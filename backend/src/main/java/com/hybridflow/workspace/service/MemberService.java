package com.hybridflow.workspace.service;

import com.hybridflow.workspace.dto.request.ChangeRoleRequest;
import com.hybridflow.workspace.dto.response.MemberResponse;

import java.util.List;
import java.util.UUID;

public interface MemberService {
    List<MemberResponse> list(UUID workspaceId);
    void changeRole(UUID workspaceId, UUID targetUserId, ChangeRoleRequest request);
    void remove(UUID workspaceId, UUID targetUserId);
}
