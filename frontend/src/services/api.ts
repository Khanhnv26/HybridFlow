import axios from 'axios';
import { SheetDataResponse, UpdateCellRequest, UpdateCellResponse } from '../types';

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
