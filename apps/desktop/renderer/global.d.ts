import type { TabeaApi } from '../main/preload';

declare global {
  interface Window {
    tabea: TabeaApi;
  }
}

export {};
