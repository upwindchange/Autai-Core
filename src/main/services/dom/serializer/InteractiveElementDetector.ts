/**
 * Interactive Element Detector - Dedicated class for detecting and highlighting interactive DOM elements
 *
 * Extracted from DOMTreeSerializer to provide better separation of concerns and testability.
 * Ports existing detection logic with placeholders for missing browser-use features.
 * Includes highlighting functionality using CDP commands.
 */

import type { EnhancedDOMTreeNode } from "@shared/dom";
import { NodeType } from "@shared/dom";
import type { WebContents } from "electron";
import log from "electron-log/main";
import { sendCDPCommand, isElementVisible } from "../utils/DOMUtils";

// Enhanced interactive element tags (ported from DOMTreeSerializer)
const INTERACTIVE_TAGS = [
  "button",
  "input",
  "select",
  "textarea",
  "a",
  "option",
  "label",
  "iframe",
  "frame",
  "details",
  "summary",
  "optgroup",
];

// Enhanced event handlers for interactive detection (ported from DOMTreeSerializer)
const EVENT_HANDLERS = [
  "onclick",
  "onmousedown",
  "onmouseup",
  "onkeydown",
  "onkeyup",
  "onkeypress",
  "onfocus",
  "onblur",
  "onchange",
  "onsubmit",
  "onreset",
  "onselect",
  "tabindex",
];

// Accessibility property categories for comprehensive analysis (ported from DOMTreeSerializer)
const DIRECT_INTERACTIVITY = ["focusable", "editable", "settable"];
const INTERACTIVE_STATES = ["checked", "expanded", "pressed", "selected"];
const FORM_PROPERTIES = ["required", "autocomplete", "keyshortcuts"];
const BLOCKER_PROPERTIES = ["disabled", "hidden"];

// Enhanced search element indicators for comprehensive search detection
const SEARCH_INDICATORS = [
  "search",
  "magnify",
  "glass",
  "lookup",
  "find",
  "query",
  "search-icon",
  "search-btn",
  "search-button",
  "searchbox",
  "filter",
  "filter-icon",
  "filter-btn",
  "find-button",
  "lookup-box",
  "query-input",
  "typeahead",
  "autocomplete",
  "suggest",
  "suggestion",
  "lookup-field",
  "search-field",
  "search-input",
  "search-form",
  "search-bar",
  "search-area",
];

// Size thresholds for element detection
const SIZE_THRESHOLDS = {
  MIN_ICON_SIZE: 10, // Minimum size for icon detection (px)
  MAX_ICON_SIZE: 50, // Maximum size for icon detection (px)
  MIN_IFRAME_WIDTH: 100, // Minimum iframe width for interactivity (px)
  MIN_IFRAME_HEIGHT: 100, // Minimum iframe height for interactivity (px)
  OPACITY_THRESHOLD: 0.8, // Minimum opacity for interactive elements
} as const;

// Icon detection attributes
const ICON_ATTRIBUTES = [
  "class",
  "role",
  "onclick",
  "data-action",
  "aria-label",
  "title",
  "data-icon",
  "data-testid",
  "data-cy",
  "data-qa",
  "id",
];

// Icon class patterns
const ICON_CLASS_PATTERNS = [
  "icon",
  "btn",
  "button",
  "click",
  "action",
  "trigger",
  "svg",
  "img",
  "glyph",
  "symbol",
  "logo",
  "brand",
];

/**
 * Interactive Element Detector Class
 *
 * Provides comprehensive detection of interactive DOM elements using a tiered approach.
 * Matches browser-use detection patterns with existing Autai-Core functionality.
 * Includes highlighting capabilities using CDP commands.
 */
export class InteractiveElementDetector {
  private webContents: WebContents;
  private logger = log.scope("InteractiveElementDetector");
  private devicePixelRatio: number = 1; // Default ratio, will be updated dynamically

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    this.logger.info(
      "InteractiveElementDetector initialized with highlighting support"
    );
    this.initializeDevicePixelRatio();
  }

  /**
   * Initialize device pixel ratio for accurate size calculations
   */
  private async initializeDevicePixelRatio(): Promise<void> {
    try {
      const result = (await sendCDPCommand(
        this.webContents,
        "Runtime.evaluate",
        {
          expression: "window.devicePixelRatio || 1",
        },
        this.logger
      )) as { result: { value: number } };
      this.devicePixelRatio = result.result.value || 1;
      this.logger.info(
        `Device pixel ratio initialized: ${this.devicePixelRatio}`
      );
    } catch (error) {
      this.logger.warn(
        "Failed to get device pixel ratio, using default value of 1:",
        error
      );
      this.devicePixelRatio = 1;
    }
  }

  /**
   * Convert device pixels to CSS pixels for accurate sizing
   */
  private deviceToCSSPixels(devicePixels: number): number {
    return devicePixels / this.devicePixelRatio;
  }

  /**
   * Get element size in CSS pixels
   */
  private getElementSize(
    node: EnhancedDOMTreeNode
  ): { width: number; height: number } | null {
    if (!node.snapshotNode?.boundingBox) {
      return null;
    }

    const { width, height } = node.snapshotNode.boundingBox;
    return {
      width: this.deviceToCSSPixels(width),
      height: this.deviceToCSSPixels(height),
    };
  }

  /**
   * Main detection method with on-the-fly highlighting
   *
   * @param node The DOM node to check for interactivity
   * @returns boolean indicating if the element is interactive
   */
  async isInteractive(node: EnhancedDOMTreeNode): Promise<boolean> {
    return this.getDetectionTier(node);
  }

  /**
   * Check if element passes basic visual filtering (opacity, visibility)
   */
  private passesVisualFilter(node: EnhancedDOMTreeNode): boolean {
    // Use the existing utility function for visibility checking
    if (!isElementVisible(node.snapshotNode?.computedStyles || null)) {
      this.logger.debug(
        `Element ${node.nodeId} filtered out by visibility check`
      );
      return false;
    }

    // Additional opacity threshold check
    if (node.snapshotNode?.computedStyles?.opacity) {
      const opacity = parseFloat(node.snapshotNode.computedStyles.opacity);
      if (opacity < SIZE_THRESHOLDS.OPACITY_THRESHOLD) {
        this.logger.debug(
          `Element ${node.nodeId} filtered out by opacity threshold: ${opacity}`
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Enhanced detection method with on-the-fly highlighting
   *
   * @param node The DOM node to check for interactivity
   * @returns boolean indicating if the element is interactive
   */
  async getDetectionTier(node: EnhancedDOMTreeNode): Promise<boolean> {
    try {
      // Basic validation
      if (!node) {
        this.logger.warn("Node is null or undefined");
        return false;
      }

      // Visual filtering
      if (!this.passesVisualFilter(node)) return false;

      // Tier 1: Quick filters
      if (!this.checkNodeType(node)) return false;
      if (this.checkSkippedElements(node)) return false;
      if (this.checkIframeSize(node)) {
        await this.highlightElement(node, "tier1");
        return true; // Special case for iframes
      }

      // Tier 2: Search detection
      if (this.checkSearchElements(node)) {
        await this.highlightElement(node, "tier2");
        return true;
      }
      if (this.checkSpecializedTags(node)) {
        await this.highlightElement(node, "tier2");
        return true;
      }

      // Tier 3: Attribute-based detection
      if (this.checkEventHandlers(node)) {
        await this.highlightElement(node, "tier3");
        return true;
      }
      if (this.checkARIAAttributes(node)) {
        await this.highlightElement(node, "tier3");
        return true;
      }
      if (this.checkInputAttributes(node)) {
        await this.highlightElement(node, "tier3");
        return true;
      }

      // Tier 4: Accessibility tree analysis
      if (this.checkAccessibilityProperties(node)) {
        await this.highlightElement(node, "tier4");
        return true;
      }
      if (this.checkAccessibilityRoles(node)) {
        await this.highlightElement(node, "tier4");
        return true;
      }

      // Tier 5: Visual/structural indicators
      if (this.checkIconElements(node)) {
        await this.highlightElement(node, "tier5");
        return true;
      }
      if (this.checkCursorStyle(node)) {
        await this.highlightElement(node, "tier5");
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(
        `Error in getDetectionTier for node ${node.nodeId}:`,
        error
      );
      return false;
    }
  }

  // Tier 1: Quick Filters

  /**
   * Check if node is an element node
   * Only ELEMENT_NODE (nodeType: 1) can be interactive
   */
  private checkNodeType(node: EnhancedDOMTreeNode): boolean {
    return node.nodeType === NodeType.ELEMENT_NODE;
  }

  /**
   * Check if element should be skipped
   * HTML and BODY elements are not interactive by themselves
   */
  private checkSkippedElements(node: EnhancedDOMTreeNode): boolean {
    if (!node.tag) return false;
    const tag = node.tag.toLowerCase();
    return tag === "html" || tag === "body";
  }

  /**
   * Check iframe size requirements
   * Only iframes larger than 100x100px are considered interactive
   */
  private checkIframeSize(node: EnhancedDOMTreeNode): boolean {
    if (node.tag?.toLowerCase() !== "iframe") {
      return false;
    }

    const size = this.getElementSize(node);
    if (!size) {
      this.logger.warn(`Could not get size for iframe ${node.nodeId}`);
      return false;
    }

    const isLargeEnough =
      size.width >= SIZE_THRESHOLDS.MIN_IFRAME_WIDTH &&
      size.height >= SIZE_THRESHOLDS.MIN_IFRAME_HEIGHT;

    if (isLargeEnough) {
      this.logger.debug(
        `Iframe ${node.nodeId} passed size check: ${size.width}x${size.height}px`
      );
    }

    return isLargeEnough;
  }

  // Tier 2: Search Element Detection

  /**
   * Check for search-related elements
   * Detects search indicators in class names, IDs, and data attributes
   */
  private checkSearchElements(node: EnhancedDOMTreeNode): boolean {
    if (!node.attributes) return false;

    // Check class name for search indicators
    if (node.attributes.class) {
      const className = node.attributes.class.toLowerCase();
      for (const indicator of SEARCH_INDICATORS) {
        if (className.includes(indicator)) {
          return true;
        }
      }
    }

    // Check ID for search indicators
    if (node.attributes.id) {
      const id = node.attributes.id.toLowerCase();
      for (const indicator of SEARCH_INDICATORS) {
        if (id.includes(indicator)) {
          return true;
        }
      }
    }

    // Check data attributes for search indicators
    for (const [attrName, attrValue] of Object.entries(node.attributes)) {
      if (attrName.startsWith("data-") && attrValue) {
        const value = attrValue.toLowerCase();
        for (const indicator of SEARCH_INDICATORS) {
          if (value.includes(indicator)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check for specialized interactive tags (ported from existing logic)
   */
  private checkSpecializedTags(node: EnhancedDOMTreeNode): boolean {
    if (!node.tag) return false;
    const tag = node.tag.toLowerCase();
    return INTERACTIVE_TAGS.includes(tag);
  }

  // Tier 3: Attribute-based Detection

  /**
   * Check for event handlers with enhanced detection
   */
  private checkEventHandlers(node: EnhancedDOMTreeNode): boolean {
    if (!node.attributes) return false;

    for (const handler of EVENT_HANDLERS) {
      if (handler === "tabindex") {
        // Special handling for tabindex - any tabindex (even 0) makes element focusable
        if (
          node.attributes[handler] !== undefined &&
          node.attributes[handler] !== null
        ) {
          return true;
        }
      } else if (
        handler === "onclick" ||
        handler === "onmousedown" ||
        handler === "onmouseup"
      ) {
        // Most reliable interactive indicators - check if they exist and are not empty
        const value = node.attributes[handler];
        if (
          value &&
          value !== "" &&
          value !== "null" &&
          value !== "undefined"
        ) {
          return true;
        }
      } else {
        // For other event handlers, check if they exist
        if (node.attributes[handler]) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check for ARIA roles (ported from existing logic)
   */
  private checkARIAAttributes(node: EnhancedDOMTreeNode): boolean {
    if (!node.attributes?.role) return false;
    const role = node.attributes.role.toLowerCase();

    const interactiveRoles = [
      "button",
      "link",
      "menuitem",
      "option",
      "radio",
      "checkbox",
      "tab",
      "textbox",
      "combobox",
      "slider",
      "spinbutton",
      "search",
      "searchbox",
    ];

    return interactiveRoles.includes(role);
  }

  /**
   * Check for input-like attributes (ported from existing logic)
   */
  private checkInputAttributes(node: EnhancedDOMTreeNode): boolean {
    return node.attributes?.contenteditable === "true";
  }

  // Tier 4: Accessibility Tree Analysis

  /**
   * Check comprehensive accessibility properties (ported from existing logic)
   */
  private checkAccessibilityProperties(node: EnhancedDOMTreeNode): boolean {
    if (!node.axNode?.properties) return false;

    for (const prop of node.axNode.properties) {
      const propName = prop.name.toLowerCase();

      // Check for blocker properties first (return false if true)
      if (
        BLOCKER_PROPERTIES.includes(propName) &&
        prop.value?.type === "boolean" &&
        prop.value.value === true
      ) {
        return false;
      }

      // Check for direct interactivity properties (return true if true)
      if (
        DIRECT_INTERACTIVITY.includes(propName) &&
        prop.value?.type === "boolean" &&
        prop.value.value === true
      ) {
        return true;
      }

      // Check for interactive state properties (return true if true)
      if (
        INTERACTIVE_STATES.includes(propName) &&
        prop.value?.type === "boolean" &&
        prop.value.value === true
      ) {
        return true;
      }

      // Check for form properties (return true if present)
      if (
        FORM_PROPERTIES.includes(propName) &&
        prop.value?.value !== undefined
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check accessibility tree roles
   * Detects interactive elements based on their accessibility roles
   */
  private checkAccessibilityRoles(node: EnhancedDOMTreeNode): boolean {
    if (!node.axNode?.role?.value) return false;

    const role = node.axNode.role.value.toString().toLowerCase();

    // Comprehensive list of interactive accessibility roles
    const interactiveRoles = [
      "button",
      "link",
      "menuitem",
      "option",
      "radio",
      "checkbox",
      "tab",
      "textbox",
      "combobox",
      "slider",
      "spinbutton",
      "search",
      "searchbox",
      "gridcell",
      "rowheader",
      "columnheader",
      "treeitem",
      "switch",
      "menubar",
      "menu",
      "listbox",
      "tree",
      "grid",
      "application",
      "group",
      "radiogroup",
      "list",
      "row",
      "table",
      "tooltip",
      "dialog",
      "alertdialog",
      "document",
      "article",
      "feed",
      "figure",
      "img",
      "banner",
      "complementary",
      "contentinfo",
      "form",
      "main",
      "navigation",
      "region",
      "status",
      "timer",
    ];

    return interactiveRoles.includes(role);
  }

  // Tier 5: Visual/Structural Indicators

  /**
   * Check for icon-sized interactive elements
   * Detects 10-50px elements that might be icons with interactive attributes
   */
  private checkIconElements(node: EnhancedDOMTreeNode): boolean {
    // First check if element size is within icon range
    const size = this.getElementSize(node);
    if (!size) {
      return false;
    }

    const isIconSize =
      size.width >= SIZE_THRESHOLDS.MIN_ICON_SIZE &&
      size.width <= SIZE_THRESHOLDS.MAX_ICON_SIZE &&
      size.height >= SIZE_THRESHOLDS.MIN_ICON_SIZE &&
      size.height <= SIZE_THRESHOLDS.MAX_ICON_SIZE;

    if (!isIconSize) {
      return false;
    }

    // Check if element has interactive attributes
    return this.hasIconInteractiveAttributes(node);
  }

  /**
   * Check if an icon-sized element has interactive attributes
   */
  private hasIconInteractiveAttributes(node: EnhancedDOMTreeNode): boolean {
    if (!node.attributes) {
      return false;
    }

    // Check for event handlers
    for (const handler of EVENT_HANDLERS) {
      if (node.attributes[handler]) {
        return true;
      }
    }

    // Check for interactive ARIA roles
    const role = node.attributes.role?.toLowerCase();
    if (role && ["button", "link", "menuitem", "option"].includes(role)) {
      return true;
    }

    // Check for tabindex
    if (
      node.attributes.tabindex !== undefined &&
      node.attributes.tabindex !== null
    ) {
      return true;
    }

    // Check for icon-specific attributes and patterns
    return this.hasIconAttributesOrClasses(node);
  }

  /**
   * Check for icon-specific attributes and class patterns
   */
  private hasIconAttributesOrClasses(node: EnhancedDOMTreeNode): boolean {
    if (!node.attributes) {
      return false;
    }

    // Check for icon attributes
    for (const attr of ICON_ATTRIBUTES) {
      const value = node.attributes[attr];
      if (value && typeof value === "string") {
        const lowerValue = value.toLowerCase();

        // Check for interactive keywords in attributes
        const interactiveKeywords = [
          "click",
          "action",
          "button",
          "btn",
          "trigger",
          "toggle",
          "close",
          "open",
          "menu",
          "search",
          "filter",
          "play",
          "pause",
          "stop",
          "next",
          "prev",
          "back",
          "forward",
          "up",
          "down",
        ];

        for (const keyword of interactiveKeywords) {
          if (lowerValue.includes(keyword)) {
            return true;
          }
        }
      }
    }

    // Special check for class name patterns
    if (node.attributes.class) {
      const className = node.attributes.class.toLowerCase();
      for (const pattern of ICON_CLASS_PATTERNS) {
        if (className.includes(pattern)) {
          // Also ensure it has some interactive indication
          return this.hasInteractiveIndication(node);
        }
      }
    }

    return false;
  }

  /**
   * Check if element has basic interactive indications
   */
  private hasInteractiveIndication(node: EnhancedDOMTreeNode): boolean {
    if (!node.attributes) {
      return false;
    }

    // Check for any event handler
    for (const handler of EVENT_HANDLERS) {
      if (node.attributes[handler]) {
        return true;
      }
    }

    // Check for cursor pointer style
    if (node.snapshotNode?.cursorStyle === "pointer") {
      return true;
    }

    // Check for ARIA attributes that suggest interactivity
    const ariaProps = [
      "aria-label",
      "aria-role",
      "aria-pressed",
      "aria-expanded",
    ];
    for (const prop of ariaProps) {
      if (node.attributes[prop]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check cursor style indicators
   * Uses cursor style as final fallback for detecting interactive elements
   */
  private checkCursorStyle(node: EnhancedDOMTreeNode): boolean {
    // Check if the element has pointer cursor style
    return node.snapshotNode?.cursorStyle === "pointer";
  }

  /**
   * Highlight a single element using non-blocking overlay system
   */
  private async highlightElement(
    node: EnhancedDOMTreeNode,
    detectionTier: string
  ): Promise<void> {
    if (!node.nodeId) return;

    // Color scheme for different detection tiers
    const tierColors: Record<string, string> = {
      tier1: "#FF6B6B", // Red - Basic node type filtering
      tier2: "#45B7D1", // Blue - Specialized tag detection
      tier3: "#96CEB4", // Green - Event handler detection
      tier4: "#DDA0DD", // Purple - Accessibility property analysis
      tier5: "#FF8C42", // Orange - Size-based filtering
      default: "#FF6B6B", // Default red for unknown tiers
    };

    const color = tierColors[detectionTier] || tierColors.default;

    try {
      // Enable DOM agent if not already enabled
      await sendCDPCommand(
        this.webContents,
        "DOM.enable",
        undefined,
        this.logger
      );

      // Set up the element for pseudo-element highlighting
      await sendCDPCommand(
        this.webContents,
        "DOM.setAttributeValue",
        {
          nodeId: node.nodeId,
          name: "style",
          value: `position: relative !important; z-index: 1 !important;`,
        },
        this.logger
      );

      // Add unique class for pseudo-element targeting
      const existingClass = node.attributes?.class || "";
      const newClass = existingClass ? `${existingClass} autai-highlight-${detectionTier}` : `autai-highlight-${detectionTier}`;

      await sendCDPCommand(
        this.webContents,
        "DOM.setAttributeValue",
        {
          nodeId: node.nodeId,
          name: "class",
          value: newClass,
        },
        this.logger
      );

      // Add data attribute to identify highlighted elements
      await sendCDPCommand(
        this.webContents,
        "DOM.setAttributeValue",
        {
          nodeId: node.nodeId,
          name: "data-autai-highlighted",
          value: detectionTier,
        },
        this.logger
      );

      // Inject the pseudo-element CSS for this tier
      await this.injectHighlightCSS(color, detectionTier);

    } catch (error) {
      this.logger.warn(`Failed to highlight element ${node.nodeId}:`, error);
    }
  }

  /**
   * Track injected CSS to avoid duplicate injection
   */
  private injectedStyles = new Set<string>();

  /**
   * Inject CSS for pseudo-element highlighting
   */
  private async injectHighlightCSS(color: string, detectionTier: string): Promise<void> {
    // Avoid injecting the same style multiple times
    const styleKey = `${detectionTier}-${color}`;
    if (this.injectedStyles.has(styleKey)) {
      return;
    }

    try {
      const css = `
        .autai-highlight-${detectionTier}::after {
          content: '' !important;
          position: absolute !important;
          top: -3px !important;
          left: -3px !important;
          right: -3px !important;
          bottom: -3px !important;
          border: 3px solid ${color} !important;
          background-color: ${color}20 !important;
          pointer-events: none !important;
          z-index: 999999 !important;
          box-sizing: border-box !important;
          border-radius: 2px !important;
        }
      `;

      // Use Runtime.evaluate to inject the CSS
      await sendCDPCommand(
        this.webContents,
        "Runtime.evaluate",
        {
          expression: `
            (function() {
              if (!document.getElementById('autai-highlight-styles-${detectionTier}')) {
                const style = document.createElement('style');
                style.id = 'autai-highlight-styles-${detectionTier}';
                style.textContent = \`${css}\`;
                document.head.appendChild(style);
              }
            })()
          `
        },
        this.logger
      );

      this.injectedStyles.add(styleKey);
      this.logger.debug(`Injected highlight CSS for tier: ${detectionTier}`);

    } catch (error) {
      this.logger.warn(`Failed to inject highlight CSS for tier ${detectionTier}:`, error);
    }
  }
}
