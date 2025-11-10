/**
 * Unified DOM Tree Serializer - Simple single-pass processing
 *
 * Replaces the complex 6-stage pipeline with a straightforward approach
 * following browser-use patterns for maximum simplicity and maintainability.
 */

import type {
  EnhancedDOMTreeNode,
  SerializedDOMState,
  SimplifiedNode,
  DOMSelectorMap,
  SerializationConfig,
  SerializationStats,
  SerializationTiming,
  ScrollInfo,
} from "@shared/dom";
import { NodeType } from "@shared/dom";
import type { WebContents } from "electron";
import log from "electron-log/main";

import { InteractiveElementDetector } from "./InteractiveElementDetector";

// ==================== BOUNDING BOX CONSTANTS ====================

// Propagating elements that can contain child interactive elements
const PROPAGATING_ELEMENTS = [
  { tag: "a", role: null },
  { tag: "button", role: null },
  { tag: "div", role: "button" },
  { tag: "div", role: "combobox" },
  { tag: "input", role: "combobox" },
  { tag: "span", role: "button" },
  { tag: "span", role: "combobox" },
];

// Default containment threshold for bounds propagation
const DEFAULT_CONTAINMENT_THRESHOLD = 0.99;

// Note: Icon detection attributes and patterns (ICON_ATTRIBUTES, ICON_CLASS_PATTERNS)
// are available if needed for icon-based filtering logic

// ==================== PAINT ORDER INFRASTRUCTURE ====================

/**
 * Rectangle interface for paint order calculations
 */
interface PaintOrderRect {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

// Paint order filtering constants
const OPACITY_THRESHOLD = 0.8; // Elements with opacity below this are excluded from occlusion calculation
const TRANSPARENT_BACKGROUND = "rgba(0, 0, 0, 0)"; // Transparent background color to check for

// Tags that should be skipped
const SKIP_TAGS = [
  "style",
  "script",
  "head",
  "meta",
  "link",
  "title",
  // SVG elements to skip entirely
  "svg",
  "path",
  "rect",
  "g",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "use",
  "defs",
  "clipPath",
  "mask",
  "pattern",
  "image",
  "text",
  "tspan",
];

// Note: SerializationTiming interface moved to @shared/dom/types.ts

// Interface for compound component children
interface CompoundChild {
  name?: string;
  role?: string;
  valuemin?: number | null;
  valuemax?: number | null;
  valuenow?: number | null;
  options_count?: number | null;
  first_options?: string[];
  format_hint?: string;
}

/**
 * Unified DOM Tree Serializer
 */
export class DOMTreeSerializer {
  private config: SerializationConfig;
  private interactiveCounter = 1;
  private interactiveDetector: InteractiveElementDetector;
  private logger = log.scope("DOMTreeSerializer");

  // Paint order filtering state
  private paintOrderRects: PaintOrderRect[] = [];
  private paintOrderProcessed: Set<number> = new Set();

  constructor(
    _webContents: WebContents,
    config: Partial<SerializationConfig> = {}
  ) {
    this.config = {
      enablePaintOrderFiltering: true,
      enableBoundingBoxFiltering: true,
      enableCompoundComponents: false,
      opacityThreshold: 0.8,
      containmentThreshold: 0.99,
      maxInteractiveElements: 1000,
      ...config,
    };

    // Initialize the interactive element detector
    this.interactiveDetector = new InteractiveElementDetector(_webContents);
  }

  // ==================== BOUNDING BOX METHODS ====================

  /**
   * Convert device pixels to CSS pixels for accurate sizing
   */
  private deviceToCSSPixels(devicePixels: number): number {
    return devicePixels / this.interactiveDetector.getDevicePixelRatio();
  }

  /**
   * Get element size in CSS pixels
   */
  private getElementSize(
    node: EnhancedDOMTreeNode
  ): { width: number; height: number } | null {
    if (!node.snapshotNode?.bounds) {
      return null;
    }

    const { width, height } = node.snapshotNode.bounds;
    return {
      width: this.deviceToCSSPixels(width),
      height: this.deviceToCSSPixels(height),
    };
  }

  /**
   * Check if element is a propagating element that can contain child interactive elements
   */
  private isPropagatingElement(node: EnhancedDOMTreeNode): boolean {
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
  private isContainedInParent(
    childNode: SimplifiedNode,
    parentNode: SimplifiedNode,
    threshold: number = DEFAULT_CONTAINMENT_THRESHOLD
  ): boolean {
    const childBounds = childNode.originalNode.snapshotNode?.bounds;
    const parentBounds = parentNode.originalNode.snapshotNode?.bounds;

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
  private shouldKeepContainedElement(node: SimplifiedNode): boolean {
    const tag = node.originalNode.tag?.toLowerCase();

    // Always keep form elements
    if (
      ["input", "select", "textarea", "label", "option"].includes(tag || "")
    ) {
      return true;
    }

    // Keep other propagating elements (prevents event stop propagation conflicts)
    if (this.isPropagatingElement(node.originalNode)) {
      return true;
    }

    // Keep elements with explicit onclick handlers
    if (
      node.originalNode.attributes.onclick &&
      node.originalNode.attributes.onclick !== ""
    ) {
      return true;
    }

    // Keep elements with meaningful aria-label
    if (
      node.originalNode.attributes["aria-label"] &&
      node.originalNode.attributes["aria-label"].trim() !== ""
    ) {
      return true;
    }

    // Keep interactive role elements
    const role = node.originalNode.attributes.role?.toLowerCase();
    if (
      role &&
      ["button", "link", "checkbox", "radio", "menuitem", "tab"].includes(role)
    ) {
      return true;
    }

    return false;
  }

  // Note: getElementBounds method is available if needed for specific bounds calculations

  /**
   * Find propagating parent for bounds checking
   */
  private findPropagatingParent(_node: SimplifiedNode): SimplifiedNode | null {
    // Note: SimplifiedNode parent relationship is handled differently
    // This method is called after the tree is built, so we traverse the tree structure
    // The actual parent finding logic is implemented in applyBoundingBoxFiltering
    return null;
  }

  /**
   * Process a single node for bounding box filtering
   */
  private processBoundingBoxNode(node: SimplifiedNode): boolean {
    const enhancedNode = node.originalNode;

    // Skip if element is outside valid size range
    if (!this.isWithinValidSizeRange(enhancedNode)) {
      return false;
    }

    // Apply bounds propagation filtering if enabled
    if (this.config.boundingBoxConfig?.enablePropagationFiltering) {
      const propagatingParent = this.findPropagatingParent(node);
      if (
        propagatingParent &&
        this.isContainedInParent(node, propagatingParent)
      ) {
        // Element is contained within a propagating parent
        if (!this.shouldKeepContainedElement(node)) {
          return false; // Filter out contained elements that shouldn't be kept
        }
      }
    }

    return true; // Keep this node
  }

  /**
   * Check if element is within valid size range
   */
  private isWithinValidSizeRange(node: EnhancedDOMTreeNode): boolean {
    const size = this.getElementSize(node);
    if (!size) {
      return false;
    }

    return (
      size.width >= 1 &&
      size.width <= Number.MAX_SAFE_INTEGER &&
      size.height >= 1 &&
      size.height <= Number.MAX_SAFE_INTEGER
    );
  }

  /**
   * Serialize DOM tree - single pass processing
   */
  async serializeDOMTree(
    rootNode: EnhancedDOMTreeNode,
    previousState?: SerializedDOMState,
    _config?: Partial<SerializationConfig>
  ): Promise<{
    serializedState: SerializedDOMState;
    timing: SerializationTiming;
    stats: SerializationStats;
  }> {
    const startTime = Date.now();
    const timings: SerializationTiming = {
      total: 0,
      createSimplifiedTree: 0,
      paintOrderFiltering: 0,
      optimizeTreeStructure: 0,
      boundingBoxFiltering: 0,
      assignInteractiveIndices: 0,
      markNewElements: 0,
    };

    // Reset counter
    this.interactiveCounter = 1;

    // Get previous selector map for change detection
    const previousSelectorMap = previousState?.selectorMap;

    // Single-pass serialization with on-the-fly highlighting
    const createSimplifiedTreeStart = Date.now();
    const simplifiedRoot = await this.createSimplifiedNode(
      rootNode,
      previousSelectorMap
    );
    timings.createSimplifiedTree = Date.now() - createSimplifiedTreeStart;

    if (!simplifiedRoot) {
      throw new Error("Root node was filtered out during serialization");
    }

    // Apply paint order filtering to the complete tree
    const paintOrderStart = Date.now();
    await this.applyPaintOrderFiltering(simplifiedRoot);
    timings.paintOrderFiltering = Date.now() - paintOrderStart;

    // Apply bounding box filtering as standalone stage
    const boundingBoxStart = Date.now();
    await this.applyBoundingBoxFiltering(simplifiedRoot);
    timings.boundingBoxFiltering = Date.now() - boundingBoxStart;

    // Apply tree optimization to remove empty branches
    const optimizeStart = Date.now();
    const optimizedRoot = this.optimizeTree(simplifiedRoot);
    timings.optimizeTreeStructure = Date.now() - optimizeStart;
    const selectorMap = this.buildSelectorMap(optimizedRoot);
    const stats = this.calculateStats(optimizedRoot);

    // Log LLM representation for debugging
    try {
      const llmRep = await this.generateLLMRepresentation(optimizedRoot);
      this.logger.debug("=== LLM DOM Representation ===");
      this.logger.debug(llmRep);
      this.logger.debug("=== End LLM DOM Representation ===");
    } catch (error) {
      this.logger.error("Failed to generate LLM representation:", error);
    }

    timings.total = Date.now() - startTime;

    return {
      serializedState: {
        root: optimizedRoot,
        selectorMap,
        timing: timings,
      },
      timing: timings,
      stats,
    };
  }

  /**
   * Create simplified node (single pass with on-the-fly highlighting)
   */
  private async createSimplifiedNode(
    node: EnhancedDOMTreeNode,
    previousSelectorMap?: DOMSelectorMap
  ): Promise<SimplifiedNode | null> {
    // Skip certain tags
    if (node.tag && SKIP_TAGS.includes(node.tag)) {
      return null;
    }

    // Skip hidden elements
    if (node.isVisible === false) {
      return null;
    }

    // Enhanced text node filtering - filter out text nodes with no meaningful content
    if (node.nodeType === NodeType.TEXT_NODE && node.nodeValue) {
      const textValue = node.nodeValue.trim();
      // Skip text nodes that are empty, whitespace only, or single characters
      if (!textValue || textValue.length <= 1) {
        return null;
      }
    }

    const simplified: SimplifiedNode = {
      originalNode: node,
      children: [],
      shouldDisplay: true,
      interactiveIndex: null,
      isNew: false,
      ignoredByPaintOrder: false,
      excludedByParent: false,
      isShadowHost: !!node.shadowRootType,
      isCompoundComponent: false,
      hasCompoundChildren: false,
      isLeaf: false,
      depth: 0,
      nodeHash: 0,
      interactiveElement: false,
      hasChildren: false,
      tagName: node.tag || "",
      textContent: node.nodeValue || "",
    };

    // Process children
    if (node.actualChildren) {
      for (const child of node.actualChildren) {
        const simplifiedChild = await this.createSimplifiedNode(
          child,
          previousSelectorMap
        );
        if (simplifiedChild) {
          simplified.children.push(simplifiedChild);
        }
      }
    }

    // Process shadow roots
    if (node.shadowRoots) {
      for (const shadowRoot of node.shadowRoots) {
        const simplifiedShadow = await this.createSimplifiedNode(
          shadowRoot,
          previousSelectorMap
        );
        if (simplifiedShadow) {
          simplified.children.push(simplifiedShadow);
        }
      }
    }

    // Check if interactive using the dedicated detector with on-the-fly highlighting
    if (simplified.shouldDisplay) {
      const isInteractive = await this.interactiveDetector.isInteractive(node);
      if (isInteractive) {
        simplified.interactiveIndex = this.interactiveCounter++;
        simplified.interactiveElement = true;
      }
    }

    // Mark as new based on comparison with previous state
    simplified.isNew = this.isNewElement(node, previousSelectorMap);

    return simplified;
  }

  /**
   * Optimize tree by removing empty branches and meaningless elements
   * Based on browser-use's _optimize_tree approach
   */
  private optimizeTree(node: SimplifiedNode): SimplifiedNode {
    // First, optimize all children recursively
    const optimizedChildren: SimplifiedNode[] = [];
    for (const child of node.children) {
      const optimizedChild = this.optimizeTree(child);
      if (this.shouldKeepNode(optimizedChild)) {
        optimizedChildren.push(optimizedChild);
      }
    }

    // Update the node with optimized children
    node.children = optimizedChildren;
    node.hasChildren = optimizedChildren.length > 0;

    return node;
  }

  /**
   * Determine if a node should be kept in the optimized tree
   */
  private shouldKeepNode(node: SimplifiedNode): boolean {
    // Keep nodes that are interactive
    if (node.interactiveIndex !== null) {
      return true;
    }

    // Keep nodes that are scrollable
    if (
      node.originalNode.isActuallyScrollable ||
      node.originalNode.isScrollable
    ) {
      return true;
    }

    // Keep nodes that have meaningful children
    if (node.children.length > 0) {
      return true;
    }

    // Keep text nodes with meaningful content
    if (
      node.originalNode.nodeType === NodeType.TEXT_NODE &&
      node.originalNode.nodeValue
    ) {
      const textValue = node.originalNode.nodeValue.trim();
      return textValue.length > 1;
    }

    // Keep iframes and frames
    if (node.originalNode.tag) {
      const upperTag = node.originalNode.tag.toUpperCase();
      if (upperTag === "IFRAME" || upperTag === "FRAME") {
        return true;
      }
    }

    // Keep shadow hosts
    if (node.isShadowHost) {
      return true;
    }

    // Element meaningfulness check - keep elements with semantic value
    if (this.hasSemanticMeaning(node)) {
      return true;
    }

    // Default to removing the node if it doesn't meet any criteria
    return false;
  }

  /**
   * Check if an element has semantic meaning even if empty
   */
  private hasSemanticMeaning(node: SimplifiedNode): boolean {
    return DOMTreeSerializer.hasSemanticMeaningStatic(node);
  }

  /**
   * Static version of hasSemanticMeaning for use in static methods
   */
  private static hasSemanticMeaningStatic(node: SimplifiedNode): boolean {
    const tag = node.originalNode.tag?.toLowerCase();
    if (!tag) return false;

    // Keep elements with important semantic roles
    if (node.originalNode.axNode?.role) {
      const role = String(node.originalNode.axNode.role).toLowerCase();
      const semanticRoles = [
        "button",
        "link",
        "navigation",
        "main",
        "banner",
        "contentinfo",
        "search",
        "complementary",
        "form",
        "region",
        "heading",
        "list",
        "listitem",
        "table",
        "row",
        "cell",
        "grid",
        "gridcell",
        "tab",
        "tabpanel",
        "dialog",
        "alert",
        "status",
        "timer",
        "marquee",
        "application",
        "document",
        "article",
        "section",
        "group",
      ];
      if (semanticRoles.includes(role)) {
        return true;
      }
    }

    // Keep elements with meaningful attributes
    if (node.originalNode.attributes) {
      const meaningfulAttrs = [
        "id",
        "data-testid",
        "data-cy",
        "role",
        "aria-label",
        "title",
      ];
      for (const attr of meaningfulAttrs) {
        if (node.originalNode.attributes[attr]) {
          return true;
        }
      }
    }

    // Keep important structural elements
    const structuralTags = [
      "header",
      "footer",
      "nav",
      "main",
      "section",
      "article",
      "aside",
      "form",
      "input",
      "button",
      "select",
      "textarea",
      "a",
      "img",
      "video",
      "audio",
      "canvas",
      "svg",
      "iframe",
      "frame",
    ];
    if (structuralTags.includes(tag)) {
      return true;
    }

    // Keep form controls
    if (["input", "textarea", "select", "button", "option"].includes(tag)) {
      return true;
    }

    // Keep elements with ARIA attributes
    if (node.originalNode.attributes) {
      for (const [key, value] of Object.entries(node.originalNode.attributes)) {
        if (key.startsWith("aria-") && value) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if element is new compared to previous state
   */
  private isNewElement(
    node: EnhancedDOMTreeNode,
    previousSelectorMap?: DOMSelectorMap
  ): boolean {
    if (!previousSelectorMap) {
      return true; // First run, everything is new
    }

    // Check if node's backendNodeId exists in previous selector map
    return !Object.values(previousSelectorMap).some(
      (prevNode) => prevNode.backendNodeId === node.backendNodeId
    );
  }

  /**
   * Build selector map for interactive elements
   */
  private buildSelectorMap(root: SimplifiedNode): DOMSelectorMap {
    const selectorMap: DOMSelectorMap = {};

    const traverse = (node: SimplifiedNode) => {
      if (
        node.interactiveIndex !== null &&
        !node.ignoredByPaintOrder &&
        !node.excludedByBoundingBox
      ) {
        selectorMap[node.interactiveIndex] = node.originalNode;
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(root);
    return selectorMap;
  }

  /**
   * Calculate serialization statistics
   */
  private calculateStats(root: SimplifiedNode): SerializationStats {
    let totalNodes = 0;
    let interactiveElements = 0;
    let newElements = 0;
    let occludedNodes = 0;
    let containedNodes = 0;
    let sizeFilteredNodes = 0;

    const traverse = (node: SimplifiedNode) => {
      totalNodes++;

      if (node.ignoredByPaintOrder) {
        occludedNodes++;
      }

      if (node.excludedByBoundingBox) {
        if (node.exclusionReason === "size_filtered") {
          sizeFilteredNodes++;
        } else if (node.exclusionReason === "contained") {
          containedNodes++;
        }
      }

      if (
        node.interactiveIndex !== null &&
        !node.ignoredByPaintOrder &&
        !node.excludedByBoundingBox
      ) {
        interactiveElements++;
      }

      if (node.isNew) {
        newElements++;
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(root);

    return {
      totalNodes,
      simplifiedNodes: totalNodes,
      filteredNodes: occludedNodes + containedNodes + sizeFilteredNodes,
      interactiveElements,
      newElements,
      occludedNodes,
      containedNodes,
      sizeFilteredNodes,
    };
  }

  /**
   * Build HTML-style attributes string for serialization
   * Ported from browser-use build_attributes_string logic
   */
  private static buildAttributesString(
    node: EnhancedDOMTreeNode,
    includeAttributes: string[],
    text: string
  ): string {
    const attributesToInclude: Record<string, string> = {};

    // Include HTML attributes
    if (node.attributes) {
      Object.entries(node.attributes).forEach(([key, value]) => {
        if (includeAttributes.includes(key) && value.trim() !== "") {
          attributesToInclude[key] = value.trim();
        }
      });
    }

    // Add format hints for date/time inputs (HTML5 ISO formats)
    if (node.tag && node.tag.toLowerCase() === "input" && node.attributes) {
      const inputType = (node.attributes["type"] || "").toLowerCase();

      if (
        ["date", "time", "datetime-local", "month", "week"].includes(inputType)
      ) {
        const formatMap: Record<string, string> = {
          date: "YYYY-MM-DD",
          time: "HH:MM",
          "datetime-local": "YYYY-MM-DDTHH:MM",
          month: "YYYY-MM",
          week: "YYYY-W##",
        };
        attributesToInclude["format"] = formatMap[inputType];

        // Add placeholder if not exists
        if (
          includeAttributes.includes("placeholder") &&
          !attributesToInclude["placeholder"]
        ) {
          attributesToInclude["placeholder"] = formatMap[inputType];
        }
      }

      // Handle tel inputs
      if (inputType === "tel" && !attributesToInclude["pattern"]) {
        attributesToInclude["placeholder"] = "123-456-7890";
      }

      // Handle jQuery/Bootstrap datepickers
      if (["text", ""].includes(inputType)) {
        const classAttr = (node.attributes["class"] || "").toLowerCase();

        if (
          classAttr.includes("datepicker") ||
          classAttr.includes("datetimepicker") ||
          classAttr.includes("daterangepicker") ||
          node.attributes["data-datepicker"]
        ) {
          const dateFormat =
            node.attributes["data-date-format"] || "mm/dd/yyyy";
          attributesToInclude["placeholder"] = dateFormat;
          attributesToInclude["format"] = dateFormat;
        }
      }
    }

    // Include accessibility properties
    if (node.axNode && node.axNode.properties) {
      node.axNode.properties.forEach((prop) => {
        if (includeAttributes.includes(prop.name) && prop.value !== null) {
          let value: string;
          if (typeof prop.value === "boolean") {
            value = prop.value ? "true" : "false";
          } else if (
            typeof prop.value === "object" &&
            prop.value !== null &&
            "value" in prop.value
          ) {
            // Handle CDP boolean objects: {type: "boolean", value: true/false}
            if (typeof prop.value.value === "boolean") {
              value = prop.value.value ? "true" : "false";
            } else {
              // Skip non-boolean objects by not setting a value
              return;
            }
          } else {
            value = String(prop.value).trim();
          }
          if (value) {
            attributesToInclude[prop.name] = value;
          }
        }
      });
    }

    // Special handling for form elements - ensure current value is shown
    if (
      node.tag &&
      ["input", "textarea", "select"].includes(node.tag.toLowerCase())
    ) {
      if (node.axNode && node.axNode.properties) {
        for (const prop of node.axNode.properties) {
          if (
            String(prop.name) === "valuetext" &&
            prop.value !== null &&
            prop.value !== undefined
          ) {
            const valueStr = String(prop.value).trim();
            if (valueStr) {
              attributesToInclude["value"] = valueStr;
              break;
            }
          }
          if (
            String(prop.name) === "value" &&
            prop.value !== null &&
            prop.value !== undefined
          ) {
            const valueStr = String(prop.value).trim();
            if (valueStr && !attributesToInclude["value"]) {
              attributesToInclude["value"] = valueStr;
              break;
            }
          }
        }
      }
    }

    // Add compound component metadata if available
    if (node._compoundChildren && node._compoundChildren.length > 0) {
      const compoundInfo = node._compoundChildren
        .map((child: CompoundChild) => {
          const parts: string[] = [];
          if (child.name) parts.push(`name=${child.name}`);
          if (child.role) parts.push(`role=${child.role}`);
          if (child.valuemin !== undefined && child.valuemin !== null)
            parts.push(`min=${child.valuemin}`);
          if (child.valuemax !== undefined && child.valuemax !== null)
            parts.push(`max=${child.valuemax}`);
          if (child.valuenow !== undefined && child.valuenow !== null)
            parts.push(`current=${child.valuenow}`);

          // Add select-specific information
          if (child.options_count !== undefined && child.options_count !== null)
            parts.push(`count=${child.options_count}`);
          if (child.first_options && child.first_options.length > 0) {
            const optionsStr = child.first_options.slice(0, 4).join("|");
            parts.push(`options=${optionsStr}`);
          }
          if (child.format_hint) parts.push(`format=${child.format_hint}`);

          return parts.length > 0 ? `(${parts.join(",")})` : "";
        })
        .filter((info) => info.length > 0);

      if (compoundInfo.length > 0) {
        attributesToInclude["compound_components"] = compoundInfo.join(",");
      }
    }

    if (Object.keys(attributesToInclude).length === 0) {
      return "";
    }

    // Remove duplicate values
    const orderedKeys = includeAttributes.filter(
      (key) => key in attributesToInclude
    );

    if (orderedKeys.length > 1) {
      const keysToRemove = new Set<string>();
      const seenValues: Record<string, string> = {};

      // Attributes that should never be removed as duplicates
      const protectedAttrs = new Set([
        "format",
        "expected_format",
        "placeholder",
        "value",
        "aria-label",
        "title",
      ]);

      for (const key of orderedKeys) {
        const value = attributesToInclude[key];
        if (value.length > 5) {
          if (value in seenValues && !protectedAttrs.has(key)) {
            keysToRemove.add(key);
          } else {
            seenValues[value] = key;
          }
        }
      }

      keysToRemove.forEach((key) => delete attributesToInclude[key]);
    }

    // Remove attributes that duplicate accessibility data
    const role = node.axNode?.role;
    if (role && node.tag === String(role)) {
      delete attributesToInclude.role;
    }

    // Remove type attribute if it matches the tag name
    if (
      attributesToInclude.type &&
      attributesToInclude.type.toLowerCase() === node.tag?.toLowerCase()
    ) {
      delete attributesToInclude.type;
    }

    // Remove invalid attribute if it's false
    if (attributesToInclude.invalid === "false") {
      delete attributesToInclude.invalid;
    }

    // Handle boolean attributes
    const booleanAttrs = ["required"];
    booleanAttrs.forEach((attr) => {
      if (
        attributesToInclude[attr] &&
        ["false", "0", "no"].includes(attributesToInclude[attr].toLowerCase())
      ) {
        delete attributesToInclude[attr];
      }
    });

    // Remove aria-expanded if we have expanded
    if (attributesToInclude.expanded && attributesToInclude["aria-expanded"]) {
      delete attributesToInclude["aria-expanded"];
    }

    // Remove attributes that duplicate text content
    const attrsToRemoveIfTextMatches = ["aria-label", "placeholder", "title"];
    attrsToRemoveIfTextMatches.forEach((attr) => {
      if (
        attributesToInclude[attr] &&
        attributesToInclude[attr].trim().toLowerCase() ===
          text.trim().toLowerCase()
      ) {
        delete attributesToInclude[attr];
      }
    });

    if (Object.keys(attributesToInclude).length > 0) {
      // Format attributes, wrapping empty values in quotes
      const formattedAttrs = Object.entries(attributesToInclude).map(
        ([key, value]) => {
          const cappedValue =
            value.length > 100 ? value.substring(0, 100) : value;
          if (!cappedValue) {
            return `${key}=''`;
          }
          return `${key}=${cappedValue}`;
        }
      );
      return formattedAttrs.join(" ");
    }

    return "";
  }

  /**
   * Get scroll information text for scrollable elements
   */
  private static getScrollInfoText(node: EnhancedDOMTreeNode): string {
    if (!node.shouldShowScrollInfo) {
      return "";
    }

    const scrollInfo = node.scrollInfo as unknown as ScrollInfo;
    if (!scrollInfo) {
      return "";
    }

    const parts: string[] = [];

    if (
      typeof scrollInfo.scrollWidth === "number" &&
      typeof scrollInfo.clientWidth === "number" &&
      scrollInfo.scrollWidth > scrollInfo.clientWidth
    ) {
      const horizontalPercent = Math.round(
        (scrollInfo.scrollLeft /
          (scrollInfo.scrollWidth - scrollInfo.clientWidth)) *
          100
      );
      parts.push(`horizontal: ${horizontalPercent}%`);
    }

    if (
      typeof scrollInfo.scrollHeight === "number" &&
      typeof scrollInfo.clientHeight === "number" &&
      scrollInfo.scrollHeight > scrollInfo.clientHeight
    ) {
      const verticalPercent = Math.round(
        (scrollInfo.scrollTop /
          (scrollInfo.scrollHeight - scrollInfo.clientHeight)) *
          100
      );
      parts.push(`vertical: ${verticalPercent}%`);
    }

    return parts.length > 0 ? `scroll: ${parts.join(", ")}` : "";
  }

  /**
   * Generate LLM representation for a SimplifiedNode
   * @param node - The SimplifiedNode to generate representation for
   * @returns Promise<string> - LLM-friendly string representation
   */
  async generateLLMRepresentation(node: SimplifiedNode): Promise<string> {
    return await DOMTreeSerializer.serializeTree(node, [
      "role",
      "aria-label",
      "placeholder",
      "value",
      "title",
      "name",
      "type",
      "disabled",
      "required",
      "checked",
      "selected",
      "expanded",
      "format",
      "expected_format",
      "compound_components",
    ]);
  }

  /**
   * Static serialize tree method - main browser-use compatibility
   */
  static async serializeTree(
    node: SimplifiedNode | null,
    includeAttributes: string[],
    depth: number = 0
  ): Promise<string> {
    if (!node) {
      return "";
    }

    // Skip excluded nodes but process their children
    if (node.excludedByParent) {
      const childTexts: string[] = [];
      for (const child of node.children) {
        const childText = await this.serializeTree(
          child,
          includeAttributes,
          depth
        );
        if (childText) {
          childTexts.push(childText);
        }
      }
      return childTexts.join("\n");
    }

    const formattedText: string[] = [];
    const depthStr = "\t".repeat(depth);
    let nextDepth = depth;

    if (node.originalNode.tag) {
      // Skip displaying nodes marked as shouldDisplay=false
      if (!node.shouldDisplay) {
        const childTexts: string[] = [];
        for (const child of node.children) {
          const childText = await this.serializeTree(
            child,
            includeAttributes,
            depth
          );
          if (childText) {
            childTexts.push(childText);
          }
        }
        return childTexts.join("\n");
      }

      // Special handling for SVG elements
      if (node.originalNode.tag.toLowerCase() === "svg") {
        let shadowPrefix = "";
        if (node.isShadowHost) {
          shadowPrefix = "|SHADOW(closed)|";
        }

        let line = `${depthStr}${shadowPrefix}`;

        // Add interactive marker if clickable
        if (node.interactiveIndex !== null && !node.excludedByBoundingBox) {
          const newPrefix = node.isNew ? "*" : "";
          line += `${newPrefix}[${node.originalNode.nodeId}]`;
        }

        line += "<svg";

        const attributesString = this.buildAttributesString(
          node.originalNode,
          includeAttributes,
          ""
        );
        if (attributesString) {
          line += ` ${attributesString}`;
        }

        line += " /> <!-- SVG content collapsed -->";
        formattedText.push(line);

        return formattedText.join("\n");
      }

      // Skip elements that are ignored by paint order filtering or bounding box filtering
      if (node.ignoredByPaintOrder || node.excludedByBoundingBox) {
        // Process children but skip this element entirely
        for (const child of node.children) {
          const childText = await DOMTreeSerializer.serializeTree(
            child,
            includeAttributes,
            depth
          );
          if (childText) {
            formattedText.push(childText);
          }
        }
        return formattedText.join("\n");
      }

      // Add element if interactive, scrollable, or iframe
      const isScrollable =
        node.originalNode.isActuallyScrollable ||
        node.originalNode.isScrollable;
      const shouldShowScroll = node.originalNode.shouldShowScrollInfo;

      if (
        (node.interactiveIndex !== null && !node.excludedByBoundingBox) ||
        isScrollable ||
        node.originalNode.tag.toUpperCase() === "IFRAME" ||
        node.originalNode.tag.toUpperCase() === "FRAME"
      ) {
        nextDepth++;
      }

      // Build attributes string
      const textContent = "";
      const attributesString = this.buildAttributesString(
        node.originalNode,
        includeAttributes,
        textContent
      );

      // Build the line with shadow host indicator
      let shadowPrefix = "";
      if (node.isShadowHost) {
        shadowPrefix = "|SHADOW(open)|";
      }

      let line: string;

      if (shouldShowScroll && node.interactiveIndex === null) {
        // Scrollable container but not clickable
        line = `${depthStr}${shadowPrefix}|SCROLL|<${node.originalNode.tag}`;
      } else if (
        node.interactiveIndex !== null &&
        !node.excludedByBoundingBox
      ) {
        // Clickable (and possibly scrollable)
        const newPrefix = node.isNew ? "*" : "";
        const scrollPrefix = shouldShowScroll ? "|SCROLL[" : "[";
        line = `${depthStr}${shadowPrefix}${newPrefix}${scrollPrefix}${node.originalNode.nodeId}]<${node.originalNode.tag}`;
      } else if (node.originalNode.tag.toUpperCase() === "IFRAME") {
        line = `${depthStr}${shadowPrefix}|IFRAME|<${node.originalNode.tag}`;
      } else if (node.originalNode.tag.toUpperCase() === "FRAME") {
        line = `${depthStr}${shadowPrefix}|FRAME|<${node.originalNode.tag}`;
      } else {
        line = `${depthStr}${shadowPrefix}<${node.originalNode.tag}`;
      }

      if (attributesString) {
        line += ` ${attributesString}`;
      }

      line += " />";

      // Add scroll information when we should show it
      if (shouldShowScroll) {
        const scrollInfoText = this.getScrollInfoText(node.originalNode);
        if (scrollInfoText) {
          line += ` (${scrollInfoText})`;
        }
      }

      formattedText.push(line);
    }

    // Handle text nodes
    if (
      node.originalNode.nodeType === NodeType.TEXT_NODE &&
      node.originalNode.nodeValue
    ) {
      const isVisible = node.originalNode.isVisible;
      const textValue = node.originalNode.nodeValue.trim();

      if (isVisible && textValue && textValue.length > 1) {
        formattedText.push(`${depthStr}${textValue}`);
      }
    }

    // Enhanced serialization: skip empty elements that have no meaningful content
    // and no children that would be serialized
    if (node.originalNode.tag && node.children.length === 0) {
      // Check if this element should be serialized based on criteria
      const shouldSerialize =
        node.interactiveIndex !== null || // Interactive elements
        node.originalNode.isActuallyScrollable || // Scrollable elements
        node.originalNode.isScrollable ||
        node.originalNode.shouldShowScrollInfo ||
        (node.originalNode.tag &&
          ["iframe", "frame", "img"].includes(
            node.originalNode.tag.toLowerCase()
          )) ||
        DOMTreeSerializer.hasSemanticMeaningStatic(node); // Elements with semantic value

      if (!shouldSerialize) {
        // Skip this element entirely - don't add anything to formattedText
        return formattedText.join("\n");
      }
    }

    // Process children
    for (const child of node.children) {
      const childText = await this.serializeTree(
        child,
        includeAttributes,
        nextDepth
      );
      if (childText) {
        formattedText.push(childText);
      }
    }

    return formattedText.join("\n");
  }

  /**
   * Apply paint order filtering to a complete simplified tree
   *
   * This method implements the proper paint order filtering algorithm:
   * 1. Collect all nodes with paint order information from the complete tree
   * 2. Group nodes by paint order value
   * 3. Process elements in descending paint order (highest to lowest)
   * 4. Mark occluded elements so they can be filtered out during serialization
   *
   * @param rootNode The root SimplifiedNode to process
   */
  private async applyPaintOrderFiltering(
    rootNode: SimplifiedNode
  ): Promise<void> {
    try {
      // Phase 1: Collect all nodes with paint order information
      const nodesWithPaintOrder: SimplifiedNode[] = [];

      const collectNodesWithPaintOrder = (node: SimplifiedNode) => {
        if (
          node.originalNode?.snapshotNode?.paintOrder !== null &&
          node.originalNode?.snapshotNode?.paintOrder !== undefined &&
          node.originalNode?.snapshotNode?.bounds
        ) {
          nodesWithPaintOrder.push(node);
        }

        // Recursively process children
        if (node.children) {
          for (const child of node.children) {
            collectNodesWithPaintOrder(child);
          }
        }
      };

      collectNodesWithPaintOrder(rootNode);

      if (nodesWithPaintOrder.length === 0) {
        this.logger.debug(
          "No nodes with paint order found, skipping paint order filtering"
        );
        return;
      }

      // Phase 2: Group nodes by paint order
      const groupedByPaintOrder = new Map<number, SimplifiedNode[]>();

      for (const node of nodesWithPaintOrder) {
        const paintOrder = node.originalNode.snapshotNode!.paintOrder;
        if (paintOrder !== undefined && !groupedByPaintOrder.has(paintOrder)) {
          groupedByPaintOrder.set(paintOrder, []);
        }
        if (paintOrder !== undefined) {
          groupedByPaintOrder.get(paintOrder)!.push(node);
        }
      }

      // Phase 3: Process elements in descending paint order (highest to lowest)
      // Reset paint order state for fresh processing
      this.paintOrderRects = [];
      this.paintOrderProcessed.clear();

      const sortedPaintOrders = Array.from(groupedByPaintOrder.keys()).sort(
        (a, b) => b - a
      );

      for (const paintOrder of sortedPaintOrders) {
        const nodes = groupedByPaintOrder.get(paintOrder)!;

        for (const node of nodes) {
          const bounds = node.originalNode.snapshotNode!.bounds;
          if (!bounds) continue;

          const elementRect = this.createPaintOrderRect(
            bounds.x,
            bounds.y,
            bounds.x + bounds.width,
            bounds.y + bounds.height
          );

          if (!elementRect) {
            continue;
          }

          // Check if this element is occluded by higher paint order elements
          if (this.paintOrderContains(elementRect)) {
            // Mark this node as ignored by paint order
            node.ignoredByPaintOrder = true;
            this.logger.debug(
              `Node ${node.originalNode.nodeId} occluded by higher paint order elements`
            );
          } else {
            // Don't add to the union if element should be excluded from occlusion calculation
            if (!this.shouldExcludeFromOcclusion(node.originalNode)) {
              this.paintOrderAdd(elementRect);
            }
          }
        }

        // Mark this paint order as processed
        this.paintOrderProcessed.add(paintOrder);
      }

      this.logger.info(
        `Paint order filtering completed: processed ${nodesWithPaintOrder.length} nodes across ${sortedPaintOrders.length} paint order levels`
      );
    } catch (error) {
      this.logger.error("Error in applyPaintOrderFiltering:", error);
    }
  }

  // ==================== PAINT ORDER METHODS ====================

  /**
   * Create a paint order rectangle
   */
  private createPaintOrderRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): PaintOrderRect {
    if (!(x1 <= x2 && y1 <= y2)) {
      throw new Error("Invalid rectangle coordinates");
    }
    return { x1, y1, x2, y2 };
  }

  /**
   * Check if rectangle a intersects with rectangle b
   */
  private rectIntersects(a: PaintOrderRect, b: PaintOrderRect): boolean {
    return !(a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1);
  }

  /**
   * Check if rectangle a completely contains rectangle b
   */
  private rectContains(a: PaintOrderRect, b: PaintOrderRect): boolean {
    return a.x1 <= b.x1 && a.y1 <= b.y1 && a.x2 >= b.x2 && a.y2 >= b.y2;
  }

  /**
   * Split rectangle a by rectangle b, returning a \ b
   * Returns up to 4 rectangles
   */
  private splitDiff(a: PaintOrderRect, b: PaintOrderRect): PaintOrderRect[] {
    const parts: PaintOrderRect[] = [];

    // Bottom slice
    if (a.y1 < b.y1) {
      parts.push({ x1: a.x1, y1: a.y1, x2: a.x2, y2: b.y1 });
    }

    // Top slice
    if (b.y2 < a.y2) {
      parts.push({ x1: a.x1, y1: b.y2, x2: a.x2, y2: a.y2 });
    }

    // Middle (vertical) strip: y overlap is [max(a.y1,b.y1), min(a.y2,b.y2)]
    const yLo = Math.max(a.y1, b.y1);
    const yHi = Math.min(a.y2, b.y2);

    // Left slice
    if (a.x1 < b.x1) {
      parts.push({ x1: a.x1, y1: yLo, x2: b.x1, y2: yHi });
    }

    // Right slice
    if (b.x2 < a.x2) {
      parts.push({ x1: b.x2, y1: yLo, x2: a.x2, y2: yHi });
    }

    return parts;
  }

  /**
   * Check if rectangle r is fully covered by the current paint order union
   */
  private paintOrderContains(r: PaintOrderRect): boolean {
    if (this.paintOrderRects.length === 0) {
      return false;
    }

    let stack = [r];
    for (const s of this.paintOrderRects) {
      const newStack: PaintOrderRect[] = [];
      for (const piece of stack) {
        if (this.rectContains(s, piece)) {
          // piece completely gone
          continue;
        }
        if (this.rectIntersects(piece, s)) {
          newStack.push(...this.splitDiff(piece, s));
        } else {
          newStack.push(piece);
        }
      }
      if (newStack.length === 0) {
        // everything eaten – covered
        return true;
      }
      stack = newStack;
    }
    return false; // something survived
  }

  /**
   * Insert rectangle r into paint order union unless it is already covered
   * Returns true if the union grew
   */
  private paintOrderAdd(r: PaintOrderRect): boolean {
    if (this.paintOrderContains(r)) {
      return false;
    }

    let pending = [r];
    let i = 0;
    while (i < this.paintOrderRects.length) {
      const s = this.paintOrderRects[i];
      const newPending: PaintOrderRect[] = [];
      let changed = false;

      for (const piece of pending) {
        if (this.rectIntersects(piece, s)) {
          newPending.push(...this.splitDiff(piece, s));
          changed = true;
        } else {
          newPending.push(piece);
        }
      }

      pending = newPending;
      if (changed) {
        // s unchanged; proceed with next existing rectangle
        i += 1;
      } else {
        i += 1;
      }
    }

    // Any left-over pieces are new, non-overlapping areas
    this.paintOrderRects.push(...pending);
    return true;
  }

  /**
   * Apply bounding box filtering to a complete simplified tree
   *
   * This method implements bounding box filtering as a standalone processing stage
   * that runs after paint order filtering but before tree optimization.
   * It handles size-based filtering and bounds propagation.
   *
   * @param rootNode The root SimplifiedNode to process
   */
  private async applyBoundingBoxFiltering(
    rootNode: SimplifiedNode
  ): Promise<void> {
    try {
      if (!this.config.enableBoundingBoxFiltering) {
        this.logger.debug("Bounding box filtering disabled");
        return;
      }

      const startTime = Date.now();
      let totalNodes = 0;
      let excludedNodes = 0;
      let containedNodes = 0;
      let sizeFilteredNodes = 0;

      // Mark excluded nodes for later processing
      const markExcludedNodes = (node: SimplifiedNode): boolean => {
        totalNodes++;
        const shouldKeep = this.processBoundingBoxNode(node);
        if (!shouldKeep) {
          excludedNodes++;
          node.excludedByBoundingBox = true;

          // Determine exclusion reason for statistics
          if (!this.isWithinValidSizeRange(node.originalNode)) {
            sizeFilteredNodes++;
            node.exclusionReason = "size_filtered";
          } else if (
            this.config.boundingBoxConfig?.enablePropagationFiltering
          ) {
            const propagatingParent = this.findPropagatingParent(node);
            if (
              propagatingParent &&
              this.isContainedInParent(node, propagatingParent)
            ) {
              containedNodes++;
              node.exclusionReason = "contained";
            }
          }
        }

        // Process children recursively
        for (const child of node.children) {
          markExcludedNodes(child);
        }

        return shouldKeep;
      };

      markExcludedNodes(rootNode);

      const processingTime = Date.now() - startTime;
      this.logger.info(
        `Bounding box filtering completed: ${excludedNodes}/${totalNodes} nodes excluded ` +
          `(${sizeFilteredNodes} size filtered, ${containedNodes} contained) in ${processingTime}ms`
      );
    } catch (error) {
      this.logger.error("Error in applyBoundingBoxFiltering:", error);
    }
  }

  /**
   * Check if element should be excluded from occlusion calculation due to transparency
   */
  private shouldExcludeFromOcclusion(node: EnhancedDOMTreeNode): boolean {
    if (!node.snapshotNode?.computedStyles) {
      return false;
    }

    // Check opacity threshold
    const opacity = parseFloat(node.snapshotNode.computedStyles.opacity || "1");
    if (opacity < OPACITY_THRESHOLD) {
      return true;
    }

    // Check for transparent background
    const backgroundColor =
      node.snapshotNode.computedStyles["background-color"];
    if (backgroundColor === TRANSPARENT_BACKGROUND) {
      return true;
    }

    return false;
  }

  /**
   * Get current configuration
   */
  getConfig(): SerializationConfig {
    return this.config;
  }
}
