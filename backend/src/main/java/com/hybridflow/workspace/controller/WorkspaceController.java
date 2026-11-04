package com.hybridflow.workspace.controller;

import com.hybridflow.workspace.dto.request.CreateWorkspaceRequest;
import com.hybridflow.workspace.dto.response.WorkspaceResponse;
import com.hybridflow.workspace.service.WorkspaceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/workspaces")
public class WorkspaceController {
    private final WorkspaceService service;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WorkspaceResponse create(@Valid @RequestBody CreateWorkspaceRequest request) {
        return service.create(request);
    }

    @GetMapping
    public List<WorkspaceResponse> mine() {
        return service.mine();
    }
}
