import { useEffect, useState } from 'react';
import { X, UserPlus, Check, Copy, Trash2, Shield, UserRound, AlertCircle } from 'lucide-react';
import { useExitMotion } from '../../hooks/useExitMotion';
import { memberService, invitationService } from '../../services/api';
import { errorMessage } from '../../services/errors';
import type { WorkspaceMember, WorkspaceRole } from '../../types';

interface WorkspaceShareModalProps {
  workspaceId: string;
  workspaceName?: string;
  currentUserRole?: WorkspaceRole;
  currentUserId?: string;
  currentUserAvatarUrl?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onMembersChanged?: () => void;
}

const roleLabels: Record<WorkspaceRole, string> = {
  OWNER: 'Chủ sở hữu',
  ADMIN: 'Quản trị viên',
  EDITOR: 'Người chỉnh sửa',
  VIEWER: 'Người xem',
};

export function WorkspaceShareModal({
  workspaceId,
  workspaceName,
  currentUserRole,
  currentUserId,
  currentUserAvatarUrl,
  isOpen,
  onClose,
  onMembersChanged,
}: WorkspaceShareModalProps) {
  const motionRef = useExitMotion(isOpen);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('EDITOR');
  const [inviting, setInviting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [latestInviteUrl, setLatestInviteUrl] = useState('');

  const isOwner = currentUserRole === 'OWNER';

  async function loadMembers(signal?: AbortSignal) {
    setLoading(true);
    setError('');
    try {
      const items = await memberService.list(workspaceId, signal);
      if (!signal?.aborted) {
        setMembers(items);
      }
    } catch (err) {
      if (!signal?.aborted) {
        setError(errorMessage(err));
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    void loadMembers(controller.signal);
    return () => controller.abort();
  }, [isOpen, workspaceId]);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email || inviting || !isOwner) return;

    setInviting(true);
    setError('');
    setSuccess('');
    try {
      const result = await invitationService.create(workspaceId, email, inviteRole);
      setLatestInviteUrl(result.inviteUrl);
      setSuccess(`Đã tạo lời mời cho ${email}.`);
      setInviteEmail('');
      await loadMembers();
      onMembersChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setInviting(false);
    }
  }

  async function handleChangeRole(targetUserId: string, newRole: WorkspaceRole) {
    if (!isOwner || busyUserId) return;
    setBusyUserId(targetUserId);
    setError('');
    setSuccess('');
    try {
      await memberService.changeRole(workspaceId, targetUserId, newRole);
      setSuccess('Đã cập nhật quyền thành viên.');
      await loadMembers();
      onMembersChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemoveMember(targetUserId: string) {
    if (!isOwner || busyUserId) return;
    setBusyUserId(targetUserId);
    setError('');
    setSuccess('');
    try {
      await memberService.remove(workspaceId, targetUserId);
      setSuccess('Đã xóa quyền truy cập của thành viên.');
      await loadMembers();
      onMembersChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleCopyLink() {
    const copy = async (text: string) => {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    };

    if (latestInviteUrl) {
      await copy(latestInviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      return;
    }

    const email = inviteEmail.trim().toLowerCase();
    if (email && isOwner) {
      setInviting(true);
      setError('');
      try {
        const result = await invitationService.create(workspaceId, email, inviteRole);
        setLatestInviteUrl(result.inviteUrl);
        await copy(result.inviteUrl);
        setCopied(true);
        setSuccess(`Đã tạo và sao chép đường liên kết mời cho ${email}.`);
        setInviteEmail('');
        setTimeout(() => setCopied(false), 2500);
        await loadMembers();
        onMembersChanged?.();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setInviting(false);
      }
      return;
    }

    const currentUrl = typeof window !== 'undefined' && window.location
      ? window.location.origin + window.location.pathname
      : '';
    if (currentUrl) {
      await copy(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  function renderAvatar(member: WorkspaceMember) {
    const isCurrent = member.userId === currentUserId;
    const avatarUrl = (isCurrent ? currentUserAvatarUrl : undefined) || member.avatarUrl;
    const hasFailed = failedAvatars[member.userId];

    if (avatarUrl && !hasFailed) {
      return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full overflow-hidden border border-line bg-surface select-none">
          <img
            src={avatarUrl}
            alt={member.displayName || member.email}
            referrerPolicy="no-referrer"
            onError={() => setFailedAvatars((prev) => ({ ...prev, [member.userId]: true }))}
            className="h-full w-full object-cover"
          />
        </span>
      );
    }

    const name = member.displayName?.trim() || member.email || '';
    const words = name.split(/\s+/).filter(Boolean);
    const initials = words.length > 1
      ? `${Array.from(words[0])[0]}${Array.from(words[words.length - 1])[0]}`.toLocaleUpperCase('vi')
      : Array.from(words[0] || '').slice(0, 2).join('').toLocaleUpperCase('vi');

    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface border border-line text-xs font-semibold text-primary select-none">
        {initials || <UserRound size={16} />}
      </span>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      ref={motionRef}
      className="hf-motion-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="bg-elevated border border-line rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden text-primary shadow-2xl">
        <div className="p-5 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <UserPlus size={18} />
            </div>
            <div>
              <h2 id="share-modal-title" className="font-semibold text-base">
                Chia sẻ không gian làm việc
              </h2>
              <p className="text-xs text-secondary mt-0.5">
                {workspaceName ? `Không gian: "${workspaceName}"` : 'Cấp quyền và quản lý thành viên'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại chia sẻ"
            className="toolbar-button !p-1.5 text-secondary hover:text-primary rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-sm flex-1">
          {error && (
            <div role="alert" className="p-3 bg-danger-soft border border-red-500/30 text-danger text-xs rounded-xl flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                {error}
              </span>
              <button
                type="button"
                onClick={() => setError('')}
                className="text-danger hover:text-primary ml-2 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {success && (
            <div role="status" className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Check size={15} className="shrink-0" />
                {success}
              </span>
              <button
                type="button"
                onClick={() => setSuccess('')}
                className="text-emerald-400 hover:text-primary ml-2 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {isOwner ? (
            <form onSubmit={handleInvite} className="space-y-2">
              <label htmlFor="share-email-input" className="block text-xs font-semibold uppercase tracking-wider text-secondary">
                Thêm người vào workspace
              </label>
              <div className="flex gap-2 items-center">
                <input
                  id="share-email-input"
                  type="email"
                  required
                  placeholder="Nhập email người cần mời..."
                  value={inviteEmail}
                  disabled={inviting}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <select
                  value={inviteRole}
                  aria-label="Chọn vai trò cấp quyền"
                  disabled={inviting}
                  onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                  className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-primary focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="VIEWER">{roleLabels.VIEWER}</option>
                  <option value="EDITOR">{roleLabels.EDITOR}</option>
                  <option value="ADMIN">{roleLabels.ADMIN}</option>
                </select>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {inviting ? 'Đang gửi…' : 'Mời'}
                </button>
              </div>
            </form>
          ) : (
            <div className="p-3 bg-surface border border-line rounded-xl text-xs text-secondary flex items-center gap-2">
              <Shield size={16} className="text-secondary shrink-0" />
              <span>Chỉ Chủ sở hữu mới có quyền gửi lời mời và thay đổi phân quyền workspace.</span>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Những người có quyền truy cập ({members.length})
              </h3>
            </div>

            {loading ? (
              <div className="p-4 text-center text-xs text-secondary">Đang tải danh sách thành viên…</div>
            ) : (
              <div className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-surface/50">
                {members.map((member) => {
                  const isCurrent = member.userId === currentUserId;
                  const isMemberOwner = member.role === 'OWNER';
                  const isBusy = busyUserId === member.userId;

                  return (
                    <div key={member.userId} className="p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {renderAvatar(member)}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-primary truncate flex items-center gap-1.5">
                            {member.displayName || member.email}
                            {isCurrent && <span className="text-xs text-secondary font-normal">(Bạn)</span>}
                          </p>
                          <p className="text-xs text-secondary truncate">{member.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isMemberOwner ? (
                          <span className="text-xs font-medium text-secondary px-2.5 py-1 rounded-lg bg-surface border border-line">
                            {roleLabels.OWNER}
                          </span>
                        ) : isOwner ? (
                          <div className="flex items-center gap-1">
                            <select
                              value={member.role}
                              aria-label={`Đổi vai trò của ${member.email}`}
                              disabled={isBusy}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'REMOVE') {
                                  void handleRemoveMember(member.userId);
                                } else {
                                  void handleChangeRole(member.userId, val as WorkspaceRole);
                                }
                              }}
                              className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-primary focus:outline-none cursor-pointer"
                            >
                              <option value="VIEWER">{roleLabels.VIEWER}</option>
                              <option value="EDITOR">{roleLabels.EDITOR}</option>
                              <option value="ADMIN">{roleLabels.ADMIN}</option>
                              <option value="REMOVE" className="text-danger">Xóa quyền truy cập</option>
                            </select>
                            <button
                              type="button"
                              disabled={isBusy}
                              aria-label={`Xóa thành viên ${member.email}`}
                              onClick={() => handleRemoveMember(member.userId)}
                              className="toolbar-button !p-1.5 text-secondary hover:text-danger rounded-lg"
                              title="Xóa quyền truy cập"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-secondary px-2.5 py-1 rounded-lg bg-surface border border-line">
                            {roleLabels[member.role] || member.role}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-line bg-surface/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopyLink}
            disabled={inviting}
            className="toolbar-button w-full sm:w-auto justify-center text-xs font-medium flex items-center gap-2 rounded-xl px-4 py-2.5 border border-line hover:border-indigo-500/50 hover:bg-indigo-500/10 text-primary transition"
          >
            {copied ? (
              <>
                <Check size={15} className="text-emerald-400" />
                <span className="text-emerald-400">Đã sao chép liên kết!</span>
              </>
            ) : (
              <>
                <Copy size={15} className="text-secondary" />
                <span>{latestInviteUrl ? 'Sao chép liên kết mời vừa tạo' : 'Sao chép đường liên kết'}</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl bg-surface border border-line hover:bg-elevated px-5 py-2.5 text-xs font-semibold text-primary transition"
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}
