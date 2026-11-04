import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthGate } from './components/auth/AuthGate';
import { WorkspacePicker } from './components/workspace/WorkspacePicker';
import { ModuleWorkflowPicker } from './components/workspace/ModuleWorkflowPicker';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      {user => (
        <WorkspacePicker key={user.id}>
          {workspace => (
            <ModuleWorkflowPicker workspace={workspace}>
              {workflow => (
                <App
                  key={`${user.id}:${workspace.id}:${workflow.id}`}
                  userId={user.id}
                  workspaceId={workspace.id}
                  workspaceRole={workspace.role}
                  workflowId={workflow.id}
                />
              )}
            </ModuleWorkflowPicker>
          )}
        </WorkspacePicker>
      )}
    </AuthGate>
  </React.StrictMode>,
);
