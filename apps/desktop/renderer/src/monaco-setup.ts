import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import { registerAutocomplete } from './autocomplete';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

// Serve Monaco's language workers from the local bundle (Vite `?worker`
// imports) instead of a CDN, so the editor works offline and under the
// Electron file:// origin.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

// ---- Strix editor themes -------------------------------------------------
// Match the editor chrome to the app's accent: accent cursor, accent active
// line-number, accent-tinted selection / bracket matching, and a subtle
// current-line highlight. Token colours are inherited (vs-dark / vs) so syntax
// highlighting stays familiar; only the surrounding chrome is restyled. The
// accent is swappable at runtime via applyAccent().
function withAlpha(hex: string, alpha: string) {
  // hex like '#e8a33d' → '#e8a33d3a'
  return hex.length === 7 ? `${hex}${alpha}` : hex;
}

function defineStrixThemes(accent: string) {
  monaco.editor.defineTheme('strix-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '7d8a99', fontStyle: 'italic' },
      { token: 'type', foreground: '7fc2e8' },
      { token: 'string', foreground: 'c9a26a' },
      { token: 'number', foreground: 'd19a66' },
    ],
    colors: {
      // Deep near-black to match the UI surfaces.
      'editor.background': '#0e0e10',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#4a4a4e',
      'editorLineNumber.activeForeground': accent,
      'editorCursor.foreground': accent,
      'editor.selectionBackground': withAlpha(accent, '3a'),
      'editor.inactiveSelectionBackground': withAlpha(accent, '20'),
      'editor.selectionHighlightBackground': withAlpha(accent, '22'),
      'editor.wordHighlightBackground': withAlpha(accent, '1f'),
      'editor.lineHighlightBackground': '#ffffff0a',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background': '#232327',
      'editorIndentGuide.activeBackground': withAlpha(accent, '55'),
      'editorBracketMatch.border': accent,
      'editorBracketMatch.background': withAlpha(accent, '22'),
      'editorGutter.background': '#0e0e10',
      'editorWidget.background': '#161618',
      'editorWidget.border': '#2a2a2e',
      'editorSuggestWidget.background': '#161618',
      'editorSuggestWidget.selectedBackground': withAlpha(accent, '33'),
      'editorOverviewRuler.border': '#00000000',
      'scrollbarSlider.background': '#5a5a5a55',
      'scrollbarSlider.hoverBackground': '#5a5a5a88',
      'minimap.background': '#0e0e10',
    },
  });

  monaco.editor.defineTheme('strix-light', {
    base: 'vs',
    inherit: true,
    rules: [{ token: 'comment', foreground: '6a8759', fontStyle: 'italic' }],
    colors: {
      // Warm, soft light: paper-cream background + warm-gray text (matches the
      // light theme tokens), so the editor isn't a glaring white island.
      'editor.background': '#faf7f1',
      'editor.foreground': '#3b352d',
      'editorLineNumber.foreground': '#bdb4a2',
      'editorLineNumber.activeForeground': accent,
      'editorCursor.foreground': accent,
      'editor.selectionBackground': withAlpha(accent, '44'),
      'editor.lineHighlightBackground': '#7a5a2010',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background': '#e6ddcd',
      'editorIndentGuide.activeBackground': withAlpha(accent, '66'),
      'editorBracketMatch.border': accent,
      'editorGutter.background': '#faf7f1',
      'editorWidget.background': '#f2ede3',
      'editorSuggestWidget.background': '#f2ede3',
      'minimap.background': '#faf7f1',
      'editorOverviewRuler.border': '#00000000',
    },
  });

  // Cybersec mode: a green-tinted near-black editor that matches the pentester
  // chrome (so the editor doesn't sit as a light/grey island in green-black UI).
  monaco.editor.defineTheme('strix-cybersec', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '587e69', fontStyle: 'italic' },
      { token: 'type', foreground: '74c39c' },
      { token: 'string', foreground: 'a6cdb5' },
      { token: 'number', foreground: '83cba2' },
    ],
    colors: {
      // Softer phosphor green on a green-tinted near-black (matches the UI).
      'editor.background': '#0a0e0c',
      'editor.foreground': '#b8d8c4',
      'editorLineNumber.foreground': '#345a47',
      'editorLineNumber.activeForeground': accent,
      'editorCursor.foreground': accent,
      'editor.selectionBackground': withAlpha(accent, '38'),
      'editor.inactiveSelectionBackground': withAlpha(accent, '1e'),
      'editor.selectionHighlightBackground': withAlpha(accent, '20'),
      'editor.wordHighlightBackground': withAlpha(accent, '1d'),
      'editor.lineHighlightBackground': '#2ea8710e',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background': '#17271e',
      'editorIndentGuide.activeBackground': withAlpha(accent, '50'),
      'editorBracketMatch.border': accent,
      'editorBracketMatch.background': withAlpha(accent, '20'),
      'editorGutter.background': '#0a0e0c',
      'editorWidget.background': '#0f1512',
      'editorWidget.border': '#213a2d',
      'editorSuggestWidget.background': '#0f1512',
      'editorSuggestWidget.selectedBackground': withAlpha(accent, '30'),
      'editorOverviewRuler.border': '#00000000',
      'scrollbarSlider.background': '#2ea87133',
      'scrollbarSlider.hoverBackground': '#2ea87155',
      'minimap.background': '#0a0e0c',
    },
  });
}

defineStrixThemes('#e8bd3a');

// Re-define the Strix themes with a new accent and refresh the active editor.
export function applyAccent(accentHex: string, activeTheme: string) {
  defineStrixThemes(accentHex);
  monaco.editor.setTheme(activeTheme);
}

// Point @monaco-editor/react at the bundled monaco instead of its CDN loader.
loader.config({ monaco });

// AI inline autocomplete (ghost text).
registerAutocomplete();
