/// <reference types="vite/client" />

// Import types from electron/shared
import type { IpcRendererEvent } from "@shared";

// Type-safe IPC API
declare global {
  interface Window {
    ipcRenderer: {
      // Generic invoke (fallback)
      invoke(channel: string, ...args: unknown[]): Promise<unknown>;

      // Event listeners
      on(
        channel: string,
        listener: (event: IpcRendererEvent, ...args: unknown[]) => void
      ): void;

      once(
        channel: string,
        listener: (event: IpcRendererEvent, ...args: unknown[]) => void
      ): void;

      off(channel: string, listener?: (...args: unknown[]) => void): void;

      // Send operations (rarely used in renderer)
      send(channel: string, ...args: unknown[]): void;
    };
  }
}

export {};
