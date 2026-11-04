package com.hybridflow.architecture;

import com.hybridflow.auth.controller.AuthController;
import com.hybridflow.connection.controller.GoogleConnectionController;
import com.hybridflow.connection.controller.TelegramConnectionController;
import com.hybridflow.sync.controller.SyncConflictController;
import com.hybridflow.sync.controller.SyncExecutionController;
import com.hybridflow.sync.controller.WorkflowController;
import com.hybridflow.workspace.controller.InvitationController;
import com.hybridflow.workspace.controller.MemberController;
import com.hybridflow.workspace.controller.ModuleController;
import com.hybridflow.workspace.controller.TenantWorkflowController;
import com.hybridflow.workspace.controller.WorkspaceConnectionController;
import com.hybridflow.workspace.controller.WorkspaceController;
import com.sun.source.tree.Tree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.TreeScanner;
import org.junit.jupiter.api.Test;

import javax.tools.JavaCompiler;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;

class ControllerArchitectureTest {
    @Test
    void controllersOnlyDependOnServiceInterfaces() {
        List<Class<?>> controllers = List.of(
                AuthController.class,
                GoogleConnectionController.class,
                TelegramConnectionController.class,
                SyncConflictController.class,
                SyncExecutionController.class,
                WorkflowController.class,
                WorkspaceController.class,
                ModuleController.class,
                MemberController.class,
                InvitationController.class,
                TenantWorkflowController.class,
                WorkspaceConnectionController.class);
        for (Class<?> controller : controllers) {
            for (Field dependency : controller.getDeclaredFields()) {
                if (dependency.isSynthetic()) {
                    continue;
                }
                Class<?> type = dependency.getType();
                assertTrue(type.isInterface() && type.getPackageName().contains(".service"),
                        controller.getSimpleName() + " must depend on a service interface, not " + type.getName());
            }
        }
    }

    @Test
    void controllerSourcesDoNotContainBusinessControlFlowOrPersistenceCode() throws Exception {
        Path sourceRoot = Path.of(System.getProperty("basedir", "."), "src/main/java/com/hybridflow");
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        assertNotNull(compiler, "Architecture checks require a JDK.");
        try (Stream<Path> sourcePaths = Files.walk(sourceRoot);
             StandardJavaFileManager files = compiler.getStandardFileManager(null, null, null)) {
            List<Path> controllers = sourcePaths.filter(path -> path.toString().endsWith("Controller.java")).toList();
            assertFalse(controllers.isEmpty());
            JavacTask task = (JavacTask) compiler.getTask(null, files, null, List.of("-proc:none"), null,
                    files.getJavaFileObjectsFromPaths(controllers));
            for (com.sun.source.tree.CompilationUnitTree controller : task.parse()) {
                new TreeScanner<Void, Void>() {
                    @Override
                    public Void scan(Tree tree, Void unused) {
                        if (tree != null) {
                            assertFalse(List.of(Tree.Kind.IF, Tree.Kind.TRY, Tree.Kind.THROW,
                                    Tree.Kind.CONDITIONAL_EXPRESSION, Tree.Kind.FOR_LOOP, Tree.Kind.ENHANCED_FOR_LOOP,
                                    Tree.Kind.WHILE_LOOP, Tree.Kind.DO_WHILE_LOOP, Tree.Kind.SWITCH,
                                    Tree.Kind.SWITCH_EXPRESSION, Tree.Kind.LAMBDA_EXPRESSION).contains(tree.getKind()),
                                    "Move business logic out of " + controller.getSourceFile().getName() + ": " + tree.getKind());
                        }
                        return super.scan(tree, unused);
                    }
                }.scan(controller, null);
                String source = controller.getSourceFile().getCharContent(true).toString();
                assertFalse(source.contains("JdbcTemplate") || source.contains("ObjectMapper")
                        || source.contains("@Transactional") || source.contains("@Value") || source.contains("<!DOCTYPE"),
                        "Controller must not access persistence/configuration or render templates directly.");
            }
        }
    }
}
