/**
 * Click interaction type definitions for Autai-Core DOM Service
 * Based on browser-use implementation patterns
 */

export type MouseButton = 'left' | 'right' | 'middle';
export type ModifierType = 'Alt' | 'Control' | 'Meta' | 'Shift';

export interface ClickOptions {
	/**
	 * Mouse button to use (default: 'left')
	 */
	button?: MouseButton;

	/**
	 * Number of times to click (default: 1)
	 */
	clickCount?: number;

	/**
	 * Modifier keys to hold during click
	 */
	modifiers?: ModifierType[];

	/**
	 * Maximum time to wait for click completion in milliseconds (default: 5000)
	 */
	timeout?: number;
}

export interface BoundingBox {
	/**
	 * X coordinate of the top-left corner
	 */
	x: number;

	/**
	 * Y coordinate of the top-left corner
	 */
	y: number;

	/**
	 * Width of the element
	 */
	width: number;

	/**
	 * Height of the element
	 */
	height: number;
}

export interface Position {
	/**
	 * X coordinate
	 */
	x: number;

	/**
	 * Y coordinate
	 */
	y: number;
}

export interface ElementPosition {
	/**
	 * Backend node ID from CDP
	 */
	backendNodeId: number;

	/**
	 * Current bounding box (if available)
	 */
	boundingBox: BoundingBox | null;

	/**
	 * Content quads for complex shapes
	 */
	contentQuads: number[][];

	/**
	 * Timestamp when position was last updated
	 */
	lastUpdated: number;
}

export interface ClickResult {
	/**
	 * Whether the click was successful
	 */
	success: boolean;

	/**
	 * Error message if click failed
	 */
	error?: string;

	/**
	 * Final coordinates used for clicking
	 */
	coordinates?: Position;

	/**
	 * Which method was used for coordinate resolution
	 */
	method?: 'contentQuads' | 'boxModel' | 'boundingRect' | 'javascript';

	/**
	 * Time taken for the entire click operation in milliseconds
	 */
	duration?: number;
}

export interface FillOptions {
	/**
	 * Text value to input
	 */
	value: string;

	/**
	 * Whether to clear existing text before typing (default: true)
	 */
	clear?: boolean;

	/**
	 * Delay between keystrokes in milliseconds (default: 18)
	 */
	keystrokeDelay?: number;

	/**
	 * Maximum time to wait for fill completion in milliseconds (default: 10000)
	 */
	timeout?: number;
}

export interface FillResult {
	/**
	 * Whether the fill operation was successful
	 */
	success: boolean;

	/**
	 * Error message if fill failed
	 */
	error?: string;

	/**
	 * Number of characters that were typed
	 */
	charactersTyped?: number;

	/**
	 * Which method was used for the final typing operation
	 */
	method?: 'cdp' | 'javascript';

	/**
	 * Time taken for the entire fill operation in milliseconds
	 */
	duration?: number;
}

export interface ViewportInfo {
	/**
	 * Viewport width in pixels
	 */
	width: number;

	/**
	 * Viewport height in pixels
	 */
	height: number;

	/**
	 * Scroll position X
	 */
	scrollX: number;

	/**
	 * Scroll position Y
	 */
	scrollY: number;
}

export interface SelectOptionOptions {
	/**
	 * Single value or array of values to select
	 */
	values: string | string[];

	/**
	 * Whether to clear existing selections before selecting (default: true)
	 */
	clear?: boolean;

	/**
	 * Maximum time to wait for selection completion in milliseconds (default: 5000)
	 */
	timeout?: number;
}

export interface SelectOptionResult {
	/**
	 * Whether the selection was successful
	 */
	success: boolean;

	/**
	 * Error message if selection failed
	 */
	error?: string;

	/**
	 * Number of options that were successfully selected
	 */
	optionsSelected?: number;

	/**
	 * Array of option values that were matched and selected
	 */
	matchedValues?: string[];

	/**
	 * Which method was used for the selection
	 */
	method?: 'cdp' | 'javascript';

	/**
	 * Time taken for the entire selection operation in milliseconds
	 */
	duration?: number;
}

export interface HoverOptions {
	/**
	 * Maximum time to wait for hover completion in milliseconds (default: 3000)
	 */
	timeout?: number;
}

export interface HoverResult {
	/**
	 * Whether the hover was successful
	 */
	success: boolean;

	/**
	 * Error message if hover failed
	 */
	error?: string;

	/**
	 * Final coordinates used for hovering
	 */
	coordinates?: Position;

	/**
	 * Which method was used for coordinate resolution
	 */
	method?: 'contentQuads' | 'boxModel' | 'boundingRect' | 'javascript';

	/**
	 * Time taken for the entire hover operation in milliseconds
	 */
	duration?: number;
}

export interface OptionElement {
	/**
	 * Backend node ID of the option element
	 */
	backendNodeId: number;

	/**
	 * Option value attribute
	 */
	value: string;

	/**
	 * Option text content
	 */
	text: string;

	/**
	 * Whether the option is currently selected
	 */
	selected: boolean;

	/**
	 * Whether the option is disabled
	 */
	disabled: boolean;
}

export interface DragOptions {
	/**
	 * Target can be a Position or an Element backendNodeId
	 */
	target: Position | number;

	/**
	 * Optional relative position offset when target is an Element (default: center)
	 */
	targetPosition?: Position;
}

export interface DragResult {
	/**
	 * Whether the drag operation was successful
	 */
	success: boolean;

	/**
	 * Error message if drag failed
	 */
	error?: string;

	/**
	 * Source coordinates where drag started
	 */
	sourceCoordinates?: Position;

	/**
	 * Target coordinates where drag ended
	 */
	targetCoordinates?: Position;

	/**
	 * Method used for coordinate resolution
	 */
	method?: 'contentQuads' | 'boxModel' | 'boundingRect' | 'javascript';

	/**
	 * Time taken for the entire drag operation in milliseconds
	 */
	duration?: number;
}