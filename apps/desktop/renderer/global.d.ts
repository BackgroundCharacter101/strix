import type { StrixApi } from '../main/bridge';

declare global {
  interface Window {
    strix: StrixApi;
  }
}

export {};
