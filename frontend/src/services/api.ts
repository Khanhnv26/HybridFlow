import axios from 'axios';
import type {
  SheetDataResponse,
  UpdateCellRequest,
  UpdateCellResponse,
  SyncConflictDto,
  RunSyncRequestPayload,
  RunSyncResponse,
  TelegramAlertResponse,
  ExecutionHistoryDto,
  SpreadsheetMetadataResponse,
  TelegramBotInfo,
  TelegramRecipient,
  TelegramLink,
  NotificationOutboxItem,
  Me,
  Workspace,
  BusinessModule,
  TenantWorkflowSummary,
  WorkspaceConnectionResponse,
  SheetWritePreviewRequest,
  SheetWritePreviewResponse,
} from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000,
  withCredentials: true,
});

interface CsrfInfo {
  headerName: string;
  token: string;
}

let csrfInfo: CsrfInfo | null = null;
let csrfPending: Promise<CsrfInfo> | null = null;

export function invalidateCsrf() {
  csrfInfo = null;
  csrfPending = null;
}

async function ensureCsrf(): Promise<CsrfInfo> {
  if (csrfInfo) return csrfInfo;
  if (!csrfPending) {
    csrfPending = apiClient.get<CsrfInfo>('/auth/csrf')
      .then(response => {
        csrfInfo = response.data;
        return response.data;
      })
      .finally(() => {
        csrfPending = null;
      });
  }
  return csrfPending;
}

apiClient.interceptors.request.use(async config => {
  const method = (config.method || 'get').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = await ensureCsrf();
    config.headers.set(csrf.headerName, csrf.token);
  }
  return config;
});

apiClient.interceptors.response.use(
  response => response,
  error => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url || '';
      if (!url.includes('/auth/me')) {
        window.dispatchEvent(new CustomEvent('auth-expired'));
      }
    }
    return Promise.reject(error);
  }
);

export const authService = {
  me: async (signal?: AbortSignal) =>
    (await apiClient.get<Me>('/auth/me', { signal })).data,
  logout: async () => {
    await apiClient.post('/auth/logout');
    invalidateCsrf();
  },
};

export const workspaceService = {
  list: async (signal?: AbortSignal) =>
    (await apiClient.get<Workspace[]>('/workspaces', { signal })).data,
  create: async (name: string) =>
    (await apiClient.post<Workspace>('/workspaces', { name })).data,
};

export const moduleService = {
  list: async (workspaceId: string, signal?: AbortSignal) =>
    (await apiClient.get<BusinessModule[]>(`/workspaces/${encodeURIComponent(workspaceId)}/modules`, { signal })).data,
  create: async (workspaceId: string, name: string, description = '', enabled = true) =>
    (await apiClient.post<BusinessModule>(`/workspaces/${encodeURIComponent(workspaceId)}/modules`, { name, description, enabled })).data,
};

export function tenantWorkflowApi(workspaceId: string, workflowId: string) {
  const base = `/workspaces/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflowId)}`;
  return {
    load: async (signal?: AbortSignal) =>
      (await apiClient.get(base, { signal })).data,
    updateStatus: async (enabled: boolean) =>
      (await apiClient.put(`${base}/status`, { enabled })).data,
    save: async (expectedVersion: number, definition: unknown, connectionBindings: unknown[]) =>
      (await apiClient.put(base, { expectedVersion, definition, connectionBindings })).data,
    run: async (bootstrapConfirmed?: boolean) =>
      (await apiClient.post(base + '/run', null, { params: { bootstrapConfirmed } })).data,
    history: async (signal?: AbortSignal) =>
      (await apiClient.get(base + '/history', { signal })).data,
    notifications: async (contextId: string, executionId: string, offset = 0, signal?: AbortSignal) =>
      (await apiClient.get(base + `/contexts/${encodeURIComponent(contextId)}/notifications`,
        { params: { executionId, offset, limit: 50 }, signal })).data,
    retry: async (contextId: string, notificationId: string) =>
      apiClient.post(base + `/contexts/${encodeURIComponent(contextId)}/notifications/${encodeURIComponent(notificationId)}/retry`),
  };
}

export const tenantWorkflowService = {
  list: async (workspaceId: string, signal?: AbortSignal) =>
    (await apiClient.get<TenantWorkflowSummary[]>(`/workspaces/${encodeURIComponent(workspaceId)}/workflows`, { signal })).data,
  create: async (workspaceId: string, moduleId: string, name: string) =>
    (await apiClient.post<TenantWorkflowSummary>(`/workspaces/${encodeURIComponent(workspaceId)}/workflows`, { moduleId, name })).data,
  updateStatus: async (workspaceId: string, workflowId: string, enabled: boolean) =>
    (await apiClient.put<TenantWorkflowSummary>(`/workspaces/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflowId)}/status`, { enabled })).data,
  previewSheetWrite: async (workspaceId: string, workflowId: string, request: SheetWritePreviewRequest, signal?: AbortSignal) =>
    (await apiClient.post<SheetWritePreviewResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflowId)}/sheet-write/preview`,
      request,
      { signal }
    )).data,
};

export const workspaceConnectionService = {
  list: async (workspaceId: string, signal?: AbortSignal) =>
    (await apiClient.get<WorkspaceConnectionResponse[]>(`/workspaces/${encodeURIComponent(workspaceId)}/connections`, { signal })).data,
  startGoogleOAuth: async (workspaceId: string, connectionName = 'Google Sheets') =>
    (await apiClient.post<{ url: string; callbackOrigin: string }>(`/workspaces/${encodeURIComponent(workspaceId)}/connections/google/start`, null, { params: { connectionName } })).data,
  createTelegram: async (workspaceId: string, name: string, botToken: string) =>
    (await apiClient.post<WorkspaceConnectionResponse>(`/workspaces/${encodeURIComponent(workspaceId)}/connections/telegram`, { name, botToken })).data,
  grantRole: async (workspaceId: string, connectionId: string, role = 'EDITOR') => {
    await apiClient.post(`/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}/grants`, null, { params: { role } });
  },
  revoke: async (workspaceId: string, connectionId: string) => {
    await apiClient.post(`/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}/revoke`);
  },
  delete: async (workspaceId: string, connectionId: string) => {
    await apiClient.delete(`/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}`);
  },
  getSheetMetadata: async (workspaceId: string, connectionId: string, spreadsheetId: string, signal?: AbortSignal) =>
    (await apiClient.get<SpreadsheetMetadataResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}/sheets/metadata`,
      { params: { spreadsheetId }, signal }
    )).data,
  readSheet: async (
    workspaceId: string,
    connectionId: string,
    spreadsheetId: string,
    sheetname?: string,
    signal?: AbortSignal,
    columnTypes?: Record<string, 'TEXT' | 'NUMBER'>,
  ) =>
    (await apiClient.post<SheetDataResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}/sheets/read`,
      {
        spreadsheetId,
        sheetname,
        ...(columnTypes && Object.keys(columnTypes).length ? { columnTypes } : {}),
      },
      { signal }
    )).data,
  updateCell: async (
    workspaceId: string,
    connectionId: string,
    payload: {
      spreadsheetId: string;
      range: string;
      value: string;
      valueType?: 'TEXT' | 'NUMBER';
    }
  ) =>
    (await apiClient.post<UpdateCellResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}/sheets/update`,
      payload
    )).data,
  getTelegramInfo: async (workspaceId: string, connectionId: string, signal?: AbortSignal) =>
    (await apiClient.get<{ configured: boolean; botUsername: string; firstName?: string; canJoinGroups: boolean; message: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}/telegram/info`,
      { signal }
    )).data,
};

export function workspaceTelegramApi(workspaceId: string, connectionId: string) {
  const base = `/workspaces/${encodeURIComponent(workspaceId)}/connections/${encodeURIComponent(connectionId)}/telegram`;
  const requireConnection = () => { if (!connectionId) throw new Error('Chọn bot Telegram của workspace trước.'); };
  return {
    getBot: async (signal?: AbortSignal): Promise<TelegramBotInfo> => {
      requireConnection();
      const info = await workspaceConnectionService.getTelegramInfo(workspaceId, connectionId, signal);
      return { configured: info.configured, username: info.botUsername, displayName: info.firstName || info.botUsername,
        canJoinGroups: info.canJoinGroups, message: info.message };
    },
    startLink: async (recipientType: TelegramRecipient['recipientType']): Promise<TelegramLink> => {
      requireConnection();
      return (await apiClient.post(base + '/link', { recipientType })).data;
    },
    pollLink: async (id: string, signal?: AbortSignal): Promise<TelegramLink> => {
      requireConnection();
      return (await apiClient.get(base + `/link/${encodeURIComponent(id)}`, { signal })).data;
    },
    checkRecipient: async (chatId: string, recipientType: TelegramRecipient['recipientType'], signal?: AbortSignal): Promise<TelegramRecipient> => {
      requireConnection();
      return (await apiClient.post(base + '/recipient', { chatId, recipientType }, { signal })).data;
    },
    sendTest: async (chatId: string, recipientType: TelegramRecipient['recipientType']): Promise<{ success: boolean; message: string; recipient: TelegramRecipient }> => {
      requireConnection();
      return (await apiClient.post(base + '/test', { chatId, recipientType })).data;
    },
  };
}

export const googleService = {
  // Bắt đầu OAuth 2.0 Web Flow
  getOAuthStartUrl: () =>
    new URL(`${API_BASE_URL}/connections/google/start`, window.location.origin).href,
  getOAuthConfig: async (): Promise<{ callbackOrigin: string }> =>
    (await apiClient.get('/connections/google/config')).data,
  getMetadata: async (
    accessToken: string,
    spreadsheetId: string,
    signal?: AbortSignal,
  ): Promise<SpreadsheetMetadataResponse> =>
    (
      await apiClient.post(
        '/connections/google/sheets/metadata',
        { accessToken, spreadsheetId },
        { signal },
      )
    ).data,

  // Đọc dữ liệu từ Google Sheets
  readSheet: async (
    accessToken: string,
    spreadsheetId: string,
    sheetname?: string,
    signal?: AbortSignal,
    columnTypes?: Record<string, 'TEXT' | 'NUMBER'>,
  ): Promise<SheetDataResponse> => {
    const response = await apiClient.post<SheetDataResponse>(
      '/connections/google/sheets/read',
      {
        accessToken,
        spreadsheetId,
        sheetname,
        ...(columnTypes && Object.keys(columnTypes).length ? { columnTypes } : {}),
      },
      { signal },
    );
    return response.data;
  },

  // Cập nhật ô trong Google Sheets
  updateCell: async (payload: UpdateCellRequest): Promise<UpdateCellResponse> => {
    const response = await apiClient.post<UpdateCellResponse>(
      '/connections/google/sheets/update',
      payload,
    );
    return response.data;
  },
};

export const syncService = {
  getNotificationPage: async (flowId: string, executionId: string, signal?: AbortSignal, offset = 0): Promise<NotificationOutboxItem[]> =>
    (await apiClient.get(`/workflows/${encodeURIComponent(flowId)}/notifications`, { params: { executionId, limit: 50, offset }, signal })).data,
  getNotifications: async (flowId: string, executionId: string, signal?: AbortSignal): Promise<NotificationOutboxItem[]> =>
    (await apiClient.get(`/workflows/${encodeURIComponent(flowId)}/notifications`, { params: { executionId, limit: 500 }, signal })).data,
  retryNotification: async (id: string): Promise<void> => { await apiClient.post(`/notifications/${encodeURIComponent(id)}/retry`); },
  // Chạy luồng đồng bộ 3-Way Diff trên Backend
  runSync: async (payload: RunSyncRequestPayload): Promise<RunSyncResponse> => {
    const response = await apiClient.post<RunSyncResponse>('/sync/run', payload);
    return response.data;
  },

  // Lấy danh sách xung đột đang OPEN
  getOpenConflicts: async (flowId: string, signal?: AbortSignal): Promise<SyncConflictDto[]> => {
    const response = await apiClient.get<SyncConflictDto[]>('/conflicts', { params: { flowId }, signal });
    return response.data;
  },

  // Giải quyết xung đột
  resolveConflict: async (
    conflictId: number,
    resolvedValue: string,
    accessToken: string,
  ): Promise<SyncConflictDto> => {
    const response = await apiClient.post<SyncConflictDto>(`/conflicts/${conflictId}/resolve`, {
      resolvedValue,
      accessToken,
    });
    return response.data;
  },

  // Gửi lại cảnh báo Telegram cho một conflict cụ thể
  resendTelegramAlert: async (
    conflictId: number,
    chatId: string,
  ): Promise<TelegramAlertResponse> => {
    const response = await apiClient.post<TelegramAlertResponse>(
      `/conflicts/${conflictId}/notify`,
      { chatId },
    );
    return response.data;
  },
  getHistory: async (flowId: string, signal?: AbortSignal): Promise<ExecutionHistoryDto[]> =>
    (await apiClient.get<ExecutionHistoryDto[]>(`/workflows/${encodeURIComponent(flowId)}/history`, { signal }))
      .data,
  clearHistory: async (flowId: string): Promise<void> => {
    await apiClient.delete(`/workflows/${encodeURIComponent(flowId)}/history`);
  },
  getVault: async (flowId: string): Promise<Record<string, string>[]> =>
    (
      await apiClient.get<Record<string, string>[]>(
        `/workflows/${encodeURIComponent(flowId)}/vault`,
      )
    ).data,
};

export const workflowService = {
  run: async (id: string, bootstrapConfirmed: boolean): Promise<RunSyncResponse> =>
    (await apiClient.post(`/workflows/${encodeURIComponent(id)}/run`, null, { params: { bootstrapConfirmed } })).data,
  scheduleStatus: async (id: string, signal?: AbortSignal, workspaceId?: string): Promise<{ enabled: boolean; state?: string; error?: string; next_run_at?: string; last_run_at?: string }> =>
    (await apiClient.get(`${workspaceId ? `/workspaces/${encodeURIComponent(workspaceId)}` : ''}/workflows/${encodeURIComponent(id)}/schedule`, { signal })).data,
  load: async (id: string) =>
    (await apiClient.get(`/workflows/${encodeURIComponent(id)}/definition`)).data,
  save: async (id: string, definition: unknown) =>
    apiClient.put(`/workflows/${encodeURIComponent(id)}/definition`, definition),
  updateStatus: async (_id: string, _enabled: boolean) => ({ enabled: true }),
};

export const telegramService = {
  getBot: async (signal?: AbortSignal): Promise<TelegramBotInfo> =>
    (await apiClient.get('/connections/telegram/bot', { signal })).data,
  startLink: async (recipientType: TelegramRecipient['recipientType']): Promise<TelegramLink> =>
    (await apiClient.post('/connections/telegram/link', { recipientType })).data,
  pollLink: async (id: string, signal?: AbortSignal): Promise<TelegramLink> =>
    (await apiClient.get(`/connections/telegram/link/${encodeURIComponent(id)}`, { signal })).data,
  checkRecipient: async (
    chatId: string,
    recipientType: TelegramRecipient['recipientType'],
    signal?: AbortSignal,
  ): Promise<TelegramRecipient> =>
    (await apiClient.post('/connections/telegram/recipient', { chatId, recipientType }, { signal }))
      .data,
  sendTest: async (
    chatId: string,
    recipientType: TelegramRecipient['recipientType'],
  ): Promise<{ success: boolean; message: string; recipient: TelegramRecipient }> =>
    (await apiClient.post('/connections/telegram/test', { chatId, recipientType })).data,
};
