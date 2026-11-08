import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthGate } from './components/auth/AuthGate';
import { WorkspacePicker } from './components/workspace/WorkspacePicker';
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
          <WorkspacePicker key={user.id} user={user}>
            {navigation => (
              <App
                key={`${user.id}:${navigation.selectedWorkspaceId}:${navigation.selectedWorkflowId}`}
                user={user}
                userId={user.id}
                workspaceId={navigation.selectedWorkspaceId}
                workspaceRole={navigation.workspaceRole}
                workflowId={navigation.selectedWorkflowId}
                navigation={navigation}
              />
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
