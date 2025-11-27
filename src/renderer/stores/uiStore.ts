import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Rectangle } from "electron";
import type { ClickOptions, FillOptions, ClickResult, FillResult, SelectOptionOptions, SelectOptionResult, HoverOptions, HoverResult } from "@shared/dom/interaction";
import type { IncrementalDetectionResult, LLMRepresentationResult } from "@shared/dom";

interface UiState {
  // Container reference for resize observer
  containerRef: HTMLDivElement | null;

  // Current bounds of the container
  containerBounds: Rectangle | null;

  // DOM Interaction state
  clickId: string;
  fillId: string;
  fillText: string;
  selectId: string;
  selectValues: string;
  hoverId: string;
  isClicking: boolean;
  isFilling: boolean;
  isSelecting: boolean;
  isHovering: boolean;
  lastClickResult: ClickResult | null;
  lastFillResult: FillResult | null;
  lastSelectResult: SelectOptionResult | null;
  lastHoverResult: HoverResult | null;

  // Detection and LLM state
  isDetectingChanges: boolean;
  lastDetectionResult: IncrementalDetectionResult | null;
  isGeneratingLLM: boolean;
  lastLLMRepresentation: string | null;
  llmGenerationError: string | null;

  // Actions
  setContainerRef: (ref: HTMLDivElement | null) => void;
  setContainerBounds: (bounds: Rectangle | null) => void;

  // DOM Interaction actions
  setClickId: (id: string) => void;
  setFillId: (id: string) => void;
  setFillText: (text: string) => void;
  setSelectId: (id: string) => void;
  setSelectValues: (values: string) => void;
  setHoverId: (id: string) => void;
  clickElement: (backendNodeId: number, options?: ClickOptions) => Promise<ClickResult>;
  fillElement: (backendNodeId: number, options: FillOptions) => Promise<FillResult>;
  selectElement: (backendNodeId: number, options: SelectOptionOptions) => Promise<SelectOptionResult>;
  hoverElement: (backendNodeId: number, options?: HoverOptions) => Promise<HoverResult>;

  // Detection and LLM actions
  detectChanges: () => Promise<IncrementalDetectionResult>;
  generateLLMRepresentation: () => Promise<LLMRepresentationResult>;
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
    selectId: "",
    selectValues: "",
    hoverId: "",
    isClicking: false,
    isFilling: false,
    isSelecting: false,
    isHovering: false,
    lastClickResult: null,
    lastFillResult: null,
    lastSelectResult: null,
    lastHoverResult: null,

    // Detection and LLM initial state
    isDetectingChanges: false,
    lastDetectionResult: null,
    isGeneratingLLM: false,
    lastLLMRepresentation: null,
    llmGenerationError: null,

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
    setSelectId: (id) => set({ selectId: id }),
    setSelectValues: (values) => set({ selectValues: values }),
    setHoverId: (id) => set({ hoverId: id }),

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

    selectElement: async (backendNodeId: number, options: SelectOptionOptions): Promise<SelectOptionResult> => {
      set({ isSelecting: true });
      try {
        if (!window.ipcRenderer) {
          throw new Error("IPC Renderer not available");
        }
        const result = await window.ipcRenderer.invoke("dom:selectOption", backendNodeId, options) as SelectOptionResult;
        set({ lastSelectResult: result });
        return result;
      } catch (error) {
        const errorResult: SelectOptionResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        set({ lastSelectResult: errorResult });
        return errorResult;
      } finally {
        set({ isSelecting: false });
      }
    },

    hoverElement: async (backendNodeId: number, options?: HoverOptions): Promise<HoverResult> => {
      set({ isHovering: true });
      try {
        if (!window.ipcRenderer) {
          throw new Error("IPC Renderer not available");
        }
        const result = await window.ipcRenderer.invoke("dom:hoverElement", backendNodeId, options) as HoverResult;
        set({ lastHoverResult: result });
        return result;
      } catch (error) {
        const errorResult: HoverResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        set({ lastHoverResult: errorResult });
        return errorResult;
      } finally {
        set({ isHovering: false });
      }
    },

    // Detection and LLM actions
    detectChanges: async (): Promise<IncrementalDetectionResult> => {
      set({ isDetectingChanges: true, lastDetectionResult: null });
      try {
        if (!window.ipcRenderer) {
          throw new Error("IPC Renderer not available");
        }
        const result = await window.ipcRenderer.invoke("dom:incrementalDetection") as IncrementalDetectionResult;
        set({ lastDetectionResult: result });
        return result;
      } catch (error) {
        const errorResult: IncrementalDetectionResult = {
          success: false,
          hasChanges: false,
          changeCount: 0,
          newElementsCount: 0,
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : String(error)
        };
        set({ lastDetectionResult: errorResult });
        return errorResult;
      } finally {
        set({ isDetectingChanges: false });
      }
    },

    generateLLMRepresentation: async (): Promise<LLMRepresentationResult> => {
      set({ isGeneratingLLM: true, lastLLMRepresentation: null, llmGenerationError: null });
      try {
        if (!window.ipcRenderer) {
          throw new Error("IPC Renderer not available");
        }
        const result = await window.ipcRenderer.invoke("dom:getLLMRepresentation") as LLMRepresentationResult;
        if (result.success) {
          set({ lastLLMRepresentation: result.representation });
        } else {
          set({ llmGenerationError: result.error || "Unknown error occurred" });
        }
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        set({ llmGenerationError: errorMessage });
        const errorResult: LLMRepresentationResult = {
          success: false,
          representation: "",
          timestamp: Date.now(),
          error: errorMessage
        };
        return errorResult;
      } finally {
        set({ isGeneratingLLM: false });
      }
    },
  }))
);