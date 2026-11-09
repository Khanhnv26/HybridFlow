import type { AxiosInstance } from 'axios';
import type { ExecutionHistoryDto, NotificationOutboxItem, SyncConflictDto, RunSyncResponse, TelegramAlertResponse, SheetWritePreviewRequest, SheetWritePreviewResponse } from '../types';

/** Keep the editor's existing service interface while all requests carry tenant ownership. */
export function createTenantEditorApi(client: Pick<AxiosInstance, 'get' | 'post' | 'put' | 'delete'>, workspaceId: string, workflowId: string) {
  const base = `/workspaces/${encodeURIComponent(workspaceId)}/workflows/${encodeURIComponent(workflowId)}`;
  const executionContexts = new Map<string, string>();
  const notificationContexts = new Map<string, string>();
  const conflictContexts = new Map<number, string>();
  let latestContext = '';
  let version: number | undefined;
  let bindings: { nodeId: string; connectionId: string }[] = [];
  let currentWorkflowEnabled = true;

  const contextFor = (executionId: string) => {
    const context = executionContexts.get(executionId);
    if (!context) throw new Error('Tải lại lịch sử để xác định ngữ cảnh của lượt chạy.');
    return context;
  };
  const load = async () => {
    const { data } = await client.get(base);
    version = data.definitionVersion;
    currentWorkflowEnabled = data.enabled !== false;
    bindings = data.connectionBindings || [];
    const def = (data.definition || {}) as { nodes?: unknown[]; edges?: unknown[]; enabled?: boolean };
    def.enabled = currentWorkflowEnabled;
    if (Array.isArray(def.nodes) && Array.isArray(bindings) && bindings.length > 0) {
      def.nodes = def.nodes.map((node: unknown) => {
        const n = node as { id: string; data?: Record<string, unknown> };
        const found = bindings.find(b => b.nodeId === n.id);
        return found ? { ...n, data: { ...n.data, connectionId: found.connectionId } } : n;
      });
    }
    return def;
  };
  const notifications = async (executionId: string, offset: number, limit: number, signal?: AbortSignal) => {
    const context = contextFor(executionId);
    const { data } = await client.get<NotificationOutboxItem[]>(`${base}/contexts/${encodeURIComponent(context)}/notifications`,
      { params: { executionId, offset, limit }, signal });
    for (const item of data) notificationContexts.set(item.id, context);
    return data;
  };

  return {
    workflow: {
      load: async (_id: string) => load(),
      save: async (_id: string, definition: unknown) => {
        if (version === undefined) await load();
        const graph = definition as { nodes: unknown[]; edges: unknown[] };
        const extractedBindings = Array.isArray(graph.nodes)
          ? (graph.nodes as Array<{ id?: string; type?: string; data?: { connectionId?: string } }>)
              .filter(n => n?.id && n.type !== 'sheetWriteAction' && n.data?.connectionId)
              .map(n => ({ nodeId: n.id as string, connectionId: n.data!.connectionId as string }))
          : [];
        const { data } = await client.put(base, {
          expectedVersion: version,
          definition: { nodes: graph.nodes, edges: graph.edges },
          connectionBindings: extractedBindings,
        });
        version = data.definitionVersion;
        bindings = data.connectionBindings || [];
      },
      run: async (_id: string, bootstrapConfirmed: boolean, previewToken?: string): Promise<RunSyncResponse> => {
        const { data } = await client.post<RunSyncResponse>(base + '/run', null, {
          params: { bootstrapConfirmed },
          ...(previewToken ? { headers: { 'X-Sheet-Write-Preview': previewToken } } : {}),
        });
        if (data.executionId && data.flowId) executionContexts.set(data.executionId, data.flowId);
        latestContext = data.flowId || latestContext;
        return data;
      },
      updateStatus: async (_id: string, enabled: boolean) => {
        const { data } = await client.put(base + '/status', { enabled });
        currentWorkflowEnabled = data.enabled !== false;
        return data;
      },
      isEnabled: () => currentWorkflowEnabled,
    },
    sync: {
      getHistory: async (_id: string, signal?: AbortSignal) => {
        const { data } = await client.get<ExecutionHistoryDto[]>(base + '/history', { params: { limit: 500 }, signal });
        for (const run of data) if (run.flow_id) executionContexts.set(run.id, run.flow_id);
        latestContext = data[0]?.flow_id || latestContext;
        return data;
      },
      getOpenConflicts: async (_id: string, signal?: AbortSignal) => {
        const { data } = await client.get<SyncConflictDto[]>(base + '/conflicts', { signal });
        for (const conflict of data) if (conflict.flowId) conflictContexts.set(conflict.id, conflict.flowId);
        return data;
      },
      getNotifications: async (_flow: string, executionId: string, signal?: AbortSignal) => notifications(executionId, 0, 500, signal),
      getNotificationPage: async (_flow: string, executionId: string, signal?: AbortSignal, offset = 0) => notifications(executionId, offset, 50, signal),
      retryNotification: async (id: string): Promise<void> => {
        const context = notificationContexts.get(id);
        if (!context) throw new Error('Tải lại thông báo trước khi thử gửi lại.');
        await client.post(`${base}/contexts/${encodeURIComponent(context)}/notifications/${encodeURIComponent(id)}/retry`);
      },
      clearHistory: async (_flow: string): Promise<void> => { await client.delete(base + '/history'); },
      getVault: async (_flow: string): Promise<Record<string, string>[]> => {
        if (!latestContext) return [];
        return (await client.get(`${base}/contexts/${encodeURIComponent(latestContext)}/vault`)).data;
      },
      resolveConflict: async (id: number, resolvedValue: string, _accessToken: string) => {
        const context = conflictContexts.get(id);
        if (!context) throw new Error('Tải lại danh sách xung đột trước khi xử lý.');
        return (await client.post<SyncConflictDto>(`${base}/contexts/${encodeURIComponent(context)}/conflicts/${id}/resolve`, { resolvedValue })).data;
      },
      previewSheetWrite: async (request: SheetWritePreviewRequest, signal?: AbortSignal) => {
        return (await client.post<SheetWritePreviewResponse>(`${base}/sheet-write/preview`, request, { signal })).data;
      },
      resendTelegramAlert: async (_id: number, _chatId: string): Promise<TelegramAlertResponse> => {
        throw new Error('Mở Lịch sử → Xem thông báo để thử gửi lại cảnh báo theo workspace.');
      },
    },
  };
}
