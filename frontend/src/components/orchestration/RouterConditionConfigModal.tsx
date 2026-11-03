import React, { useState } from 'react';
import { Plus, Trash2, Split, Save, X, AlertCircle } from 'lucide-react';
import type { OrchestrationNodeData, RouterConditionItem, RouterMatchMode, RouterOperator, RouterTriggerOn } from '../../types';
import { matchesCurrentValues } from '../../services/notificationPreview';

interface Props {
  data: OrchestrationNodeData;
  availableColumns: string[];
  previewRows?: Record<string, string>[];
  reading?: boolean;
  readErrors?: string[];
  onRetryRead?: () => void;
  disabled: boolean;
  onClose: () => void;
  onSave: (settings: Partial<OrchestrationNodeData>) => Promise<void>;
}

const OPERATOR_LABELS: { value: RouterOperator; label: string; desc: string }[] = [
  { value: 'EQUALS', label: 'Bằng (=)', desc: 'Giá trị chính xác (phân biệt hoa thường)' },
  { value: 'NOT_EQUALS', label: 'Khác (≠)', desc: 'Không bằng giá trị này' },
  { value: 'CONTAINS', label: 'Chứa (contains)', desc: 'Chứa từ khóa (không phân biệt hoa thường)' },
  { value: 'CHANGED_TO', label: 'Vừa đổi thành', desc: 'Giá trị sau cập nhật đổi thành giá trị này' },
  { value: 'IS_NOT_EMPTY', label: 'Không để trống', desc: 'Ô có dữ liệu sau khi cắt khoảng trắng' },
];

export const RouterConditionConfigModal: React.FC<Props> = ({
  data,
  availableColumns,
  previewRows = [],
  reading = false,
  readErrors = [],
  onRetryRead,
  disabled,
  onClose,
  onSave,
}) => {
  const rawTrigger = (data.routerTriggerOn || data.triggerOn || 'CHANGED') as RouterTriggerOn;
  const rawMatch = (data.routerMatchMode || data.matchMode || 'ALL') as RouterMatchMode;
  const rawConditions = (data.routerConditions || data.conditions || []) as RouterConditionItem[];

  const [triggerOn, setTriggerOn] = useState<RouterTriggerOn>(rawTrigger);
  const [matchMode, setMatchMode] = useState<RouterMatchMode>(rawMatch);
  const [conditions, setConditions] = useState<RouterConditionItem[]>(
    rawConditions.length > 0
      ? rawConditions.map((c) => ({ ...c }))
      : [{ columnName: availableColumns[0] || 'id', operator: 'EQUALS', value: '' }],
  );
  const [error, setError] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const addCondition = () => {
    setConditions((prev) => [
      ...prev,
      { columnName: availableColumns[0] || '', operator: 'EQUALS', value: '' },
    ]);
    setError('');
  };

  const removeCondition = (index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
    setError('');
  };

  const updateCondition = (index: number, patch: Partial<RouterConditionItem>) => {
    setConditions((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
    setError('');
  };

  const handleSave = async () => {
    if (conditions.length === 0) {
      setError('Cần ít nhất một điều kiện NẾU để rẽ nhánh.');
      return;
    }
    for (let i = 0; i < conditions.length; i++) {
      const c = conditions[i];
      if (!c.columnName || !c.columnName.trim()) {
        setError(`Điều kiện dòng ${i + 1} chưa chọn cột.`);
        return;
      }
      if (!availableColumns.includes(c.columnName)) { setError(`Cột ${c.columnName} không thuộc phạm vi đồng bộ.`); return; }
      if (c.operator !== 'IS_NOT_EMPTY' && c.value === undefined) {
        setError(`Điều kiện dòng ${i + 1} chưa nhập giá trị so sánh.`);
        return;
      }
    }

    try {
      setSaving(true);
      setError('');
      await onSave({
        routerTriggerOn: triggerOn,
        routerMatchMode: matchMode,
        routerConditions: conditions.map((c) => ({
          columnName: c.columnName.trim(),
          operator: c.operator,
          value: c.operator === 'IS_NOT_EMPTY' ? '' : (c.value ?? ''),
        })),
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu cấu hình rẽ nhánh.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="router-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[#2d3748] bg-[#11151c] shadow-2xl text-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2d3748] px-6 py-4 bg-[#141922] rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-950/70 border border-purple-800/60 text-purple-300">
              <Split size={20} />
            </div>
            <div>
              <h3 id="router-modal-title" className="text-sm font-bold text-white uppercase tracking-wider">
                Rẽ Nhánh Điều Kiện (KHI – NẾU)
              </h3>
              <p className="text-xs text-gray-400">
                Lọc bản ghi từ Điều phối & Đồng bộ trước khi gửi tới hành động
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {reading && <p role="status" className="text-xs text-gray-400">Đang đọc cột và dữ liệu xem trước… Bạn vẫn có thể chỉnh điều kiện hoặc đóng cửa sổ.</p>}
          {readErrors.length > 0 && <div role="alert" className="space-y-2 text-xs text-amber-200">
            {readErrors.map((message, index) => <p key={index}>{message}</p>)}
            {onRetryRead && <button type="button" disabled={reading} onClick={onRetryRead} className="underline">Đọc lại dữ liệu</button>}
          </div>}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/40 px-4 py-3 text-xs text-red-200">
              <AlertCircle size={16} className="shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: KHI */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-purple-300">
                1. KHI NÀO (Sự kiện bản ghi)
              </label>
              <span className="text-[11px] text-gray-400">Đánh giá trên dữ liệu đã hợp nhất</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { value: 'CHANGED', label: 'Bản ghi thay đổi', desc: 'Gồm cả tạo mới và cập nhật' },
                { value: 'CREATED', label: 'Chỉ tạo mới', desc: 'Bản ghi chưa có ở lần chạy trước' },
                { value: 'UPDATED', label: 'Chỉ cập nhật', desc: 'Bản ghi đã tồn tại và có cột đổi' },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  disabled={disabled || saving}
                  onClick={() => setTriggerOn(opt.value as RouterTriggerOn)}
                  className={`flex flex-col text-left p-3 rounded-xl border transition cursor-pointer ${
                    triggerOn === opt.value
                      ? 'border-purple-500 bg-purple-950/40 text-white ring-1 ring-purple-500/30'
                      : 'border-[#2d3748] bg-[#171b24] text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <span className="text-xs font-semibold text-white">{opt.label}</span>
                  <span className="text-[10px] text-gray-400 mt-0.5 leading-tight">{opt.desc}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Section 2: NẾU */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-purple-300">
                2. NẾU NHƯ (Điều kiện lọc dữ liệu)
              </label>
              <div className="flex items-center gap-1 rounded-lg border border-[#2d3748] bg-[#171b24] p-0.5">
                <button
                  type="button"
                  disabled={disabled || saving}
                  onClick={() => setMatchMode('ALL')}
                  className={`px-2.5 py-1 text-[11px] rounded font-medium transition cursor-pointer ${
                    matchMode === 'ALL'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  TẤT CẢ (AND)
                </button>
                <button
                  type="button"
                  disabled={disabled || saving}
                  onClick={() => setMatchMode('ANY')}
                  className={`px-2.5 py-1 text-[11px] rounded font-medium transition cursor-pointer ${
                    matchMode === 'ANY'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  MỘT TRONG (OR)
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {conditions.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-xl border border-[#2d3748] bg-[#171b24] p-3 shadow-sm"
                >
                  <span className="text-xs font-mono text-purple-400 shrink-0 w-6 text-center">
                    #{index + 1}
                  </span>

                  {/* Column */}
                  <div className="flex-1 min-w-0">
                    <select
                      disabled={disabled || saving}
                      value={item.columnName}
                      onChange={(e) => updateCondition(index, { columnName: e.target.value })}
                      className="w-full rounded-lg border border-[#303b4b] bg-[#10131a] px-2.5 py-1.5 text-xs text-white focus:border-purple-400 focus:outline-none"
                    >
                      {availableColumns.length === 0 ? (
                        <option value={item.columnName || ''}>
                          {item.columnName || 'Nhập tên cột...'}
                        </option>
                      ) : (
                        availableColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Operator */}
                  <div className="w-36 shrink-0">
                    <select
                      disabled={disabled || saving}
                      value={item.operator}
                      onChange={(e) => updateCondition(index, { operator: e.target.value as RouterOperator })}
                      className="w-full rounded-lg border border-[#303b4b] bg-[#10131a] px-2.5 py-1.5 text-xs text-white focus:border-purple-400 focus:outline-none"
                    >
                      {OPERATOR_LABELS.map((op) => (
                        <option key={op.value} value={op.value} title={op.desc}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Value */}
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      disabled={disabled || saving || item.operator === 'IS_NOT_EMPTY'}
                      value={item.operator === 'IS_NOT_EMPTY' ? '' : item.value}
                      placeholder={item.operator === 'IS_NOT_EMPTY' ? '(Không cần giá trị)' : 'Giá trị so sánh...'}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                      className="w-full rounded-lg border border-[#303b4b] bg-[#10131a] px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-purple-400 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Remove */}
                  <button
                    type="button"
                    disabled={disabled || saving || conditions.length <= 1}
                    onClick={() => removeCondition(index)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/30 transition disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                    title="Xóa điều kiện này"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={disabled || saving}
              onClick={addCondition}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-800/60 bg-purple-950/30 text-purple-300 text-xs font-medium hover:bg-purple-950/60 transition cursor-pointer disabled:opacity-40"
            >
              <Plus size={14} />
              Thêm điều kiện
            </button>
          </section>
        </div>

        {previewRows.length > 0 && <p role="status" className="px-6 py-3 text-xs text-gray-400">
          Xem trước dữ liệu hiện tại: {previewRows.filter(row => matchesCurrentValues(conditions, matchMode, row)).length}/{previewRows.length} dòng thỏa giá trị lọc.
          {' '}KHI và “Vừa đổi thành” được xác nhận bằng snapshot khi đồng bộ; đây không phải số tin sẽ gửi.
        </p>}
        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#2d3748] px-6 py-4 bg-[#141922] rounded-b-2xl">
          <p className="text-[11px] text-gray-400">
            Khối sẽ chỉ chuyển tiếp bản ghi vượt qua bộ lọc tới cổng đầu ra.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800 transition cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 transition shadow-md disabled:opacity-40 cursor-pointer"
            >
              <Save size={14} />
              {saving ? 'Đang lưu...' : 'Lưu cấu hình rẽ nhánh'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
