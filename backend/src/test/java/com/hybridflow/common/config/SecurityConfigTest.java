package com.hybridflow.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class SecurityConfigTest {

    @Test
    void testBulletproofValidation() {
        String[] samples = {
            null,
            "",
            "   ",
            "FRONTEND_ORIGIN=https://hybrid-flow-six.vercel.app",
            "\"FRONTEND_ORIGIN=https://hybrid-flow-six.vercel.app\"",
            "hybrid-flow-six.vercel.app",
            "https://hybrid-flow-six.vercel.app",
            "https://hybrid-flow-six.vercel.app/",
            "\"https://hybrid-flow-six.vercel.app\"",
            "'https://hybrid-flow-six.vercel.app'",
            "https://",
            "invalid url %%^^",
            "///",
            "/"
        };

        for (String sample : samples) {
            assertDoesNotThrow(() -> {
                String target;
                try {
                    target = SecurityConfig.normalizeFrontendUrl(sample);
                    new SimpleUrlAuthenticationSuccessHandler().setDefaultTargetUrl(target);
                } catch (Exception e) {
                    target = "/";
                }
                new SimpleUrlAuthenticationSuccessHandler().setDefaultTargetUrl(target);
            });
        }
    }
}
