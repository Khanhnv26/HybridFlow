package com.hybridflow.common.config;

import com.hybridflow.auth.security.GoogleOidcUserLoader;
import com.hybridflow.auth.security.GoogleLoginFailureHandler;
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
                                                   GoogleLoginFailureHandler loginFailure,
                                                   @Value("${app.frontend-origin:http://localhost:3000}") String frontend) throws Exception {
        http.cors(Customizer.withDefaults());
        http.csrf(csrf -> csrf.ignoringRequestMatchers("/api/v1/health", "/api/v1/webhooks/**")
                .csrfTokenRepository(new HttpSessionCsrfTokenRepository()));
        http.authorizeHttpRequests(access -> access
                .requestMatchers("/api/v1/health", "/api/v1/auth/csrf", "/api/v1/auth/login/google",
                        "/oauth2/**", "/login/oauth2/**", "/api/v1/webhooks/**", "/error").permitAll()
                .requestMatchers("/api/v1/workflows/**", "/api/v1/sync/**", "/api/v1/conflicts/**",
                        "/api/v1/sync-conflicts/**", "/api/v1/notifications/**", "/api/v1/connections/**").denyAll()
                .anyRequest().authenticated());
        http.requestCache(cache -> cache.disable());
        http.oauth2Login(login -> login
                .userInfoEndpoint(info -> info.oidcUserService(loader))
                .defaultSuccessUrl(frontend, true)
                .failureHandler(loginFailure));
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
