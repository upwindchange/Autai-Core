# DOM Service Architecture Workflow

This mermaid chart illustrates the high-level workflow of the DOM Service architecture, showing how the three main classes (DOMService, DOMTreeSerializer, and InteractiveElementDetector) interact. The chart focuses on the main workflow and 6-tier detection system entry points without going into detailed method implementations.

```mermaid
graph TB
    %% Main Classes
    DOM[DOMService] --> SER[DOMTreeSerializer]
    SER --> DET[InteractiveElementDetector]

    %% DOM Service Methods
    subgraph "DOMService (Main Orchestrator)"
        DOM_INIT["initialize()"]
        DOM_GET["getDOMTree()"]
        DOM_SER["getSerializedDOMTree()"]
        DOM_CHANGE["getDOMTreeWithChangeDetection()"]
        DOM_DESTROY["destroy()"]
        DOM_STATUS["getStatus()"]
    end

    %% DOM Service Internal Methods
    subgraph "DOMService Internal Methods"
        DOM_ALL["getAllTrees()"]
        DOM_BUILD["buildEnhancedDOMTree()"]
        DOM_LOOKUP["buildSnapshotLookup()"]
        DOM_CONSTRUCT["constructEnhancedNode()"]
        DOM_COUNT["countNodes()"]
    end

    %% DOM Tree Serializer Methods
    subgraph "DOMTreeSerializer (Single-pass Processing)"
        SER_SERIALIZE["serializeDOMTree()"]
        SER_SIMPLIFY["createSimplifiedNode()"]
        SER_SELECTOR["buildSelectorMap()"]
        SER_STATS["calculateStats()"]
        SER_CONFIG["getConfig()"]
    end

    %% Interactive Element Detector Methods
    subgraph "InteractiveElementDetector (6-Tier Detection)"
        DET_INTERACTIVE["isInteractive()"]
    end

    %% Detection Tiers (Entry Points Only)
    subgraph "6-Tier Detection System"
        TIER1["Tier 1: Quick Filters + Visual<br/>• Node type validation<br/>• Skip HTML/BODY elements<br/>• iframe size requirements<br/>• Visual filtering (opacity, visibility)"]
        TIER2["Tier 2: Search Detection<br/>• Search indicators<br/>• Specialized interactive tags"]
        TIER3["Tier 3: Attribute Detection<br/>• Event handlers<br/>• ARIA attributes<br/>• Input attributes"]
        TIER4["Tier 4: Accessibility Analysis<br/>• Accessibility properties<br/>• Accessibility roles"]
        TIER5["Tier 5: Visual/Structural<br/>• Icon detection<br/>• Cursor style analysis"]
        TIER6["Tier 6: Compound Controls<br/>• Virtualization<br/>• Component building"]
    end

    
    %% Main Workflow Connections
    DOM_INIT --> DOM_GET
    DOM_GET --> DOM_ALL
    DOM_ALL --> DOM_BUILD
    DOM_BUILD --> DOM_LOOKUP
    DOM_BUILD --> DOM_CONSTRUCT
    DOM_CONSTRUCT --> DOM_COUNT
    DOM_SER --> DOM_GET
    DOM_GET --> SER_SERIALIZE
    DOM_CHANGE --> DOM_GET

    %% Enhanced to Simplified Node Transformation (Downstream Flow)
    DOM_CONSTRUCT -.->|"Enhanced Nodes Input"| SER_SIMPLIFY
    DOM_BUILD -.->|"Enhanced Tree Input"| SER_SERIALIZE

    %% Serializer Workflow (Downstream Processing)
    SER_SERIALIZE --> SER_SIMPLIFY
    SER_SIMPLIFY --> DET_INTERACTIVE
    SER_SERIALIZE --> SER_SELECTOR
    SER_SERIALIZE --> SER_STATS

    %% Detection Workflow
    DET_INTERACTIVE --> TIER1

    %% Tier Progression (Sequential Flow)
    TIER1 -.-> TIER2
    TIER2 -.-> TIER3
    TIER3 -.-> TIER4
    TIER4 -.-> TIER5
    TIER5 -.-> TIER6

    %% Styling
    classDef serviceClass fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef internalClass fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef serializerClass fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef detectorClass fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef tierClass fill:#fce4ec,stroke:#880e4f,stroke-width:2px

    class DOM,DOM_INIT,DOM_GET,DOM_SER,DOM_CHANGE,DOM_DESTROY,DOM_STATUS serviceClass
    class DOM_ALL,DOM_BUILD,DOM_LOOKUP,DOM_CONSTRUCT,DOM_COUNT internalClass
    class SER,SER_SERIALIZE,SER_SIMPLIFY,SER_SELECTOR,SER_STATS,SER_CONFIG serializerClass
    class DET,DET_INTERACTIVE detectorClass
    class TIER1,TIER2,TIER3,TIER4,TIER5,TIER6 tierClass
```

## Summary

This workflow diagram illustrates how the three main classes work together:

1. **DOMService**: The main orchestrator that manages CDP connections, builds enhanced DOM trees, and provides the primary API
2. **DOMTreeSerializer**: Performs single-pass serialization, creating simplified DOM structures optimized for LLM consumption
3. **InteractiveElementDetector**: Implements a comprehensive 6-tier detection system for identifying interactive elements and virtualizing compound controls

The flow shows how CDP commands are used throughout the process, from initial DOM tree extraction to interactive element highlighting and compound control virtualization.