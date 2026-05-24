import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
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

// Point @monaco-editor/react at the bundled monaco instead of its CDN loader.
loader.config({ monaco });
