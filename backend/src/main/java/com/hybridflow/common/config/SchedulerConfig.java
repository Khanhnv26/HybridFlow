package com.hybridflow.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import java.time.Clock;
import java.util.concurrent.*;

@Configuration
public class SchedulerConfig {
    @Bean
    public Clock schedulerClock() { return Clock.systemUTC(); }

    @Bean(destroyMethod = "shutdown")
    public ThreadPoolExecutor workflowExecutor(@Value("${hybridflow.scheduler.workers:5}") int workers) {
        return new ThreadPoolExecutor(workers, workers, 0, TimeUnit.SECONDS, new SynchronousQueue<>(),
                Thread.ofPlatform().name("workflow-worker-", 0).factory(), new ThreadPoolExecutor.AbortPolicy());
    }
}
