Missing Features Ranked by Implementation Difficulty

EASY (1-2 hours each)

1. IFrame Size Detection

- What: Filters small iframes (< 100x100px) that are unlikely to be interactive     
- Why: Reduces noise from tiny decorative/ad iframes
- Implementation: Check node.snapshotNode.bounds for width/height > 100px
- Status: checkIframeSize() is currently a placeholder

2. Icon Element Detection

- What: Detects small interactive elements (10-50px) like search icons, close       
buttons
- Why: Catches small but important interactive elements often missed
- Implementation: Size checking + attribute validation for interactive
properties
- Status: checkIconElements() is currently a placeholder

MEDIUM (3-5 hours each)

3. Enhanced ARIA Role Detection

- What: Expands interactive role detection to include modern ARIA roles
- Why: Many modern web components use roles like gridcell, treeitem, switch,        
menubar
- Implementation: Expand interactiveRoles array in checkAccessibilityRoles()        
- Coverage: Browser-use has 30+ roles vs Autai-Core's ~15 roles

4. Visual State Analysis

- What: Processes paint order, stacking contexts, and visibility calculation        
- Why: Better handling of overlays, z-index, and occluded elements
- Implementation: Use node.snapshotNode.paintOrder, stackingContexts, computed      
styles
- Status: Only basic cursor style is currently used

5. Compound Component Analysis

- What: Virtualizes compound controls into sub-components (date pickers, file       
inputs)
- Why: Better interaction with complex form controls
- Implementation: Analyze node._compoundChildren property and add virtual
components
- Status: Compound component detection not implemented

HARD (5-10+ hours each)

6. Bounding Box Filtering Logic

- What: Implements propagating bounds system that excludes contained elements       
- Why: Reduces element noise significantly in complex layouts
- Implementation: Create PropagatingBounds system with exception rules
- Status: Not implemented at all

7. Shadow DOM Integration

- What: Enhanced shadow host detection with open/closed shadow root processing      
- Why: Better support for SPA frameworks using shadow DOM
- Implementation: Process shadowRootType and handle shadow content specially        
- Status: Basic shadow DOM support but not integrated into detection

8. Cross-Origin Iframe Processing

- What: Recursive iframe processing with depth limits and cross-origin support      
- Why: Enables interaction with complex applications using iframes
- Implementation: Cross-target CDP session management and recursive processing      
- Status: No cross-origin iframe handling

Key Findings

Current Coverage: Autai-Core implements about 70% of browser-use's detection        
capabilities

Biggest Gaps:
- Visual/structural analysis (paint order, bounding boxes)
- Compound component virtualization
- Enhanced shadow DOM support

Easiest Wins: The two placeholder methods (checkIframeSize and
checkIconElements) are the lowest hanging fruit and would provide immediate
benefits.