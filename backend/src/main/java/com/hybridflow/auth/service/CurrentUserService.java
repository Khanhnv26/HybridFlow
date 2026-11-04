package com.hybridflow.auth.service;

import com.hybridflow.auth.dto.response.MeResponse;

import java.util.UUID;

public interface CurrentUserService {
    MeResponse requireUser();
    UUID requireUserId();
}
