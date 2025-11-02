/**
 * Direct CDP integration for DOM manipulation and analysis
 */

import type { WebContents } from "electron";
import log from "electron-log/main";
import type { Protocol as CDP } from "devtools-protocol";

import type {
  IDOMService,
  EnhancedDOMTreeNode,
  TargetAllTrees,
  SerializedDOMState,
  SerializationConfig,
  SerializationTiming,
  SerializationStats,
  EnhancedSnapshotNode,
} from "@shared/dom";
import { DOMTreeSerializer } from "./serializer/DOMTreeSerializer";
import { sendCDPCommand, attachDebugger, detachDebugger, isDebuggerAttached } from "./utils/DOMUtils";

export class DOMService implements IDOMService {
  private webContents: WebContents;
  private logger = log.scope("DOMService");
  private serializer: DOMTreeSerializer;
  private previousState?: SerializedDOMState;

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    this.serializer = new DOMTreeSerializer(webContents);
    this.logger.info("DOMService initialized - direct CDP integration");
  }

  
  async getDOMTree(): Promise<EnhancedDOMTreeNode> {
    if (!isDebuggerAttached(this.webContents)) {
      throw new Error("Debugger not attached - call initialize() first");
    }

    try {
      this.logger.debug("Getting DOM tree");

      await sendCDPCommand(this.webContents, "DOM.enable", undefined, this.logger);
      this.logger.debug("DOM agent enabled successfully");

      const trees = await this.getAllTrees();

      this.logger.debug("Building enhanced DOM tree from CDP data");
      const enhancedTree = this.buildEnhancedDOMTree(trees);

      const nodeCount = this.countNodes(enhancedTree);
      this.logger.info(`DOM tree built successfully with ${nodeCount} nodes`);
      return enhancedTree;
    } catch (error) {
      this.logger.error(`Failed to get DOM tree: ${error}`);
      throw error;
    }
  }

  /**
   * Get all CDP tree data for DOM analysis
   */
  private async getAllTrees(): Promise<TargetAllTrees> {
    try {
      this.logger.debug("Collecting CDP data");

      // Get DOM data in parallel with correct CDP typing
      const [domTree, snapshot, axTree] = await Promise.allSettled([
        sendCDPCommand<CDP.DOM.GetDocumentResponse>(this.webContents, "DOM.getDocument", {
          depth: -1,
          pierce: true,
        }, this.logger),
        sendCDPCommand<CDP.DOMSnapshot.GetSnapshotResponse>(
          this.webContents,
          "DOMSnapshot.captureSnapshot",
          {
            computedStyles: [
              "display",
              "visibility",
              "opacity",
              "cursor",
              "position",
            ],
            includePaintOrder: true,
            includeDOMRects: true,
            includeBlendedBackgroundColors: false,
            includeTextColorOpacities: false,
          },
          this.logger
        ),
        sendCDPCommand<CDP.Accessibility.GetFullAXTreeResponse>(
          this.webContents,
          "Accessibility.getFullAXTree",
          undefined,
          this.logger
        ),
      ]);

      return {
        snapshot:
          snapshot.status === "fulfilled"
            ? snapshot.value
            : {
                domNodes: [],
                layoutTreeNodes: [],
                computedStyles: [],
              },
        domTree: domTree.status === "fulfilled" ? domTree.value : null,
        axTree: axTree.status === "fulfilled" ? axTree.value : { nodes: [] },
        devicePixelRatio: 1.0, // Simplified - use basic scaling
        cdpTiming: { cdp_calls_total: 0 },
      };
    } catch (error) {
      this.logger.error(`CDP data collection failed: ${error}`);
      throw error;
    }
  }

  /**
   * Build enhanced DOM tree from CDP data (simplified DOMTreeBuilder merge)
   */
  private buildEnhancedDOMTree(trees: TargetAllTrees): EnhancedDOMTreeNode {
    const { snapshot, domTree, axTree } = trees;

    this.logger.debug("Building enhanced DOM tree", {
      hasDomTree: !!domTree,
      hasSnapshot: !!snapshot,
      snapshotDomNodes: snapshot?.domNodes?.length || 0,
      axTreeNodes: axTree?.nodes?.length || 0,
    });

    // Build lookups
    const axTreeLookup: Record<number, CDP.Accessibility.AXNode> = {};
    for (const axNode of axTree.nodes) {
      if (axNode.backendDOMNodeId) {
        axTreeLookup[axNode.backendDOMNodeId] = axNode;
      }
    }

    const snapshotLookup = this.buildSnapshotLookup(snapshot, 1.0);
    const nodeLookup: Record<number, EnhancedDOMTreeNode> = {};

    // Build enhanced tree
    if (!domTree) {
      throw new Error("DOM tree is null - cannot build enhanced tree");
    }
    return this.constructEnhancedNode(
      domTree.root,
      axTreeLookup,
      snapshotLookup,
      nodeLookup,
      "default"
    );
  }

  /**
   * Build snapshot lookup using official DOMSnapshot structure
   */
  private buildSnapshotLookup(
    snapshot: CDP.DOMSnapshot.GetSnapshotResponse,
    _devicePixelRatio: number
  ): Record<number, EnhancedSnapshotNode> {
    const lookup: Record<number, EnhancedSnapshotNode> = {};

    if (
      !snapshot.domNodes ||
      !snapshot.layoutTreeNodes ||
      !snapshot.computedStyles
    ) {
      return lookup;
    }

    // Create index -> ComputedStyle mapping
    const computedStyleMap = new Map<number, CDP.DOMSnapshot.ComputedStyle>();
    snapshot.computedStyles.forEach((style, index) => {
      computedStyleMap.set(index, style);
    });

    // Build lookup from layout tree nodes (using domNodeIndex to map to DOM nodes)
    for (const layoutNode of snapshot.layoutTreeNodes) {
      const domNode = snapshot.domNodes[layoutNode.domNodeIndex];
      if (!domNode) continue;

      const backendNodeId = domNode.backendNodeId;

      let bounds: CDP.DOM.Rect | null = null;
      let computedStyles: Record<string, string> | null = null;
      const isClickable = false; // Not available in official types, default to false

      // Create bounds from layout node
      if (layoutNode.boundingBox) {
        bounds = layoutNode.boundingBox;
      }

      // Get computed styles
      if (layoutNode.styleIndex !== undefined) {
        const style = computedStyleMap.get(layoutNode.styleIndex);
        if (style?.properties) {
          computedStyles = {};
          for (const prop of style.properties) {
            computedStyles[prop.name] = prop.value;
          }
        }
      }

      lookup[backendNodeId] = {
        bounds,
        computedStyles,
        isClickable,
      };
    }

    return lookup;
  }

  /**
   * Construct enhanced node (simplified)
   */
  private constructEnhancedNode(
    node: CDP.DOM.Node,
    axTreeLookup: Record<number, CDP.Accessibility.AXNode>,
    snapshotLookup: Record<number, EnhancedSnapshotNode>,
    nodeLookup: Record<number, EnhancedDOMTreeNode>,
    targetId: string
  ): EnhancedDOMTreeNode {
    // Validate node
    if (!node || typeof node.nodeId === "undefined") {
      this.logger.error(
        "Invalid node provided to constructEnhancedNode:",
        node
      );
      throw new Error("Invalid node: nodeId is undefined");
    }

    // Check if already processed
    if (nodeLookup[node.nodeId]) {
      return nodeLookup[node.nodeId];
    }

    // Parse attributes
    const attributes: Record<string, string> = {};
    if (node.attributes) {
      for (let i = 0; i < node.attributes.length; i += 2) {
        attributes[node.attributes[i]] = node.attributes[i + 1] || "";
      }
    }

    // Get snapshot data
    const snapshotData = snapshotLookup[node.backendNodeId];
    const axNode = axTreeLookup[node.backendNodeId];

    // Create enhanced node
    const enhancedNode: EnhancedDOMTreeNode = {
      nodeId: node.nodeId,
      backendNodeId: node.backendNodeId,
      nodeType: node.nodeType,
      nodeName: node.nodeName,
      localName: node.localName,
      nodeValue: node.nodeValue || "",
      attributes,
      isScrollable: false, // Will be calculated from snapshot data if available
      isVisible: true, // Will be calculated later
      absolutePosition: snapshotData?.bounds || null,
      targetId,
      frameId: null, // DOMNode doesn't have frameId in official types
      sessionId: null,
      shadowRootType: null, // Will be set if this is a shadow root
      shadowRoots: [],
      parentNode: null,
      childrenNodes: [],
      contentDocument: null,
      axNode: axNode || null,
      snapshotNode: snapshotData,
      elementIndex: null,
      _compoundChildren: [],
      uuid: Math.random().toString(36).substring(2, 15),

      // Simplified getters
      get tag() {
        return this.nodeName.toLowerCase();
      },
      get actualChildren() {
        return this.childrenNodes || [];
      },
      get childrenAndShadowRoots() {
        const children = [...(this.childrenNodes || [])];
        if (this.shadowRoots) children.push(...this.shadowRoots);
        return children;
      },
      get parent() {
        return this.parentNode;
      },
      get isActuallyScrollable() {
        return this.isScrollable || false;
      },
      get shouldShowScrollInfo(): boolean {
        return (this.isScrollable || false) && this.tag
          ? ["body", "html"].includes(this.tag)
          : false;
      },
      get scrollInfo() {
        return null;
      },
      get elementHash() {
        return 0;
      },
      };

    // Store in lookup
    nodeLookup[node.nodeId] = enhancedNode;

    // Process children recursively
    if (node.children && Array.isArray(node.children)) {
      enhancedNode.childrenNodes = [];
      for (const child of node.children) {
        // Validate child before processing - child should be a DOM node directly
        if (!child || typeof child.nodeId === "undefined") {
          this.logger.warn("Skipping invalid child node:", child);
          continue;
        }

        const childNode = this.constructEnhancedNode(
          child,
          axTreeLookup,
          snapshotLookup,
          nodeLookup,
          targetId
        );
        childNode.parentNode = enhancedNode;
        enhancedNode.childrenNodes.push(childNode);
      }
    }

    // Calculate visibility
    if (snapshotData?.computedStyles) {
      const styles = snapshotData.computedStyles;
      enhancedNode.isVisible =
        styles.display !== "none" &&
        styles.visibility !== "hidden" &&
        parseFloat(styles.opacity || "1") > 0;
    } else {
      enhancedNode.isVisible = true;
    }

    return enhancedNode;
  }

  /**
   * Count total nodes in tree
   */
  private countNodes(node: EnhancedDOMTreeNode): number {
    let count = 1;
    for (const child of node.childrenNodes || []) {
      count += this.countNodes(child);
    }
    return count;
  }

  /**
   * Initialize the DOM service
   */
  async initialize(): Promise<void> {
    try {
      await attachDebugger(this.webContents, this.logger);
      this.logger.info("DOMService initialized");
    } catch (error) {
      this.logger.error("Failed to initialize DOMService:", error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    try {
      await detachDebugger(this.webContents, this.logger);
      this.previousState = undefined;
      this.logger.info("DOMService destroyed");
    } catch (error) {
      this.logger.error("Error during DOMService destruction:", error);
    }
  }

  /**
   * Get the underlying debugger (for advanced usage)
   */
  getDebugger() {
    return this.webContents.debugger;
  }

  /**
   * Get the webContents instance
   */
  getWebContents(): WebContents {
    return this.webContents;
  }

  /**
   * Get viewport information (simplified)
   */
  async getViewportInfo() {
    return {
      width: 1920,
      height: 1080,
      devicePixelRatio: 1.0,
      scrollX: 0,
      scrollY: 0,
    };
  }

  /**
   * Get frame tree (simplified)
   */
  async getFrameTree() {
    return {
      frameTree: {
        frame: {
          id: "default",
          url: "",
          name: "",
          securityOrigin: "",
        },
      },
    };
  }

  /**
   * Get targets for current page (simplified)
   */
  async getTargetsForPage() {
    return {
      pageSession: {
        targetId: "default",
        type: "page",
        title: "",
        url: "",
        attached: true,
      },
      iframeSessions: [],
    };
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return isDebuggerAttached(this.webContents);
  }

  /**
   * Get serialized DOM tree optimized for LLM consumption
   */
  async getSerializedDOMTree(
    previousState?: SerializedDOMState,
    config?: Partial<SerializationConfig>
  ): Promise<{
    serializedState: SerializedDOMState;
    timing: SerializationTiming;
    stats: SerializationStats;
  }> {
    if (!isDebuggerAttached(this.webContents)) {
      throw new Error("Debugger not attached - call initialize() first");
    }

    try {
      this.logger.debug("Getting serialized DOM tree");

      const domTree = await this.getDOMTree();
      const result = await this.serializer.serializeDOMTree(
        domTree,
        previousState,
        config
      );

      this.previousState = result.serializedState;
      this.logger.info(
        `DOM tree serialized: ${result.stats.interactiveElements} interactive elements`
      );

      // Convert timing to expected format
      const convertedTiming: SerializationTiming = {
        total: result.timing.serialize_dom_tree_total,
        createSimplifiedTree: 0,
        paintOrderFiltering: 0,
        optimizeTreeStructure: 0,
        boundingBoxFiltering: 0,
        assignInteractiveIndices: 0,
        markNewElements: 0,
      };

      return {
        serializedState: result.serializedState,
        timing: convertedTiming,
        stats: result.stats,
      };
    } catch (error) {
      this.logger.error(`Failed to serialize DOM tree: ${error}`);
      throw error;
    }
  }

  /**
   * Get DOM tree with change detection
   */
  async getDOMTreeWithChangeDetection(
    previousState?: SerializedDOMState
  ): Promise<{
    domTree: EnhancedDOMTreeNode;
    serializedState?: SerializedDOMState;
    hasChanges: boolean;
    changeCount: number;
  }> {
    if (!isDebuggerAttached(this.webContents)) {
      throw new Error("Debugger not attached - call initialize() first");
    }

    try {
      const domTree = await this.getDOMTree();

      if (!previousState) {
        const serializedResult = await this.serializer.serializeDOMTree(
          domTree
        );
        return {
          domTree,
          serializedState: serializedResult.serializedState,
          hasChanges: true,
          changeCount: serializedResult.stats.totalNodes,
        };
      }

      const serializedResult = await this.serializer.serializeDOMTree(
        domTree,
        previousState
      );
      const changeCount = serializedResult.stats.newElements;
      const hasChanges = changeCount > 0;

      return {
        domTree,
        serializedState: serializedResult.serializedState,
        hasChanges,
        changeCount,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get DOM tree with change detection: ${error}`
      );
      throw error;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isInitialized: true,
      isAttached: isDebuggerAttached(this.webContents),
      webContentsId: this.webContents.id,
    };
  }

  /**
   * Get previous serialized state for change detection
   */
  getPreviousState(): SerializedDOMState | undefined {
    return this.previousState;
  }
}
