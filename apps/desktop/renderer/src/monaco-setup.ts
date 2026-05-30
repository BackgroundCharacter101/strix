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
// Match the editor chrome to the app's amber identity: amber cursor, amber
// active line-number, amber-tinted selection / bracket matching, and a subtle
// current-line highlight. Token colours are inherited (vs-dark / vs) so syntax
// highlighting stays familiar; only the surrounding chrome is restyled.
const AMBER = '#e8a33d';

monaco.editor.defineTheme('strix-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '7d8a99', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'e8a33d' },
    { token: 'type', foreground: '7fc2e8' },
    { token: 'string', foreground: 'c9a26a' },
    { token: 'number', foreground: 'd19a66' },
  ],
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#d4d4d4',
    'editorLineNumber.foreground': '#5a5a5a',
    'editorLineNumber.activeForeground': AMBER,
    'editorCursor.foreground': AMBER,
    'editor.selectionBackground': '#e8a33d3a',
    'editor.inactiveSelectionBackground': '#e8a33d20',
    'editor.selectionHighlightBackground': '#e8a33d22',
    'editor.wordHighlightBackground': '#e8a33d1f',
    'editor.lineHighlightBackground': '#ffffff08',
    'editor.lineHighlightBorder': '#00000000',
    'editorIndentGuide.background': '#2b2b2b',
    'editorIndentGuide.activeBackground': '#e8a33d55',
    'editorBracketMatch.border': '#e8a33d',
    'editorBracketMatch.background': '#e8a33d22',
    'editorGutter.background': '#1e1e1e',
    'editorWidget.background': '#252526',
    'editorWidget.border': '#3c3c3c',
    'editorSuggestWidget.background': '#252526',
    'editorSuggestWidget.selectedBackground': '#e8a33d33',
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
    'editorLineNumber.activeForeground': '#c9802a',
    'editorCursor.foreground': '#c9802a',
    'editor.selectionBackground': '#e8a33d44',
    'editor.lineHighlightBackground': '#00000007',
    'editor.lineHighlightBorder': '#00000000',
    'editorIndentGuide.activeBackground': '#c9802a66',
    'editorBracketMatch.border': '#c9802a',
    'editorOverviewRuler.border': '#00000000',
  },
});

// Point @monaco-editor/react at the bundled monaco instead of its CDN loader.
loader.config({ monaco });

// AI inline autocomplete (ghost text).
registerAutocomplete();
