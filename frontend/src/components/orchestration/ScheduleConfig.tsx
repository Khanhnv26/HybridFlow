import { errorMessage } from '../../services/errors';
import { useEffect, useState } from 'react';
import { workflowService } from '../../services/api';
import { Clock, Save, X, Check, Calendar, Timer, Globe, AlertTriangle } from 'lucide-react';
import type { OrchestrationNodeData } from '../../types';

interface Props {
  workspaceId?: string;
  workflowId?: string;
  data: OrchestrationNodeData;
  disabled: boolean;
  onClose: () => void;
  onSave: (data: Partial<OrchestrationNodeData>) => Promise<void>;
}

const INTERVAL_PRESETS = [
  { label: '1 phút (Thử nghiệm)', value: 1 },
  { label: '5 phút (Khuyên dùng)', value: 5 },
  { label: '15 phút', value: 15 },
  { label: '30 phút', value: 30 },
  { label: '1 giờ', value: 60 },
];

const DAILY_PRESETS = [
  { label: '08:00 (Đầu giờ sáng)', value: '08:00' },
  { label: '12:00 (Nghỉ trưa)', value: '12:00' },
  { label: '18:00 (Cuối ngày)', value: '18:00' },
  { label: '23:00 (Đêm đối soát)', value: '23:00' },
];

const JOB_STATES: Record<string, string> = {
  READY: 'Chờ chạy', RUNNING: 'Đang đồng bộ', RETRY: 'Chờ thử lại', SUCCEEDED: 'Đã hoàn tất',
  NEEDS_CONNECTION: 'Cần kết nối lại Google', NEEDS_BOOTSTRAP: 'Cần xác nhận khởi tạo',
  DEAD: 'Đã dừng sau nhiều lần thử', CANCELLED: 'Đã hủy',
};

export function ScheduleConfig({ data, disabled, onClose, onSave, workflowId, workspaceId }: Props) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof workflowService.scheduleStatus>> | null>(null);
  const [statusError, setStatusError] = useState('');
  const [timezone, setTimezone] = useState(data.scheduleTimezone || 'Asia/Ho_Chi_Minh');
  useEffect(() => {
    if (!workflowId) return;
    const controller = new AbortController();
    const refresh = () => void workflowService.scheduleStatus(workflowId, controller.signal, workspaceId)
      .then((value) => { if (!controller.signal.aborted) { setStatus(value); setStatusError(''); } })
      .catch(() => { if (!controller.signal.aborted) setStatusError('Không tải được trạng thái lịch từ máy chủ.'); });
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [workflowId, workspaceId]);
  const [enabled, setEnabled] = useState(data.scheduleEnabled !== false);
  const [type, setType] = useState<'interval' | 'daily'>(
    (data.scheduleType as 'interval' | 'daily') || 'interval',
  );
  const [intervalMinutes, setIntervalMinutes] = useState(data.scheduleIntervalMinutes || 5);
  const [dailyTime, setDailyTime] = useState(data.scheduleTime || '08:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440)
        throw new Error('Chu kỳ phải là số nguyên từ 1 đến 1440 phút.');
      if (type === 'daily' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTime))
        throw new Error('Chọn giờ chạy hợp lệ.');
      await onSave({
        scheduleEnabled: enabled,
        scheduleType: type,
        scheduleIntervalMinutes: intervalMinutes,
        scheduleTime: dailyTime,
        scheduleTimezone: timezone,
        subtitle:
          type === 'daily'
            ? `Chạy lúc ${dailyTime} mỗi ngày`
            : intervalMinutes >= 60 && intervalMinutes % 60 === 0
              ? `Chạy mỗi ${Math.floor(intervalMinutes / 60)} giờ`
              : `Chạy mỗi ${intervalMinutes} phút`,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Lưu cấu hình thất bại.'));
    } finally {
      setSaving(false);
    }
  };

  const previewText = !enabled
    ? 'Hẹn giờ đang TẠM DỪNG (sẽ không tự động kích hoạt luồng).'
    : type === 'daily'
      ? `Hệ thống sẽ tự động kích hoạt luồng vào lúc ${dailyTime} mỗi ngày.`
      : intervalMinutes >= 60 && intervalMinutes % 60 === 0
        ? `Hệ thống sẽ tự động kích hoạt luồng mỗi ${Math.floor(intervalMinutes / 60)} giờ một lần.`
        : `Hệ thống sẽ tự động kích hoạt luồng mỗi ${intervalMinutes} phút một lần.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-[#171b24] border border-[#2d3748] rounded-2xl w-full hf-modal hf-modal--simple shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="hf-modal-header p-4 border-b border-[#2d3748] flex items-center justify-between bg-[#131720]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Clock size={20} />
            </span>
            <div>
              <h3 className="font-semibold text-sm text-gray-100">Cấu hình Hẹn Giờ Định Kỳ</h3>
              <p className="text-[11px] text-gray-400">Thiết lập chu kỳ tự động đối soát và đồng bộ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-200 p-1 rounded-lg hover:bg-gray-800 transition"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="hf-modal-body p-4 space-y-4 text-sm node-scrollbar">
          <fieldset disabled={disabled || saving} className="min-w-0 space-y-4">
            {/* Status alerts / warnings */}
            {(statusError || status?.error) && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs leading-relaxed">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-400" />
                <div className="space-y-0.5">
                  {status?.error && <p role="status">{status.error}</p>}
                  {statusError && <p role="status">{statusError}</p>}
                </div>
              </div>
            )}

            {/* Server run stats */}
            {(status?.state || status?.last_run_at || (status && !status.enabled) || (status?.enabled && !statusError && status.next_run_at && !['NEEDS_CONNECTION', 'NEEDS_BOOTSTRAP', 'DEAD'].includes(status.state || ''))) && (
              <div className="p-3 rounded-xl bg-[#11151d] border border-[#262f3f] space-y-1.5 text-xs">
                {status?.state && (
                  <div className="flex items-center justify-between text-gray-300">
                    <span>Lượt gần nhất:</span>
                    <span className="font-medium text-emerald-400">{JOB_STATES[status.state] || status.state}</span>
                  </div>
                )}
                {status?.last_run_at && (
                  <div className="flex items-center justify-between text-gray-400 text-[11px]">
                    <span>Hoàn tất gần nhất:</span>
                    <span>{new Date(status.last_run_at).toLocaleString('vi-VN', { timeZone: timezone })} ({timezone})</span>
                  </div>
                )}
                {status && !status.enabled && (
                  <p className="text-amber-400 text-[11px]">Lịch trên máy chủ đang tắt. Nối khối hẹn giờ vào cổng kích hoạt và lưu workflow để bật lịch.</p>
                )}
                {status?.enabled && !statusError && status.next_run_at && !['NEEDS_CONNECTION', 'NEEDS_BOOTSTRAP', 'DEAD'].includes(status.state || '') && (
                  <div className="flex items-center justify-between text-gray-300">
                    <span>Lượt kế tiếp:</span>
                    <span className="font-medium text-emerald-400">{new Date(status.next_run_at).toLocaleString('vi-VN', { timeZone: timezone })} ({timezone})</span>
                  </div>
                )}
              </div>
            )}

            {/* Toggle Status & Timezone Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Status Toggle Card */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#11151d] border border-[#262f3f]">
                <div>
                  <p className="font-medium text-gray-200">Trạng thái hẹn giờ</p>
                  <p className="text-[11px] text-gray-400">
                    {enabled ? 'Đang kích hoạt tự động theo chu kỳ' : 'Tạm dừng tự động kích hoạt'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={disabled || saving}
                  onClick={() => setEnabled(!enabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                    enabled ? 'bg-emerald-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Timezone Selector Card */}
              <div className="flex flex-col justify-center p-3 rounded-xl bg-[#11151d] border border-[#262f3f] gap-1.5">
                <div className="flex items-center gap-1.5 text-gray-300">
                  <Globe size={13} className="text-gray-400 shrink-0" />
                  <label htmlFor="schedule-timezone" className="font-medium">Múi giờ</label>
                </div>
                <select
                  id="schedule-timezone"
                  aria-label="Múi giờ"
                  disabled={disabled || saving}
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  className="w-full bg-[#141a24] border border-[#303b4b] rounded-lg px-2.5 py-1 text-gray-200 outline-none focus:border-emerald-500 text-xs"
                >
                  <option value="Asia/Ho_Chi_Minh">Việt Nam (UTC+7)</option>
                  <option value="UTC">UTC</option>
                  {!['Asia/Ho_Chi_Minh', 'UTC'].includes(timezone) && <option value={timezone}>{timezone}</option>}
                </select>
              </div>
            </div>

            {/* Schedule Type Selection Tabs */}
            <div className="space-y-1.5">
              <label className="font-medium text-gray-300 block">Kiểu chu kỳ</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#11151d] rounded-xl border border-[#262f3f]">
                <button
                  type="button"
                  onClick={() => setType('interval')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg font-medium transition ${
                    type === 'interval'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Timer size={14} /> Lặp theo phút / giờ
                </button>
                <button
                  type="button"
                  onClick={() => setType('daily')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg font-medium transition ${
                    type === 'daily'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Calendar size={14} /> Cố định mỗi ngày
                </button>
              </div>
            </div>

            {/* Interval Settings */}
            {type === 'interval' && (
              <div className="space-y-3 p-3.5 rounded-xl bg-[#11151d] border border-[#262f3f]">
                <label className="font-medium text-gray-300 block">Chọn nhanh khoảng thời gian</label>
                <div className="grid grid-cols-2 gap-2">
                  {INTERVAL_PRESETS.map((preset, index) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setIntervalMinutes(preset.value)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition ${
                        intervalMinutes === preset.value
                          ? 'border-emerald-500/70 bg-emerald-950/40 text-emerald-200'
                          : 'border-[#262f3f] bg-[#141a24] text-gray-300 hover:border-gray-600'
                      } ${index === 4 ? 'col-span-2' : ''}`}
                    >
                      <span className="truncate">{preset.label}</span>
                      {intervalMinutes === preset.value && <Check size={14} className="text-emerald-400 shrink-0 ml-1.5" />}
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-[#262f3f] flex items-center justify-between gap-3">
                  <span className="text-gray-400">Hoặc tùy chỉnh số phút:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      value={intervalMinutes}
                      onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                      className="w-20 rounded-lg border border-[#303b4b] bg-[#141a24] px-2.5 py-1 text-center font-mono text-emerald-300 outline-none focus:border-emerald-500"
                    />
                    <span className="text-gray-400">phút</span>
                  </div>
                </div>
              </div>
            )}

            {/* Daily Settings */}
            {type === 'daily' && (
              <div className="space-y-3 p-3.5 rounded-xl bg-[#11151d] border border-[#262f3f]">
                <label className="font-medium text-gray-300 block">Khung giờ chạy mỗi ngày</label>
                <div className="grid grid-cols-2 gap-2">
                  {DAILY_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setDailyTime(preset.value)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition ${
                        dailyTime === preset.value
                          ? 'border-emerald-500/70 bg-emerald-950/30 text-emerald-200'
                          : 'border-[#262f3f] bg-[#141a24] text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      <span>{preset.label}</span>
                      {dailyTime === preset.value && <Check size={14} className="text-emerald-400 shrink-0 ml-1.5" />}
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t border-[#262f3f] flex items-center justify-between gap-3">
                  <span className="text-gray-400">Giờ chính xác (24h):</span>
                  <input
                    type="time"
                    value={dailyTime}
                    onChange={(e) => setDailyTime(e.target.value)}
                    className="rounded-lg border border-[#303b4b] bg-[#141a24] px-2.5 py-1 text-center font-mono text-emerald-300 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            {/* Preview Banner */}
            <div
              className={`flex items-center gap-2.5 p-3 rounded-xl border text-[11px] ${
                enabled
                  ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                  : 'border-gray-700 bg-gray-800/40 text-gray-400'
              }`}
            >
              <Clock size={16} className="shrink-0 text-emerald-400" />
              <span>{previewText}</span>
            </div>

            {error && <p className="text-red-400 text-[11px]">{error}</p>}
          </fieldset>
        </div>

        {/* Footer */}
        <div className="hf-modal-footer p-3.5 border-b-0 border-t border-[#2d3748] bg-[#131720] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3.5 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition text-xs font-medium"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || disabled}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition text-xs disabled:opacity-50"
          >
            <Save size={13} />
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>
      </div>
    </div>
  );
}
