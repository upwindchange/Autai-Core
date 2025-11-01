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

// Compound Control Detection Constants (ported from browser-use)

// Input types that should be virtualized as compound controls
const COMPOUND_INPUT_TYPES = [
  "range",
  "number",
  "color",
  "file",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
];

// Elements that should be virtualized as compound controls
const COMPOUND_ELEMENT_TAGS = ["select", "details", "audio", "video"];

// ARIA roles that should be virtualized as compound controls
const COMPOUND_ARIA_ROLES = ["combobox", "slider", "spinbutton", "listbox"];

// Propagating elements that can contain child interactive elements
const PROPAGATING_ELEMENTS = [
  { tag: "a", role: null },
  { tag: "button", role: null },
  { tag: "div", role: "button" },
  { tag: "div", role: "combobox" },
  { tag: "input", role: "combobox" },
];

// Default containment threshold for bounds propagation
const DEFAULT_CONTAINMENT_THRESHOLD = 0.99;

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
   * Main detection method with on-the-fly highlighting
   *
   * @param node The DOM node to check for interactivity
   * @returns boolean indicating if the element is interactive
   */
  async isInteractive(node: EnhancedDOMTreeNode): Promise<boolean> {
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

      // Tier 6: Compound control detection
      if (await this.checkCompoundControls(node)) {
        await this.highlightElement(node, "tier6");
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(
        `Error in isInteractive for node ${node.nodeId}:`,
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
   * Check for compound controls
   * Detects complex form controls that should be virtualized
   */
  private async checkCompoundControls(
    node: EnhancedDOMTreeNode
  ): Promise<boolean> {
    if (!this.canVirtualize(node)) {
      return false;
    }

    // Build compound components for the element
    await this.addCompoundComponents(node);

    // Element is considered interactive if it has compound components
    return !!(node._compoundChildren && node._compoundChildren.length > 0);
  }

  // ==================== COMPOUND CONTROL DETECTION ====================

  /**
   * Check if element can be virtualized as a compound control
   */
  canVirtualize(node: EnhancedDOMTreeNode): boolean {
    if (!node.tag) return false;

    const tag = node.tag.toLowerCase();
    const inputType = node.attributes.type?.toLowerCase();
    const ariaRole = node.attributes.role?.toLowerCase();

    // Check input types
    if (
      tag === "input" &&
      inputType &&
      COMPOUND_INPUT_TYPES.includes(inputType)
    ) {
      return true;
    }

    // Check element tags
    if (COMPOUND_ELEMENT_TAGS.includes(tag)) {
      return true;
    }

    // Check ARIA roles
    if (ariaRole && COMPOUND_ARIA_ROLES.includes(ariaRole)) {
      return true;
    }

    return false;
  }

  /**
   * Main entry point for compound component detection
   * Adds virtual components to compound controls
   */
  async addCompoundComponents(node: EnhancedDOMTreeNode): Promise<void> {
    try {
      const tag = node.tag?.toLowerCase();

      // Initialize compound children array if needed
      if (!node._compoundChildren) {
        node._compoundChildren = [];
      }

      // Build compound components based on element type
      if (tag === "input") {
        await this.buildInputComponents(node);
      } else if (tag === "select") {
        await this.buildSelectComponents(node);
      } else if (tag === "details") {
        await this.buildDetailsComponents(node);
      } else if (tag === "audio" || tag === "video") {
        await this.buildMediaComponents(node);
      } else if (node.attributes.role?.toLowerCase() === "combobox") {
        await this.buildComboboxComponents(node);
      }

      this.logger.debug(
        `Added ${node._compoundChildren.length} compound components to ${tag} element`
      );
    } catch (error) {
      this.logger.warn(
        `Error adding compound components to node ${node.nodeId}:`,
        error
      );
    }
  }

  /**
   * Build compound components for input elements
   */
  private async buildInputComponents(node: EnhancedDOMTreeNode): Promise<void> {
    const inputType = node.attributes.type?.toLowerCase();
    if (!inputType || !COMPOUND_INPUT_TYPES.includes(inputType)) {
      return;
    }

    switch (inputType) {
      case "range":
        this.buildRangeComponents(node);
        break;
      case "number":
        this.buildNumberComponents(node);
        break;
      case "color":
        this.buildColorComponents(node);
        break;
      case "file":
        this.buildFileComponents(node);
        break;
      case "date":
      case "time":
      case "datetime-local":
      case "month":
      case "week":
        this.buildDateTimeComponents(node, inputType);
        break;
    }
  }

  /**
   * Build components for range input (slider)
   */
  private buildRangeComponents(node: EnhancedDOMTreeNode): void {
    const min = this.safeParseNumber(node.attributes.min, 0.0);
    const max = this.safeParseNumber(node.attributes.max, 100.0);
    const value = this.safeParseNumber(node.attributes.value, (min + max) / 2);

    node._compoundChildren?.push({
      role: "slider",
      name: "Value",
      valuemin: min,
      valuemax: max,
      valuenow: value,
    });
  }

  /**
   * Build components for number input
   */
  private buildNumberComponents(node: EnhancedDOMTreeNode): void {
    node._compoundChildren?.push(
      { role: "button", name: "Increment" },
      { role: "button", name: "Decrement" },
      { role: "textbox", name: "Value" }
    );
  }

  /**
   * Build components for color input
   */
  private buildColorComponents(node: EnhancedDOMTreeNode): void {
    const value = node.attributes.value || "#000000";

    node._compoundChildren?.push(
      { role: "textbox", name: "Hex Value", valuenow: value },
      { role: "button", name: "Color Picker" }
    );
  }

  /**
   * Build components for file input
   */
  private buildFileComponents(node: EnhancedDOMTreeNode): void {
    const hasFile = node.attributes.value && node.attributes.value !== "";

    node._compoundChildren?.push(
      { role: "button", name: "Browse" },
      {
        role: "textbox",
        name: "Filename",
        valuenow: hasFile ? node.attributes.value : "No file selected",
        readonly: true,
      }
    );
  }

  /**
   * Build components for date/time inputs
   */
  private buildDateTimeComponents(
    node: EnhancedDOMTreeNode,
    inputType: string
  ): void {
    let formatHint = "";
    let formats = "";

    switch (inputType) {
      case "date":
        formatHint = "YYYY-MM-DD";
        formats = "ISO 8601 date";
        break;
      case "time":
        formatHint = "HH:MM";
        formats = "24-hour time";
        break;
      case "datetime-local":
        formatHint = "YYYY-MM-DDTHH:MM";
        formats = "ISO 8601 datetime";
        break;
      case "month":
        formatHint = "YYYY-MM";
        formats = "Year-month";
        break;
      case "week":
        formatHint = "YYYY-Www";
        formats = "ISO week date";
        break;
    }

    const value = node.attributes.value || "";

    node._compoundChildren?.push({
      role: "textbox",
      name: "Date/Time Value",
      valuenow: value,
      format_hint: formatHint,
      formats,
    });
  }

  /**
   * Build components for select elements
   */
  private async buildSelectComponents(
    node: EnhancedDOMTreeNode
  ): Promise<void> {
    const optionsInfo = await this.extractSelectOptions(node);
    if (!optionsInfo) {
      return;
    }

    // Add dropdown toggle button
    node._compoundChildren?.push({
      role: "button",
      name: "Dropdown Toggle",
    });

    // Add options listbox
    node._compoundChildren?.push({
      role: "listbox",
      name: "Options",
      options_count: optionsInfo.count,
      first_options: optionsInfo.firstOptions,
      format_hint: optionsInfo.formatHint,
    });
  }

  /**
   * Extract options from select element
   */
  private async extractSelectOptions(node: EnhancedDOMTreeNode): Promise<{
    count: number;
    firstOptions: string[];
    formatHint: string;
  } | null> {
    try {
      // Use CDP to get select options
      const result = await sendCDPCommand(
        this.webContents,
        "Runtime.evaluate",
        {
          expression: `
            (function(nodeId) {
              const node = document.querySelector('[data-node-id="' + nodeId + '"]');
              if (!node || node.tagName !== 'SELECT') return null;

              const options = Array.from(node.options);
              const count = options.length;
              const firstOptions = options.slice(0, 4).map(opt => opt.text || opt.value || '');

              // Analyze format patterns
              let formatHint = '';
              if (count > 0) {
                const sampleTexts = firstOptions.filter(text => text.length > 0);
                if (sampleTexts.length > 0) {
                  // Check for numeric patterns
                  if (sampleTexts.every(text => /^\\d+$/.test(text))) {
                    formatHint = 'numeric';
                  }
                  // Check for date patterns
                  else if (sampleTexts.every(text => /^\\d{4}-\\d{2}-\\d{2}/.test(text))) {
                    formatHint = 'date';
                  }
                  // Check for country/state codes
                  else if (sampleTexts.every(text => /^[A-Z]{2}$/.test(text))) {
                    formatHint = 'country_code';
                  }
                }
              }

              return { count, firstOptions, formatHint };
            })(${node.nodeId})
          `,
        },
        this.logger
      );

      return (
        (
          result as {
            result?: {
              value?: {
                count: number;
                firstOptions: string[];
                formatHint: string;
              };
            };
          }
        )?.result?.value || null
      );
    } catch (error) {
      this.logger.warn(
        `Failed to extract select options for node ${node.nodeId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Build components for details/summary elements
   */
  private buildDetailsComponents(node: EnhancedDOMTreeNode): void {
    const isOpen = node.attributes.open !== undefined;

    node._compoundChildren?.push({
      role: "button",
      name: "Toggle Details",
      valuenow: isOpen ? "open" : "closed",
    });
  }

  /**
   * Build components for media elements
   */
  private buildMediaComponents(node: EnhancedDOMTreeNode): void {
    const isVideo = node.tag === "video";

    node._compoundChildren?.push(
      { role: "button", name: "Play/Pause" },
      { role: "slider", name: "Progress", valuemin: 0, valuemax: 100 },
      { role: "button", name: "Mute" },
      { role: "slider", name: "Volume", valuemin: 0, valuemax: 100 }
    );

    if (isVideo) {
      node._compoundChildren?.push({ role: "button", name: "Fullscreen" });
    }
  }

  /**
   * Build components for combobox elements
   */
  private buildComboboxComponents(node: EnhancedDOMTreeNode): void {
    node._compoundChildren?.push(
      { role: "textbox", name: "Input" },
      { role: "button", name: "Dropdown Toggle" },
      { role: "listbox", name: "Options" }
    );
  }

  /**
   * Safely parse a number with fallback
   */
  private safeParseNumber(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  }

  // ==================== COMPOUND COMPONENT SERIALIZATION ====================

  /**
   * Format compound components as HTML attribute string for serialization
   */
  formatCompoundComponents(node: EnhancedDOMTreeNode): string {
    if (!node._compoundChildren || node._compoundChildren.length === 0) {
      return "";
    }

    const compoundInfo = node._compoundChildren.map(
      (childInfo: Record<string, unknown>) => {
        const parts: string[] = [];
        if (childInfo.name) parts.push(`name=${childInfo.name}`);
        if (childInfo.role) parts.push(`role=${childInfo.role}`);
        if (childInfo.valuemin !== undefined)
          parts.push(`min=${childInfo.valuemin}`);
        if (childInfo.valuemax !== undefined)
          parts.push(`max=${childInfo.valuemax}`);
        if (childInfo.valuenow !== undefined && childInfo.valuenow !== null) {
          parts.push(`current=${childInfo.valuenow}`);
        }
        if (childInfo.options_count)
          parts.push(`count=${childInfo.options_count}`);
        if (
          childInfo.first_options &&
          Array.isArray(childInfo.first_options) &&
          childInfo.first_options.length > 0
        ) {
          parts.push(
            `options=[${childInfo.first_options.slice(0, 3).join(", ")}]`
          );
        }
        if (childInfo.format_hint)
          parts.push(`format=${childInfo.format_hint}`);
        if (childInfo.readonly) parts.push(`readonly=true`);
        if (childInfo.description) parts.push(`desc=${childInfo.description}`);

        return `(${parts.join(",")})`;
      }
    );

    return `compound_components=${compoundInfo.join(",")}`;
  }

  /**
   * Get compound component summary for debugging
   */
  getCompoundComponentSummary(node: EnhancedDOMTreeNode): {
    count: number;
    types: string[];
    hasInteractiveComponents: boolean;
    summary: string;
  } {
    if (!node._compoundChildren || node._compoundChildren.length === 0) {
      return {
        count: 0,
        types: [],
        hasInteractiveComponents: false,
        summary: "No compound components",
      };
    }

    const types = node._compoundChildren.map(
      (child: Record<string, unknown>) => (child.role as string) || "unknown"
    );
    const interactiveRoles = ["button", "textbox", "slider", "listbox"];
    const hasInteractiveComponents = node._compoundChildren.some(
      (child: Record<string, unknown>) =>
        child.role && interactiveRoles.includes(child.role as string)
    );

    const summary = `${node._compoundChildren.length} components: ${types.join(
      ", "
    )}`;

    return {
      count: node._compoundChildren.length,
      types,
      hasInteractiveComponents,
      summary,
    };
  }

  /**
   * Check if node has compound components and is a compound control
   */
  isCompoundControl(node: EnhancedDOMTreeNode): boolean {
    return !!(node._compoundChildren && node._compoundChildren.length > 0);
  }

  /**
   * Get compound component detection tier info
   */
  getCompoundDetectionInfo(node: EnhancedDOMTreeNode): {
    isCompound: boolean;
    canVirtualize: boolean;
    componentCount: number;
    primaryType: string;
    detectionReason: string;
  } {
    const canVirtualize = this.canVirtualize(node);
    const isCompound = this.isCompoundControl(node);
    const componentCount = node._compoundChildren?.length || 0;
    const primaryType = this.getPrimaryCompoundType(node);
    const detectionReason = this.getCompoundDetectionReason(node);

    return {
      isCompound,
      canVirtualize,
      componentCount,
      primaryType,
      detectionReason,
    };
  }

  /**
   * Get the primary type of compound control
   */
  private getPrimaryCompoundType(node: EnhancedDOMTreeNode): string {
    if (!node._compoundChildren || node._compoundChildren.length === 0) {
      return "none";
    }

    const tag = node.tag?.toLowerCase();
    const inputType = node.attributes.type?.toLowerCase();

    if (tag === "input") {
      return inputType || "input";
    } else if (tag) {
      return tag;
    } else if (node.attributes.role) {
      return node.attributes.role;
    }

    return "unknown";
  }

  /**
   * Get the reason why this element was detected as compound control
   */
  private getCompoundDetectionReason(node: EnhancedDOMTreeNode): string {
    const tag = node.tag?.toLowerCase();
    const inputType = node.attributes.type?.toLowerCase();
    const ariaRole = node.attributes.role?.toLowerCase();

    if (
      tag === "input" &&
      inputType &&
      COMPOUND_INPUT_TYPES.includes(inputType)
    ) {
      return `Input type "${inputType}" requires virtualization`;
    } else if (COMPOUND_ELEMENT_TAGS.includes(tag || "")) {
      return `Element "${tag}" requires virtualization`;
    } else if (ariaRole && COMPOUND_ARIA_ROLES.includes(ariaRole)) {
      return `ARIA role "${ariaRole}" requires virtualization`;
    } else if (node._compoundChildren && node._compoundChildren.length > 0) {
      return `Has ${node._compoundChildren.length} virtual components`;
    }

    return "Unknown compound control";
  }

  // ==================== BOUNDS PROPAGATION SYSTEM ====================

  /**
   * Check if element is a propagating element that can contain child interactive elements
   */
  isPropagatingElement(node: EnhancedDOMTreeNode): boolean {
    if (!node.tag) return false;

    const tag = node.tag.toLowerCase();
    const role = node.attributes.role?.toLowerCase() || null;

    return PROPAGATING_ELEMENTS.some(
      (propagating) => propagating.tag === tag && propagating.role === role
    );
  }

  /**
   * Check if child element is contained within parent bounds
   */
  isContainedInParent(
    childNode: EnhancedDOMTreeNode,
    parentNode: EnhancedDOMTreeNode,
    threshold: number = DEFAULT_CONTAINMENT_THRESHOLD
  ): boolean {
    const childBounds = childNode.snapshotNode?.boundingBox;
    const parentBounds = parentNode.snapshotNode?.boundingBox;

    if (!childBounds || !parentBounds) {
      return false;
    }

    // Calculate intersection area
    const xOverlap = Math.max(
      0,
      Math.min(
        childBounds.x + childBounds.width,
        parentBounds.x + parentBounds.width
      ) - Math.max(childBounds.x, parentBounds.x)
    );
    const yOverlap = Math.max(
      0,
      Math.min(
        childBounds.y + childBounds.height,
        parentBounds.y + parentBounds.height
      ) - Math.max(childBounds.y, parentBounds.y)
    );

    const intersectionArea = xOverlap * yOverlap;
    const childArea = childBounds.width * childBounds.height;

    if (childArea === 0) {
      return false;
    }

    const containmentRatio = intersectionArea / childArea;
    return containmentRatio >= threshold;
  }

  /**
   * Check if contained element should be kept (exception rules)
   */
  shouldKeepContainedElement(node: EnhancedDOMTreeNode): boolean {
    const tag = node.tag?.toLowerCase();

    // Always keep form elements
    if (
      ["input", "select", "textarea", "label", "option"].includes(tag || "")
    ) {
      return true;
    }

    // Keep other propagating elements (prevents event stop propagation conflicts)
    if (this.isPropagatingElement(node)) {
      return true;
    }

    // Keep elements with explicit onclick handlers
    if (node.attributes.onclick && node.attributes.onclick !== "") {
      return true;
    }

    // Keep elements with meaningful aria-label
    if (
      node.attributes["aria-label"] &&
      node.attributes["aria-label"].trim() !== ""
    ) {
      return true;
    }

    // Keep interactive role elements
    const role = node.attributes.role?.toLowerCase();
    if (
      role &&
      ["button", "link", "checkbox", "radio", "menuitem", "tab"].includes(role)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Get bounding box for element in CSS pixels
   */
  getElementBounds(
    node: EnhancedDOMTreeNode
  ): { x: number; y: number; width: number; height: number } | null {
    if (!node.snapshotNode?.boundingBox) {
      return null;
    }

    const bounds = node.snapshotNode.boundingBox;
    return {
      x: this.deviceToCSSPixels(bounds.x),
      y: this.deviceToCSSPixels(bounds.y),
      width: this.deviceToCSSPixels(bounds.width),
      height: this.deviceToCSSPixels(bounds.height),
    };
  }

  /**
   * Find propagating parent for bounds checking
   */
  findPropagatingParent(node: EnhancedDOMTreeNode): EnhancedDOMTreeNode | null {
    let current = node.parent;
    while (current) {
      if (this.isPropagatingElement(current)) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * Lightweight development highlighting using only DOM.setAttributeValue
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
      tier6: "#9B59B6", // Purple - Compound control detection
      default: "#FF6B6B", // Default red for unknown tiers
    };

    // Use compound-specific colors based on element type
    const color = tierColors[detectionTier];

    try {
      // Enable DOM agent if not already enabled
      await sendCDPCommand(
        this.webContents,
        "DOM.enable",
        undefined,
        this.logger
      );

      // Lightweight approach: Simple inline styles for development debugging
      // No position changes, no class modifications, no z-index interference
      await sendCDPCommand(
        this.webContents,
        "DOM.setAttributeValue",
        {
          nodeId: node.nodeId,
          name: "style",
          value: `
            outline: 3px solid ${color} !important;
            outline-offset: 2px !important;
            background-color: ${color}20 !important;
          `,
        },
        this.logger
      );

      // Simple data attribute for identification (no class pollution)
      await sendCDPCommand(
        this.webContents,
        "DOM.setAttributeValue",
        {
          nodeId: node.nodeId,
          name: "data-autai-tier",
          value: detectionTier,
        },
        this.logger
      );
    } catch (error) {
      this.logger.warn(`Failed to highlight element ${node.nodeId}:`, error);
    }
  }
}
