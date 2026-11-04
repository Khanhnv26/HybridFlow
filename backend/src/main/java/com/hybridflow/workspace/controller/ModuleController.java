package com.hybridflow.workspace.controller;

import com.hybridflow.workspace.dto.request.SaveModuleRequest;
import com.hybridflow.workspace.dto.response.ModuleResponse;
import com.hybridflow.workspace.service.ModuleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/workspaces/{workspaceId}/modules")
public class ModuleController {
    private final ModuleService service;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ModuleResponse create(@PathVariable UUID workspaceId, @Valid @RequestBody SaveModuleRequest request) {
        return service.create(workspaceId, request);
    }

    @PutMapping("/{moduleId}")
    public ModuleResponse update(@PathVariable UUID workspaceId, @PathVariable UUID moduleId,
                                 @Valid @RequestBody SaveModuleRequest request) {
        return service.update(workspaceId, moduleId, request);
    }

    @GetMapping
    public List<ModuleResponse> list(@PathVariable UUID workspaceId) {
        return service.list(workspaceId);
    }
}
