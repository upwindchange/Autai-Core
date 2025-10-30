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
import { sendCDPCommand } from "../utils/DOMUtils";

// Enhanced interactive element tags (ported from DOMTreeSerializer)
const INTERACTIVE_TAGS = [
  'button', 'input', 'select', 'textarea', 'a',
  'option', 'label', 'iframe', 'frame', 'details', 'summary', 'optgroup'
];

// Enhanced event handlers for interactive detection (ported from DOMTreeSerializer)
const EVENT_HANDLERS = [
  'onclick', 'onmousedown', 'onmouseup', 'onkeydown', 'onkeyup', 'tabindex'
];

// Accessibility property categories for comprehensive analysis (ported from DOMTreeSerializer)
const DIRECT_INTERACTIVITY = ['focusable', 'editable', 'settable'];
const INTERACTIVE_STATES = ['checked', 'expanded', 'pressed', 'selected'];
const FORM_PROPERTIES = ['required', 'autocomplete', 'keyshortcuts'];
const BLOCKER_PROPERTIES = ['disabled', 'hidden'];

// Search element indicators for comprehensive search detection
const SEARCH_INDICATORS = [
  'search', 'magnify', 'glass', 'lookup', 'find', 'query',
  'search-icon', 'search-btn', 'search-button', 'searchbox'
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

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    this.logger.info("InteractiveElementDetector initialized with highlighting support");
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
      this.logger.error(`Error in getDetectionTier for node ${node.nodeId}:`, error);
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
    return tag === 'html' || tag === 'body';
  }

  /**
   * Check iframe size requirements (placeholder)
   * TODO: Implement iframe size filtering (minimum 100x100px)
   */
  private checkIframeSize(_node: EnhancedDOMTreeNode): boolean {
    // Placeholder - will implement iframe size detection later
    return false;
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
      if (attrName.startsWith('data-') && attrValue) {
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
   * Check for event handlers (ported from existing logic)
   */
  private checkEventHandlers(node: EnhancedDOMTreeNode): boolean {
    if (!node.attributes) return false;

    for (const handler of EVENT_HANDLERS) {
      if (handler === 'tabindex') {
        // Special handling for tabindex - any tabindex (even 0) makes element focusable
        if (node.attributes[handler] !== undefined && node.attributes[handler] !== null) {
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
      'button', 'link', 'menuitem', 'option', 'radio', 'checkbox', 'tab',
      'textbox', 'combobox', 'slider', 'spinbutton', 'search', 'searchbox'
    ];

    return interactiveRoles.includes(role);
  }

  /**
   * Check for input-like attributes (ported from existing logic)
   */
  private checkInputAttributes(node: EnhancedDOMTreeNode): boolean {
    return node.attributes?.contenteditable === 'true';
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
      if (BLOCKER_PROPERTIES.includes(propName) && prop.value?.type === 'boolean' && prop.value.value === true) {
        return false;
      }

      // Check for direct interactivity properties (return true if true)
      if (DIRECT_INTERACTIVITY.includes(propName) && prop.value?.type === 'boolean' && prop.value.value === true) {
        return true;
      }

      // Check for interactive state properties (return true if true)
      if (INTERACTIVE_STATES.includes(propName) && prop.value?.type === 'boolean' && prop.value.value === true) {
        return true;
      }

      // Check for form properties (return true if present)
      if (FORM_PROPERTIES.includes(propName) && prop.value?.value !== undefined) {
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
      'button', 'link', 'menuitem', 'option', 'radio', 'checkbox', 'tab',
      'textbox', 'combobox', 'slider', 'spinbutton', 'search', 'searchbox',
      'gridcell', 'rowheader', 'columnheader', 'treeitem', 'switch', 'menubar',
      'menu', 'listbox', 'tree', 'grid', 'application', 'group', 'radiogroup',
      'list', 'row', 'table', 'tooltip', 'dialog', 'alertdialog', 'document',
      'article', 'feed', 'figure', 'img', 'banner', 'complementary', 'contentinfo',
      'form', 'main', 'navigation', 'region', 'status', 'timer'
    ];

    return interactiveRoles.includes(role);
  }

  // Tier 5: Visual/Structural Indicators

  /**
   * Check for icon-sized interactive elements (placeholder)
   * TODO: Implement icon detection (10-50px elements with interactive attributes)
   */
  private checkIconElements(_node: EnhancedDOMTreeNode): boolean {
    // Placeholder - will implement icon element detection later
    return false;
  }

  /**
   * Check cursor style indicators
   * Uses cursor style as final fallback for detecting interactive elements
   */
  private checkCursorStyle(node: EnhancedDOMTreeNode): boolean {
    // Check if the element has pointer cursor style
    return node.snapshotNode?.cursorStyle === 'pointer';
  }

  /**
   * Highlight a single element using CDP commands
   */
  private async highlightElement(node: EnhancedDOMTreeNode, detectionTier: string): Promise<void> {
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
      await sendCDPCommand(this.webContents, "DOM.enable", undefined, this.logger);

      // Use DOM.setAttributeValue to add colored border styling
      await sendCDPCommand(this.webContents, "DOM.setAttributeValue", {
        nodeId: node.nodeId,
        name: "style",
        value: `border: 3px solid ${color} !important; box-sizing: border-box !important; background-color: ${color}20 !important;`,
      }, this.logger);

      // Add data attribute to identify highlighted elements
      await sendCDPCommand(this.webContents, "DOM.setAttributeValue", {
        nodeId: node.nodeId,
        name: "data-autai-highlighted",
        value: detectionTier,
      }, this.logger);

    } catch (error) {
      this.logger.warn(`Failed to highlight element ${node.nodeId}:`, error);
    }
  }
}