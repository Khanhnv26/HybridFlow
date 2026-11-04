package com.hybridflow.workspace.service;

import com.hybridflow.workspace.dto.request.AcceptInvitationRequest;
import com.hybridflow.workspace.dto.request.InviteMemberRequest;
import com.hybridflow.workspace.dto.response.InvitationResponse;
import com.hybridflow.workspace.dto.response.WorkspaceResponse;

import java.util.UUID;

public interface InvitationService {
    InvitationResponse create(UUID workspaceId, InviteMemberRequest request);
    WorkspaceResponse accept(AcceptInvitationRequest request);
    void revoke(UUID workspaceId, UUID invitationId);
}
