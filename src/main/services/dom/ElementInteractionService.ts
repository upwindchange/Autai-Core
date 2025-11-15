/**
 * Element Interaction Service for Autai-Core
 * Provides click functionality using multi-fallback coordinate resolution
 * Based on browser-use implementation patterns
 */

import type { WebContents } from "electron";
import log from "electron-log/main";
import type { Protocol as CDP } from "devtools-protocol";

import type {
  ClickOptions,
  ClickResult,
  BoundingBox,
  Position,
  ViewportInfo,
  ModifierType,
} from "../../../shared/dom/interaction";
import { sendCDPCommand } from "./utils/DOMUtils";
import type { LogFunctions } from "electron-log";

/**
 * Element Interaction Service class
 * Handles element clicking and interaction with simplified interface
 */
export class ElementInteractionService {
  private webContents: WebContents;
  private logger: LogFunctions;

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    this.logger = log.scope("ElementInteractionService");
  }

  /**
   * Sleep utility for timing delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get viewport metrics for visibility checks
   */
  private async getViewportInfo(): Promise<ViewportInfo> {
    try {
      const layoutMetrics: CDP.Page.GetLayoutMetricsResponse =
        await sendCDPCommand(
          this.webContents,
          "Page.getLayoutMetrics",
          undefined,
          this.logger
        );
      const layoutViewport = layoutMetrics.cssLayoutViewport;

      return {
        width: layoutViewport.clientWidth,
        height: layoutViewport.clientHeight,
        scrollX: layoutViewport.pageX || 0,
        scrollY: layoutViewport.pageY || 0,
      };
    } catch (error) {
      throw new Error(`Failed to get viewport metrics: ${error}`);
    }
  }

  /**
   * Get element coordinates using multiple fallback methods
   */
  private async getElementCoordinates(
    backendNodeId: number,
    viewport: ViewportInfo
  ): Promise<{
    coordinates: Position;
    method: "contentQuads" | "boxModel" | "boundingRect" | "javascript";
  }> {
    // Method 1: Try DOM.getContentQuads first (best for inline elements and complex layouts)
    try {
      const contentQuadsResult: CDP.DOM.GetContentQuadsResponse = await sendCDPCommand(
        this.webContents,
        "DOM.getContentQuads",
        { backendNodeId },
        this.logger
      );

      if (contentQuadsResult.quads && contentQuadsResult.quads.length > 0) {
        const quads = contentQuadsResult.quads;
        let bestQuad: CDP.DOM.Quad | null = null;
        let bestArea = 0;

        // Find the largest quad within viewport
        for (const quad of quads) {
          if (quad.length < 8) continue;

          // Calculate quad bounds
          const xs = [quad[0], quad[2], quad[4], quad[6]];
          const ys = [quad[1], quad[3], quad[5], quad[7]];
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);

          // Check if quad intersects with viewport
          if (
            maxX < 0 ||
            maxY < 0 ||
            minX > viewport.width ||
            minY > viewport.height
          ) {
            continue; // Quad is completely outside viewport
          }

          // Calculate visible area
          const visibleMinX = Math.max(0, minX);
          const visibleMaxX = Math.min(viewport.width, maxX);
          const visibleMinY = Math.max(0, minY);
          const visibleMaxY = Math.min(viewport.height, maxY);

          const visibleWidth = visibleMaxX - visibleMinX;
          const visibleHeight = visibleMaxY - visibleMinY;
          const visibleArea = visibleWidth * visibleHeight;

          if (visibleArea > bestArea) {
            bestArea = visibleArea;
            bestQuad = quad;
          }
        }

        if (bestQuad) {
          // Calculate center point of the best quad
          const centerX =
            (bestQuad[0] + bestQuad[2] + bestQuad[4] + bestQuad[6]) / 4;
          const centerY =
            (bestQuad[1] + bestQuad[3] + bestQuad[5] + bestQuad[7]) / 4;

          return {
            coordinates: { x: centerX, y: centerY },
            method: "contentQuads",
          };
        }
      }
    } catch (_error) {
      // Continue to next method
    }

    // Method 2: Fall back to DOM.getBoxModel
    try {
      const boxModel: CDP.DOM.GetBoxModelResponse = await sendCDPCommand(
        this.webContents,
        "DOM.getBoxModel",
        { backendNodeId },
        this.logger
      );

      if (
        boxModel.model &&
        boxModel.model.content &&
        boxModel.model.content.length >= 8
      ) {
        const content = boxModel.model.content;
        const centerX = (content[0] + content[2] + content[4] + content[6]) / 4;
        const centerY = (content[1] + content[3] + content[5] + content[7]) / 4;

        return {
          coordinates: { x: centerX, y: centerY },
          method: "boxModel",
        };
      }
    } catch (_error) {
      // Continue to next method
    }

    // Method 3: Fall back to JavaScript getBoundingClientRect
    try {
      const resolveResult: CDP.DOM.ResolveNodeResponse = await sendCDPCommand(
        this.webContents,
        "DOM.resolveNode",
        { backendNodeId },
        this.logger
      );

      if (resolveResult.object && resolveResult.object.objectId) {
        const boundsResult: CDP.Runtime.CallFunctionOnResponse = await sendCDPCommand(
          this.webContents,
          "Runtime.callFunctionOn",
          {
            functionDeclaration: `
						function() {
							const rect = this.getBoundingClientRect();
							return {
								x: rect.left,
								y: rect.top,
								width: rect.width,
								height: rect.height
							};
						}
					`,
            objectId: resolveResult.object.objectId,
            returnByValue: true,
          },
          this.logger
        );

        if (boundsResult.result && boundsResult.result.value) {
          const rect = boundsResult.result.value;
          const centerX = rect.x + rect.width / 2;
          const centerY = rect.y + rect.height / 2;

          return {
            coordinates: { x: centerX, y: centerY },
            method: "boundingRect",
          };
        }
      }
    } catch (_error) {
      // All methods failed
    }

    throw new Error(
      `Failed to get element coordinates for backendNodeId: ${backendNodeId}`
    );
  }

  /**
   * Convert modifier keys to CDP bitmask
   */
  private getModifierBitmask(modifiers: ModifierType[] | undefined): number {
    if (!modifiers) return 0;

    const modifierMap: Record<ModifierType, number> = {
      Alt: 1,
      Control: 2,
      Meta: 4,
      Shift: 8,
    };

    return modifiers.reduce((bitmask, modifier) => {
      return bitmask | (modifierMap[modifier] || 0);
    }, 0);
  }

  /**
   * Click an element using backendNodeId with multi-fallback coordinate resolution
   */
  async clickElement(
    backendNodeId: number,
    options: ClickOptions = {}
  ): Promise<ClickResult> {
    const startTime = Date.now();

    try {
      this.logger.debug(
        `Clicking element with backendNodeId: ${backendNodeId}`,
        {
          backendNodeId,
          options: options || {},
        }
      );

      const {
        button: mouseButton = "left",
        clickCount = 1,
        modifiers,
      } = options;

      // Get viewport information
      const viewport = await this.getViewportInfo();

      // Get element coordinates using fallback methods
      const { coordinates, method } = await this.getElementCoordinates(
        backendNodeId,
        viewport
      );

      // Ensure coordinates are within viewport bounds
      const clickX = Math.max(0, Math.min(viewport.width - 1, coordinates.x));
      const clickY = Math.max(0, Math.min(viewport.height - 1, coordinates.y));

      // Scroll element into view if needed
      try {
        await sendCDPCommand(
          this.webContents,
          "DOM.scrollIntoViewIfNeeded",
          { backendNodeId },
          this.logger
        );
        await this.sleep(50); // Wait for scroll to complete
      } catch (_error) {
        // Continue even if scroll fails
      }

      // Calculate modifier bitmask
      const modifierValue = this.getModifierBitmask(modifiers);

      // Perform the click using CDP
      try {
        // Move mouse to element
        await sendCDPCommand(
          this.webContents,
          "Input.dispatchMouseEvent",
          {
            type: "mouseMoved",
            x: clickX,
            y: clickY,
          },
          this.logger
        );
        await this.sleep(50);

        // Mouse down with timeout
        await Promise.race([
          sendCDPCommand(
            this.webContents,
            "Input.dispatchMouseEvent",
            {
              type: "mousePressed",
              x: clickX,
              y: clickY,
              button: mouseButton,
              clickCount,
              modifiers: modifierValue,
            },
            this.logger
          ),
          this.sleep(1000), // 1 second timeout for mousePressed
        ]);
        await this.sleep(80);

        // Mouse up with timeout
        await Promise.race([
          sendCDPCommand(
            this.webContents,
            "Input.dispatchMouseEvent",
            {
              type: "mouseReleased",
              x: clickX,
              y: clickY,
              button: mouseButton,
              clickCount,
              modifiers: modifierValue,
            },
            this.logger
          ),
          this.sleep(3000), // 3 second timeout for mouseReleased
        ]);

        return {
          success: true,
          coordinates: { x: clickX, y: clickY },
          method,
          duration: Date.now() - startTime,
        };
      } catch (cdpError) {
        // Fall back to JavaScript click if CDP fails
        try {
          const resolveResult: CDP.DOM.ResolveNodeResponse = await sendCDPCommand(
            this.webContents,
            "DOM.resolveNode",
            { backendNodeId },
            this.logger
          );

          if (resolveResult.object && resolveResult.object.objectId) {
            await sendCDPCommand(
              this.webContents,
              "Runtime.callFunctionOn",
              {
                functionDeclaration: "function() { this.click(); }",
                objectId: resolveResult.object.objectId,
              },
              this.logger
            );
            await this.sleep(100);

            return {
              success: true,
              coordinates: { x: clickX, y: clickY },
              method: "javascript",
              duration: Date.now() - startTime,
            };
          } else {
            // If we can't resolve the node, return failure
            return {
              success: false,
              error: "Failed to resolve DOM node for JavaScript click",
              duration: Date.now() - startTime,
            };
          }
        } catch (jsError) {
          throw new Error(
            `Both CDP and JavaScript click failed. CDP: ${cdpError}, JavaScript: ${jsError}`
          );
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get element bounding box using multiple methods
   */
  async getBoundingBox(backendNodeId: number): Promise<BoundingBox | null> {
    try {
      // Try DOM.getBoxModel first
      const boxModel: CDP.DOM.GetBoxModelResponse = await sendCDPCommand(
        this.webContents,
        "DOM.getBoxModel",
        { backendNodeId },
        this.logger
      );

      if (
        boxModel.model &&
        boxModel.model.content &&
        boxModel.model.content.length >= 8
      ) {
        const content = boxModel.model.content;
        const xs = [content[0], content[2], content[4], content[6]];
        const ys = [content[1], content[3], content[5], content[7]];

        const x = Math.min(...xs);
        const y = Math.min(...ys);
        const width = Math.max(...xs) - x;
        const height = Math.max(...ys) - y;

        return { x, y, width, height };
      }
    } catch (_error) {
      // Fall back to JavaScript
    }

    try {
      const resolveResult: CDP.DOM.ResolveNodeResponse = await sendCDPCommand(
        this.webContents,
        "DOM.resolveNode",
        { backendNodeId },
        this.logger
      );

      if (resolveResult.object && resolveResult.object.objectId) {
        const boundsResult: CDP.Runtime.CallFunctionOnResponse = await sendCDPCommand(
          this.webContents,
          "Runtime.callFunctionOn",
          {
            functionDeclaration: `
						function() {
							const rect = this.getBoundingClientRect();
							return {
								x: rect.left,
								y: rect.top,
								width: rect.width,
								height: rect.height
							};
						}
					`,
            objectId: resolveResult.object.objectId,
            returnByValue: true,
          },
          this.logger
        );

        if (boundsResult.result && boundsResult.result.value) {
          const rect = boundsResult.result.value;
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        }
      }
    } catch (_error) {
      // All methods failed
    }

    return null;
  }
}
