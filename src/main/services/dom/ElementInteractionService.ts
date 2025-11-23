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
  FillOptions,
  FillResult,
  SelectOptionOptions,
  SelectOptionResult,
  OptionElement,
} from "../../../shared/dom/interaction";
import { sendCDPCommand } from "./utils/DOMUtils";
import type { LogFunctions } from "electron-log";

/**
 * Character information for typing operations
 */
interface CharInfo {
  modifiers: number;
  vkCode: number;
  baseKey: string;
  keyCode: string;
}

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
   * Get modifiers, virtual key code, and base key for a character
   * Based on browser-use character mapping logic
   * Returns null for characters that cannot be typed via keyboard simulation
   */
  private getCharInfo(char: string): CharInfo | null {
    // Characters that require Shift modifier
    const shiftChars: Record<string, { baseKey: string; vkCode: number; keyCode: string }> = {
      '!': { baseKey: '1', vkCode: 49, keyCode: 'Digit1' },
      '@': { baseKey: '2', vkCode: 50, keyCode: 'Digit2' },
      '#': { baseKey: '3', vkCode: 51, keyCode: 'Digit3' },
      '$': { baseKey: '4', vkCode: 52, keyCode: 'Digit4' },
      '%': { baseKey: '5', vkCode: 53, keyCode: 'Digit5' },
      '^': { baseKey: '6', vkCode: 54, keyCode: 'Digit6' },
      '&': { baseKey: '7', vkCode: 55, keyCode: 'Digit7' },
      '*': { baseKey: '8', vkCode: 56, keyCode: 'Digit8' },
      '(': { baseKey: '9', vkCode: 57, keyCode: 'Digit9' },
      ')': { baseKey: '0', vkCode: 48, keyCode: 'Digit0' },
      '_': { baseKey: '-', vkCode: 189, keyCode: 'Minus' },
      '+': { baseKey: '=', vkCode: 187, keyCode: 'Equal' },
      '{': { baseKey: '[', vkCode: 219, keyCode: 'BracketLeft' },
      '}': { baseKey: ']', vkCode: 221, keyCode: 'BracketRight' },
      '|': { baseKey: '\\', vkCode: 220, keyCode: 'Backslash' },
      ':': { baseKey: ';', vkCode: 186, keyCode: 'Semicolon' },
      '"': { baseKey: "'", vkCode: 222, keyCode: 'Quote' },
      '<': { baseKey: ',', vkCode: 188, keyCode: 'Comma' },
      '>': { baseKey: '.', vkCode: 190, keyCode: 'Period' },
      '?': { baseKey: '/', vkCode: 191, keyCode: 'Slash' },
      '~': { baseKey: '`', vkCode: 192, keyCode: 'Backquote' },
    };

    // Special characters without Shift
    const noShiftChars: Record<string, { vkCode: number; keyCode: string }> = {
      ' ': { vkCode: 32, keyCode: 'Space' },
      '-': { vkCode: 189, keyCode: 'Minus' },
      '=': { vkCode: 187, keyCode: 'Equal' },
      '[': { vkCode: 219, keyCode: 'BracketLeft' },
      ']': { vkCode: 221, keyCode: 'BracketRight' },
      '\\': { vkCode: 220, keyCode: 'Backslash' },
      ';': { vkCode: 186, keyCode: 'Semicolon' },
      "'": { vkCode: 222, keyCode: 'Quote' },
      ',': { vkCode: 188, keyCode: 'Comma' },
      '.': { vkCode: 190, keyCode: 'Period' },
      '/': { vkCode: 191, keyCode: 'Slash' },
      '`': { vkCode: 192, keyCode: 'Backquote' },
    };

    // Check if character requires Shift
    if (char in shiftChars) {
      const shiftInfo = shiftChars[char];
      return {
        modifiers: 8, // Shift modifier
        vkCode: shiftInfo.vkCode,
        baseKey: shiftInfo.baseKey,
        keyCode: shiftInfo.keyCode,
      };
    }

    // Uppercase letters require Shift
    if (char >= 'A' && char <= 'Z') {
      return {
        modifiers: 8, // Shift modifier
        vkCode: char.charCodeAt(0),
        baseKey: char.toLowerCase(),
        keyCode: `Key${char}`,
      };
    }

    // Lowercase letters
    if (char >= 'a' && char <= 'z') {
      return {
        modifiers: 0,
        vkCode: char.toUpperCase().charCodeAt(0),
        baseKey: char,
        keyCode: `Key${char.toUpperCase()}`,
      };
    }

    // Numbers
    if (char >= '0' && char <= '9') {
      return {
        modifiers: 0,
        vkCode: char.charCodeAt(0),
        baseKey: char,
        keyCode: `Digit${char}`,
      };
    }

    // Special characters without Shift
    if (char in noShiftChars) {
      const noShiftInfo = noShiftChars[char];
      return {
        modifiers: 0,
        vkCode: noShiftInfo.vkCode,
        baseKey: char,
        keyCode: noShiftInfo.keyCode,
      };
    }

    // Return null for unsupported characters (will trigger JavaScript fallback)
    return null;
  }

  /**
   * Focus element using multiple strategies with robust fallbacks
   * Based on browser-use _focus_element_simple implementation
   */
  private async focusElement(
    backendNodeId: number,
    objectId?: string
  ): Promise<boolean> {
    try {
      // Strategy 1: CDP focus (most reliable)
      this.logger.debug('Focusing element using CDP focus');
      await sendCDPCommand(
        this.webContents,
        'DOM.focus',
        { backendNodeId },
        this.logger
      );
      this.logger.debug('Element focused successfully using CDP focus');
      return true;
    } catch (error) {
      this.logger.debug(`CDP focus failed: ${error}, trying JavaScript focus`);
    }

    // Strategy 2: JavaScript focus (fallback)
    if (objectId) {
      try {
        this.logger.debug('Focusing element using JavaScript focus');
        await sendCDPCommand(
          this.webContents,
          'Runtime.callFunctionOn',
          {
            functionDeclaration: 'function() { this.focus(); }',
            objectId,
          },
          this.logger
        );
        this.logger.debug('Element focused successfully using JavaScript');
        return true;
      } catch (error) {
        this.logger.debug(`JavaScript focus failed: ${error}, trying click focus`);
      }
    }

    // Strategy 3: Click to focus (last resort)
    try {
      this.logger.debug('Focusing element by clicking at element center');

      // Get element coordinates for click
      const viewport = await this.getViewportInfo();
      const { coordinates } = await this.getElementCoordinates(backendNodeId, viewport);

      // Click on the element to focus it
      await sendCDPCommand(
        this.webContents,
        'Input.dispatchMouseEvent',
        {
          type: 'mousePressed',
          x: coordinates.x,
          y: coordinates.y,
          button: 'left',
          clickCount: 1,
        },
        this.logger
      );

      await this.sleep(50);

      await sendCDPCommand(
        this.webContents,
        'Input.dispatchMouseEvent',
        {
          type: 'mouseReleased',
          x: coordinates.x,
          y: coordinates.y,
          button: 'left',
          clickCount: 1,
        },
        this.logger
      );

      this.logger.debug('Element focused using click');
      return true;
    } catch (error) {
      this.logger.warn(`All focus strategies failed: ${error}`);
      return false;
    }
  }

  /**
   * Clear text field using multiple strategies, starting with the most reliable
   * Based on browser-use _clear_text_field implementation
   */
  private async clearTextField(objectId: string): Promise<boolean> {
    try {
      // Strategy 1: Direct JavaScript value setting (most reliable for modern web apps)
      this.logger.debug('Clearing text field using JavaScript value setting');

      const clearResult: CDP.Runtime.CallFunctionOnResponse = await sendCDPCommand(
        this.webContents,
        'Runtime.callFunctionOn',
        {
          functionDeclaration: `
            function() {
              // Try to select all text first (only works on text-like inputs)
              // This handles cases where cursor is in the middle of text
              try {
                this.select();
              } catch (e) {
                // Some input types (date, color, number, etc.) don't support select()
                // That's fine, we'll just clear the value directly
              }
              // Set value to empty
              this.value = "";
              // Dispatch events to notify frameworks like React
              this.dispatchEvent(new Event("input", { bubbles: true }));
              this.dispatchEvent(new Event("change", { bubbles: true }));
              return this.value;
            }
          `,
          objectId,
          returnByValue: true,
        },
        this.logger
      );

      // Verify clearing worked by checking the value
      if (clearResult.result && clearResult.result.value === '') {
        this.logger.debug('Text field cleared successfully using JavaScript');
        return true;
      } else {
        const currentValue = clearResult.result?.value || '';
        this.logger.debug(`JavaScript clear partially failed, field still contains: "${currentValue}"`);
      }
    } catch (error) {
      this.logger.debug(`JavaScript clear failed: ${error}`);
    }

    // Strategy 2: Triple-click + Delete (fallback for stubborn fields)
    try {
      this.logger.debug('Fallback: Clearing using triple-click + Delete');

      // Get element coordinates for triple-click
      const boundsResult: CDP.Runtime.CallFunctionOnResponse = await sendCDPCommand(
        this.webContents,
        'Runtime.callFunctionOn',
        {
          functionDeclaration: 'function() { return this.getBoundingClientRect(); }',
          objectId,
          returnByValue: true,
        },
        this.logger
      );

      if (boundsResult.result && boundsResult.result.value) {
        const rect = boundsResult.result.value;
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;

        // Triple-click to select all text
        await sendCDPCommand(
          this.webContents,
          'Input.dispatchMouseEvent',
          {
            type: 'mousePressed',
            x: centerX,
            y: centerY,
            button: 'left',
            clickCount: 3,
          },
          this.logger
        );

        await sendCDPCommand(
          this.webContents,
          'Input.dispatchMouseEvent',
          {
            type: 'mouseReleased',
            x: centerX,
            y: centerY,
            button: 'left',
            clickCount: 3,
          },
          this.logger
        );

        // Delete selected text
        await sendCDPCommand(
          this.webContents,
          'Input.dispatchKeyEvent',
          {
            type: 'keyDown',
            key: 'Delete',
            code: 'Delete',
          },
          this.logger
        );

        await sendCDPCommand(
          this.webContents,
          'Input.dispatchKeyEvent',
          {
            type: 'keyUp',
            key: 'Delete',
            code: 'Delete',
          },
          this.logger
        );

        this.logger.debug('Text field cleared using triple-click + Delete');
        return true;
      }
    } catch (error) {
      this.logger.debug(`Triple-click clear failed: ${error}`);
    }

    // If all strategies failed
    this.logger.warn('All text clearing strategies failed');
    return false;
  }

  /**
   * Type text character by character using proper human-like key events
   * Based on browser-use character typing implementation
   */
  private async typeCharacterByCharacter(
    text: string,
    keystrokeDelay: number = 18
  ): Promise<void> {
    this.logger.debug(`Typing text character by character: "${text}"`);

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Handle newline characters as Enter key
      if (char === '\n') {
        // Send proper Enter key sequence
        await sendCDPCommand(
          this.webContents,
          'Input.dispatchKeyEvent',
          {
            type: 'keyDown',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
          },
          this.logger
        );

        // Small delay to emulate human typing speed
        await this.sleep(1);

        // Send char event with carriage return
        await sendCDPCommand(
          this.webContents,
          'Input.dispatchKeyEvent',
          {
            type: 'char',
            text: '\r',
            key: 'Enter',
          },
          this.logger
        );

        // Send keyUp event
        await sendCDPCommand(
          this.webContents,
          'Input.dispatchKeyEvent',
          {
            type: 'keyUp',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
          },
          this.logger
        );
      } else {
        // Handle regular characters
        const charInfo = this.getCharInfo(char);

        // Check if character can be typed via keyboard simulation
        if (charInfo === null) {
          throw new Error(`Character '${char}' cannot be typed via keyboard simulation, requires JavaScript fallback`);
        }

        // Step 1: Send keyDown event (NO text parameter)
        await sendCDPCommand(
          this.webContents,
          'Input.dispatchKeyEvent',
          {
            type: 'keyDown',
            key: charInfo.baseKey,
            code: charInfo.keyCode,
            modifiers: charInfo.modifiers,
            windowsVirtualKeyCode: charInfo.vkCode,
          },
          this.logger
        );

        // Small delay to emulate human typing speed
        await this.sleep(1);

        // Step 2: Send char event (WITH text parameter) - this is crucial for text input
        await sendCDPCommand(
          this.webContents,
          'Input.dispatchKeyEvent',
          {
            type: 'char',
            text: char,
            key: char,
          },
          this.logger
        );

        // Step 3: Send keyUp event (NO text parameter)
        await sendCDPCommand(
          this.webContents,
          'Input.dispatchKeyEvent',
          {
            type: 'keyUp',
            key: charInfo.baseKey,
            code: charInfo.keyCode,
            modifiers: charInfo.modifiers,
            windowsVirtualKeyCode: charInfo.vkCode,
          },
          this.logger
        );
      }

      // Add delay between keystrokes (default 18ms from browser-use)
      await this.sleep(keystrokeDelay);
    }
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
   * Fill an input element with text using proper CDP methods with improved focus handling
   * Based on browser-use fill implementation
   */
  async fillElement(
    backendNodeId: number,
    options: FillOptions
  ): Promise<FillResult> {
    const startTime = Date.now();
    const {
      value,
      clear: shouldClear = true,
      keystrokeDelay = 18,
    } = options;

    try {
      this.logger.debug(
        `Filling element with backendNodeId: ${backendNodeId}`,
        {
          backendNodeId,
          value,
          shouldClear,
          keystrokeDelay,
        }
      );

      // Step 1: Scroll element into view
      try {
        await sendCDPCommand(
          this.webContents,
          'DOM.scrollIntoViewIfNeeded',
          { backendNodeId },
          this.logger
        );
        await this.sleep(10);
      } catch (error) {
        this.logger.warn(`Failed to scroll element into view: ${error}`);
      }

      // Step 2: Get object ID for the element
      const resolveResult: CDP.DOM.ResolveNodeResponse = await sendCDPCommand(
        this.webContents,
        'DOM.resolveNode',
        { backendNodeId },
        this.logger
      );

      if (!resolveResult.object || !resolveResult.object.objectId) {
        throw new Error('Failed to get object ID for element');
      }

      const objectId = resolveResult.object.objectId;

      // Step 3: Focus the element
      const focusedSuccessfully = await this.focusElement(backendNodeId, objectId);
      if (!focusedSuccessfully) {
        this.logger.warn('Element focus failed, typing may not work correctly');
      }

      // Step 4: Clear existing text if requested
      if (shouldClear) {
        const clearedSuccessfully = await this.clearTextField(objectId);
        if (!clearedSuccessfully) {
          this.logger.warn('Text field clearing failed, typing may append to existing text');
        }
      }

      // Step 5: Type the text character by character using proper human-like key events
      await this.typeCharacterByCharacter(value, keystrokeDelay);

      return {
        success: true,
        charactersTyped: value.length,
        method: 'cdp',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      // Fall back to JavaScript value setting if CDP typing fails
      try {
        this.logger.debug(`CDP typing failed: ${error}, trying JavaScript fallback`);

        const resolveResult: CDP.DOM.ResolveNodeResponse = await sendCDPCommand(
          this.webContents,
          'DOM.resolveNode',
          { backendNodeId },
          this.logger
        );

        if (resolveResult.object && resolveResult.object.objectId) {
          await sendCDPCommand(
            this.webContents,
            'Runtime.callFunctionOn',
            {
              functionDeclaration: `
                function(text) {
                  // Set value directly
                  this.value = text;
                  // Dispatch events to notify frameworks
                  this.dispatchEvent(new Event("input", { bubbles: true }));
                  this.dispatchEvent(new Event("change", { bubbles: true }));
                  return this.value;
                }
              `,
              objectId: resolveResult.object.objectId,
              arguments: [{ value }],
              returnByValue: true,
            },
            this.logger
          );

          return {
            success: true,
            charactersTyped: value.length,
            method: 'javascript',
            duration: Date.now() - startTime,
          };
        } else {
          throw new Error('Failed to resolve DOM node for JavaScript fill');
        }
      } catch (jsError) {
        return {
          success: false,
          error: `Both CDP and JavaScript fill failed. CDP: ${error}, JavaScript: ${jsError}`,
          duration: Date.now() - startTime,
        };
      }
    }
  }

  /**
   * Select option(s) in a select element
   * Based on browser-use select_option implementation
   */
  async selectOption(
    backendNodeId: number,
    options: SelectOptionOptions
  ): Promise<SelectOptionResult> {
    const startTime = Date.now();
    const {
      values,
      clear: shouldClear = true,
      timeout = 5000,
    } = options;

    try {
      this.logger.debug(
        `Selecting options for element with backendNodeId: ${backendNodeId}`,
        {
          backendNodeId,
          values,
          shouldClear,
          timeout,
        }
      );

      // Normalize values to array format
      const valuesToSelect = Array.isArray(values) ? values : [values];

      // Step 1: Scroll element into view and focus
      await sendCDPCommand(
        this.webContents,
        'DOM.scrollIntoViewIfNeeded',
        { backendNodeId },
        this.logger
      );
      await this.sleep(10);

      // Focus the select element
      const focusedSuccessfully = await this.focusElement(backendNodeId);
      if (!focusedSuccessfully) {
        this.logger.warn('Element focus failed, selection may not work correctly');
      }

      // Step 2: Get all options from the select element
      const availableOptions = await this.getOptionsFromSelectElement(backendNodeId);
      if (!availableOptions.length) {
        throw new Error('No options found in select element');
      }

      // Step 3: Check if it's a multi-select element
      const isMultiSelect = await this.checkIfMultiSelect(backendNodeId);

      // For single-select, only select the first matching option
      const targetValues = isMultiSelect ? valuesToSelect : [valuesToSelect[0]];

      // Step 4: Find matching options
      const matchingOptions = availableOptions.filter(option =>
        this.matchesOption(option, targetValues) && !option.disabled
      );

      if (!matchingOptions.length) {
        throw new Error(`No matching options found for values: ${targetValues.join(', ')}`);
      }

      // Step 5: Select the matching options
      const selectedOptions: string[] = [];
      let selectionMethod: 'cdp' | 'javascript' = 'cdp';

      for (const option of matchingOptions) {
        try {
          // Use existing clickElement method to select the option
          const clickResult = await this.clickElement(option.backendNodeId);
          if (clickResult.success) {
            selectedOptions.push(option.value);
            this.logger.debug(`Successfully selected option: ${option.value}`);
          } else {
            throw new Error(clickResult.error || 'Click failed');
          }
        } catch (clickError) {
          this.logger.debug(`CDP click failed for option ${option.value}: ${clickError}, trying JavaScript`);

          // Fallback to JavaScript selection
          try {
            const jsSuccess = await this.selectOptionByJavaScript(option.backendNodeId);
            if (jsSuccess) {
              selectedOptions.push(option.value);
              selectionMethod = 'javascript';
              this.logger.debug(`Successfully selected option using JavaScript: ${option.value}`);
            } else {
              throw new Error('JavaScript selection failed');
            }
          } catch (jsError) {
            this.logger.warn(`Failed to select option ${option.value}: CDP=${clickError}, JS=${jsError}`);
          }
        }

        // Add small delay between selections
        await this.sleep(50);
      }

      // Step 6: Verify selection
      await this.sleep(100);

      return {
        success: selectedOptions.length > 0,
        optionsSelected: selectedOptions.length,
        matchedValues: selectedOptions,
        method: selectionMethod,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get all option elements from a select element
   */
  private async getOptionsFromSelectElement(backendNodeId: number): Promise<OptionElement[]> {
    const options: OptionElement[] = [];

    try {
      // Get node ID from backend node ID
      const resolveResult: CDP.DOM.ResolveNodeResponse = await sendCDPCommand(
        this.webContents,
        'DOM.resolveNode',
        { backendNodeId },
        this.logger
      );

      if (!resolveResult.object || !resolveResult.object.objectId) {
        throw new Error('Failed to resolve select element');
      }

      // Request child nodes to get options
      const nodeId = await this.getNodeIdFromBackendNodeId(backendNodeId);
      await sendCDPCommand(
        this.webContents,
        'DOM.requestChildNodes',
        { nodeId, depth: 1 },
        this.logger
      );

      // Get the updated node description with children
      const describeResult: CDP.DOM.DescribeNodeResponse = await sendCDPCommand(
        this.webContents,
        'DOM.describeNode',
        { nodeId, depth: 1 },
        this.logger
      );

      const selectNode = describeResult.node;

      // Find and process option elements
      for (const child of selectNode.children || []) {
        if (child.nodeName?.toLowerCase() === 'option') {
          const optionBackendId = child.backendNodeId;
          if (!optionBackendId) continue;

          // Get option attributes
          const attrs = child.attributes || [];
          const optionAttrs: Record<string, string> = {};

          for (let i = 0; i < attrs.length; i += 2) {
            if (i + 1 < attrs.length) {
              optionAttrs[attrs[i]] = attrs[i + 1];
            }
          }

          // Extract option information
          const option: OptionElement = {
            backendNodeId: optionBackendId,
            value: optionAttrs.value || '',
            text: child.nodeValue || '',
            selected: optionAttrs.selected === 'selected' || optionAttrs.selected === '',
            disabled: optionAttrs.disabled === 'disabled' || optionAttrs.disabled === '',
          };

          options.push(option);
        }
      }

      this.logger.debug(`Found ${options.length} options in select element`);
      return options;
    } catch (error) {
      this.logger.debug(`Failed to get options from select element: ${error}`);
      return [];
    }
  }

  /**
   * Check if a select element supports multiple selection
   */
  private async checkIfMultiSelect(backendNodeId: number): Promise<boolean> {
    try {
      const resolveResult: CDP.DOM.ResolveNodeResponse = await sendCDPCommand(
        this.webContents,
        'DOM.resolveNode',
        { backendNodeId },
        this.logger
      );

      if (!resolveResult.object || !resolveResult.object.objectId) {
        return false;
      }

      const attributesResult: CDP.Runtime.CallFunctionOnResponse = await sendCDPCommand(
        this.webContents,
        'Runtime.callFunctionOn',
        {
          functionDeclaration: 'function() { return this.multiple; }',
          objectId: resolveResult.object.objectId,
          returnByValue: true,
        },
        this.logger
      );

      return !!(attributesResult.result?.value);
    } catch (error) {
      this.logger.debug(`Failed to check if multi-select: ${error}`);
      return false;
    }
  }

  /**
   * Check if an option matches any of the target values
   */
  private matchesOption(option: OptionElement, targetValues: string[]): boolean {
    return targetValues.some(value =>
      option.value === value ||
      option.text === value ||
      option.text.toLowerCase().includes(value.toLowerCase()) ||
      value.toLowerCase().includes(option.text.toLowerCase())
    );
  }

  /**
   * Select an option using JavaScript
   */
  private async selectOptionByJavaScript(backendNodeId: number): Promise<boolean> {
    try {
      const resolveResult: CDP.DOM.ResolveNodeResponse = await sendCDPCommand(
        this.webContents,
        'DOM.resolveNode',
        { backendNodeId },
        this.logger
      );

      if (!resolveResult.object || !resolveResult.object.objectId) {
        return false;
      }

      await sendCDPCommand(
        this.webContents,
        'Runtime.callFunctionOn',
        {
          functionDeclaration: `
            function() {
              this.selected = true;
              // Dispatch events to notify frameworks
              this.dispatchEvent(new Event('input', { bubbles: true }));
              this.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          `,
          objectId: resolveResult.object.objectId,
          returnByValue: true,
        },
        this.logger
      );

      return true;
    } catch (error) {
      this.logger.debug(`JavaScript option selection failed: ${error}`);
      return false;
    }
  }

  /**
   * Get node ID from backend node ID
   */
  private async getNodeIdFromBackendNodeId(backendNodeId: number): Promise<number> {
    const pushResult: CDP.DOM.PushNodesByBackendIdsToFrontendResponse = await sendCDPCommand(
      this.webContents,
      'DOM.pushNodesByBackendIdsToFrontend',
      { backendNodeIds: [backendNodeId] },
      this.logger
    );

    if (!pushResult.nodeIds || !pushResult.nodeIds.length) {
      throw new Error('Failed to get node ID from backend node ID');
    }

    return pushResult.nodeIds[0];
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
