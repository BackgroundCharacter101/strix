import type { StrixApi } from '../main/bridge';

declare global {
  interface Window {
    strix: StrixApi;
  }
}

// Vite resolves image imports to their served/bundled URL (a string).
declare module '*.png' {
  const src: string;
  export default src;
}

// Electron's <webview> tag (enabled via webviewTag) — used by the Live Preview
// to embed the running dev-server app. Typed minimally; methods are called
// through a ref cast to WebviewElement.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        partition?: string;
        allowpopups?: string;
      },
      HTMLElement
    >;
  }
}

export {};
