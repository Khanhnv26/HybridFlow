package com.hybridflow.workspace.controller;

import com.hybridflow.workspace.dto.request.ChangeRoleRequest;
import com.hybridflow.workspace.dto.response.MemberResponse;
import com.hybridflow.workspace.service.MemberService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/workspaces/{workspaceId}/members")
public class MemberController {
    private final MemberService service;

    @GetMapping
    public List<MemberResponse> list(@PathVariable UUID workspaceId) {
        return service.list(workspaceId);
    }

    @PutMapping("/{userId}/role")
    public void changeRole(@PathVariable UUID workspaceId, @PathVariable UUID userId,
                           @Valid @RequestBody ChangeRoleRequest request) {
        service.changeRole(workspaceId, userId, request);
    }

    @DeleteMapping("/{userId}")
    public void remove(@PathVariable UUID workspaceId, @PathVariable UUID userId) {
        service.remove(workspaceId, userId);
    }
}
