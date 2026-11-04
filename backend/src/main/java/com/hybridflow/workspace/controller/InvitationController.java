package com.hybridflow.workspace.controller;

import com.hybridflow.workspace.dto.request.AcceptInvitationRequest;
import com.hybridflow.workspace.dto.request.InviteMemberRequest;
import com.hybridflow.workspace.dto.response.InvitationResponse;
import com.hybridflow.workspace.dto.response.WorkspaceResponse;
import com.hybridflow.workspace.service.InvitationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/workspaces")
public class InvitationController {
    private final InvitationService service;

    @PostMapping("/{workspaceId}/invitations")
    @ResponseStatus(HttpStatus.CREATED)
    public InvitationResponse create(@PathVariable UUID workspaceId,
                                     @Valid @RequestBody InviteMemberRequest request) {
        return service.create(workspaceId, request);
    }

    @PostMapping("/invitations/accept")
    public WorkspaceResponse accept(@Valid @RequestBody AcceptInvitationRequest request) {
        return service.accept(request);
    }

    @DeleteMapping("/{workspaceId}/invitations/{invitationId}")
    public void revoke(@PathVariable UUID workspaceId, @PathVariable UUID invitationId) {
        service.revoke(workspaceId, invitationId);
    }
}
