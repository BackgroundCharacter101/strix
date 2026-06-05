import React from 'react';

// Lightweight inline SVG icons (Codicon-style) so the UI reads like VS Code
// without pulling in an icon font/dependency. All icons inherit `currentColor`.

type IconProps = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

// The Strix mark — a stylized owl face (the genus Strix is a true owl).
// Ear tufts, round eyes with amber pupils, and a beak. Inherits currentColor
// for the outline; eyes use the accent so the "owl eyes in the dark" identity
// reads even at small sizes.
export function OwlIcon({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
        {/* ear tufts */}
        <path d="M6.5 6.5 5 3.5l3.2 1.6M17.5 6.5 19 3.5l-3.2 1.6" />
        {/* head / body */}
        <path d="M12 4.8c4 0 6.6 2.8 6.6 7.1 0 4.6-2.9 7.8-6.6 7.8s-6.6-3.2-6.6-7.8c0-4.3 2.6-7.1 6.6-7.1z" />
        {/* beak */}
        <path d="M12 12.4 10.9 14h2.2L12 12.4z" fill="currentColor" />
      </g>
      {/* eyes */}
      <circle cx="9" cy="10.6" r="2.4" fill="none" stroke="currentColor" strokeWidth={1.4} />
      <circle cx="15" cy="10.6" r="2.4" fill="none" stroke="currentColor" strokeWidth={1.4} />
      <circle cx="9" cy="10.6" r="1" fill="var(--accent)" />
      <circle cx="15" cy="10.6" r="1" fill="var(--accent)" />
    </svg>
  );
}

export function FilesIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 4h5l2 2h9v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function SparkleIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.7 5.1a3 3 0 0 0 1.9 1.9L20.8 11l-5.2 1.7a3 3 0 0 0-1.9 1.9L12 19.8l-1.7-5.2a3 3 0 0 0-1.9-1.9L3.2 11l5.2-1.7a3 3 0 0 0 1.9-1.9z" />
    </svg>
  );
}

export function SearchIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="10.5" cy="10.5" r="6" />
      <line x1="20" y1="20" x2="15" y2="15" />
    </svg>
  );
}

export function SourceControlIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="17" cy="12" r="2.4" />
      <path d="M6 8.4v7.2M8.3 6h4.4a2 2 0 0 1 2 2v1.6" />
    </svg>
  );
}

// Extensions glyph (four squares, top-right offset) — the classic "extensions" mark.
export function ExtensionsIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
      <path d="M14 4.5h5.5V10" />
      <path d="M16.7 7.2 20 4" />
    </svg>
  );
}

export function SplitIcon({ size = 15 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

export function TerminalIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <polyline points="5 8 9 12 5 16" />
      <line x1="11" y1="16" x2="17" y2="16" />
    </svg>
  );
}

export function GearIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </svg>
  );
}

export function RunIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlayIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M7 5l11 7-11 7z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SaveIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5 3h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M8 3v5h7V3" />
      <rect x="8" y="13" width="8" height="6" />
    </svg>
  );
}

// --- Window controls (title bar) ---
export function WinMinIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function WinMaxIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function WinRestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <rect x="1.5" y="3" width="5.5" height="5.5" stroke="currentColor" strokeWidth="1" />
      <path d="M3.5 3V1.5H8.5V6.5H7" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function WinCloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1" />
      <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function GitBranchIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <path d="M6 8.2v7.6M18 9.2c0 4-3 4.8-6 4.8" />
    </svg>
  );
}

export function ErrorIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm2.5 9.1-1.4 1.4L8 9.4l-1.1 1.1-1.4-1.4L6.6 8 5.5 6.9l1.4-1.4L8 6.6l1.1-1.1 1.4 1.4L9.4 8l1.1 1.1z" />
    </svg>
  );
}

export function WarningIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1.5 15 14H1L8 1.5zm-.8 4.5v3.4h1.6V6H7.2zm0 4.4V12h1.6v-1.6H7.2z" />
    </svg>
  );
}

// A filled document glyph with a folded corner — used for files (tinted by type).
export function FileGlyph({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M9.4 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.6L9.4 1zM9 2.2 11.8 5H9V2.2z" />
    </svg>
  );
}

export function FolderGlyph({ open = false, size = 15 }: IconProps & { open?: boolean }) {
  if (open) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M1.5 3.5a1 1 0 0 1 1-1h3.1l1.2 1.2h5.7a1 1 0 0 1 1 1V6H4.2a1 1 0 0 0-.96.73L1.6 12.4 1.5 12V3.5z" />
        <path d="M4.2 7h10.6a.6.6 0 0 1 .58.77l-1.3 4.6a1 1 0 0 1-.96.73H2.6a.6.6 0 0 1-.58-.77l1.2-4.6A1 1 0 0 1 4.2 7z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M1.5 3.6a1 1 0 0 1 1-1h3.1l1.2 1.2h6.2a1 1 0 0 1 1 1v7.1a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V3.6z" />
    </svg>
  );
}
