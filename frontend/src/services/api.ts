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
} from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000,
});

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
  ): Promise<SheetDataResponse> => {
    const response = await apiClient.post<SheetDataResponse>(
      '/connections/google/sheets/read',
      {
        accessToken,
        spreadsheetId,
        sheetname,
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
  scheduleStatus: async (id: string, signal?: AbortSignal): Promise<{ enabled: boolean; state?: string; error?: string; next_run_at?: string; last_run_at?: string }> =>
    (await apiClient.get(`/workflows/${encodeURIComponent(id)}/schedule`, { signal })).data,
  load: async (id: string) =>
    (await apiClient.get(`/workflows/${encodeURIComponent(id)}/definition`)).data,
  save: async (id: string, definition: unknown) =>
    apiClient.put(`/workflows/${encodeURIComponent(id)}/definition`, definition),
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
