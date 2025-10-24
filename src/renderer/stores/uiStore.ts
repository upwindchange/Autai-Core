import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Rectangle } from "electron";

interface UiState {
  // Container reference for resize observer
  containerRef: HTMLDivElement | null;

  // Current bounds of the container
  containerBounds: Rectangle | null;

  // Actions
  setContainerRef: (ref: HTMLDivElement | null) => void;
  setContainerBounds: (bounds: Rectangle | null) => void;
}

export const useUiStore = create<UiState>()(
  subscribeWithSelector((set) => ({
    // Initial state
    containerRef: null,
    containerBounds: null,

    // Actions
    setContainerRef: (ref) => set({ containerRef: ref }),

    setContainerBounds: (bounds) => {
      set({ containerBounds: bounds });

      // Send bounds to main process if we have valid bounds
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        if (window.ipcRenderer) {
          window.ipcRenderer.send("view:setBounds", bounds);
        }
      }
    },
  }))
);