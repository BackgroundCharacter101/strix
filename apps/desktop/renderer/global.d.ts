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

export {};
