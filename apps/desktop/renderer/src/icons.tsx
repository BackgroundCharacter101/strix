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

export function TerminalIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <polyline points="5 8 9 12 5 16" />
      <line x1="11" y1="16" x2="17" y2="16" />
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
