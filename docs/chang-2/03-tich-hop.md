# Bài 6–9: đưa engine hiện có vào Workspace

Đây là phần cần đọc kỹ nhất. Bài 1–5 thêm chức năng quản lý; bài này thay đổi đường đi của dữ liệu thật. Làm trên database phát triển đã sao lưu và tắt scheduler trong lúc chuyển đổi.

## Bài 6. Phân biệt ba loại ID

Repo hiện có hai khái niệm dễ nhầm:

- `frontend/src/App.tsx`: `workflowId` được tạo bằng UUID và cất trong localStorage. Đây là ID bản thiết kế trong `workflow_definitions.flow_id`.
- `WorkflowGraphParser.buildSyncRequest`: tự tính `flow-<sha256>` theo nguồn/cột/kiểu dữ liệu. Đây là ID ngữ cảnh dùng cho checkpoint, conflict, execution và Outbox.

Chặng 2 giữ chúng tách biệt:

```text
workspaceId: workspace sở hữu dữ liệu, server cấp
workflowId: UUID ổn định của workflow, server cấp
contextId: flow-<hash(workspaceId, workflowId, fingerprint-cấu-hình)>
```

Đổi tên workflow không đổi workflowId. Đổi nguồn/cột tạo contextId mới và yêu cầu bootstrap theo quy tắc hiện có. Hai workspace chọn cùng file/cột vẫn có contextId khác nhau. Frontend không còn tự quyết định ID mà backend dùng để cấp quyền.

### 6.1 Migration V16 — mở rộng, chưa ép NOT NULL cho dữ liệu cũ

File tham khảo `V16__tenant_resources.sql`:

```sql
ALTER TABLE workflow_definitions
    ADD COLUMN workspace_id UUID REFERENCES workspaces(id),
    ADD COLUMN module_id UUID,
    ADD COLUMN name VARCHAR(120) NOT NULL DEFAULT 'Workflow',
    ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN definition_version BIGINT NOT NULL DEFAULT 1,
    ADD CONSTRAINT workflow_workspace_unique UNIQUE(workspace_id,flow_id),
    ADD CONSTRAINT workflow_module_workspace_fk
        FOREIGN KEY(workspace_id,module_id) REFERENCES business_modules(workspace_id,id);

CREATE TABLE flow_contexts (
    flow_id VARCHAR(100) PRIMARY KEY,
    workspace_id UUID NOT NULL,
    workflow_id VARCHAR(100) NOT NULL,
    config_fingerprint VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(workspace_id,workflow_id)
        REFERENCES workflow_definitions(workspace_id,flow_id),
    UNIQUE(workspace_id,workflow_id,config_fingerprint)
);
CREATE INDEX contexts_workflow ON flow_contexts(workspace_id,workflow_id);

CREATE TABLE workflow_permissions (
    workspace_id UUID NOT NULL,
    workflow_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL,
    can_edit BOOLEAN NOT NULL DEFAULT false,
    can_run BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY(workspace_id,workflow_id,user_id),
    FOREIGN KEY(workspace_id,workflow_id)
        REFERENCES workflow_definitions(workspace_id,flow_id),
    FOREIGN KEY(workspace_id,user_id)
        REFERENCES workspace_members(workspace_id,user_id) ON DELETE CASCADE
);

CREATE TABLE workspace_connections (
    id VARCHAR(50) PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    provider VARCHAR(20) NOT NULL CHECK(provider IN ('GOOGLE','TELEGRAM')),
    name VARCHAR(120) NOT NULL,
    state VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    UNIQUE(workspace_id,id)
);

CREATE TABLE connection_role_grants (
    workspace_id UUID NOT NULL,
    connection_id VARCHAR(50) NOT NULL,
    role VARCHAR(10) NOT NULL CHECK(role='EDITOR'),
    PRIMARY KEY(workspace_id,connection_id,role),
    FOREIGN KEY(workspace_id,connection_id)
        REFERENCES workspace_connections(workspace_id,id)
);

CREATE TABLE workflow_connection_bindings (
    workspace_id UUID NOT NULL,
    workflow_id VARCHAR(100) NOT NULL,
    node_id VARCHAR(100) NOT NULL,
    connection_id VARCHAR(50) NOT NULL,
    PRIMARY KEY(workspace_id,workflow_id,node_id),
    FOREIGN KEY(workspace_id,workflow_id)
        REFERENCES workflow_definitions(workspace_id,flow_id),
    FOREIGN KEY(workspace_id,connection_id)
        REFERENCES workspace_connections(workspace_id,id)
);

CREATE TABLE telegram_connections (
    id VARCHAR(50) PRIMARY KEY REFERENCES workspace_connections(id),
    encrypted_bot_token TEXT NOT NULL,
    bot_username VARCHAR(120) NOT NULL
);

ALTER TABLE workflow_jobs ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE notification_outbox
    ADD COLUMN workspace_id UUID REFERENCES workspaces(id),
    ADD COLUMN connection_id VARCHAR(50),
    ADD CONSTRAINT outbox_connection_workspace_fk FOREIGN KEY(workspace_id,connection_id)
        REFERENCES workspace_connections(workspace_id,id);

CREATE INDEX jobs_workspace_state ON workflow_jobs(workspace_id,state,available_at);
CREATE INDEX outbox_workspace_state ON notification_outbox(workspace_id,state,available_at);
```

`workspace_connections` là danh mục sở hữu và quyền. Google token vẫn ở `google_connections` và dùng cipher hiện tại; ID catalog bằng ID `gconn-...` của connection thật. Viết repository resolve bằng JOIN catalog + google table, không cho resolve tùy ý một `gconn-...` không có catalog đúng workspace. Telegram token ở bảng riêng và cũng mã hóa bằng cơ chế AES-GCM hiện có, không viết thuật toán mã hóa mới.

### 6.2 Guard workflow: code dùng làm nền

File đầy đủ `workspace/repository/TenantWorkflowRepository.java`:

```java
package com.hybridflow.workspace.repository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.UUID;

@Repository @RequiredArgsConstructor
public class TenantWorkflowRepository {
    private final JdbcTemplate jdbc;

    public boolean exists(UUID workspaceId, String workflowId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM workflow_definitions
                WHERE workspace_id=? AND flow_id=?)
                """, Boolean.class, workspaceId, workflowId));
    }
    public boolean granted(UUID workspaceId, String workflowId, UUID userId, String action) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM workflow_permissions
                WHERE workspace_id=? AND workflow_id=? AND user_id=?
                AND (?='READ' OR (?='EDIT' AND can_edit) OR (?='RUN' AND can_run)))
                """, Boolean.class, workspaceId, workflowId, userId, action, action, action));
    }
    public boolean runnable(UUID workspaceId, String workflowId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM workflow_definitions d
                JOIN business_modules m ON m.workspace_id=d.workspace_id AND m.id=d.module_id
                WHERE d.workspace_id=? AND d.flow_id=? AND d.enabled AND m.enabled)
                """, Boolean.class, workspaceId, workflowId));
    }
    public boolean contextBelongs(UUID workspaceId, String workflowId, String contextId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM flow_contexts
                WHERE workspace_id=? AND workflow_id=? AND flow_id=?)
                """, Boolean.class, workspaceId, workflowId, contextId));
    }
}
```

File đầy đủ `workspace/service/WorkflowAccessService.java`:

```java
package com.hybridflow.workspace.service;
import java.util.UUID;
public interface WorkflowAccessService {
    void requireRead(UUID workspaceId, String workflowId);
    void requireEdit(UUID workspaceId, String workflowId);
    void requireRun(UUID workspaceId, String workflowId);
    void requireContext(UUID workspaceId, String workflowId, String contextId);
}
```

File đầy đủ `workspace/service/impl/WorkflowAccessServiceImpl.java`:

```java
package com.hybridflow.workspace.service.impl;
import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.TenantWorkflowRepository;
import com.hybridflow.workspace.service.WorkspaceAccessService;
import com.hybridflow.workspace.service.WorkflowAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.UUID;

@Service @RequiredArgsConstructor
public class WorkflowAccessServiceImpl implements WorkflowAccessService {
    private final WorkspaceAccessService workspaces;
    private final TenantWorkflowRepository workflows;
    private final CurrentUserService currentUser;

    private void require(UUID workspaceId, String workflowId, String action) {
        WorkspaceRole role = workspaces.requireMember(workspaceId);
        if (!workflows.exists(workspaceId, workflowId)) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        if (role == WorkspaceRole.OWNER || role == WorkspaceRole.ADMIN) return;
        if (!"READ".equals(action) && role == WorkspaceRole.VIEWER) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        }
        if (!workflows.granted(workspaceId, workflowId, currentUser.requireUserId(), action)) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        }
    }
    @Override public void requireRead(UUID workspaceId, String workflowId) {
        require(workspaceId, workflowId, "READ");
    }
    @Override public void requireEdit(UUID workspaceId, String workflowId) {
        require(workspaceId, workflowId, "EDIT");
    }
    @Override public void requireRun(UUID workspaceId, String workflowId) {
        require(workspaceId, workflowId, "RUN");
        if (!workflows.runnable(workspaceId, workflowId)) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Module hoặc workflow đang tắt.");
        }
    }
    @Override public void requireContext(UUID workspaceId, String workflowId, String contextId) {
        requireRead(workspaceId, workflowId);
        if (!workflows.contextBelongs(workspaceId, workflowId, contextId)) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
        }
    }
}
```

Guard trên kiểm tra quyền, không thay thế scope SQL ở repository. API ghi cần transaction/row lock cho bước nhận việc và thao tác cập nhật; nếu module vừa tắt giữa lúc kiểm tra và nhận job, worker phải kiểm tra lại trước khi thực thi.

### 6.3 Tạo contextId ở server

File đầy đủ `sync/util/FlowContextIds.java`:

```java
package com.hybridflow.sync.util;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;

public final class FlowContextIds {
    private FlowContextIds() {}
    public static String scoped(UUID workspaceId, String workflowId, String fingerprint) {
        String source = workspaceId + "\n" + workflowId + "\n" + fingerprint;
        try {
            return "flow-" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(source.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
```

Server sinh workflowId chuẩn UUID, fingerprint là hash do parser tạo; không nhận các chuỗi tùy ý chứa dấu xuống dòng từ client vào hàm này.

Đoạn ghép vào một service dùng chung để tạo `RunSyncRequest` cho **cả chạy tay và worker**:

```java
RunSyncRequest request = parser.buildSyncRequest(workflowId, definition, connectionReference)
        .orElseThrow(() -> new ValidationException("Cấu hình luồng chưa hợp lệ."));
String fingerprint = request.getFlowId();
String contextId = FlowContextIds.scoped(workspaceId, workflowId, fingerprint);
contextRepository.ensure(workspaceId, workflowId, fingerprint, contextId);
request.setFlowId(contextId);
request.setWorkspaceId(workspaceId); // trường mới bạn thêm vào RunSyncRequest
```

`contextRepository.ensure` dùng `INSERT ... ON CONFLICT DO NOTHING`, sau đó đọc lại mapping và từ chối nếu mapping khác kỳ vọng. Tên service gợi ý: `TenantRunPlanService`/`TenantRunPlanServiceImpl`; worker gọi nó, không gọi bản parser cũ rồi bỏ qua scope. Context đăng ký trong transaction ngắn trước khi chạy engine; không để rollback execution làm mất mapping mà lịch sử `REQUIRES_NEW` đang tham chiếu.

`RunSyncResponse` đã có `flowId`: trả contextId đó về frontend. Frontend bỏ việc dùng `flowIdFor()` làm ID truy vấn backend; trước lượt đầu có thể GET danh sách contexts hoặc chỉ hiển thị lịch sử theo workflowId.

### 6.4 CRUD workflow và version

Tạo workflow phải insert vào `workflow_definitions` với workflowId do server tạo, workspace/module đã kiểm tra, definition rỗng hợp lệ, `enabled=false`, `definition_version=1`. Không bật lịch khi người dùng chỉ tạo nháp.

Không dùng nguyên `saveDefinitionWithSchedule` kiểu UPSERT cũ cho API sửa cấu hình mới: client có thể dùng ID bất kỳ để tạo hoặc ghi đè một hàng chưa thuộc workspace. Tách create và update, giữ phần tính lịch/revision nhưng thêm điều kiện ownership/version.

Request lưu:

```json
{
  "expectedVersion": 3,
  "definition": {"nodes": [], "edges": []},
  "connectionBindings": [{"nodeId":"sheet-1","connectionId":"gconn-..."}]
}
```

SQL update cốt lõi trong repository:

```sql
UPDATE workflow_definitions
SET definition=?::jsonb, definition_version=definition_version+1, updated_at=now()
WHERE workspace_id=? AND flow_id=? AND definition_version=?;
```

Service: requireEdit → đọc hàng theo workspace/workflow và lock → validate schema/graph → kiểm tra từng binding đúng workspace/provider/quyền dùng → cập nhật definition+lịch+bindings+version trong cùng transaction → changed=0 trả 409. Trả version mới để frontend lưu. **Đoạn SQL trên chỉ minh họa optimistic lock**; khi ghép thực tế phải giữ logic `next_run_at`, `schedule_revision` và hủy job cấu hình cũ của repository hiện tại. Không thay cả hàm bằng đoạn SQL rút gọn rồi làm mất lịch chạy.

Nhân bản: tạo workflowId mới; sao chép node/edge/mapping/rule, cho phép giữ connectionId cùng workspace sau khi kiểm tra quyền; đặt enabled=false và schedule_enabled=false. Không copy snapshot, journal, conflict, execution, Outbox hoặc secret. Gán quyền cho người tạo nếu là Editor.

API cấp workflow grant: Owner/Admin kiểm tra người nhận vẫn là thành viên workspace, rồi UPSERT `workflow_permissions`. Với Viewer luôn lưu can_edit=false, can_run=false. Thay đổi membership phải có hiệu lực ở request kế tiếp vì guard luôn đọc role hiện tại.

## Bài 7. Bọc mọi API dữ liệu bằng scope

Tạo `TenantWorkflowController` và `TenantWorkflowService`, không nhét thêm mọi thứ vào `App.tsx` hoặc controller cũ.

Đoạn ghép controller Outbox:

```java
@GetMapping("/{workflowId}/contexts/{contextId}/notifications")
public List<NotificationOutboxItem> notifications(
        @PathVariable UUID workspaceId, @PathVariable String workflowId,
        @PathVariable String contextId, @RequestParam String executionId,
        @RequestParam(defaultValue = "50") int limit,
        @RequestParam(defaultValue = "0") int offset) {
    return tenantWorkflows.notifications(workspaceId, workflowId, contextId, executionId, limit, offset);
}
```

Class mapping: `/api/v1/workspaces/{workspaceId}/workflows`. Interface khai báo đúng method trên. Service requireContext → query có JOIN context/execution → chỉ trả thông báo scope đúng. Không trả trực tiếp `owner`/lease nội bộ trong DTO giao diện.

Đọc history toàn bộ context của workflow:

```sql
SELECT e.* FROM sync_executions e
JOIN flow_contexts c ON c.flow_id=e.flow_id
WHERE c.workspace_id=? AND c.workflow_id=?
ORDER BY e.started_at DESC,e.id DESC LIMIT ? OFFSET ?;
```

Retry thông báo: cần quyền chạy workflow, nhưng cho phép retry thông báo đã xác minh ngay cả khi lịch/workflow đang pause. Vì `requireRun` ở ví dụ còn kiểm tra enabled, hãy tách thêm `requireOperate` (kiểm tra role/grant RUN) và `requireRun` (requireOperate + enabled). Retry gọi requireOperate; connection vẫn phải ACTIVE. Module tắt không tạo sự kiện mới, retry side effect đã xác minh là thao tác chủ động được audit.

SQL retry có scope, **không gọi thẳng retry(id) cũ**:

```sql
UPDATE notification_outbox n
SET state='PENDING',attempts=0,available_at=now(),lease_until=NULL,
    last_error=NULL,error_code=NULL
FROM flow_contexts c
WHERE n.id=? AND n.flow_id=c.flow_id AND n.workspace_id=c.workspace_id
  AND c.workspace_id=? AND c.workflow_id=?
  AND n.state IN ('FAILED','DEAD');
```

Kiểm tra connection ACTIVE trong cùng thao tác nhận retry. Không có hàng đổi → trả 404 nếu ID không thuộc scope, 409 nếu thuộc scope nhưng trạng thái không retry được. Ghi audit trong cùng transaction.

Conflict resolve: load conflict bằng `id + workspaceId + workflowId` qua JOIN `flow_contexts`; requireEdit hoặc quyền resolve riêng đã thống nhất; dùng connection của workflow từ backend. Bản đầu cho Editor có can_edit xử lý conflict; Viewer không được. Không nhận `accessToken` hay `chatId` tùy ý từ body để thay connection/đích của workflow.

Các đường phải kiểm tra đủ: definition save/load/run, schedule, vault preview, history clear, conflict list/resolve/notify, Outbox list/retry, Google metadata/read/update, Telegram bot/link/recipient/test. Kiểm tra API có ID con từ chính tài nguyên được load, không chỉ tin workspaceId/path do caller gửi.

Trước khi mở nhiều người dùng, các API cũ như `/sync/run`, `/workflows/{id}/...`, `/notifications/{id}/retry`, `/conflicts/{id}/resolve` phải được chuyển qua guard tương đương hoặc **bỏ mapping cũ**. Chỉ `.authenticated()` là chưa đủ: người A vẫn có thể đoán ID người B. Trong môi trường học, cách dễ rà soát là chuyển frontend sang route mới rồi loại bỏ route cũ; không giữ một cổng bypass để tiện test.

## Bài 8. Connection chia sẻ trong workspace

### 8.1 Google

Giữ token cipher/refresh hiện có. Thay đường bắt đầu OAuth bằng POST có CSRF tại workspace. Lưu một pending object trong HttpSession gồm `state` ngẫu nhiên, workspaceId, userId, createdAt; không encode raw workspaceId thành state rồi tin callback.

Đoạn ghép kiểm tra callback trong service:

```java
PendingGoogleConnection pending = pendingStore.consume(session, callbackState);
// consume phải tìm theo state, xóa ngay khi đọc và kiểm tra hạn 10 phút.
if (!pending.getUserId().equals(currentUser.requireUserId())) {
    throw new ApplicationException(ErrorCode.ACCESS_DENIED);
}
access.requireManager(pending.getWorkspaceId());
GoogleTokenResponse token = oauth.exChangeCode(code);
String connectionId = credentials.store(token);
catalog.insert(connectionId, pending.getWorkspaceId(), "GOOGLE", connectionName);
```

Đây là **đoạn thuật toán**, bạn cần triển khai `PendingGoogleConnection`, `PendingGoogleConnectionStore` trong package `support` (không nằm trong `service`). Kho pending là map theo state trong session để hai tab kết nối cùng lúc không ghi đè nhau; consume dùng lock đồng bộ trên session, so sánh state, hạn dùng và xóa một lần. State phải được truyền vào authorization URL qua `.setState(state)` và callback phải nhận `@RequestParam String state`.

Callback phải còn session đã khởi tạo OAuth; không permitAll rồi nhận code trần như luồng kết nối hiện tại. Spring OIDC login xử lý state riêng; **không tự động bảo vệ callback Sheets viết tay**.

Lưu secret + catalog phải nguyên tử: `credentials.store()` hiện dùng REQUIRES_NEW nên không tự rollback cùng `catalog.insert`. Hãy thêm một method nội bộ lưu encrypted Google connection và catalog trong cùng transaction, hoặc viết bước bù xóa secret mồ côi nếu insert catalog lỗi. Không giả định `@Transactional` ở service ngoài sẽ bao phủ REQUIRES_NEW.

Response danh sách connection chỉ gồm id/name/provider/state/usageCount. Backend resolve token theo workspace + connectionId; frontend không nhận access/refresh token, không lưu `gconn-...` vào trường tên `accessToken` nữa. Connection ID không phải secret nhưng cũng không phải giấy phép dùng connection.

### 8.2 Telegram

Hiện repo dùng token bot toàn cục từ cấu hình. Chặng 2 phải đổi sang connection theo workspace:

1. Owner/Admin nhập bot token một lần; backend gọi getMe để kiểm tra và lấy tên bot.
2. Mã hóa token và insert `telegram_connections` + catalog trong một transaction.
3. Node Telegram lưu `connectionId` và recipient đã xác minh, không lưu bot token.
4. `ActionPlan`/Outbox bổ sung connectionId; sender resolve token bằng workspaceId + connectionId mỗi lần gửi. Không gửi bằng global `TELEGRAM_BOT_TOKEN` dự phòng.
5. Các bot/link/test API đều dùng đúng connection đã kiểm tra quyền. Cache/link pending phải có workspace + connection + user, không để hai workspace nhận link của nhau.
6. Nếu dùng nhiều bot, HTTP client nhận token theo mỗi lời gọi; không sửa một biến token dùng chung trong singleton service.

Quyền dùng: Owner/Admin dùng được; Editor cần connection_role_grants EDITOR và can_edit/can_run trên workflow. Khi đổi grant phải xem workflow nào còn phụ thuộc; không gỡ grant rồi âm thầm đổi credential của workflow đang chạy.

`GET connections/{id}/usage` query `workflow_connection_bindings` theo workspace. DELETE thường trả 409 nếu còn binding; người quản trị phải gỡ binding/đổi connection trước. Với reconnect Google, cập nhật secret của đúng connection thay vì tạo ID mới khiến mọi workflow mất liên kết. Revoke khẩn cấp chuyển state=REVOKED và chặn job/Outbox mới dùng connection; ghi audit.

## Bài 9. Worker, quota và migration dữ liệu cũ

### 9.1 Worker không dùng session

Sửa các file hiện tại theo thứ tự:

1. `WorkflowDefinitionRepository.lockDueWorkflows`: JOIN module; WHERE workflow.enabled và module.enabled, workspace_id không null.
2. `WorkflowJobRepository.enqueue`: ghi workspaceId vào job, không lấy từ payload tùy ý.
3. `WorkflowJobRepository.claim`: kiểm tra job.workspaceId khớp definition.workspaceId; module/workflow còn bật.
4. `WorkflowJobServiceImpl.execute`: sau khi giữ khóa job, kiểm tra lại ownership/revision/module/connection trước khi gọi engine. Job nhận trước lúc module tắt nhưng chưa bắt đầu phải bị CANCELLED; job đã bắt đầu được hoàn tất.
5. Manual run và scheduled run cùng gọi `TenantRunPlanService`, nhận contextId giống nhau với cùng workspace/workflow/cấu hình.
6. `NotificationOutboxServiceImpl`: ghi workspaceId + connectionId từ request/binding đã kiểm tra; sender dùng hai ID đó. Kiểm tra connection state khi claim và ngay trước khi gửi.
7. History/trace chứa workspace/workflow/context/execution/correlation. Có thể suy workspace qua flow_contexts, nhưng mọi query public phải JOIN scope đó.

Những class cần thêm trường: `RunSyncRequest`, `WorkflowJob`, `ScheduledWorkflowRow`, `NotificationOutboxItem`, `ActionPlan`. Sửa cả SQL RowMapper; chỉ thêm field vào DTO không làm database tự điền giá trị.

Giữ các khóa bảo vệ ghi Sheet theo **file thật** hiện có. Workspace khác nhau vẫn có thể được Google cấp cùng một file: nếu thêm workspace vào khóa file, hai luồng có thể ghi chồng lên file đó. Tenant isolation áp dụng dữ liệu ứng dụng; không được vô tình bỏ cơ chế phối hợp trên tài nguyên bên ngoài.

### 9.2 Quota tối thiểu, không dùng counter Java đơn lẻ

Bản đầu: quota workspace tối đa 2 sync job đồng thời, pool tổng mặc định 5. Đây là giá trị cấu hình minh họa; bài test 5 workflow độc lập có thể chạy trên 3 workspace hoặc tăng quota workspace kiểm thử lên 5. Nên kiểm tra riêng cả quota lẫn năng lực pool.

Để không hai worker cùng thấy “đang chạy 1 < quota 2” rồi claim dư, khóa một hàng `workspace_runtime(workspace_id PRIMARY KEY)` trong transaction claim, đếm job RUNNING còn lease hoặc đang bị giữ row lock, rồi claim job đủ điều kiện. Dùng `FOR UPDATE SKIP LOCKED` để workspace hết lượt không chặn workspace khác. Cần lease recovery và xử lý RUNNING hết lease nhưng vẫn giữ row lock như Chặng 1.

Không chỉ thêm `COUNT(*) < quota` vào SQL mà thiếu cơ chế serialize theo workspace. Không giữ lock workspace suốt cuộc gọi Google vì như vậy vô tình chỉ cho một job/workspace. Nếu chưa tự viết claim atomic đúng, ghi bài này là chưa xong, chưa mở beta nhiều người dùng.

Rate limit theo connector thuộc FR-018: thêm bảng `connector_rate_windows(connection_id PRIMARY KEY, next_allowed_at TIMESTAMPTZ)` hoặc token bucket trong DB. Worker chỉ giữ lock trong bước đặt lịch lượt API tiếp theo; quota/rate-limit không được sleep trong transaction đang giữ job/file lock. Khi bị giới hạn, đưa việc về thời điểm available_at và không tăng số lần lỗi nghiệp vụ. Với Google API đọc/ghi bên trong engine cần thiết kế ngân sách cho một lượt sync và backoff theo Retry-After; đừng chỉ giới hạn endpoint `/run` rồi coi đã kiểm soát Google quota. Tái sử dụng chính sách 429 hiện có và thêm test hai workflow dùng chung connection.

### 9.3 Dữ liệu cũ: expand → kiểm kê → gán → siết ràng buộc

Không tự gán mọi dữ liệu cũ cho người đầu tiên đăng nhập.

1. Sao lưu DB, tắt scheduler (`SCHEDULER_ENABLED=false`), ngừng worker instance khác.
2. Chạy V14–V16 trên bản sao; tạo user thật, workspace và module đích.
3. Lập manifest mapping `oldWorkflowId → workspaceId/moduleId`, `oldRuntimeFlowId → workflowId`, `oldConnectionId → workspaceId`. Xác minh thủ công nguồn của từng mapping.
4. Gán workspace/module cho definition. Đăng ký context lịch sử bằng oldRuntimeFlowId để đọc được lịch sử cũ; context mới dùng công thức mới. Không đổi hàng loạt khóa flow bằng replace chuỗi.
5. Gán catalog Google/Telegram, backfill workspaceId của job/Outbox qua mapping, gán connectionId cho Outbox chỉ khi xác định chắc bot cũ. Hàng không xác định giữ ngoài worker, không gửi bằng credential mặc định.
6. Nếu một runtimeFlowId cũ từng được nhiều bản thiết kế dùng chung, không thể suy ra chủ sở hữu chỉ từ hash. Dừng tự gán; chọn một chủ sở hữu được xác nhận hoặc lập kế hoạch sao chép lịch sử rõ ràng. Không chia sẻ mapping đó giữa hai workspace.
7. Chạy báo cáo orphan theo từng bảng: snapshot, vault, binding, execution, conflict, journal, job, Outbox. Journal PENDING phải reconcile trước khi đổi nguồn/khóa, không xóa để vượt qua migration.
8. Viết V17 trên schema/dữ liệu đã xác minh: NOT NULL workspace/module cho definition, workspace cho job/Outbox; FK runtime flow vào flow_contexts cho các bảng đã kiểm kê. Thêm CHECK cặp workspace/connection theo kênh và provider. Nếu còn orphan, migration phải fail thay vì tiếp tục.
9. Lưu/bật workflow, chạy tay bootstrap nếu context mới, kiểm tra A/B, rồi bật scheduler. Không copy snapshot cũ vào context mới khi nguồn/cột/kiểu đã thay đổi.

SQL kiểm tra mẫu (chưa đủ cho mọi bảng, hãy viết một query cho từng bảng ở bước 7):

```sql
SELECT e.id,e.flow_id FROM sync_executions e
LEFT JOIN flow_contexts c ON c.flow_id=e.flow_id WHERE c.flow_id IS NULL;

SELECT j.id FROM workflow_jobs j
JOIN workflow_definitions d ON d.flow_id=j.workflow_id
WHERE j.workspace_id IS DISTINCT FROM d.workspace_id;

SELECT n.id FROM notification_outbox n
LEFT JOIN flow_contexts c ON c.flow_id=n.flow_id
WHERE c.flow_id IS NULL OR n.workspace_id IS DISTINCT FROM c.workspace_id;
```

V17 phải được viết theo manifest và schema thực tế của bạn, nên tài liệu không cung cấp một bản backfill “chạy luôn” có thể gán sai quyền dữ liệu.

## Điều kiện qua bài 6–9

Đổi workspaceId, workflowId, contextId, executionId, notificationId, conflictId hoặc connectionId sang tài nguyên bên khác đều không vượt quyền. Các đường cũ không còn bypass. Chạy tay/lịch cùng scope; module tắt không nhận việc mới; connection revoke chặn side effect mới; kiểm thử quota, lease, rollback của Chặng 1 vẫn đạt.
