# Bài 10: frontend, kiểm thử và cách tự triển khai

Điều kiện: API backend đã có tenant scope. Chưa nối editor vào route cũ rồi coi đã multi-tenant.

## 10.1 Cookie và CSRF cho Axios

Đoạn ghép vào `frontend/src/services/api.ts`: thêm `withCredentials: true` vào `axios.create` hiện có. Giữ timeout và xử lý lỗi hiện tại.

```ts
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000,
  withCredentials: true,
});

interface CsrfInfo { headerName: string; token: string }
let csrfInfo: CsrfInfo | null = null;
let csrfPending: Promise<CsrfInfo> | null = null;

export function invalidateCsrf() {
  csrfInfo = null;
  csrfPending = null;
}

async function ensureCsrf(): Promise<CsrfInfo> {
  if (csrfInfo) return csrfInfo;
  if (!csrfPending) {
    csrfPending = apiClient.get<CsrfInfo>('/auth/csrf')
      .then(response => { csrfInfo = response.data; return response.data; })
      .finally(() => { csrfPending = null; });
  }
  return csrfPending;
}

apiClient.interceptors.request.use(async config => {
  const method = (config.method || 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = await ensureCsrf();
    config.headers.set(csrf.headerName, csrf.token);
  }
  return config;
});

export const authService = {
  me: async (signal?: AbortSignal) =>
    (await apiClient.get<Me>('/auth/me', { signal })).data,
  logout: async () => {
    await apiClient.post('/auth/logout');
    invalidateCsrf();
  },
};
```

Thêm `Me` vào types và import trong api.ts:

```ts
export interface Me { id: string; email: string; displayName: string }
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
export interface Workspace { id: string; name: string; role: WorkspaceRole }
```

`ensureCsrf` gọi GET nên không bị vòng lặp interceptor. Sau Google login dùng redirect tải lại trang, biến token trong bộ nhớ được tạo mới. Sau logout hủy token cũ. Nếu session hết hạn, đưa người dùng về đăng nhập; không tự retry thao tác ghi vì có thể tạo side effect hai lần. Nếu hỗ trợ đăng nhập popup không reload sau này, phải vô hiệu hóa cache CSRF và hủy request cũ khi principal đổi.

## 10.2 AuthGate đầy đủ

File đầy đủ `frontend/src/components/auth/AuthGate.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Me } from '../../types';
import { authService } from '../../services/api';
import { errorMessage } from '../../services/errors';
import axios from 'axios';

type State =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; user: Me };

export function AuthGate({ children }: { children: (user: Me) => ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    authService.me(controller.signal)
      .then(user => { if (!controller.signal.aborted) setState({ kind: 'ready', user }); })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          setState({ kind: 'anonymous' });
        } else setState({ kind: 'error', message: errorMessage(error) });
      });
    return () => controller.abort();
  }, [revision]);

  if (state.kind === 'loading') return <p role="status">Đang kiểm tra phiên…</p>;
  if (state.kind === 'error') return <div role="alert">
    <p>{state.message}</p><button onClick={() => setRevision(value => value + 1)}>Thử lại</button>
  </div>;
  if (state.kind === 'anonymous') return <main>
    <h1>Đăng nhập HybridFlow</h1>
    <a href="/api/v1/auth/login/google">Tiếp tục với Google</a>
  </main>;
  return <>{children(state.user)}</>;
}
```

Đây là ví dụ dùng API cùng origin qua proxy, như bài 1. Khi authService nhận 401 từ một request nghiệp vụ sau lúc gate đã load, bạn cần cập nhật state đăng nhập chung hoặc chuyển về trang login. Cách đầu tiên dễ làm là response interceptor chỉ dispatch một sự kiện `auth-expired` khi 401, AuthGate lắng nghe để set anonymous; dọn listener khi unmount. Không dispatch khi GET `/auth/me` đang dò phiên, không biến mọi 403 thành logout (403 có thể chỉ là thiếu quyền).

Nút logout: `await authService.logout()` thành công → xóa lựa chọn/draft nhạy cảm trong bộ nhớ → chuyển gate về anonymous hoặc tải lại trang. Nếu logout thất bại thì hiển thị lỗi, không giả vờ đã hủy phiên server.

## 10.3 Workspace API và bộ chọn đơn giản

Thêm vào `api.ts`, import type Workspace:

```ts
export const workspaceService = {
  list: async (signal?: AbortSignal) =>
    (await apiClient.get<Workspace[]>('/workspaces', { signal })).data,
  create: async (name: string) =>
    (await apiClient.post<Workspace>('/workspaces', { name })).data,
};
```

File đầy đủ `frontend/src/components/workspace/WorkspacePicker.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Workspace } from '../../types';
import { workspaceService } from '../../services/api';
import { errorMessage } from '../../services/errors';

export function WorkspacePicker({ children }: { children: (workspace: Workspace) => ReactNode }) {
  const [items, setItems] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    workspaceService.list(controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setItems(result);
        setSelected(old => result.some(item => item.id === old) ? old : result[0]?.id || '');
      })
      .catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  async function createWorkspace() {
    if (busy || !name.trim()) return;
    setBusy(true); setError('');
    try {
      const created = await workspaceService.create(name.trim());
      setItems(current => [...current, created]); setSelected(created.id); setName('');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }

  const active = items.find(item => item.id === selected);
  return <main>
    <label>Workspace <select value={selected} disabled={loading || busy}
      onChange={event => setSelected(event.target.value)}>
      <option value="">Chọn workspace</option>
      {items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}
    </select></label>
    <label>Tên workspace mới <input value={name} maxLength={120}
      onChange={event => setName(event.target.value)} /></label>
    <button disabled={loading || busy || !name.trim()} onClick={() => void createWorkspace()}>Tạo workspace</button>
    {loading && <p role="status">Đang tải workspace…</p>}
    {error && <div role="alert">{error}<button onClick={() => setRevision(value => value + 1)}>Tải lại</button></div>}
    {!loading && !error && active && <section key={active.id}>{children(active)}</section>}
  </main>;
}
```

`key` ở section giúp React bỏ state cũ khi đổi workspace. Khi đổi tài khoản cũng remount WorkspacePicker bằng `key={user.id}`. Hủy các request cũ khi đổi workspace, tương tự useWorkflowPolling/ExecutionOutbox đã có ở Chặng 1.

Tiếp theo tự viết `ModuleWorkflowPicker`: GET module theo workspace; chọn module → GET workflow được cấp quyền → chọn workflow. Truyền `workspaceId`, `workflowId`, `userId` xuống editor. Không để frontend tự lọc một danh sách tất cả workflow tải từ server, vì khi đó dữ liệu đã bị lộ.

## 10.4 Sửa editor hiện tại từng bước

Đoạn ghép thay phần khởi tạo `App.tsx`:

```tsx
interface EditorProps { userId: string; workspaceId: string; workflowId: string }

export default function App({ userId, workspaceId, workflowId }: EditorProps) {
  const draftKey = `hybridflow:draft:${userId}:${workspaceId}:${workflowId}`;
  // Giữ các hook editor hiện có, nhưng đọc/ghi draft bằng draftKey mới.
  // Bỏ useState tạo workflowId từ localStorage: workflowId do server cấp qua props.
}
```

Đây là **đoạn ghép**, không phải toàn bộ App. Đổi hàm `draft()` hiện có thành `readDraft(draftKey)`; các cấu hình cũ trong localStorage chỉ được import chủ động sau khi chọn workspace, không tự áp vào tài khoản mới.

Root lắp ghép theo thứ tự:

```tsx
<AuthGate>{user =>
  <WorkspacePicker key={user.id}>{workspace =>
    <ModuleWorkflowPicker workspace={workspace}>{workflow =>
      <App key={`${user.id}:${workspace.id}:${workflow.id}`}
        userId={user.id} workspaceId={workspace.id} workflowId={workflow.id} />
    }</ModuleWorkflowPicker>
  }</WorkspacePicker>
}</AuthGate>
```

`ModuleWorkflowPicker` là bài tự làm, không phải component đang có. Đừng copy root này trước khi viết component đó.

API factory tránh truyền thiếu workspaceId ở mỗi chỗ:

```ts
export function tenantWorkflowApi(workspaceId: string, workflowId: string) {
  const base = `/workspaces/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflowId)}`;
  return {
    load: async (signal?: AbortSignal) =>
      (await apiClient.get(base + '/definition', { signal })).data,
    save: async (expectedVersion: number, definition: unknown, connectionBindings: unknown[]) =>
      (await apiClient.put(base + '/definition', { expectedVersion, definition, connectionBindings })).data,
    run: async (bootstrapConfirmed: boolean) =>
      (await apiClient.post(base + '/run', null, { params: { bootstrapConfirmed } })).data,
    history: async (signal?: AbortSignal) =>
      (await apiClient.get(base + '/history', { signal })).data,
    notifications: async (contextId: string, executionId: string, offset = 0, signal?: AbortSignal) =>
      (await apiClient.get(base + `/contexts/${encodeURIComponent(contextId)}/notifications`,
        { params: { executionId, offset, limit: 50 }, signal })).data,
    retry: async (notificationId: string) =>
      apiClient.post(base + `/notifications/${encodeURIComponent(notificationId)}/retry`),
  };
}
```

Bản mẫu dùng `unknown` cho payload JSON chưa đóng schema; thêm DTO TypeScript của bạn sau khi backend contract chốt. Thêm generic response thực tế cho load/run/history/notifications để editor không truyền `any` khắp nơi.

Các việc cần nối:

1. Load definition trả `{definition,version}`; giữ version ở state, save gửi expectedVersion; 409 hiển thị “cấu hình đã thay đổi, tải lại”, không ghi đè mù.
2. Run trả `RunSyncResponse.flowId` = contextId từ backend; cập nhật state đó sau chạy. History theo workflow trả cả flow_id của từng execution để mở Outbox đúng context của lượt cũ.
3. Không dùng context hiện tại để xem Outbox một execution cũ. Sửa `RunHistoryItem` thêm contextId lấy từ execution.flow_id; truyền contextId của chính dòng đang mở vào ExecutionOutbox.
4. Thay callback load/retry trong RunHistoryDrawer bằng tenantWorkflowApi, không gọi endpoint global cũ.
5. Node Sheet/Telegram chọn connectionId từ danh sách workspace. Bỏ dùng token global từ localStorage.
6. Đổi workspace/tài khoản xóa state conflict, preview, notification, pending popup; abort polling/request cũ. Server vẫn kiểm tra quyền lại.
7. Viewer chỉ thấy nút đọc; Editor hiển thị theo grant. Các quyền UI nên lấy từ DTO backend như `{canEdit,canRun,canManageConnections}`, không tự suy rằng Editor có mọi quyền.
8. Làm trang members, form mời, form module và danh sách connection sau khi API tương ứng đã có test.

## 10.5 Một test MockMvc mẫu để bắt lỗi vượt workspace

Đây là test **để bạn thêm khi đã triển khai API module**, không chạy được trên code Chặng 1 hiện tại. Dùng database kiểm thử riêng như README, không dùng DB ứng dụng thật. Các test dưới tạo user/workspace riêng bằng UUID, không cần truncate dữ liệu khác.

File đầy đủ `backend/src/test/java/com/hybridflow/workspace/WorkspaceIsolationIntegrationTest.java`:

```java
package com.hybridflow.workspace;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import java.util.UUID;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@EnabledIfEnvironmentVariable(named="HYBRIDFLOW_TEST_DB_URL",
        matches="jdbc:postgresql://(localhost|127[.]0[.]0[.]1):15432/hybridflow_test")
@SpringBootTest(properties={
        "spring.datasource.url=${HYBRIDFLOW_TEST_DB_URL}",
        "spring.datasource.username=hybridflow_test",
        "spring.datasource.password=hybridflow_test",
        "hybridflow.scheduler.enabled=false",
        "spring.security.oauth2.client.registration.google.client-id=test-client",
        "spring.security.oauth2.client.registration.google.client-secret=test-secret",
        "google.oauth.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="})
@AutoConfigureMockMvc
class WorkspaceIsolationIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    private String subjectA;
    private String subjectB;

    @BeforeEach void accounts() {
        subjectA = "test-a-" + UUID.randomUUID();
        subjectB = "test-b-" + UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id,google_subject,email,display_name) VALUES (?,?,?,?)",
                UUID.randomUUID(), subjectA, "a@example.test", "A");
        jdbc.update("INSERT INTO app_users(id,google_subject,email,display_name) VALUES (?,?,?,?)",
                UUID.randomUUID(), subjectB, "b@example.test", "B");
    }

    @Test void anonymousCannotListWorkspaces() throws Exception {
        mvc.perform(get("/api/v1/workspaces")).andExpect(status().isUnauthorized());
    }

    @Test void modifyingWithoutCsrfIsRejected() throws Exception {
        mvc.perform(post("/api/v1/workspaces")
                .with(oidcLogin().idToken(token -> token.subject(subjectA)))
                .contentType("application/json").content("{\"name\":\"Shop A\"}"))
                .andExpect(status().isForbidden());
    }

    @Test void anotherUserCannotCreateModuleInOwnersWorkspace() throws Exception {
        String created = mvc.perform(post("/api/v1/workspaces")
                .with(oidcLogin().idToken(token -> token.subject(subjectA))).with(csrf())
                .contentType("application/json").content("{\"name\":\"Shop A\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        JsonNode workspace = mapper.readTree(created);
        mvc.perform(post("/api/v1/workspaces/" + workspace.path("id").asText() + "/modules")
                .with(oidcLogin().idToken(token -> token.subject(subjectB))).with(csrf())
                .contentType("application/json")
                .content("{\"name\":\"Kho\",\"description\":\"\",\"enabled\":true}"))
                .andExpect(status().isForbidden());
    }
}
```

`oidcLogin()` chỉ giả principal ở biên Security; nó không chạy GoogleOidcUserLoader, nên test phải seed app_users. Các test OAuth login riêng cần mock provider hoặc dùng tài khoản thật ở bước kiểm tra thủ công. Với test API nhiều workspace, không mock WorkspaceAccessService vì bạn đang cần chứng minh guard đó hoạt động.

## 10.6 Danh sách test bắt buộc trước khi đóng chặng

Auth:

- Chưa đăng nhập/hết session → 401; logout hủy session; đăng nhập cùng Google sub không tạo user trùng.
- POST/PUT/DELETE thiếu/sai CSRF → 403; token CSRF mới sau login/logout dùng được.
- Lỗi mạng `/auth/me` hiển thị lỗi kết nối, không tự coi là chưa đăng nhập.

Workspace/RBAC:

- A không thấy workspace B; member bị xóa mất quyền ở request tiếp theo.
- Viewer không sửa/chạy; Editor không sửa workflow chưa có grant; Admin không sửa role Owner.
- Foreign module/workflow/context/execution/conflict/notification/connection ID đều bị chặn, kể cả đoán đúng ID.
- Lời mời sai email, hết hạn, thu hồi, dùng lại, nhận đồng thời; không hạ quyền thành viên cũ.
- Audit có actor/workspace/resource/correlation; không có secret.

Engine:

- Cùng Sheet/cột nhưng khác workspace → khác context/snapshot/history/Outbox.
- Cùng workspace/workflow/cấu hình → chạy tay và lịch cùng contextId.
- Đổi cấu hình tạo context mới; xem lượt cũ vẫn dùng context cũ.
- Module/workflow tắt không nhận job mới; job đang chạy hoàn tất; job chưa bắt đầu bị chặn.
- Hai người cùng save expectedVersion → chỉ một thành công, người còn lại 409.
- Nhân bản workflow không copy checkpoint/side effect/lịch đang bật.
- Hai workflow dùng một connection; revoke connection chặn side effect tiếp theo; usage báo đúng ảnh hưởng.
- Không còn endpoint legacy vượt qua guard; kiểm tra cả alias `/sync-conflicts` và đường retry cũ.
- Quota workspace không vượt khi hai worker claim đồng thời; workspace hết quota không chặn workspace khác; connector 429 backoff đúng.
- Tất cả test reliability Chặng 1 vẫn chạy, không bỏ qua integration test để lấy kết quả xanh.

Frontend:

- Đổi tài khoản/workspace/workflow không lộ draft, preview hay dữ liệu cũ.
- Response đến muộn của workspace cũ bị bỏ; request/polling cũ bị hủy.
- Form giữ dữ liệu khi API lỗi; save conflict 409 không tự ghi đè.
- Lịch sử/Outbox lượt cũ hoạt động đúng sau đổi nguồn.

## 10.7 Cách chia commit và kiểm tra mỗi bài

```text
01 auth dependencies + accounts migration
02 Google login + current user + CSRF + logout
03 create/list workspace + isolation tests
04 membership roles + audit
05 module CRUD + invitations
06 resource schema + workflow grants + stable workflow/context IDs
07 scoped APIs + workflow versioning + bỏ legacy bypass
08 Google/Telegram workspace connections
09 worker ownership + module admission + quota/rate limit
10 frontend shell + editor wiring + migration + UAT
```

Trong `backend`, dùng JDK 21 rồi chạy `mvn test`; bật biến database kiểm thử để chạy integration tests. Trong `frontend`: `npm test`, `npm run build`. Mỗi bài ghi lại request đã thử, response và test nào chứng minh hành vi đó.

Khi bị lỗi, gửi đúng một bài, tên file, lệnh chạy và lỗi đầu tiên; che token/secret. Ví dụ: “Bài 2.6, GET /auth/me trả 302 thay vì 401; đây là SecurityConfig và response headers”. Cách này dễ học và sửa hơn việc copy cả chặng rồi gỡ nhiều lớp lỗi cùng lúc.
