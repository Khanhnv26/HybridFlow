import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthGate } from './components/auth/AuthGate';
import { WorkspacePicker } from './components/workspace/WorkspacePicker';
import { ModuleWorkflowPicker } from './components/workspace/ModuleWorkflowPicker';
import { LandingPage } from './pages/LandingPage';
import { OpenWorkspace } from './pages/LoginPage';
import { resolveRoute, syncOAuthRedirect } from './router';
import App from './App.tsx';
import './index.css';
import './studio.css';
import { BootstrapPreloader } from './components/Preloader';

syncOAuthRedirect();
const route = resolveRoute(window.location.pathname, window.location.search);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <><BootstrapPreloader /><React.StrictMode>
    {route === 'workspace' ? (
      <AuthGate>
        {user => (
          <WorkspacePicker key={user.id}>
            {(workspace, workspaceNav) => (
              <ModuleWorkflowPicker workspace={workspace} workspaceNavigation={workspaceNav}>
                {(workflow, fullNav) => (
                  <App
                    key={`${user.id}:${workspace.id}:${workflow.id}`}
                    userId={user.id}
                    workspaceId={workspace.id}
                    workspaceRole={workspace.role}
                    workflowId={workflow.id}
                    navigation={fullNav}
                  />
                )}
              </ModuleWorkflowPicker>
            )}
          </WorkspacePicker>
        )}
      </AuthGate>
    ) : route === 'login' ? (
      <AuthGate>{() => <OpenWorkspace />}</AuthGate>
    ) : (
      <LandingPage />
    )}
  </React.StrictMode></>,
);
