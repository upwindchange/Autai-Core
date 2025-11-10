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
import { applyPaintOrderFiltering } from "./PaintOrderFiltering";
import { applyBoundingBoxFiltering } from "./boundingBoxFiltering";
import { applyTreeOptimization, hasSemanticMeaning } from "./TreeOptimization";

// Note: Icon detection attributes and patterns (ICON_ATTRIBUTES, ICON_CLASS_PATTERNS)
// are available if needed for icon-based filtering logic

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

  constructor(
    _webContents: WebContents,
    config: Partial<SerializationConfig> = {}
  ) {
    this.config = {
      enablePaintOrderFiltering: true,
      enableBoundingBoxFiltering: true,
      opacityThreshold: 0.8,
      containmentThreshold: 0.99,
      maxInteractiveElements: 1000,
      ...config,
    };

    // Initialize the interactive element detector
    this.interactiveDetector = new InteractiveElementDetector(_webContents);
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
    await applyPaintOrderFiltering(simplifiedRoot, this.config);
    timings.paintOrderFiltering = Date.now() - paintOrderStart;

    // Apply tree optimization to remove empty branches
    const optimizeStart = Date.now();
    applyTreeOptimization(simplifiedRoot);
    timings.optimizeTreeStructure = Date.now() - optimizeStart;
    const selectorMap = this.buildSelectorMap(simplifiedRoot);
    const stats = this.calculateStats(simplifiedRoot);

    // Apply bounding box filtering as standalone stage
    const boundingBoxStart = Date.now();
    await applyBoundingBoxFiltering(
      simplifiedRoot,
      this.config,
      this.interactiveDetector
    );
    timings.boundingBoxFiltering = Date.now() - boundingBoxStart;

    // Log LLM representation for debugging
    try {
      const llmRep = await this.generateLLMRepresentation(simplifiedRoot);
      this.logger.debug("=== LLM DOM Representation ===");
      this.logger.debug(llmRep);
      this.logger.debug("=== End LLM DOM Representation ===");
    } catch (error) {
      this.logger.error("Failed to generate LLM representation:", error);
    }

    timings.total = Date.now() - startTime;

    return {
      serializedState: {
        root: simplifiedRoot,
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
        hasSemanticMeaning(node); // Elements with semantic value

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
   * Get current configuration
   */
  getConfig(): SerializationConfig {
    return this.config;
  }
}
