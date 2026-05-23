import type { StrixApi } from '../main/preload';

declare global {
  interface Window {
    strix: StrixApi;
  }
}

export {};
