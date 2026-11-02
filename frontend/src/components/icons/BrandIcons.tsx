interface BrandIconProps {
  size?: number;
  className?: string;
}

export function ExcelIcon({ size = 24, className }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true" focusable="false">
      <rect x="10" y="3" width="20" height="26" rx="3" fill="#107C41" />
      <path d="M13 3h14a3 3 0 0 1 3 3v7H10V6a3 3 0 0 1 3-3Z" fill="#33C481" />
      <path d="M10 13h20v8H10z" fill="#21A366" />
      <path d="M20 6v20M13 10h14M13 16h14M13 22h14" stroke="white" strokeOpacity=".35" strokeWidth="1.2" />
      <rect x="2" y="8" width="18" height="18" rx="3" fill="#185C37" />
      <path d="m6.5 12 3.1 5-3.3 5h3l1.9-3.3 1.9 3.3h3l-3.3-5 3.1-5h-2.9l-1.8 3.1L9.4 12H6.5Z" fill="white" />
    </svg>
  );
}

export function TelegramIcon({ size = 24, className }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="#229ED9" />
      <path d="M7.4 15.3 24 8.9c.8-.3 1.4.2 1.1 1.3l-2.8 13.1c-.2.9-.8 1.1-1.5.7l-4.3-3.2-2.1 2c-.2.2-.4.4-.8.4l.3-4.5 8.2-7.4c.4-.3-.1-.5-.6-.2l-10.1 6.4-4.3-1.3c-.9-.3-.9-.7.3-1.2Z" fill="white" />
    </svg>
  );
}
