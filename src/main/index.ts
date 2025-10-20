import { app, BrowserWindow, ipcMain, Rectangle, WebContentsView } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { is } from "@electron-toolkit/utils";
import log from "electron-log/main";
import { DOMService } from "./services/dom/DOMService";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = log.scope("main");

// Constants
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
    win.webContents.openDevTools();
  } else {
    win.loadFile(indexHtml);
  }

  // Create WebContentsView following the original Autai pattern
  webView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Set transparent background like in original Autai
  webView.setBackgroundColor("#00000000");

  // Add to window's contentView
  win.contentView.addChildView(webView);

  // Initialize DOMService with the webContents
  domService = new DOMService(webView.webContents);

  // Load the URL
  webView.webContents.loadURL(DEFAULT_URL).catch((error) => {
    logger.error("Failed to load URL:", error);
  });

  logger.info("Window and WebContentsView created successfully");
}

app.whenReady().then(async () => {
  log.initialize();
  log.transports.file.level = "info";
  log.transports.console.level = is.dev ? "debug" : "info";

  logger.info("Application starting");

  createWindow();

  app.on("activate", () => {
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length) {
      allWindows[0].focus();
    } else {
      createWindow();
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

  // Clean up DOMService first
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
      // Clean up webContents first (following Autai pattern)
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

      // Remove view from window
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

  // Clean up window
  if (win && !win.isDestroyed()) {
    win.destroy();
  }

  // Clear references
  webView = null;
  win = null;
});

// IPC handlers for bounds management
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

// DOM Service IPC handlers
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

ipcMain.handle("dom:getSerializedDOMTree", async (_, previousState?: any, config?: any) => {
  if (!domService) {
    throw new Error("DOMService not initialized");
  }
  try {
    return await domService.getSerializedDOMTree(previousState, config);
  } catch (error) {
    logger.error("Failed to get serialized DOM tree:", error);
    throw error;
  }
});

ipcMain.handle("dom:getStatus", () => {
  if (!domService) {
    return { isInitialized: false, isAttached: false };
  }
  return domService.getStatus();
});