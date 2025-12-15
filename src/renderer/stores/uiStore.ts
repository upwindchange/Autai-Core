import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Rectangle } from "electron";
import type { ClickOptions, FillOptions, ClickResult, FillResult, SelectOptionOptions, SelectOptionResult, HoverOptions, HoverResult, DragOptions, DragResult } from "@shared/dom/interaction";
import type { IncrementalDetectionResult, LLMRepresentationResult, SerializationStats } from "@shared/dom";

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
  dragSourceId: string;
  dragTarget: string;
  isClicking: boolean;
  isFilling: boolean;
  isSelecting: boolean;
  isHovering: boolean;
  isDragging: boolean;
  lastClickResult: ClickResult | null;
  lastFillResult: FillResult | null;
  lastSelectResult: SelectOptionResult | null;
  lastHoverResult: HoverResult | null;
  lastDragResult: DragResult | null;

  // Detection and LLM state
  isDetectingChanges: boolean;
  lastDetectionResult: IncrementalDetectionResult | null;
  isGeneratingLLM: boolean;
  lastLLMRepresentation: string | null;
  llmGenerationError: string | null;

  // DOM baseline initialization state
  isInitializingBaseline: boolean;
  lastInitializationResult: {
    success: boolean;
    message: string;
    error?: string;
    stats?: SerializationStats;
  } | null;

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
  setDragSourceId: (id: string) => void;
  setDragTarget: (target: string) => void;
  clickElement: (backendNodeId: number, options?: ClickOptions) => Promise<ClickResult>;
  fillElement: (backendNodeId: number, options: FillOptions) => Promise<FillResult>;
  selectElement: (backendNodeId: number, options: SelectOptionOptions) => Promise<SelectOptionResult>;
  hoverElement: (backendNodeId: number, options?: HoverOptions) => Promise<HoverResult>;
  dragElement: (sourceBackendNodeId: number, options: DragOptions) => Promise<DragResult>;

  // Detection and LLM actions
  detectChanges: () => Promise<IncrementalDetectionResult>;
  generateLLMRepresentation: () => Promise<LLMRepresentationResult>;
  initializeDomBaseline: () => Promise<{
    success: boolean;
    message: string;
    error?: string;
    stats?: SerializationStats;
  }>;
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
    dragSourceId: "",
    dragTarget: "",
    isClicking: false,
    isFilling: false,
    isSelecting: false,
    isHovering: false,
    isDragging: false,
    lastClickResult: null,
    lastFillResult: null,
    lastSelectResult: null,
    lastHoverResult: null,
    lastDragResult: null,

    // Detection and LLM initial state
    isDetectingChanges: false,
    lastDetectionResult: null,
    isGeneratingLLM: false,
    lastLLMRepresentation: null,
    llmGenerationError: null,

    // DOM baseline initialization initial state
    isInitializingBaseline: false,
    lastInitializationResult: null,

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
    setDragSourceId: (id) => set({ dragSourceId: id }),
    setDragTarget: (target) => set({ dragTarget: target }),

    clickElement: async (backendNodeId: number, options?: ClickOptions): Promise<ClickResult> => {
      set({ isClicking: true });
      try {
        if (!window.ipcRenderer) {
          throw new Error("IPC Renderer not available");
        }
        const result = await window.ipcRenderer.invoke("interaction:clickElement", backendNodeId, options) as ClickResult;
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
        const result = await window.ipcRenderer.invoke("interaction:fillElement", backendNodeId, options) as FillResult;
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
        const result = await window.ipcRenderer.invoke("interaction:selectOption", backendNodeId, options) as SelectOptionResult;
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
        const result = await window.ipcRenderer.invoke("interaction:hoverElement", backendNodeId, options) as HoverResult;
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

    dragElement: async (sourceBackendNodeId: number, options: DragOptions): Promise<DragResult> => {
      set({ isDragging: true });
      try {
        if (!window.ipcRenderer) {
          throw new Error("IPC Renderer not available");
        }
        const result = await window.ipcRenderer.invoke("interaction:dragElement", sourceBackendNodeId, options) as DragResult;
        set({ lastDragResult: result });
        return result;
      } catch (error) {
        const errorResult: DragResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        set({ lastDragResult: errorResult });
        return errorResult;
      } finally {
        set({ isDragging: false });
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

    initializeDomBaseline: async (): Promise<{
      success: boolean;
      message: string;
      error?: string;
      stats?: SerializationStats;
    }> => {
      set({ isInitializingBaseline: true, lastInitializationResult: null });

      try {
        if (!window.ipcRenderer) {
          throw new Error("IPC Renderer not available");
        }

        const result = await window.ipcRenderer.invoke("dom:initializeBaseline") as {
          success: boolean;
          message: string;
          error?: string;
          stats?: SerializationStats;
        };
        set({ lastInitializationResult: result });
        return result;

      } catch (error) {
        const errorResult = {
          success: false,
          message: "Failed to initialize DOM baseline",
          error: error instanceof Error ? error.message : String(error)
        };
        set({ lastInitializationResult: errorResult });
        return errorResult;

      } finally {
        set({ isInitializingBaseline: false });
      }
    },
  }))
);