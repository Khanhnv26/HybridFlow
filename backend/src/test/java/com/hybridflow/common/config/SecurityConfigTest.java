package com.hybridflow.common.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SecurityConfigTest {

    @Test
    void shouldNormalizeFrontendUrlsCorrectly() {
        assertEquals("http://localhost:3000", SecurityConfig.normalizeFrontendUrl(null));
        assertEquals("http://localhost:3000", SecurityConfig.normalizeFrontendUrl(""));
        assertEquals("http://localhost:3000", SecurityConfig.normalizeFrontendUrl("   "));
        assertEquals("https://hybrid-flow-six.vercel.app", SecurityConfig.normalizeFrontendUrl("https://hybrid-flow-six.vercel.app"));
        assertEquals("http://localhost:3000", SecurityConfig.normalizeFrontendUrl("http://localhost:3000"));
        assertEquals("https://hybrid-flow-six.vercel.app", SecurityConfig.normalizeFrontendUrl("hybrid-flow-six.vercel.app"));
        assertEquals("https://hybrid-flow-six.vercel.app", SecurityConfig.normalizeFrontendUrl("\"https://hybrid-flow-six.vercel.app\""));
        assertEquals("https://hybrid-flow-six.vercel.app", SecurityConfig.normalizeFrontendUrl("'https://hybrid-flow-six.vercel.app'"));
        assertEquals("https://hybrid-flow-six.vercel.app", SecurityConfig.normalizeFrontendUrl("  hybrid-flow-six.vercel.app  "));
        assertEquals("/", SecurityConfig.normalizeFrontendUrl("/"));
    }
}
