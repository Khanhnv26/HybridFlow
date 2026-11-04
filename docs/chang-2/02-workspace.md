# Bài 3–5: Workspace, phân quyền, module và lời mời

Điều kiện bắt đầu: bài đăng nhập đã chạy; bạn hiểu controller → service → repository. Tất cả đường dẫn Java bên dưới nằm dưới `backend/src/main/java/com/hybridflow/`.

## Bài 3. Một tính năng hoàn chỉnh: tạo workspace

### 3.1 Migration V15

File đầy đủ `backend/src/main/resources/db/migration/V15__workspace_management.sql`:

```sql
CREATE TABLE workspaces (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    user_id UUID NOT NULL REFERENCES app_users(id),
    role VARCHAR(10) NOT NULL CHECK(role IN ('OWNER','ADMIN','EDITOR','VIEWER')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(workspace_id, user_id)
);
CREATE UNIQUE INDEX one_owner_per_workspace ON workspace_members(workspace_id)
    WHERE role='OWNER';
CREATE INDEX workspace_members_user ON workspace_members(user_id, workspace_id);

CREATE TABLE business_modules (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    name VARCHAR(120) NOT NULL,
    description VARCHAR(1000) NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, id)
);

CREATE TABLE workspace_invitations (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    email VARCHAR(320) NOT NULL,
    role VARCHAR(10) NOT NULL CHECK(role IN ('ADMIN','EDITOR','VIEWER')),
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    state VARCHAR(10) NOT NULL DEFAULT 'PENDING'
        CHECK(state IN ('PENDING','ACCEPTED','REVOKED')),
    created_by UUID NOT NULL REFERENCES app_users(id),
    accepted_by UUID REFERENCES app_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_audit (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    actor_user_id UUID REFERENCES app_users(id),
    action VARCHAR(80) NOT NULL,
    resource_id VARCHAR(100),
    correlation_id VARCHAR(36),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workspace_audit_recent ON workspace_audit(workspace_id, created_at DESC);
```

Unique partial index đảm bảo **tối đa** một Owner. Service phải đảm bảo tạo workspace và Owner cùng transaction; không cho xóa/hạ quyền Owner để duy trì ít nhất một Owner. Nếu sau này cho chuyển Owner, cần một thao tác chuyển quyền riêng có lock, không dùng API sửa role thông thường.

### 3.2 DTO và enum

File đầy đủ `workspace/model/WorkspaceRole.java`:

```java
package com.hybridflow.workspace.model;
public enum WorkspaceRole { OWNER, ADMIN, EDITOR, VIEWER }
```

File đầy đủ `workspace/dto/CreateWorkspaceRequest.java`:

```java
package com.hybridflow.workspace.dto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter @Setter
public class CreateWorkspaceRequest {
    @NotBlank @Size(max = 120)
    private String name;
}
```

File đầy đủ `workspace/dto/WorkspaceResponse.java`:

```java
package com.hybridflow.workspace.dto;
import com.hybridflow.workspace.model.WorkspaceRole;
import lombok.AllArgsConstructor;
import lombok.Getter;
import java.util.UUID;

@Getter @AllArgsConstructor
public class WorkspaceResponse {
    private final UUID id;
    private final String name;
    private final WorkspaceRole role;
}
```

### 3.3 Repository

File đầy đủ `workspace/repository/WorkspaceRepository.java`:

```java
package com.hybridflow.workspace.repository;
import com.hybridflow.workspace.dto.WorkspaceResponse;
import com.hybridflow.workspace.model.WorkspaceRole;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository @RequiredArgsConstructor
public class WorkspaceRepository {
    private final JdbcTemplate jdbc;

    public void insert(UUID id, String name) {
        jdbc.update("INSERT INTO workspaces(id,name) VALUES (?,?)", id, name);
    }

    public List<WorkspaceResponse> findForUser(UUID userId) {
        return jdbc.query("""
                SELECT w.id,w.name,m.role FROM workspaces w
                JOIN workspace_members m ON m.workspace_id=w.id
                WHERE m.user_id=? ORDER BY w.created_at,w.id
                """, (rs, row) -> new WorkspaceResponse(rs.getObject("id", UUID.class),
                rs.getString("name"), WorkspaceRole.valueOf(rs.getString("role"))), userId);
    }
}
```

File đầy đủ `workspace/repository/MembershipRepository.java`:

```java
package com.hybridflow.workspace.repository;
import com.hybridflow.workspace.model.WorkspaceRole;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;

@Repository @RequiredArgsConstructor
public class MembershipRepository {
    private final JdbcTemplate jdbc;
    public void insert(UUID workspaceId, UUID userId, WorkspaceRole role) {
        jdbc.update("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (?,?,?)",
                workspaceId, userId, role.name());
    }
    public Optional<WorkspaceRole> findRole(UUID workspaceId, UUID userId) {
        return jdbc.query("SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?",
                (rs, row) -> WorkspaceRole.valueOf(rs.getString("role")), workspaceId, userId)
                .stream().findFirst();
    }
}
```

### 3.4 Một chỗ dùng chung để kiểm tra role

File đầy đủ `workspace/service/WorkspaceAccessService.java`:

```java
package com.hybridflow.workspace.service;
import com.hybridflow.workspace.model.WorkspaceRole;
import java.util.UUID;

public interface WorkspaceAccessService {
    WorkspaceRole requireMember(UUID workspaceId);
    void requireManager(UUID workspaceId);
    void requireOwner(UUID workspaceId);
}
```

File đầy đủ `workspace/service/impl/WorkspaceAccessServiceImpl.java`:

```java
package com.hybridflow.workspace.service.impl;
import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.MembershipRepository;
import com.hybridflow.workspace.service.WorkspaceAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.UUID;

@Service @RequiredArgsConstructor
public class WorkspaceAccessServiceImpl implements WorkspaceAccessService {
    private final CurrentUserService currentUser;
    private final MembershipRepository members;

    @Override
    public WorkspaceRole requireMember(UUID workspaceId) {
        return members.findRole(workspaceId, currentUser.requireUserId())
                .orElseThrow(() -> new ApplicationException(ErrorCode.ACCESS_DENIED));
    }
    @Override
    public void requireManager(UUID workspaceId) {
        WorkspaceRole role = requireMember(workspaceId);
        if (role != WorkspaceRole.OWNER && role != WorkspaceRole.ADMIN) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        }
    }
    @Override
    public void requireOwner(UUID workspaceId) {
        if (requireMember(workspaceId) != WorkspaceRole.OWNER) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        }
    }
}
```

Đọc membership từ database mỗi request. Không lưu role cố định vào JWT/session để rồi người đã bị thu hồi vẫn dùng quyền cũ.

### 3.5 Service và controller

File đầy đủ `workspace/service/WorkspaceService.java`:

```java
package com.hybridflow.workspace.service;
import com.hybridflow.workspace.dto.CreateWorkspaceRequest;
import com.hybridflow.workspace.dto.WorkspaceResponse;
import java.util.List;

public interface WorkspaceService {
    WorkspaceResponse create(CreateWorkspaceRequest request);
    List<WorkspaceResponse> mine();
}
```

File đầy đủ `workspace/service/impl/WorkspaceServiceImpl.java`:

```java
package com.hybridflow.workspace.service.impl;
import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.workspace.dto.CreateWorkspaceRequest;
import com.hybridflow.workspace.dto.WorkspaceResponse;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.MembershipRepository;
import com.hybridflow.workspace.repository.WorkspaceRepository;
import com.hybridflow.workspace.service.WorkspaceService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.UUID;

@Service @RequiredArgsConstructor
public class WorkspaceServiceImpl implements WorkspaceService {
    private final WorkspaceRepository workspaces;
    private final MembershipRepository members;
    private final CurrentUserService currentUser;

    @Override @Transactional
    public WorkspaceResponse create(CreateWorkspaceRequest request) {
        UUID userId = currentUser.requireUserId();
        UUID id = UUID.randomUUID();
        String name = request.getName().trim();
        workspaces.insert(id, name);
        members.insert(id, userId, WorkspaceRole.OWNER);
        return new WorkspaceResponse(id, name, WorkspaceRole.OWNER);
    }
    @Override @Transactional(readOnly = true)
    public List<WorkspaceResponse> mine() {
        return workspaces.findForUser(currentUser.requireUserId());
    }
}
```

File đầy đủ `workspace/controller/WorkspaceController.java`:

```java
package com.hybridflow.workspace.controller;
import com.hybridflow.workspace.dto.CreateWorkspaceRequest;
import com.hybridflow.workspace.dto.WorkspaceResponse;
import com.hybridflow.workspace.service.WorkspaceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController @RequiredArgsConstructor
@RequestMapping("/api/v1/workspaces")
public class WorkspaceController {
    private final WorkspaceService service;
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public WorkspaceResponse create(@Valid @RequestBody CreateWorkspaceRequest request) {
        return service.create(request);
    }
    @GetMapping
    public List<WorkspaceResponse> mine() { return service.mine(); }
}
```

Request `POST /workspaces`: `{"name":"Cửa hàng A"}`. Response 201: `{"id":"UUID","name":"Cửa hàng A","role":"OWNER"}`. `GET /workspaces` chỉ trả workspace mình tham gia.

Tự kiểm tra: tạo hai tài khoản, mỗi tài khoản tạo một workspace. Danh sách tài khoản B không chứa workspace A. Ép lỗi khi insert membership phải rollback cả workspace, không để workspace mồ côi.

## Bài 4. Module và phân quyền thành viên

Hãy dùng đúng mẫu DTO → interface → implementation → repository → controller vừa học. Phần dưới là **đoạn ghép** để bạn xây các lớp tương ứng, không phải class độc lập.

DTO `SaveModuleRequest`: `name` (`@NotBlank`, `@Size(max=120)`), `description` (`@Size(max=1000)`, `enabled` kiểu `boolean`. Response thêm `id`, `workspaceId`. Khi tạo, description mặc định `""`, enabled mặc định true.

Các method trong `ModuleService`:

```java
ModuleResponse create(UUID workspaceId, SaveModuleRequest request);
ModuleResponse update(UUID workspaceId, UUID moduleId, SaveModuleRequest request);
List<ModuleResponse> list(UUID workspaceId);
```

Luồng `create`: `access.requireManager(workspaceId)` → tạo UUID → gọi repository insert → ghi audit → trả DTO. Luồng `update`:

```java
// Đoạn ghép trong ModuleServiceImpl; các dependency là service/repository tương ứng.
@Transactional
public ModuleResponse update(UUID workspaceId, UUID moduleId, SaveModuleRequest request) {
    access.requireManager(workspaceId);
    int changed = modules.update(workspaceId, moduleId, request);
    if (changed == 0) throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND);
    audit.append(workspaceId, currentUser.requireUserId(), "MODULE_UPDATED", moduleId.toString());
    return modules.find(workspaceId, moduleId)
            .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
}
```

SQL trong `ModuleRepository.update`:

```java
return jdbc.update("""
        UPDATE business_modules SET name=?,description=?,enabled=?
        WHERE workspace_id=? AND id=?
        """, request.getName().trim(), request.getDescription(), request.isEnabled(), workspaceId, moduleId);
```

Không chỉ `WHERE id=?`: workspace trong URL cũng phải tham gia query. Tắt module còn phải sửa worker theo bài 7; nút tắt ở đây chưa hoàn thành FR-003.

Thành viên: thêm `MemberService` với `list`, `changeRole`, `remove`. Tất cả thay đổi role/remove phải:

1. `requireOwner(workspaceId)`; không dùng `userId` body làm người thao tác.
2. Lock membership đích: `SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=? FOR UPDATE`.
3. Không tìm thấy → 404. Đích đang OWNER hoặc role mới OWNER → 409; chuyển quyền Owner là tính năng khác.
4. Update/delete bằng cả `workspace_id` và `user_id`, ghi audit cùng transaction.
5. Xóa các workflow grant của thành viên vừa bị loại. Worker không giả làm thành viên đó; workflow đã lưu thuộc workspace và tiếp tục theo chính sách automation.

Không cho Editor sửa role, không cho Admin tự nâng mình thành Owner. Với list module/thống kê: Owner/Admin thấy tất cả; Editor/Viewer chỉ đếm workflow họ được cấp quyền, không dùng tổng của workspace rồi trả về cho mọi người.

Audit: `AuditService.append` → `AuditRepository.insert`; service interface và implementation theo quy ước repo. SQL:

```java
jdbc.update("""
        INSERT INTO workspace_audit(id,workspace_id,actor_user_id,action,resource_id,correlation_id)
        VALUES (?,?,?,?,?,?)
        """, UUID.randomUUID(), workspaceId, actorUserId, action, resourceId, correlationId);
```

Lấy correlation ID từ hạ tầng `ErrorContext`/filter hiện có. Audit lưu loại thao tác và ID, không lưu token hoặc toàn bộ nội dung ô Sheet. Thêm audit vào create workspace của bài 3 sau khi hoàn thành lớp này.

## Bài 5. Mời thành viên bằng link có hạn

Bản đầu trả link cho Owner tự chia sẻ. Chưa cần tích hợp dịch vụ gửi email. Token ngẫu nhiên 32 byte, lưu SHA-256 trong database; token gốc chỉ trả một lần khi tạo lời mời. Không dùng UUID ngắn hoặc email làm token.

File đầy đủ `workspace/util/InvitationTokens.java`:

```java
package com.hybridflow.workspace.util;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

public final class InvitationTokens {
    private static final SecureRandom RANDOM = new SecureRandom();
    private InvitationTokens() {}
    public static String create() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    public static String hash(String raw) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
```

Đoạn ghép `InvitationServiceImpl.create`:

```java
@Transactional
public InvitationResponse create(UUID workspaceId, InviteMemberRequest request) {
    access.requireOwner(workspaceId);
    if (request.getRole() == WorkspaceRole.OWNER) {
        throw new ValidationException("Không thể mời thêm Owner.");
    }
    String raw = InvitationTokens.create();
    UUID id = UUID.randomUUID();
    Instant expiresAt = clock.instant().plus(Duration.ofHours(48));
    invitations.insert(id, workspaceId, request.getEmail().trim().toLowerCase(Locale.ROOT),
            request.getRole(), InvitationTokens.hash(raw), expiresAt, currentUser.requireUserId());
    audit.append(workspaceId, currentUser.requireUserId(), "MEMBER_INVITED", id.toString());
    return new InvitationResponse(id, frontendOrigin + "/#invite=" + raw, expiresAt);
}
```

`InviteMemberRequest`: email có `@NotBlank @Email @Size(max=320)`; role có `@NotNull`. Response gồm `UUID id`, `String invitationUrl`, `Instant expiresAt`. Thuộc tính `frontendOrigin` lấy từ cấu hình, không lấy từ body.

Đoạn ghép `InvitationServiceImpl.accept`:

```java
@Transactional
public WorkspaceResponse accept(AcceptInvitationRequest request) {
    MeResponse user = currentUser.requireUser();
    InvitationRow invitation = invitations.lockByHash(InvitationTokens.hash(request.getToken()))
            .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
    if (!"PENDING".equals(invitation.getState())
            || !invitation.getExpiresAt().isAfter(clock.instant())) {
        throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Lời mời đã hết hạn hoặc đã được sử dụng.");
    }
    if (!invitation.getEmail().equalsIgnoreCase(user.getEmail())) {
        throw new ApplicationException(ErrorCode.ACCESS_DENIED);
    }
    members.insertIfAbsent(invitation.getWorkspaceId(), user.getId(), invitation.getRole());
    invitations.markAccepted(invitation.getId(), user.getId());
    audit.append(invitation.getWorkspaceId(), user.getId(), "INVITATION_ACCEPTED", invitation.getId().toString());
    return workspaces.findForUser(user.getId()).stream()
            .filter(workspace -> workspace.getId().equals(invitation.getWorkspaceId()))
            .findFirst().orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
}
```

`AcceptInvitationRequest.token`: `@NotBlank @Size(min=43,max=43)`. Không log body API này. `InvitationRow` là class có getter cho `id,workspaceId,email,role,expiresAt,state`; mapping từ SQL bằng `RowMapper`, giống WorkspaceRepository.

SQL chính trong repository:

```sql
-- lockByHash, dùng transaction của service
SELECT id,workspace_id,email,role,expires_at,state
FROM workspace_invitations WHERE token_hash=? FOR UPDATE;

-- insertIfAbsent: không được hạ/nâng role của người đã là thành viên
INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (?,?,?)
ON CONFLICT(workspace_id,user_id) DO NOTHING;

-- markAccepted
UPDATE workspace_invitations SET state='ACCEPTED',accepted_by=? WHERE id=?;

-- revoke: service đã requireOwner; query vẫn scope workspace
UPDATE workspace_invitations SET state='REVOKED'
WHERE workspace_id=? AND id=? AND state='PENDING';
```

Create SQL dùng đúng các cột trong V15, token_hash và expires_at đều truyền bằng tham số. Bài tự làm: viết `InvitationRepository`, interface `InvitationService`, DTO, controller theo mẫu bài 3; không đặt SQL trong service.

Test tối thiểu: đúng email thành công; sai email 403; hết hạn/thu hồi/dùng lại 409; hai request nhận cùng token đồng thời chỉ một thành công; người đã là Owner nhận một lời mời Viewer vẫn là Owner. Frontend đọc token từ fragment và chỉ POST khi người dùng bấm **Chấp nhận**, không tự gửi khi vừa mở link.

## Chốt bài 3–5

Bạn cần có 4 nhóm API hoạt động: workspace, members, modules và invitations. Mỗi nhóm đều phải có test vượt quyền, không chỉ happy path. Sau đó mới ghép editor đồng bộ ở bài tiếp theo.
