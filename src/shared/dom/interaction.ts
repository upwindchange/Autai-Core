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