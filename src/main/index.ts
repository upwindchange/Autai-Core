import {
  app,
  BrowserWindow,
  ipcMain,
  Rectangle,
  WebContentsView,
} from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { is } from "@electron-toolkit/utils";
import log from "electron-log/main";
import { DOMService } from "./services/dom/DOMService";
import type { SerializedDOMState, SerializationConfig } from "@shared/dom";
import type {
  ClickOptions,
  FillOptions,
  SelectOptionOptions,
  HoverOptions,
} from "@shared/dom/interaction";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = log.scope("main");

const DEFAULT_URL = "https://www.google.com";

process.env.APP_ROOT = path.join(__dirname, "../..");
export const MAIN_DIST = path.join(process.env.APP_ROOT, "out/main");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "out/renderer");
export const ELECTRON_RENDERER_URL = process.env.ELECTRON_RENDERER_URL;

process.env.VITE_PUBLIC = ELECTRON_RENDERER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null = null;
let webView: WebContentsView | null = null;
let domService: DOMService | null = null;
let viewBounds: Rectangle = { x: 0, y: 0, width: 1920, height: 1080 };

// Secondary control panel window
let controlPanelWindow: BrowserWindow | null = null;
const CONTROL_PANEL_BOUNDS = { x: 100, y: 100, width: 1280, height: 720 };

const preload = path.join(__dirname, "../preload/index.mjs");
const indexHtml = path.join(RENDERER_DIST, "index.html");

function createWindow() {
  win = new BrowserWindow({
    title: "Autai DOM Testbed",
    icon: process.env.VITE_PUBLIC
      ? path.join(process.env.VITE_PUBLIC, "favicon.ico")
      : undefined,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: false,
      webviewTag: false,
    },
  });

  if (is.dev && ELECTRON_RENDERER_URL) {
    win.loadURL(ELECTRON_RENDERER_URL);
    // win.webContents.openDevTools();
  } else {
    win.loadFile(indexHtml);
  }

  webView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  webView.setBackgroundColor("#00000000");

  win.contentView.addChildView(webView);

  domService = new DOMService(webView.webContents);
  webView.webContents.on("did-finish-load", async () => {
    logger.info("Page finished loading, processing DOM...");

    try {
      if (domService) {
        await domService.initialize();
        await domService.getSerializedDOMTree();
        logger.info(
          `DOM tree processed successfully - tree construction complete`
        );
      }
    } catch (error) {
      logger.error("Failed to process DOM after page load:", error);
    }
  });

  webView.webContents.on("did-fail-load", (_, errorCode, errorDescription) => {
    logger.error(`Page failed to load: ${errorCode} - ${errorDescription}`);
  });

  webView.webContents.loadURL(DEFAULT_URL).catch((error) => {
    logger.error("Failed to load URL:", error);
  });

  logger.info("Window and WebContentsView created successfully");
}

function createControlPanel() {
  controlPanelWindow = new BrowserWindow({
    title: "Autai Control Panel",
    x: CONTROL_PANEL_BOUNDS.x,
    y: CONTROL_PANEL_BOUNDS.y,
    width: CONTROL_PANEL_BOUNDS.width,
    height: CONTROL_PANEL_BOUNDS.height,
    icon: process.env.VITE_PUBLIC
      ? path.join(process.env.VITE_PUBLIC, "favicon.ico")
      : undefined,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: false,
      webviewTag: false,
    },
  });

  // Load React app for control panel
  if (is.dev && ELECTRON_RENDERER_URL) {
    // Development: Use the control-panel specific URL
    controlPanelWindow.loadURL(`${ELECTRON_RENDERER_URL}control-panel/`);
  } else {
    // Production: Load from built files
    const controlPanelHtml = path.join(RENDERER_DIST, "control-panel/index.html");
    controlPanelWindow.loadFile(controlPanelHtml);
  }

  logger.info("Control panel window created successfully");
}

app.whenReady().then(async () => {
  log.initialize();
  log.transports.file.level = "info";
  log.transports.console.level = is.dev ? "debug" : "info";

  logger.info("Application starting");

  // Create both windows
  createWindow();
  createControlPanel();

  app.on("activate", () => {
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length) {
      // Focus main window if available, otherwise any window
      const mainWindow = allWindows.find((w) => w === win) || allWindows[0];
      mainWindow.focus();
    } else {
      createWindow();
      createControlPanel();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    logger.info("Quitting app...");
    app.quit();
  }
});

app.on("before-quit", async () => {
  logger.info("Cleaning up before quit...");

  if (domService) {
    try {
      await domService.destroy();
      logger.debug("DOMService cleaned up successfully");
    } catch (error) {
      logger.error("Error cleaning up DOMService:", error);
    }
    domService = null;
  }

  if (webView && win && !win.isDestroyed()) {
    try {
      if (webView.webContents && !webView.webContents.isDestroyed()) {
        try {
          webView.webContents.stop();
          webView.webContents.removeAllListeners();
          webView.webContents.close({ waitForBeforeUnload: false });
          webView.webContents.forcefullyCrashRenderer();
          logger.debug("WebContents cleaned up successfully");
        } catch (error) {
          logger.error("Error cleaning up WebContents:", error);
        }
      }

      try {
        win.contentView.removeChildView(webView);
        logger.debug("WebContentsView removed from window");
      } catch (error) {
        logger.error("Error removing WebContentsView from window:", error);
      }
    } catch (error) {
      logger.error("Error during WebView cleanup:", error);
    }
  }

  // Cleanup control panel window (NEW)
  if (controlPanelWindow && !controlPanelWindow.isDestroyed()) {
    try {
      controlPanelWindow.webContents.stop();
      controlPanelWindow.webContents.removeAllListeners();
      controlPanelWindow.webContents.close({ waitForBeforeUnload: false });
      controlPanelWindow.webContents.forcefullyCrashRenderer();
      controlPanelWindow.destroy();
      logger.debug("Control panel window cleaned up successfully");
    } catch (error) {
      logger.error("Error cleaning up control panel window:", error);
    }
  }

  // Cleanup main window (existing)
  if (win && !win.isDestroyed()) {
    win.destroy();
  }

  // Reset all variables
  webView = null;
  win = null;
  controlPanelWindow = null; // NEW
});

ipcMain.on("view:setBounds", (_, bounds: Rectangle) => {
  logger.debug("Setting view bounds:", bounds);
  viewBounds = bounds;

  if (webView) {
    try {
      webView.setBounds(bounds);
      logger.debug(`Bounds updated: ${bounds.width}x${bounds.height}`);
    } catch (error) {
      logger.error("Failed to set bounds:", error);
    }
  } else {
    logger.warn("WebView not available for bounds update");
  }
});

ipcMain.handle("view:getBounds", () => {
  return viewBounds;
});

ipcMain.handle("dom:initialize", async () => {
  if (!domService) {
    throw new Error("DOMService not initialized");
  }
  try {
    await domService.initialize();
    return { success: true };
  } catch (error) {
    logger.error("Failed to initialize DOMService:", error);
    throw error;
  }
});

ipcMain.handle("dom:getDOMTree", async () => {
  if (!domService) {
    throw new Error("DOMService not initialized");
  }
  try {
    return await domService.getDOMTree();
  } catch (error) {
    logger.error("Failed to get DOM tree:", error);
    throw error;
  }
});

ipcMain.handle(
  "dom:getSerializedDOMTree",
  async (
    _,
    previousState?: SerializedDOMState,
    config?: Partial<SerializationConfig>
  ) => {
    if (!domService) {
      throw new Error("DOMService not initialized");
    }
    try {
      return await domService.getSerializedDOMTree(previousState, config);
    } catch (error) {
      logger.error("Failed to get serialized DOM tree:", error);
      throw error;
    }
  }
);

ipcMain.handle("dom:getStatus", () => {
  if (!domService) {
    return { isInitialized: false, isAttached: false };
  }
  return domService.getStatus();
});

ipcMain.handle(
  "dom:clickElement",
  async (_, backendNodeId: number, options?: ClickOptions) => {
    if (!domService) {
      throw new Error("DOMService not initialized");
    }
    try {
      logger.info(`IPC: Clicking element with backendNodeId: ${backendNodeId}`);
      const result = await domService.clickElement(backendNodeId, options);
      logger.info(
        `IPC: Element click result: ${result.success ? "success" : "failed"}`
      );
      return result;
    } catch (error) {
      logger.error(
        `IPC: Failed to click element with backendNodeId ${backendNodeId}:`,
        error
      );
      throw error;
    }
  }
);

ipcMain.handle(
  "dom:fillElement",
  async (_, backendNodeId: number, options: FillOptions) => {
    if (!domService) {
      throw new Error("DOMService not initialized");
    }
    try {
      logger.info(
        `IPC: Filling element with backendNodeId: ${backendNodeId}, value: "${options.value}"`
      );
      const result = await domService.fillElement(backendNodeId, options);
      logger.info(
        `IPC: Element fill result: ${result.success ? "success" : "failed"}`
      );
      return result;
    } catch (error) {
      logger.error(
        `IPC: Failed to fill element with backendNodeId ${backendNodeId}:`,
        error
      );
      throw error;
    }
  }
);

ipcMain.handle(
  "dom:selectOption",
  async (_, backendNodeId: number, options: SelectOptionOptions) => {
    if (!domService) {
      throw new Error("DOMService not initialized");
    }
    try {
      logger.info(
        `IPC: Selecting options for element with backendNodeId: ${backendNodeId}, values: "${
          Array.isArray(options.values)
            ? options.values.join(", ")
            : options.values
        }"`
      );
      const result = await domService.selectOption(backendNodeId, options);
      logger.info(
        `IPC: Element select result: ${
          result.success ? "success" : "failed"
        }, options selected: ${result.optionsSelected || 0}`
      );
      return result;
    } catch (error) {
      logger.error(
        `IPC: Failed to select options for element with backendNodeId ${backendNodeId}:`,
        error
      );
      throw error;
    }
  }
);

ipcMain.handle(
  "dom:hoverElement",
  async (_, backendNodeId: number, options?: HoverOptions) => {
    if (!domService) {
      throw new Error("DOMService not initialized");
    }
    try {
      logger.info(`IPC: Hovering element with backendNodeId: ${backendNodeId}`);
      const result = await domService.hoverElement(backendNodeId, options);
      logger.info(
        `IPC: Element hover result: ${result.success ? "success" : "failed"}`
      );
      return result;
    } catch (error) {
      logger.error(
        `IPC: Failed to hover element with backendNodeId ${backendNodeId}:`,
        error
      );
      throw error;
    }
  }
);
