import { useState } from 'react';
import { Clock, Save, X, Check, Calendar, Timer } from 'lucide-react';
import type { OrchestrationNodeData } from '../../types';

interface Props {
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

export function ScheduleConfig({ data, disabled, onClose, onSave }: Props) {
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
      await onSave({
        scheduleEnabled: enabled,
        scheduleType: type,
        scheduleIntervalMinutes: intervalMinutes,
        scheduleTime: dailyTime,
        subtitle:
          type === 'daily'
            ? `Chạy lúc ${dailyTime} mỗi ngày`
            : intervalMinutes >= 60
              ? `Chạy mỗi ${Math.floor(intervalMinutes / 60)} giờ`
              : `Chạy mỗi ${intervalMinutes} phút`,
      });
      onClose();
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message || 'Lưu cấu hình thất bại.');
    } finally {
      setSaving(false);
    }
  };

  const previewText = !enabled
    ? 'Hẹn giờ đang TẠM DỪNG (sẽ không tự động kích hoạt luồng).'
    : type === 'daily'
      ? `Hệ thống sẽ tự động kích hoạt luồng vào lúc ${dailyTime} mỗi ngày.`
      : intervalMinutes >= 60
        ? `Hệ thống sẽ tự động kích hoạt luồng mỗi ${Math.floor(intervalMinutes / 60)} giờ một lần.`
        : `Hệ thống sẽ tự động kích hoạt luồng mỗi ${intervalMinutes} phút một lần.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-[#171b24] border border-[#2d3748] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-[#2d3748] flex items-center justify-between bg-[#131720]">
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
            className="text-gray-400 hover:text-gray-200 p-1 rounded-lg hover:bg-gray-800 transition"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[70vh]">
          {/* Status Toggle */}
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
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
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

          {/* Schedule Type Selection Tabs */}
          <div className="space-y-2">
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
              <div className="grid grid-cols-1 gap-1.5">
                {INTERVAL_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setIntervalMinutes(preset.value)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition ${
                      intervalMinutes === preset.value
                        ? 'border-emerald-500/70 bg-emerald-950/30 text-emerald-200'
                        : 'border-[#262f3f] bg-[#141a24] text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <span>{preset.label}</span>
                    {intervalMinutes === preset.value && <Check size={14} className="text-emerald-400" />}
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
                    onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value) || 1))}
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
                    {dailyTime === preset.value && <Check size={14} className="text-emerald-400" />}
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
            <Clock size={16} className="shrink-0" />
            <span>{previewText}</span>
          </div>

          {error && <p className="text-red-400 text-[11px]">{error}</p>}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-[#2d3748] bg-[#131720] flex items-center justify-end gap-2">
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
