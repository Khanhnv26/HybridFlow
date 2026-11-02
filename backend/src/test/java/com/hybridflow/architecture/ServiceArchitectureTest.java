package com.hybridflow.architecture;

import org.junit.jupiter.api.Test;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;

class ServiceArchitectureTest {
    @Test
    void servicePackagesContainInterfacesAndImplementationsHaveTheCorrectLocation() throws Exception {
        Path sourceRoot = Path.of(System.getProperty("basedir", "."), "src/main/java/com/hybridflow");
        try (Stream<Path> sourcePaths = Files.walk(sourceRoot)) {
            List<Path> services = sourcePaths.filter(path -> path.toString().endsWith(".java"))
                    .filter(path -> path.toString().replace('\\', '/').contains("/service/")).toList();
            assertFalse(services.isEmpty());
            for (Path sourcePath : services) {
                String className = "com.hybridflow." + sourceRoot.relativize(sourcePath).toString()
                        .replace('\\', '.').replace('/', '.').replaceFirst("[.]java$", "");
                Class<?> type = Class.forName(className, false, getClass().getClassLoader());
                if (sourcePath.getParent().getFileName().toString().equals("service")) {
                    assertTrue(type.isInterface(), className + " must be an interface; move implementation, persistence and utility classes out of service.");
                } else if (type.isAnnotationPresent(Service.class)) {
                    assertTrue(type.getPackageName().endsWith(".service.impl") && type.getSimpleName().endsWith("ServiceImpl"),
                            className + " must be a ServiceImpl in service.impl.");
                    assertTrue(Stream.of(type.getInterfaces()).anyMatch(contract -> contract.getPackageName()
                            .equals(type.getPackageName().replace(".impl", ""))), className + " must implement its service interface.");
                }
                String source = Files.readString(sourcePath);
                assertFalse(source.contains("JdbcTemplate") || source.contains("SELECT ") || source.contains("INSERT ")
                                || source.contains("UPDATE ") || source.contains("DELETE "),
                        className + " must delegate SQL to a repository.");
            }
        }
    }
}
