import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Rectangle } from "electron";
import type { ClickOptions, FillOptions, ClickResult, FillResult } from "@shared/dom/interaction";

interface UiState {
  // Container reference for resize observer
  containerRef: HTMLDivElement | null;

  // Current bounds of the container
  containerBounds: Rectangle | null;

  // DOM Interaction state
  clickId: string;
  fillId: string;
  fillText: string;
  isClicking: boolean;
  isFilling: boolean;
  lastClickResult: ClickResult | null;
  lastFillResult: FillResult | null;

  // Actions
  setContainerRef: (ref: HTMLDivElement | null) => void;
  setContainerBounds: (bounds: Rectangle | null) => void;

  // DOM Interaction actions
  setClickId: (id: string) => void;
  setFillId: (id: string) => void;
  setFillText: (text: string) => void;
  clickElement: (backendNodeId: number, options?: ClickOptions) => Promise<ClickResult>;
  fillElement: (backendNodeId: number, options: FillOptions) => Promise<FillResult>;
}

export const useUiStore = create<UiState>()(
  subscribeWithSelector((set) => ({
    // Initial state
    containerRef: null,
    containerBounds: null,

    // DOM Interaction initial state
    clickId: "",
    fillId: "",
    fillText: "",
    isClicking: false,
    isFilling: false,
    lastClickResult: null,
    lastFillResult: null,

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

    // DOM Interaction actions
    setClickId: (id) => set({ clickId: id }),
    setFillId: (id) => set({ fillId: id }),
    setFillText: (text) => set({ fillText: text }),

    clickElement: async (backendNodeId: number, options?: ClickOptions): Promise<ClickResult> => {
      set({ isClicking: true });
      try {
        if (!window.ipcRenderer) {
          throw new Error("IPC Renderer not available");
        }
        const result = await window.ipcRenderer.invoke("dom:clickElement", backendNodeId, options) as ClickResult;
        set({ lastClickResult: result });
        return result;
      } catch (error) {
        const errorResult: ClickResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        set({ lastClickResult: errorResult });
        return errorResult;
      } finally {
        set({ isClicking: false });
      }
    },

    fillElement: async (backendNodeId: number, options: FillOptions): Promise<FillResult> => {
      set({ isFilling: true });
      try {
        if (!window.ipcRenderer) {
          throw new Error("IPC Renderer not available");
        }
        const result = await window.ipcRenderer.invoke("dom:fillElement", backendNodeId, options) as FillResult;
        set({ lastFillResult: result });
        return result;
      } catch (error) {
        const errorResult: FillResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        set({ lastFillResult: errorResult });
        return errorResult;
      } finally {
        set({ isFilling: false });
      }
    },
  }))
);