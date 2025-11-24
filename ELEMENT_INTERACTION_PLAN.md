# ElementInteractionService Feature Implementation Plan

## Overview

This document outlines the missing features in `ElementInteractionService.ts` compared to the browser-use Python `Element` class and provides a structured implementation plan.

## Current State Analysis

The TypeScript `ElementInteractionService` covers core functionality well:
- ✅ Element clicking with multi-fallback coordinate resolution
- ✅ Text filling with proper CDP character-by-character input
- ✅ Select option handling for dropdown elements
- ✅ Focus management and text clearing
- ✅ Basic bounding box retrieval

## Missing Features Comparison

### **Critical Missing Features (High Priority)**

#### **1. Core Interaction Methods**
- **`hover()`** - Move mouse to element center without clicking
- **`drag_to()`** - Drag element to specific position or another element
- **`check()`** - Toggle checkboxes and radio buttons
- **`get_attribute()`** - Retrieve specific element attribute values

#### **2. Advanced Capabilities**
- **`screenshot()`** - Element-level screenshots with format/quality options
- **`evaluate()`** - Execute JavaScript in element context with arrow function support
- **`get_basic_info()`** - Return comprehensive element information in structured format

### **Enhancement Opportunities (Medium Priority)**

#### **3. Error Handling & Robustness**
- **Timeout-based operations** - Use Promise.race() for CDP operations with specific timeouts
- **Enhanced coordinate fallbacks** - More sophisticated quad selection with viewport intersection
- **Detailed exception reporting** - Better error context and recovery mechanisms

#### **4. Character Input Improvements**
- **Better unsupported character handling** - Graceful fallbacks instead of throwing errors
- **Comprehensive key code mapping** - Extended character support
- **Enhanced modifier handling** - More sophisticated character mapping logic

#### **5. Architecture Enhancements**
- **Session management flexibility** - More adaptable CDP client integration
- **Utility helper methods** - Node ID management and remote object helpers
- **Advanced coordinate calculation** - Quad-based selection with viewport bounds checking

## Implementation Plan

### **Phase 1: Core Interaction Methods (Week 1-2)**

#### **1.1 Implement `hover()` method**
```typescript
async hoverElement(backendNodeId: number): Promise<HoverResult>
```
- Get element coordinates using existing `getElementCoordinates()`
- Dispatch mouseMoved event to element center
- Add hover-specific result type

#### **1.2 Implement `get_attribute()` method**
```typescript
async getElementAttribute(backendNodeId: number, attributeName: string): Promise<string | null>
```
- Use DOM.getAttributes to retrieve all attributes
- Parse attribute array to find specific attribute value
- Return null if attribute not found

#### **1.3 Implement `check()` method**
```typescript
async checkElement(backendNodeId: number): Promise<CheckResult>
```
- Determine if element is checkbox/radio button
- Use existing clickElement() to toggle state
- Return current checked state

### **Phase 2: Advanced Features (Week 2-3)**

#### **2.1 Implement `screenshot()` method**
```typescript
async captureElementScreenshot(
  backendNodeId: number,
  options: ScreenshotOptions = {}
): Promise<string>
```
- Get element bounding box
- Create viewport clip using Page.captureScreenshot
- Support different formats (jpeg, png, webp) and quality settings
- Return base64 encoded image data

#### **2.2 Implement `evaluate()` method**
```typescript
async evaluateOnElement<T>(
  backendNodeId: number,
  pageFunction: string,
  ...args: any[]
): Promise<T>
```
- Convert arrow function syntax to function declaration
- Use Runtime.callFunctionOn with proper argument handling
- Support both expression and statement body formats
- Handle async function execution

### **Phase 3: Complex Interactions (Week 3-4)**

#### **3.1 Implement `drag_to()` method**
```typescript
async dragElementTo(
  backendNodeId: number,
  target: Position | { backendNodeId: number },
  options?: DragOptions
): Promise<DragResult>
```
- Calculate source coordinates from element
- Determine target coordinates (element or position)
- Dispatch mousePressed, mouseMoved, mouseReleased sequence
- Handle both element-to-element and element-to-position dragging

#### **3.2 Implement `get_basic_info()` method**
```typescript
async getElementInfo(backendNodeId: number): Promise<ElementInfo>
```
- Use DOM.describeNode for basic node information
- Parse attributes into dictionary format
- Combine with bounding box and other properties
- Return structured ElementInfo object

### **Phase 4: Enhancements (Week 4-5)**

#### **4.1 Add timeout-based error handling**
- Wrap CDP commands with Promise.race() for timeouts
- Implement separate timeouts for different operation types
- Add graceful degradation and recovery strategies

#### **4.2 Enhance character input fallbacks**
- Implement JavaScript fallback for unsupported characters
- Add character substitution and approximation logic
- Improve error handling in character mapping

#### **4.3 Add utility helper methods**
```typescript
private async getNodeIdFromBackendNodeId(backendNodeId: number): Promise<number>
private async getRemoteObjectId(backendNodeId: number): Promise<string | null>
private async calculateElementCenter(backendNodeId: number): Promise<Position>
```

## Integration Strategy

### **TypeScript Interface Updates**
Extend existing interfaces in `src/shared/dom/interaction.ts`:
- Add new result types for each method
- Update OptionType enums and interfaces
- Include new method signatures

### **Error Handling Pattern**
Follow existing patterns with structured results:
```typescript
interface MethodResult {
  success: boolean;
  duration: number;
  error?: string;
  // method-specific properties
}
```

### **Testing Approach**
- Add unit tests for each new method
- Test error conditions and fallback scenarios
- Verify compatibility with existing CDP integration

## Technical Considerations

### **CDP Integration**
- Leverage existing `sendCDPCommand` utility
- Maintain consistent session management
- Follow existing error handling patterns

### **Performance Optimizations**
- Cache element coordinates where appropriate
- Minimize DOM traversal operations
- Batch operations where possible

### **Browser Compatibility**
- Test across different Electron/Chrome versions
- Handle cross-browser CDP variations
- Provide fallbacks for unsupported features

## Success Metrics

- ✅ All missing features implemented and tested
- ✅ Error handling matches or exceeds Python implementation
- ✅ Performance characteristics are acceptable
- ✅ Integration with existing DOM Service is seamless
- ✅ TypeScript type coverage is comprehensive

## Next Steps

1. Begin Phase 1 implementation starting with `hover()`
2. Create comprehensive test suite
3. Update documentation and examples
4. Performance testing and optimization
5. Code review and refinement