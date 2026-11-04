import { useExitMotion } from '../../hooks/useExitMotion';
import { errorMessage } from '../../services/errors';
import { useState } from 'react';
import { Database, Eye, RefreshCw, Save, X } from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { OrchestrationNodeData, SheetDataResponse } from '../../types';
import { SheetSourceConfig } from './SheetSourceConfig';
import { TelegramConfig } from './TelegramConfig';
import { ScheduleConfig } from './ScheduleConfig';
import { DiffEngineConfigModal, type ComparisonSource } from './DiffEngineConfigModal';

interface Props {
  workspaceId?: string;
  workflowId?: string;
  node: Node<OrchestrationNodeData> | null;
  onClose: () => void;
  disabled: boolean;
  connected: boolean;
  onUpdateData: (nodeId: string, data: Partial<OrchestrationNodeData>) => void;
  onTestStep: (nodeId: string) => Promise<unknown>;
  connectionVersion: number;
  onConnectGoogle: () => Promise<void>;
  onReadSource: (nodeId: string, spreadsheetId: string, sheetName: string, signal: AbortSignal) => Promise<SheetDataResponse>;
  onSaveSource: (nodeId: string, source: Partial<OrchestrationNodeData>) => Promise<void>;
  onSaveTelegram: (nodeId: string, settings: Partial<OrchestrationNodeData>) => Promise<void>;
  notificationConnected: boolean;
  availableColumns?: string[];
  upstreamSheets?: string[];
  previewRow?: Record<string, string>;
  previewConflict?: Record<string, string>;
  onRetryNotification?: (id: string) => Promise<void>;
  comparisonSources?: ComparisonSource[];
  onReadComparisonSource?: (id: string, types: Record<string, 'TEXT' | 'NUMBER'>, signal: AbortSignal) => Promise<SheetDataResponse>;
}

export function NaturalLanguageConfigModal(props: Props) {
  const { node, onClose, disabled } = props;
  const motionRef = useExitMotion(!!node);
  const [tableName, setTableName] = useState(node?.data.tableName || '');
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  if (!node) return null;

  if (node.type === 'diffEngine') return <DiffEngineConfigModal
    data={node.data} sources={props.comparisonSources || []} availableColumns={props.availableColumns || []}
    disabled={disabled} onClose={onClose} onSave={settings => props.onSaveSource(node.id, settings)}
    onReadSource={props.onReadComparisonSource || (async () => { throw new Error('Chưa có bảng tính để đọc.'); })}
  />;
  if (node.type === 'sheetsTrigger') return <SheetSourceConfig workspaceId={props.workspaceId} data={node.data} disabled={disabled}
    connected={props.connected} connectionVersion={props.connectionVersion} onClose={onClose}
    onConnectGoogle={props.onConnectGoogle} onReadSource={(file, tab, signal) => props.onReadSource(node.id, file, tab, signal)}
    onSave={settings => props.onSaveSource(node.id, settings)} />;
  if (node.type === 'scheduleTrigger') return <ScheduleConfig workspaceId={props.workspaceId} workflowId={props.workflowId} data={node.data}
    disabled={disabled} onClose={onClose} onSave={settings => props.onSaveSource(node.id, settings)} />;
  if (node.type === 'telegramAction') return <TelegramConfig workspaceId={props.workspaceId} data={node.data} disabled={disabled}
    notificationConnected={props.notificationConnected} availableColumns={props.availableColumns}
    previewRow={props.previewRow} previewConflict={props.previewConflict} onRetryNotification={props.onRetryNotification}
    onClose={onClose} onSave={settings => props.onSaveTelegram(node.id, settings)} />;

  const save = async () => {
    if (!tableName.trim()) { setError('Nhập tên vùng lưu trữ.'); return; }
    setSaving(true); setError('');
    try { await props.onSaveSource(node.id, { tableName: tableName.trim() }); onClose(); }
    catch (error) {
      setError(errorMessage(error, 'Chưa lưu được cấu hình.'));
    } finally { setSaving(false); }
  };
  const read = async () => {
    setReading(true); setError('');
    try { const result = await props.onTestStep(node.id); setRows(Array.isArray(result) ? result : []); }
    catch (error) {
      setError(errorMessage(error, 'Không đọc được dữ liệu.'));
    } finally { setReading(false); }
  };
  return <div role="dialog" aria-modal="true" aria-label="Kho lưu trữ" ref={motionRef} className="hf-motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
    <div className="flex  w-full hf-modal hf-modal--simple flex-col rounded-2xl border border-line bg-surface text-primary">
      <header className="hf-modal-header flex items-center justify-between border-b border-line p-4"><h2 className="flex items-center gap-2 font-semibold"><Database size={20} />Kho lưu trữ</h2>
        <button type="button" aria-label="Đóng" disabled={saving} onClick={onClose}><X size={20} /></button>
      </header>
      <div className="hf-modal-body space-y-4 p-4">
        <label className="block space-y-2 text-sm"><span>Tên vùng lưu trữ</span><input disabled={disabled || saving} value={tableName} onChange={event => setTableName(event.target.value)} className="w-full rounded-lg border border-line bg-canvas px-3 py-2" /></label>
        <p className="text-xs text-secondary">Kho giữ dữ liệu đã đồng bộ để nhận biết các thay đổi ở lần chạy tiếp theo.</p>
        <button type="button" disabled={reading} onClick={() => void read()} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">{reading ? <RefreshCw size={15} className="animate-spin" /> : <Eye size={15} />}Xem dữ liệu đã lưu</button>
        {rows && <p role="status" className="text-sm text-secondary">Kho đang có {rows.length} dòng dữ liệu.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
      <footer className="hf-modal-footer flex justify-end gap-2 border-t border-line p-4">
        <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">Hủy</button>
        <button type="button" disabled={disabled || saving} onClick={() => void save()} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm"><Save size={15} />{saving ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
      </footer>
    </div>
  </div>;
}
