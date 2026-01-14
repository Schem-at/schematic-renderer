// Export Types - Type definitions for schematic export functionality

import * as THREE from "three";

/**
 * Supported export formats
 */
export type ExportFormat = "gltf" | "glb" | "obj" | "stl";

/**
 * Export quality presets
 */
export type ExportQuality = "low" | "medium" | "high" | "ultra";

/**
 * Normal mode for export
 */
export type NormalMode = "default" | "flip" | "recompute" | "double-sided";

/**
 * Texture handling mode
 */
export type TextureMode = "embed" | "reference" | "bake" | "none";

/**
 * Export options for all formats
 */
export interface ExportOptions {
	/** Output filename (without extension) */
	filename?: string;

	/** Export format */
	format?: ExportFormat;

	/** Quality preset */
	quality?: ExportQuality;

	/** Normal handling mode */
	normalMode?: NormalMode;

	/** Whether to embed textures (for GLTF/GLB) */
	embedTextures?: boolean;

	/** Maximum texture size */
	maxTextureSize?: number;

	/** Include animations */
	animations?: THREE.AnimationClip[];

	/** Include custom GLTF extensions */
	includeCustomExtensions?: boolean;

	/** Whether to center the model at origin */
	centerAtOrigin?: boolean;

	/** Apply a uniform scale */
	scale?: number;

	/** Optimize mesh for export (merge geometries, etc.) */
	optimize?: boolean;

	/** Include only visible meshes */
	visibleOnly?: boolean;

	/** Whether to preserve materials or bake to simple materials */
	preserveMaterials?: boolean;

	/** Force all materials to be opaque (eliminates transparency sorting issues) */
	forceOpaque?: boolean;

	/** Progress callback */
	onProgress?: ExportProgressCallback;

	/** Completion callback */
	onComplete?: ExportCompleteCallback;

	/** Error callback */
	onError?: ExportErrorCallback;
}

/**
 * Quality preset configurations
 */
export interface QualityPreset {
	maxTextureSize: number;
	optimize: boolean;
	preserveMaterials: boolean;
}

/**
 * Export progress event data
 */
export interface ExportProgress {
	/** Current phase of export */
	phase: "preparing" | "processing" | "converting" | "finalizing";
	/** Progress percentage (0-1) */
	progress: number;
	/** Human-readable status message */
	message: string;
}

/**
 * Export result data
 */
export interface ExportResult {
	/** Export was successful */
	success: boolean;
	/** Output filename */
	filename: string;
	/** Export format used */
	format: ExportFormat;
	/** Size in bytes */
	size: number;
	/** Duration in milliseconds */
	duration: number;
	/** Blob or ArrayBuffer of the exported data */
	data: Blob | ArrayBuffer;
	/** Optional download URL (if auto-download is disabled) */
	downloadUrl?: string;
}

/**
 * Export error data
 */
export interface ExportError {
	/** Error message */
	message: string;
	/** Error code */
	code: ExportErrorCode;
	/** Original error (if any) */
	originalError?: Error;
	/** Phase where error occurred */
	phase?: string;
}

/**
 * Export error codes
 */
export type ExportErrorCode =
	| "NO_MESHES"
	| "INVALID_FORMAT"
	| "CONVERSION_FAILED"
	| "DOWNLOAD_FAILED"
	| "CANCELLED"
	| "UNKNOWN";

/**
 * Callback types
 */
export type ExportProgressCallback = (progress: ExportProgress) => void;
export type ExportCompleteCallback = (result: ExportResult) => void;
export type ExportErrorCallback = (error: ExportError) => void;

/**
 * Export UI options
 */
export interface ExportUIOptions {
	/** Enable UI */
	enableUI?: boolean;
	/** UI position */
	uiPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
	/** Enable keyboard shortcuts */
	enableKeyboardShortcuts?: boolean;
	/** Toggle UI shortcut key code */
	toggleUIShortcut?: string;
	/** Default export options */
	defaultOptions?: Partial<ExportOptions>;
	/** Available formats (subset of all formats) */
	availableFormats?: ExportFormat[];
	/** Auto-download after export */
	autoDownload?: boolean;
}

/**
 * Export preset configuration
 */
export interface ExportPreset {
	/** Preset name */
	name: string;
	/** Preset description */
	description: string;
	/** Preset icon */
	icon?: string;
	/** Export options for this preset */
	options: Partial<ExportOptions>;
}

/**
 * Export event types
 */
export type ExportEventType =
	| "exportStarted"
	| "exportProgress"
	| "exportComplete"
	| "exportError"
	| "exportCancelled";

/**
 * Export event map
 */
export interface ExportEventMap {
	exportStarted: { format: ExportFormat; filename: string };
	exportProgress: ExportProgress;
	exportComplete: ExportResult;
	exportError: ExportError;
	exportCancelled: { filename: string };
}

/**
 * Export event handler type
 */
export type ExportEventHandler<T extends ExportEventType> = (event: ExportEventMap[T]) => void;
