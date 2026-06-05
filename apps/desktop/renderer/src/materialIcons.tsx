import React from 'react';

// A Material-style, colorful file/folder icon set. Each file kind gets a
// document glyph tinted with the language's brand colour and a short monogram;
// folders are filled and a few well-known names get their own accent. This is a
// curated, self-contained set (not the full upstream Material Icon Theme), but
// it gives the Explorer the recognizable colourful look.

export interface MaterialStyle {
  color: string; // glyph fill
  label: string; // monogram (1–3 chars)
  ink?: string; // monogram colour (defaults to white)
}

// Normalize an extension via a few aliases.
function ext(name: string): string {
  const e = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  const alias: Record<string, string> = {
    tsx: 'ts',
    jsx: 'js',
    mjs: 'js',
    cjs: 'js',
    yaml: 'yml',
    htm: 'html',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    h: 'c',
    kt: 'kotlin',
    rs: 'rust',
  };
  return alias[e] ?? e;
}

const EXT_STYLE: Record<string, MaterialStyle> = {
  ts: { color: '#3178c6', label: 'TS' },
  js: { color: '#f0db4f', label: 'JS', ink: '#3a3a00' },
  json: { color: '#cbcb41', label: '{}', ink: '#3a3a00' },
  md: { color: '#519aba', label: 'MD' },
  css: { color: '#2965f1', label: '#' },
  scss: { color: '#cd6799', label: 'S' },
  less: { color: '#2a4d80', label: 'LS' },
  html: { color: '#e34f26', label: '<>' },
  py: { color: '#3572A5', label: 'PY' },
  sh: { color: '#4eaa25', label: '$' },
  bash: { color: '#4eaa25', label: '$' },
  yml: { color: '#cb171e', label: 'YM' },
  toml: { color: '#9c4221', label: 'TO' },
  ini: { color: '#6d8086', label: 'IN' },
  rust: { color: '#dea584', label: 'RS', ink: '#3a2a14' },
  go: { color: '#00add8', label: 'GO' },
  java: { color: '#ea2d2e', label: 'JV' },
  kotlin: { color: '#a97bff', label: 'KT' },
  rb: { color: '#cc342d', label: 'RB' },
  php: { color: '#777bb4', label: 'PHP' },
  c: { color: '#599eff', label: 'C' },
  cpp: { color: '#f34b7d', label: 'C+' },
  cs: { color: '#178600', label: 'C#' },
  swift: { color: '#ffac45', label: 'SW', ink: '#3a2400' },
  dart: { color: '#00b4ab', label: 'DT' },
  vue: { color: '#41b883', label: 'V' },
  svelte: { color: '#ff3e00', label: 'SV' },
  lua: { color: '#000080', label: 'LU' },
  sql: { color: '#e38c00', label: 'SQL', ink: '#3a2400' },
  xml: { color: '#e37933', label: 'XM' },
  svg: { color: '#ffb13b', label: 'SVG', ink: '#3a2400' },
  png: { color: '#26a69a', label: 'IMG' },
  jpg: { color: '#26a69a', label: 'IMG' },
  jpeg: { color: '#26a69a', label: 'IMG' },
  gif: { color: '#26a69a', label: 'IMG' },
  lock: { color: '#cb3837', label: 'LK' },
  txt: { color: '#9e9e9e', label: 'TXT' },
};

// Whole-filename matches (win over extension).
const NAME_STYLE: Record<string, MaterialStyle> = {
  'package.json': { color: '#cb3837', label: 'npm' },
  'package-lock.json': { color: '#cb3837', label: 'LK' },
  'tsconfig.json': { color: '#3178c6', label: 'TS' },
  '.gitignore': { color: '#f05133', label: 'git', ink: '#fff' },
  '.gitattributes': { color: '#f05133', label: 'git' },
  dockerfile: { color: '#2496ed', label: 'DK' },
  '.env': { color: '#ecd53f', label: 'ENV', ink: '#3a3a00' },
  'readme.md': { color: '#42a5f5', label: 'i' },
  license: { color: '#d4b106', label: '©', ink: '#3a2e00' },
};

export function materialFileStyle(name: string): MaterialStyle {
  const lower = name.toLowerCase();
  return NAME_STYLE[lower] ?? EXT_STYLE[ext(name)] ?? { color: '#90a4ae', label: '·' };
}

export function MaterialFileIcon({ name, size = 16 }: { name: string; size?: number }) {
  const { color, label, ink } = materialFileStyle(name);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill={color} />
      <path d="M14 2l5 5h-4a1 1 0 0 1-1-1z" fill="#000" opacity="0.18" />
      <text
        x="11.5"
        y="17.5"
        textAnchor="middle"
        fontSize={label.length > 2 ? 5.5 : 7}
        fontWeight="700"
        fontFamily="var(--font-mono, monospace)"
        fill={ink ?? '#ffffff'}
      >
        {label}
      </text>
    </svg>
  );
}

// A few well-known folders get an accent colour; others use a neutral material
// blue-grey.
const FOLDER_COLOR: Record<string, string> = {
  src: '#42a5f5',
  source: '#42a5f5',
  components: '#26c6da',
  node_modules: '#8bc34a',
  dist: '#78909c',
  build: '#78909c',
  out: '#78909c',
  public: '#ffa726',
  assets: '#ffa726',
  images: '#ffa726',
  test: '#66bb6a',
  tests: '#66bb6a',
  __tests__: '#66bb6a',
  '.git': '#ef6c50',
  '.github': '#9e9e9e',
  docs: '#42a5f5',
  styles: '#ec407a',
  css: '#ec407a',
  scripts: '#ab47bc',
};

export function materialFolderColor(name: string): string {
  return FOLDER_COLOR[name.toLowerCase()] ?? '#5c84b1';
}

export function MaterialFolderIcon({
  open,
  name,
  size = 16,
}: {
  open?: boolean;
  name: string;
  size?: number;
}) {
  const color = materialFolderColor(name);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {open ? (
        <>
          <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v3H3z" fill={color} opacity="0.6" />
          <path d="M3 9h18l-2 9a1 1 0 0 1-1 .9H4a1 1 0 0 1-1-.9z" fill={color} />
        </>
      ) : (
        <path
          d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
          fill={color}
        />
      )}
    </svg>
  );
}
