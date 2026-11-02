import axios from 'axios';
import {
  SheetDataResponse,
  UpdateCellRequest,
  UpdateCellResponse,
  SyncConflictDto,
  RunSyncRequestPayload,
  RunSyncResponse,
  TelegramAlertResponse,
} from '../types';

const API_BASE_URL = 'http://localhost:8080/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const googleService = {
  // Bắt đầu OAuth 2.0 Web Flow
  getOAuthStartUrl: () => `${API_BASE_URL}/connections/google/start`,

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
  getOpenConflicts: async (): Promise<SyncConflictDto[]> => {
    const response = await apiClient.get<SyncConflictDto[]>('/conflicts');
    return response.data;
  },

  // Giải quyết xung đột
  resolveConflict: async (conflictId: number, resolvedValue: string): Promise<SyncConflictDto> => {
    const response = await apiClient.post<SyncConflictDto>(`/conflicts/${conflictId}/resolve`, {
      resolvedValue,
    });
    return response.data;
  },

  // Gửi lại cảnh báo Telegram cho một conflict cụ thể
  resendTelegramAlert: async (conflictId: number): Promise<TelegramAlertResponse> => {
    const response = await apiClient.post<TelegramAlertResponse>(`/conflicts/${conflictId}/notify`);
    return response.data;
  },
};
