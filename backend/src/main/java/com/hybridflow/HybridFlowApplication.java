package com.hybridflow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class HybridFlowApplication {

    public static void main(String[] args) {
        SpringApplication.run(HybridFlowApplication.class, args);
    }
}
