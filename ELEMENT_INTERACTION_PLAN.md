# Element Interaction Implementation Plan

## Current State
- ✅ **Sophisticated element detection**: You already have a 7-tier interactive element detection system with caching
- ✅ **CDP integration**: DOM service with Chrome DevTools Protocol connectivity
- ❌ **Missing interaction**: Elements are detected but not manipulated (no click, fill, hover, etc.)

## Proposed Implementation

### Phase 1: Core Element Interaction Service
**Create `src/main/services/dom/ElementInteractionService.ts`**
Only implement functions in this file, do not wrap functions into class.

#### Key Features:
- **Multi-fallback coordinate resolution** (matching browser-use patterns):
  1. `DOM.getContentQuads()` → `DOM.getBoxModel()` → JavaScript `getBoundingClientRect()`
- **Robust click implementation** with viewport visibility checks and timeout handling
- **Character-by-character text input** with proper key codes and modifiers
- **Focus management** with multiple fallback strategies
- **Comprehensive error handling** and recovery mechanisms

#### Core Methods:
```typescript
async click(backendNodeId: number, options?: ClickOptions): Promise<void>
async fill(backendNodeId: number, text: string, options?: FillOptions): Promise<void>
async hover(backendNodeId: number): Promise<void>
async focus(backendNodeId: number): Promise<void>
async selectOption(backendNodeId: number, values: string[]): Promise<void>
async getBoundingBox(backendNodeId: number): Promise<BoundingBox | null>
async dragTo(sourceId: number, targetId: number | Position): Promise<void>
```

### Phase 2: Enhanced DOM Service Integration
**Extend `src/main/services/dom/DOMService.ts`**

#### Integration Points:
- Expose interaction methods through main service interface
- Leverage existing `selectorMap` for element lookup by `backendNodeId`
- Maintain consistency with current logging and state tracking
- Integrate with existing interactive element caching system
- Add interaction methods to IPC interface for renderer process access

#### Enhancement Pattern:
```typescript
class DOMService {
  // Existing methods...

  // New interaction methods
  async clickElement(backendNodeId: number): Promise<void>
  async fillElement(backendNodeId: number, text: string): Promise<void>
  async hoverElement(backendNodeId: number): Promise<void>
  async focusElement(backendNodeId: number): Promise<void>
}
```

### Phase 3: Type Definitions
**Create `src/shared/dom/interaction.ts`**

#### Core Interfaces:
```typescript
interface ClickOptions {
  button?: MouseButton
  clickCount?: number
  modifiers?: ModifierType[]
  timeout?: number
}

interface FillOptions {
  clear?: boolean
  delay?: number
  timeout?: number
}

interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

interface ElementPosition {
  backendNodeId: number
  boundingBox: BoundingBox | null
  contentQuads: number[][]
  lastUpdated: number
}
```

### Phase 4: CDP Implementation Patterns

#### Click Implementation Strategy:
1. **Coordinate Resolution**: Try 3 methods in order
   - `DOM.getContentQuads({backendNodeId})` - Most accurate for complex layouts
   - `DOM.getBoxModel({backendNodeId})` - Fallback for simple elements
   - JavaScript `getBoundingClientRect()` - Final fallback

2. **Viewport Visibility Check**:
   - Get viewport dimensions via `Page.getLayoutMetrics()`
   - Ensure element coordinates intersect with viewport
   - Scroll element into view if needed using `DOM.scrollIntoViewIfNeeded()`

3. **Mouse Event Sequence**:
   ```typescript
   await cdpClient.send.Input.dispatchMouseEvent({
     type: 'mouseMoved',
     x: centerX,
     y: centerY
   })
   await cdpClient.send.Input.dispatchMouseEvent({
     type: 'mousePressed',
     x: centerX,
     y: centerY,
     button: 'left',
     clickCount: 1
   })
   await cdpClient.send.Input.dispatchMouseEvent({
     type: 'mouseReleased',
     x: centerX,
     y: centerY,
     button: 'left',
     clickCount: 1
   })
   ```

#### Fill Implementation Strategy:
1. **Element Focus**: Use 3-tier approach
   - `DOM.focus({backendNodeId})` - Primary CDP method
   - JavaScript `element.focus()` - Fallback
   - Click to focus - Last resort

2. **Text Clearing**:
   - JavaScript `element.value = ""` with event dispatching
   - Triple-click + Delete fallback
   - Select all + Delete fallback

3. **Character-by-Character Input**:
   ```typescript
   for (const char of text) {
     const [modifiers, vkCode, baseKey] = getCharInfo(char)
     await cdpClient.send.Input.dispatchKeyEvent({
       type: 'keyDown',
       key: baseKey,
       code: getKeyCode(char),
       modifiers,
       windowsVirtualKeyCode: vkCode
     })
     await cdpClient.send.Input.dispatchKeyEvent({
       type: 'char',
       text: char,
       key: char
     })
     await cdpClient.send.Input.dispatchKeyEvent({
       type: 'keyUp',
       key: baseKey,
       code: getKeyCode(char),
       modifiers,
       windowsVirtualKeyCode: vkCode
     })
     await sleep(18) // Human-like typing delay
   }
   ```

### Phase 5: Position Caching System
**Enhance existing interactive element cache**

#### Cache Structure:
```typescript
interface ElementCache {
  interactive: Map<number, boolean>     // Existing
  positions: Map<number, ElementPosition>  // New
  lastUpdate: number
}
```

#### Cache Invalidation:
- Position cache invalidates on page navigation
- Interactive cache persists for stable elements
- Automatic cleanup of stale entries

## Implementation Benefits
- **Leverages existing detection**: Builds on your sophisticated 7-tier detection system
- **Browser-use proven patterns**: Uses battle-tested implementation patterns from browser-use
- **CDP native**: Direct Chrome DevTools Protocol integration for maximum reliability
- **Unified architecture**: Integrates seamlessly with existing DOM service and caching
- **Type safety**: Full TypeScript support with comprehensive error handling
- **Performance**: Position caching and intelligent cache invalidation

## Development Workflow
1. Implement `ElementInteractionService` with core methods
2. Add type definitions in `src/shared/dom/interaction.ts`
3. Integrate with existing `DOMService`
4. Extend IPC interface for renderer access
5. Test with existing DOM Service testbed in renderer process
6. Add error handling and logging consistent with existing patterns

This implementation will transform Autai-Core from a DOM analysis tool into a complete browser automation platform while maintaining your current architectural excellence and sophisticated element detection capabilities.