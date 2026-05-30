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
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#5a5a5a',
      'editorLineNumber.activeForeground': accent,
      'editorCursor.foreground': accent,
      'editor.selectionBackground': withAlpha(accent, '3a'),
      'editor.inactiveSelectionBackground': withAlpha(accent, '20'),
      'editor.selectionHighlightBackground': withAlpha(accent, '22'),
      'editor.wordHighlightBackground': withAlpha(accent, '1f'),
      'editor.lineHighlightBackground': '#ffffff08',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background': '#2b2b2b',
      'editorIndentGuide.activeBackground': withAlpha(accent, '55'),
      'editorBracketMatch.border': accent,
      'editorBracketMatch.background': withAlpha(accent, '22'),
      'editorGutter.background': '#1e1e1e',
      'editorWidget.background': '#252526',
      'editorWidget.border': '#3c3c3c',
      'editorSuggestWidget.background': '#252526',
      'editorSuggestWidget.selectedBackground': withAlpha(accent, '33'),
      'editorOverviewRuler.border': '#00000000',
      'scrollbarSlider.background': '#5a5a5a55',
      'scrollbarSlider.hoverBackground': '#5a5a5a88',
      'minimap.background': '#1e1e1e',
    },
  });

  monaco.editor.defineTheme('strix-light', {
    base: 'vs',
    inherit: true,
    rules: [{ token: 'comment', foreground: '6a8759', fontStyle: 'italic' }],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1f1f1f',
      'editorLineNumber.foreground': '#b0b0b0',
      'editorLineNumber.activeForeground': accent,
      'editorCursor.foreground': accent,
      'editor.selectionBackground': withAlpha(accent, '44'),
      'editor.lineHighlightBackground': '#00000007',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.activeBackground': withAlpha(accent, '66'),
      'editorBracketMatch.border': accent,
      'editorOverviewRuler.border': '#00000000',
    },
  });
}

defineStrixThemes('#e8a33d');

// Re-define the Strix themes with a new accent and refresh the active editor.
export function applyAccent(accentHex: string, activeTheme: string) {
  defineStrixThemes(accentHex);
  monaco.editor.setTheme(activeTheme);
}

// Point @monaco-editor/react at the bundled monaco instead of its CDN loader.
loader.config({ monaco });

// AI inline autocomplete (ghost text).
registerAutocomplete();
