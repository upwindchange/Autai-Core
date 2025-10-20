import { ipcMain } from "electron";
import log from "electron-log/main";

const logger = log.scope("ViewBridge");

/**
 * Simple bridge for view-related IPC communication.
 * In this simplified version, most logic is handled directly in main process.
 */
export class ViewBridge {
  constructor() {
    this.setupHandlers();
  }

  private setupHandlers(): void {
    logger.debug("Setting up ViewBridge IPC handlers");

    // Note: These handlers are actually set up directly in main/index.ts
    // This class exists for potential future expansion and organization
  }

  /**
   * Clean up IPC handlers
   */
  destroy(): void {
    logger.debug("Cleaning up ViewBridge IPC handlers");
    // Remove all handlers if they were set up here
    ipcMain.removeAllListeners("view:setBounds");
    ipcMain.removeAllListeners("view:setVisibility");
    ipcMain.removeAllListeners("view:getBounds");
  }
}
