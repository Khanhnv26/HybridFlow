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
  getOAuthStartUrl: () => new URL(`${API_BASE_URL}/connections/google/start`, window.location.origin).href,
  getOAuthConfig: async (): Promise<{ callbackOrigin: string }> =>
    (await apiClient.get('/connections/google/config')).data,

  // Đọc dữ liệu từ Google Sheets
  readSheet: async (accessToken: string, spreadsheetId: string, sheetname?: string): Promise<SheetDataResponse> => {
    const response = await apiClient.post<SheetDataResponse>('/connections/google/sheets/read', {
      accessToken,
      spreadsheetId,
      sheetname,
    });
    return response.data;
  },

  // Cập nhật ô trong Google Sheets
  updateCell: async (payload: UpdateCellRequest): Promise<UpdateCellResponse> => {
    const response = await apiClient.post<UpdateCellResponse>('/connections/google/sheets/update', payload);
    return response.data;
  },
};

export const syncService = {
  // Chạy luồng đồng bộ 3-Way Diff trên Backend
  runSync: async (payload: RunSyncRequestPayload): Promise<RunSyncResponse> => {
    const response = await apiClient.post<RunSyncResponse>('/sync/run', payload);
    return response.data;
  },

  // Lấy danh sách xung đột đang OPEN
  getOpenConflicts: async (flowId: string): Promise<SyncConflictDto[]> => {
    const response = await apiClient.get<SyncConflictDto[]>('/conflicts', { params: { flowId } });
    return response.data;
  },

  // Giải quyết xung đột
  resolveConflict: async (conflictId: number, resolvedValue: string, accessToken: string): Promise<SyncConflictDto> => {
    const response = await apiClient.post<SyncConflictDto>(`/conflicts/${conflictId}/resolve`, {
      resolvedValue,
      accessToken,
    });
    return response.data;
  },

  // Gửi lại cảnh báo Telegram cho một conflict cụ thể
  resendTelegramAlert: async (conflictId: number, chatId: string): Promise<TelegramAlertResponse> => {
    const response = await apiClient.post<TelegramAlertResponse>(`/conflicts/${conflictId}/notify`, { chatId });
    return response.data;
  },
  getHistory: async (flowId: string): Promise<ExecutionHistoryDto[]> =>
    (await apiClient.get<ExecutionHistoryDto[]>(`/workflows/${encodeURIComponent(flowId)}/history`)).data,
  getVault: async (flowId: string): Promise<Record<string, string>[]> =>
    (await apiClient.get<Record<string, string>[]>(`/workflows/${encodeURIComponent(flowId)}/vault`)).data,
};

export const workflowService = {
  load: async (id: string) => (await apiClient.get(`/workflows/${encodeURIComponent(id)}/definition`)).data,
  save: async (id: string, definition: unknown) => apiClient.put(`/workflows/${encodeURIComponent(id)}/definition`, definition),
};
