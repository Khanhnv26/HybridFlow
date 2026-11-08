import { useEffect, useId, useRef, useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import type { Me, WorkspaceRole } from '../../types';

const roleNames: Record<WorkspaceRole, string> = {
  OWNER: 'Chủ sở hữu', ADMIN: 'Quản trị viên', EDITOR: 'Người chỉnh sửa', VIEWER: 'Người xem',
};

export function AccountMenu({ user, workspaceRole, workspaceName, onLogout }: {
  user?: Me; workspaceRole?: WorkspaceRole; workspaceName?: string; onLogout?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string>();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const name = user?.displayName?.trim() || user?.email || 'Tài khoản của bạn';
  const words = (user?.displayName?.trim() || user?.email || '').split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? `${Array.from(words[0])[0]}${Array.from(words[words.length - 1])[0]}`.toLocaleUpperCase('vi')
    : Array.from(words[0] || '').slice(0, 2).join('').toLocaleUpperCase('vi');
  const avatarUrl = user?.avatarUrl?.trim();
  const avatarImage = avatarUrl && avatarUrl !== failedAvatarUrl
    ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedAvatarUrl(avatarUrl)} />
    : null;

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); };
  }, [open]);

  return <div className="account-menu" ref={container}>
    <button ref={trigger} type="button" className="account-trigger" aria-label={`Tài khoản: ${name}`}
      aria-expanded={open} aria-controls={open ? id : undefined} title={name} onClick={() => setOpen(value => !value)}>
      <span className="account-avatar" aria-hidden="true">{avatarImage || initials || <UserRound size={18} />}</span>
    </button>
    {open && <section id={id} className="account-popover" aria-label="Thông tin tài khoản">
      <div className="account-identity">
        <span className="account-avatar account-avatar--large" aria-hidden="true">{avatarImage || initials || <UserRound size={23} />}</span>
        <div><span className="account-eyebrow">TÀI KHOẢN CỦA BẠN</span><h2>{name}</h2>{user?.email && <p>{user.email}</p>}</div>
      </div>
      {(workspaceName || workspaceRole) && <div className="account-workspace">
        <span>Workspace</span><strong>{workspaceName || 'Workspace hiện tại'}</strong>
        {workspaceRole && <span className="account-role">{roleNames[workspaceRole]}</span>}
      </div>}
      {onLogout && <div className="account-actions"><button type="button" onClick={() => { setOpen(false); onLogout(); }}><LogOut size={16} />Đăng xuất</button></div>}
    </section>}
  </div>;
}
