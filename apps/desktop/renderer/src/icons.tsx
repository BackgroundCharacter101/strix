import React from 'react';
import brandUrl from './assets/brand.png';

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

// The Strix brand mark — the orbital ring + connected-node cluster logo.
// Rendered as a rounded badge so the mark (which carries its own light
// background) stays legible on Strix's near-black chrome as well as light
// surfaces. Kept the `OwlIcon` name so every call site (title bar, welcome,
// About) picks up the new brand with no churn.
export function OwlIcon({ size = 22 }: IconProps) {
  return (
    <img
      src={brandUrl}
      width={size}
      height={size}
      alt="Strix"
      draggable={false}
      style={{
        display: 'block',
        borderRadius: Math.max(2, Math.round(size * 0.22)),
        objectFit: 'cover',
      }}
    />
  );
}

// Problems: a warning triangle with an exclamation mark.
export function ProblemsIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M10.3 3.9 2.4 17.4A1.5 1.5 0 0 0 3.7 19.7h16.6a1.5 1.5 0 0 0 1.3-2.3L13.7 3.9a1.6 1.6 0 0 0-2.8 0z" />
      <path d="M12 9v4" />
      <path d="M12 16.5h.01" />
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

export function MapIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="6" width="7" height="5" rx="1" />
      <rect x="8" y="15" width="7" height="5" rx="1" />
      <path d="M6.5 8v3.5h5" />
      <path d="M17.5 11v1.5h-6V15" />
    </svg>
  );
}

// Agents: a small robot head — reads as "automation/agents".
export function AgentsIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="5" y="8" width="14" height="10" rx="2.5" />
      <path d="M12 4v4" />
      <circle cx="12" cy="3.2" r="1.2" />
      <path d="M9.5 12.5h.01M14.5 12.5h.01" />
      <path d="M3 12v3M21 12v3" />
    </svg>
  );
}

export function OutlineIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 6h2" />
      <path d="M9 6h11" />
      <path d="M7 12h2" />
      <path d="M12 12h8" />
      <path d="M7 18h2" />
      <path d="M12 18h8" />
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
  // Filled cog — reads unmistakably as a gear at small sizes (an outline gear's
  // thin teeth look like a sun/asterisk).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.49.49 0 0 0-.48-.41h-3.84a.49.49 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z" />
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

export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5 5l14 14M19 5L5 19" />
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
