# Bài 1–2: đăng nhập Google và session

Mục tiêu: hiểu ai đang gọi API, đăng nhập/đăng xuất được, API chưa đăng nhập trả 401. Chưa viết Workspace ở bài này.

## Bài 1. Dependency, bảng user và cấu hình

Thêm vào `backend/pom.xml`, bên trong `<dependencies>`. Giữ version do Spring Boot quản lý.

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-oauth2-client</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.security</groupId>
    <artifactId>spring-security-test</artifactId>
    <scope>test</scope>
</dependency>
```

File mới `backend/src/main/resources/db/migration/V14__accounts.sql`:

```sql
CREATE TABLE app_users (
    id UUID PRIMARY KEY,
    google_subject VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(320) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`google_subject` là định danh `sub` của Google, dùng làm khóa đăng nhập; email có thể thay đổi. Chưa tự liên kết hai tài khoản chỉ vì cùng email. Google giải thích cách nhận diện người dùng bằng ID token trong [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

Thêm cấu hình vào `application.properties`:

```properties
spring.security.oauth2.client.registration.google.client-id=${GOOGLE_LOGIN_CLIENT_ID}
spring.security.oauth2.client.registration.google.client-secret=${GOOGLE_LOGIN_CLIENT_SECRET}
spring.security.oauth2.client.registration.google.scope=openid,email,profile
spring.security.oauth2.client.registration.google.redirect-uri=${APP_LOGIN_CALLBACK:http://localhost:3000/login/oauth2/code/google}
server.servlet.session.timeout=30m
server.servlet.session.cookie.http-only=true
server.servlet.session.cookie.same-site=lax
server.servlet.session.cookie.secure=${SESSION_COOKIE_SECURE:false}
```

Trong Google Cloud, đăng ký callback login `http://localhost:3000/login/oauth2/code/google`. Đây là callback đăng nhập; giữ callback cấp quyền Sheets hiện có tách riêng. Chỉ đặt secret qua môi trường hoặc file local đã được Git bỏ qua. Khi production dùng HTTPS, đặt `SESSION_COOKIE_SECURE=true` và callback đúng domain thật.

Trong `frontend/vite.config.ts`, giữ proxy `/api`, thêm hai proxy để cùng origin cho phiên đăng nhập:

```ts
'/oauth2': { target: 'http://localhost:8080', changeOrigin: true },
'/login/oauth2': { target: 'http://localhost:8080', changeOrigin: true },
```

Trong production reverse proxy cũng chuyển cả `/api`, `/oauth2`, `/login/oauth2` vào backend. Chưa dùng hai domain khác site trong bài này.

## Bài 2. Code từng file

### 2.1 DTO

File đầy đủ `auth/dto/MeResponse.java`:

```java
package com.hybridflow.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import java.util.UUID;

@Getter
@AllArgsConstructor
public class MeResponse {
    private final UUID id;
    private final String email;
    private final String displayName;
}
```

File đầy đủ `auth/dto/CsrfResponse.java`:

```java
package com.hybridflow.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class CsrfResponse {
    private final String headerName;
    private final String token;
}
```

### 2.2 Repository

File đầy đủ `auth/repository/AccountRepository.java`:

```java
package com.hybridflow.auth.repository;

import com.hybridflow.auth.dto.MeResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class AccountRepository {
    private final JdbcTemplate jdbc;

    public void upsertGoogle(String subject, String email, String name) {
        jdbc.update("""
                INSERT INTO app_users(id, google_subject, email, display_name)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(google_subject) DO UPDATE
                SET email=EXCLUDED.email, display_name=EXCLUDED.display_name,
                    updated_at=now()
                """, UUID.randomUUID(), subject, email, name);
    }

    public Optional<MeResponse> findBySubject(String subject) {
        return jdbc.query("""
                SELECT id, email, display_name FROM app_users WHERE google_subject=?
                """, (rs, row) -> new MeResponse(rs.getObject("id", UUID.class),
                rs.getString("email"), rs.getString("display_name")), subject)
                .stream().findFirst();
    }
}
```

### 2.3 Service tài khoản và người đang đăng nhập

File đầy đủ `auth/service/AccountService.java`:

```java
package com.hybridflow.auth.service;

import org.springframework.security.oauth2.core.oidc.user.OidcUser;

public interface AccountService {
    void saveGoogleUser(OidcUser user);
}
```

File đầy đủ `auth/service/impl/AccountServiceImpl.java`:

```java
package com.hybridflow.auth.service.impl;

import com.hybridflow.auth.repository.AccountRepository;
import com.hybridflow.auth.service.AccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class AccountServiceImpl implements AccountService {
    private final AccountRepository accounts;

    @Override
    @Transactional
    public void saveGoogleUser(OidcUser user) {
        if (!Boolean.TRUE.equals(user.getEmailVerified()) || user.getEmail() == null) {
            throw new OAuth2AuthenticationException("email_not_verified");
        }
        String email = user.getEmail().trim().toLowerCase(Locale.ROOT);
        String name = user.getFullName() == null ? email : user.getFullName();
        accounts.upsertGoogle(user.getSubject(), email, name);
    }
}
```

File đầy đủ `auth/service/CurrentUserService.java`:

```java
package com.hybridflow.auth.service;

import com.hybridflow.auth.dto.MeResponse;
import java.util.UUID;

public interface CurrentUserService {
    MeResponse requireUser();
    UUID requireUserId();
}
```

File đầy đủ `auth/service/impl/CurrentUserServiceImpl.java`:

```java
package com.hybridflow.auth.service.impl;

import com.hybridflow.auth.dto.MeResponse;
import com.hybridflow.auth.repository.AccountRepository;
import com.hybridflow.auth.service.CurrentUserService;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CurrentUserServiceImpl implements CurrentUserService {
    private final AccountRepository accounts;

    @Override
    public MeResponse requireUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof OidcUser)) {
            throw new ApplicationException(ErrorCode.AUTHENTICATION_REQUIRED);
        }
        OidcUser principal = (OidcUser) auth.getPrincipal();
        return accounts.findBySubject(principal.getSubject())
                .orElseThrow(() -> new ApplicationException(ErrorCode.AUTHENTICATION_REQUIRED));
    }

    @Override
    public UUID requireUserId() { return requireUser().getId(); }
}
```

`SecurityContextHolder` chỉ dùng ở đường HTTP; worker chạy nền không có session người dùng. Không truyền `userId` từ body vào service để giả làm người đăng nhập.

### 2.4 Điểm nối với Google Login

File đầy đủ `auth/security/GoogleOidcUserLoader.java`:

```java
package com.hybridflow.auth.security;

import com.hybridflow.auth.service.AccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GoogleOidcUserLoader implements OAuth2UserService<OidcUserRequest, OidcUser> {
    private final AccountService accounts;
    private final OidcUserService delegate = new OidcUserService();

    @Override
    public OidcUser loadUser(OidcUserRequest request) {
        OidcUser user = delegate.loadUser(request);
        accounts.saveGoogleUser(user);
        return user;
    }
}
```

Spring xử lý việc đổi code, kiểm tra OIDC và quản lý callback; loader chỉ ghi hồ sơ ứng dụng. Không tự giải mã JWT rồi tin claims chưa xác minh.

### 2.5 Lỗi Security vẫn phải theo format repo

File đầy đủ `auth/security/SecurityErrorWriter.java`:

```java
package com.hybridflow.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.dto.ApiError;
import com.hybridflow.common.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class SecurityErrorWriter {
    private final ObjectMapper mapper;

    public void write(HttpServletRequest request, HttpServletResponse response,
                      ErrorCode code) throws IOException {
        String correlationId = UUID.randomUUID().toString();
        response.setStatus(code.getStatus());
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("X-Correlation-ID", correlationId);
        response.setHeader("Cache-Control", "no-store");
        mapper.writeValue(response.getWriter(), new ApiError(Instant.now(), code.getStatus(),
                HttpStatus.valueOf(code.getStatus()).getReasonPhrase(), code.name(),
                code.getMessage(), correlationId, request.getRequestURI(), false, 0, List.of()));
    }
}
```

Bản đầu sinh correlation ID cho lỗi filter. Bài tự làm nhỏ sau khi chạy được: tái sử dụng ID do `CorrelationIdFilter` sinh nếu filter đó chạy trước Security, thay vì sinh ID thứ hai. Không lấy một chuỗi header tùy ý rồi in thẳng vào log.

### 2.6 SecurityConfig

File đầy đủ `common/config/SecurityConfig.java`:

```java
package com.hybridflow.common.config;

import com.hybridflow.auth.security.GoogleOidcUserLoader;
import com.hybridflow.auth.security.SecurityErrorWriter;
import com.hybridflow.common.exception.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;

@Configuration
public class SecurityConfig {
    @Bean
    public SecurityFilterChain applicationSecurity(HttpSecurity http,
            GoogleOidcUserLoader loader, SecurityErrorWriter errors,
            @Value("${app.frontend-origin:http://localhost:3000}") String frontend) throws Exception {
        http.cors(Customizer.withDefaults());
        http.csrf(csrf -> csrf.csrfTokenRepository(new HttpSessionCsrfTokenRepository()));
        http.authorizeHttpRequests(access -> access
                .requestMatchers("/api/v1/auth/csrf", "/api/v1/auth/login/google",
                        "/oauth2/**", "/login/oauth2/**", "/error").permitAll()
                .anyRequest().authenticated());
        http.requestCache(cache -> cache.disable());
        http.oauth2Login(login -> login
                .userInfoEndpoint(info -> info.oidcUserService(loader))
                .defaultSuccessUrl(frontend, true)
                .failureUrl(frontend + "/?login=failed"));
        http.exceptionHandling(handler -> handler
                .authenticationEntryPoint((request, response, exception) ->
                        errors.write(request, response, ErrorCode.AUTHENTICATION_REQUIRED))
                .accessDeniedHandler((request, response, exception) ->
                        errors.write(request, response, ErrorCode.ACCESS_DENIED)));
        http.logout(logout -> logout.logoutUrl("/api/v1/auth/logout")
                .invalidateHttpSession(true).clearAuthentication(true).deleteCookies("JSESSIONID")
                .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)));
        return http.build();
    }
}
```

Cookie là thông tin phiên; CSRF token là thông tin chống giả mạo request. Giữ mặc định XOR request handler của Spring: token trả qua API bên dưới là token từ request attribute, rồi gửi nguyên token đó trong header. Không trộn với ví dụ đọc raw cookie CSRF của tutorial khác.

### 2.7 API /auth/me và /auth/csrf

File đầy đủ `auth/service/AuthService.java`:

```java
package com.hybridflow.auth.service;

import com.hybridflow.auth.dto.CsrfResponse;
import com.hybridflow.auth.dto.MeResponse;
import org.springframework.security.web.csrf.CsrfToken;

public interface AuthService {
    MeResponse me();
    CsrfResponse csrf(CsrfToken token);
    String googleLoginUrl();
}
```

File đầy đủ `auth/service/impl/AuthServiceImpl.java`:

```java
package com.hybridflow.auth.service.impl;

import com.hybridflow.auth.dto.CsrfResponse;
import com.hybridflow.auth.dto.MeResponse;
import com.hybridflow.auth.service.AuthService;
import com.hybridflow.auth.service.CurrentUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {
    private final CurrentUserService currentUser;
    @Override public MeResponse me() { return currentUser.requireUser(); }
    @Override public CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }
    @Override public String googleLoginUrl() { return "/oauth2/authorization/google"; }
}
```

File đầy đủ `auth/controller/AuthController.java`:

```java
package com.hybridflow.auth.controller;

import com.hybridflow.auth.dto.CsrfResponse;
import com.hybridflow.auth.dto.MeResponse;
import com.hybridflow.auth.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.view.RedirectView;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService auth;
    @GetMapping("/me")
    public ResponseEntity<MeResponse> me() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(auth.me());
    }
    @GetMapping("/csrf")
    public ResponseEntity<CsrfResponse> csrf(CsrfToken token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(auth.csrf(token));
    }
    @GetMapping("/login/google")
    public RedirectView google() { return new RedirectView(auth.googleLoginUrl()); }
}
```

Không viết controller logout: Spring Security đã xử lý POST `/api/v1/auth/logout`.

## Tự kiểm tra trước khi sang bài 3

1. Chưa login, gọi `GET http://localhost:3000/api/v1/auth/me`: 401 JSON, không phải HTML đăng nhập.
2. Mở `http://localhost:3000/api/v1/auth/login/google`: Google consent, quay lại frontend; `/auth/me` trả `{id,email,displayName}`.
3. Login lại cùng tài khoản: `app_users` vẫn một dòng.
4. `GET /auth/csrf` trả `{headerName,token}`. POST logout kèm header đó trả 204; `/auth/me` sau đó trả 401.
5. POST logout khi thiếu CSRF trả 403. Sau login/logout phải lấy token CSRF mới, không tái sử dụng token cũ.
6. Đặt timeout tạm `60s`, không gọi API trong hơn 60 giây; `/auth/me` trả 401. Khôi phục 30m sau test.

Sau khi thêm Security, các test API cũ gọi request ẩn danh sẽ cần cập nhật: thêm `oidcLogin()` và `.with(csrf())` cho request ghi. Không sửa cấu hình production thành `permitAll()` để làm test xanh. Bài 10 hướng dẫn các lớp test cần thêm.
