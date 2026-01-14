// SchematicRendererOptions.ts

import { InteractionManagerOptions } from "./managers/InteractionManager";
import { DragAndDropManagerOptions } from "./managers/DragAndDropManager";
import { GizmoManagerOptions } from "./managers/GizmoManager";
import { CameraManagerOptions } from "./managers/CameraManager";
import { SelectableObject } from "./managers/SelectableObject";
import { SchematicRenderer } from "./SchematicRenderer";
import { ResourcePackOptions } from "./types/resourcePack";

export interface ProgressBarOptions {
	showLabel?: boolean;
	showPercentage?: boolean;
	barColor?: string;
	barHeight?: number;
	labelColor?: string;
	labelSize?: string;
	theme?: "light" | "dark" | "custom";
}

export interface SimulationOptions {
	// Enable redstone simulation
	enableSimulation?: boolean;
	// Auto-tick the simulation at a fixed rate (in ticks per second)
	autoTickSpeed?: number;
	// Automatically initialize simulation when schematic is loaded
	autoInitialize?: boolean;
	// Sync simulation state back to schematic automatically after ticks
	autoSync?: boolean;
}

export interface KeyboardControlsOptions {
	// Enable keyboard controls while right-clicking (orbit controls)
	enabled?: boolean;
	// Movement speed in units per second
	flySpeed?: number;
	// Sprint multiplier when holding shift
	sprintMultiplier?: number;
	// Keybinds for movement
	keybinds?: {
		forward?: string;
		backward?: string;
		left?: string;
		right?: string;
		up?: string;
		down?: string;
		sprint?: string;
	};
}

export interface DebugOptions {
	// Enable the debug GUI panel (lil-gui)
	enableInspector?: boolean;
	// Show the GUI on startup (can be toggled with keyboard shortcut)
	showOnStartup?: boolean;
	// Custom panels to add to the GUI
	customPanels?: Array<{
		name: string;
		controls: Array<{
			name: string;
			type: "number" | "boolean" | "color" | "button" | "select";
			value?: any;
			min?: number;
			max?: number;
			step?: number;
			options?: string[] | Record<string, any>;
			onChange?: (value: any) => void;
		}>;
	}>;
}

export interface PostProcessingOptions {
	// Master toggle for all post-processing
	enabled?: boolean;
	// Individual effect toggles
	enableSSAO?: boolean;
	enableSMAA?: boolean;
	enableGamma?: boolean;
	// SSAO presets for different camera modes
	ssaoPresets?: {
		perspective?: {
			aoRadius?: number;
			distanceFalloff?: number;
			intensity?: number;
		};
		isometric?: {
			aoRadius?: number;
			distanceFalloff?: number;
			intensity?: number;
		};
	};
}

export interface DefinitionRegionOptions {
	/**
	 * Automatically show definition regions from schematic metadata when a schematic is loaded.
	 * Definition regions are regions stored in the schematic's NucleationDefinitions metadata,
	 * typically created via the CircuitBuilder or Insign APIs.
	 *
	 * @default true
	 */
	showOnLoad?: boolean;

	/**
	 * Default color for definition regions (hex).
	 * Individual regions may override this if they have color metadata.
	 *
	 * @default 0x00ff88 (green)
	 */
	defaultColor?: number;

	/**
	 * Default opacity for definition regions.
	 *
	 * @default 0.25
	 */
	defaultOpacity?: number;

	/**
	 * Show wireframe edges around regions
	 *
	 * @default true
	 */
	showEdges?: boolean;

	/**
	 * Show labels with region names
	 *
	 * @default true
	 */
	showLabels?: boolean;
}

export interface GPUComputeOptions {
	/**
	 * Enable WebGPU compute for mesh building
	 *
	 * ⚠️ WARNING: GPU compute is currently SLOWER than workers due to GPU→CPU
	 * readback overhead (~6x slower, ~10x more memory). Additionally, textures
	 * don't render correctly (wireframe only).
	 *
	 * The Web Worker path with WASM is the recommended and default approach.
	 * Keep this disabled unless you're developing/testing the GPU path.
	 *
	 * @default false
	 * @deprecated Use default worker path instead
	 */
	enabled?: boolean;
	/** @deprecated GPU compute is not recommended */
	preferGPU?: boolean;
}

export interface WasmMeshBuilderOptions {
	/**
	 * Use WASM-based mesh builder for high-performance geometry merging.
	 *
	 * The WASM mesh builder is written in Rust and provides significantly
	 * better performance than the pure JavaScript implementation for the
	 * geometry merging and face culling operations.
	 *
	 * @default true (recommended)
	 */
	enabled?: boolean;

	/**
	 * Enable greedy meshing optimization.
	 *
	 * Greedy meshing merges adjacent coplanar faces with the same material
	 * into larger quads, dramatically reducing vertex count (5-10x reduction)
	 * for large flat surfaces like walls and floors.
	 *
	 * This improves both mesh building time and runtime rendering performance.
	 *
	 * Note: Only works when WASM mesh builder is enabled.
	 *
	 * @default false (until fully tested)
	 */
	greedyMeshingEnabled?: boolean;

	/**
	 * Maximum number of worker threads to use for mesh building.
	 *
	 * For small schematics, fewer workers (2-4) can actually be faster due to
	 * reduced initialization overhead. For large schematics, more workers help.
	 *
	 * Set to 0 to use automatic detection (capped at 8).
	 *
	 * @default 0 (automatic - uses min(hardwareConcurrency, 8))
	 */
	maxWorkers?: number;
}

export interface WebGPURendererOptions {
	/**
	 * Prefer WebGPU renderer when available.
	 *
	 * When enabled, the renderer will attempt to use WebGPURenderer if the
	 * browser supports WebGPU. Falls back to WebGLRenderer automatically
	 * if WebGPU is not available.
	 *
	 * Benefits of WebGPU:
	 * - Access to Three.js Inspector for debugging
	 * - Better performance for compute-heavy operations
	 * - Modern GPU API with better parallelism
	 *
	 * Requirements:
	 * - Chrome 113+, Edge 113+, Safari 17+, Firefox (behind flag)
	 *
	 * @default false (WebGL is more widely supported)
	 */
	preferWebGPU?: boolean;

	/**
	 * Force WebGPU renderer even if feature detection suggests it may not work well.
	 * Use this for testing purposes only.
	 *
	 * @default false
	 */
	forceWebGPU?: boolean;
}

export interface SchematicRendererOptions {
	backgroundColor?: number | string; // Accepts hex color or CSS color string
	hdri?: string;
	resourcePackBlobs?: Blob[];
	ffmpeg?: any;
	gamma?: number;
	chunkSideLength?: number; // Length of each chunk side in blocks
	meshBuildingMode?: "immediate" | "incremental" | "instanced" | "batched"; // How meshes are built
	// Global toggles for enabling/disabling functionalities
	enableInteraction?: boolean;
	enableDragAndDrop?: boolean;
	enableGizmos?: boolean;
	showGrid?: boolean;
	showAxes?: boolean;
	showCameraPathVisualization?: boolean;
	showRenderingBoundsHelper?: boolean;
	// Enable auto-orbit around default camera path
	enableAutoOrbit?: boolean;
	// Auto-orbit speed in seconds for a full rotation (higher = slower)
	autoOrbitDuration?: number;
	// Enable single schematic mode (only one schematic can be loaded at a time)
	singleSchematicMode?: boolean;
	// Enable progress bar for loading and chunk building
	enableProgressBar?: boolean;
	// Progress bar customization options
	progressBarOptions?: ProgressBarOptions;
	// FPS and performance options
	targetFPS?: number; // Target FPS when active (default: 60, set to 0 for uncapped)
	idleFPS?: number; // FPS when idle/static scene (default: 1)
	enableAdaptiveFPS?: boolean; // Enable adaptive FPS based on camera movement (default: true)
	logFPS?: boolean; // Log FPS to console for debugging (default: false)
	idleThreshold?: number; // Milliseconds of inactivity before entering idle mode (default: 100)
	// Options for individual managers
	interactionOptions?: InteractionManagerOptions;
	dragAndDropOptions?: DragAndDropManagerOptions;
	gizmoOptions?: GizmoManagerOptions;
	cameraOptions?: CameraManagerOptions;
	// Simulation options
	simulationOptions?: SimulationOptions;
	// Keyboard controls options
	keyboardControlsOptions?: KeyboardControlsOptions;
	// Debug/Inspector options
	debugOptions?: DebugOptions;
	// Post-processing options
	postProcessingOptions?: PostProcessingOptions;
	// GPU compute options (experimental)
	gpuComputeOptions?: GPUComputeOptions;
	// WASM mesh builder options (recommended for best performance)
	wasmMeshBuilderOptions?: WasmMeshBuilderOptions;
	// WebGPU renderer options (enables Three.js Inspector when available)
	webgpuOptions?: WebGPURendererOptions;
	// Definition region display options (for regions stored in schematic metadata)
	definitionRegionOptions?: DefinitionRegionOptions;
	// Resource pack management options
	resourcePackOptions?: ResourcePackOptions;
	// Callbacks for lifecycle events
	callbacks?: Callbacks;
	// Additional options can be added here
}

export const DEFAULT_OPTIONS: SchematicRendererOptions = {
	hdri: "",
	gamma: 0.5,
	chunkSideLength: 16, // Default chunk side length in blocks
	meshBuildingMode: "batched", // Default mesh building mode
	showCameraPathVisualization: false,
	enableAutoOrbit: false,
	autoOrbitDuration: 10,
	enableInteraction: false,
	enableDragAndDrop: false,
	enableGizmos: false,
	showGrid: false,
	showAxes: false,
	enableProgressBar: true,
	progressBarOptions: {
		showLabel: true,
		showPercentage: true,
		barColor: "#4CAF50", // Material green
		barHeight: 6,
		labelColor: "#ffffff",
		theme: "dark",
	},
	showRenderingBoundsHelper: false,
	targetFPS: 60, // 60 FPS when active
	idleFPS: 1, // 1 FPS when idle
	enableAdaptiveFPS: true, // Enable adaptive FPS by default
	idleThreshold: 100, // 100ms of inactivity before idle mode
	logFPS: false,
	callbacks: {},
	interactionOptions: {
		enableSelection: false,
		enableMovingSchematics: false,
	},
	dragAndDropOptions: {
		acceptedFileTypes: ["schematic", "nbt", "schem", "litematic", "mcstructure"],
	},
	gizmoOptions: {
		enableRotation: false,
		enableScaling: false,
	},
	cameraOptions: {
		position: [5, 5, 5],
		preserveCameraOnUpdate: false,
		useTightBounds: true,
	},
	simulationOptions: {
		enableSimulation: false,
		autoTickSpeed: 0,
		autoInitialize: false,
		autoSync: true,
	},
	keyboardControlsOptions: {
		enabled: true,
		flySpeed: 5.0, // 5 units per second
		sprintMultiplier: 2.5, // 2.5x speed when sprinting
		keybinds: {
			forward: "w",
			backward: "s",
			left: "a",
			right: "d",
			up: " ", // Space
			down: "Shift", // Shift
			sprint: "Shift", // Shift for sprint
		},
	},
	debugOptions: {
		enableInspector: false,
		showOnStartup: true,
	},
	postProcessingOptions: {
		enabled: true,
		enableSSAO: true,
		enableSMAA: true,
		enableGamma: true,
	},
	gpuComputeOptions: {
		enabled: false, // Disabled by default - experimental and slower
		preferGPU: true,
	},
	wasmMeshBuilderOptions: {
		enabled: true, // Enabled by default - recommended for best performance
		greedyMeshingEnabled: false, // Disabled by default until fully tested
	},
	webgpuOptions: {
		preferWebGPU: false, // Disabled by default - WebGL is more widely supported
		forceWebGPU: false,
	},
	definitionRegionOptions: {
		showOnLoad: true, // Auto-show definition regions from schematic metadata
		defaultColor: 0x00ff88, // Green
		defaultOpacity: 0.25,
		showEdges: true,
		showLabels: true,
	},
	resourcePackOptions: {
		enableUI: true, // Enable resource pack management UI
		uiPosition: "top-right", // UI position
		autoRebuild: true, // Auto-rebuild atlas when packs change
		showIcons: true, // Show pack icons in UI
		enableDragReorder: true, // Enable drag-and-drop reordering
		enableKeyboardShortcuts: true, // Enable keyboard shortcuts
		toggleUIShortcut: "KeyP", // Press P to toggle UI
		maxPacks: 0, // 0 = unlimited
	},
	resourcePackBlobs: [],
};

export interface Callbacks {
	// Renderer lifecycle callbacks
	onRendererInitialized?: (renderer: SchematicRenderer) => void;

	// Schematic callbacks
	onSchematicRendered?: (schematicName: string) => void;
	onSchematicLoaded?: (schematicName: string) => void;
	onSchematicDropped?: (file: File) => void | Promise<void>;
	onSchematicDropSuccess?: (file: File) => void | Promise<void>;
	onSchematicDropFailed?: (file: File, error: Error) => void | Promise<void>;

	//Schematic Manager callbacks
	onSchematicFileLoaded?: (file: File) => void | Promise<void>;
	onSchematicFileLoadFailure?: (file: File) => void | Promise<void>;

	// Resource pack callbacks
	onResourcePackLoaded?: (packName: string) => void | Promise<void>;
	onResourcePackDropped?: (file: File) => void | Promise<void>;
	onResourcePackDropSuccess?: (file: File) => void | Promise<void>;
	onResourcePackDropFailed?: (file: File, error: Error) => void | Promise<void>;
	/** Called when any pack change occurs that affects rendering */
	onPacksChanged?: (reason: string) => void | Promise<void>;
	/** Called when atlas is rebuilt */
	onAtlasRebuilt?: (textureCount: number) => void | Promise<void>;
	/** Called when pack order changes */
	onPackOrderChanged?: (packIds: string[]) => void | Promise<void>;
	/** Called when a pack is toggled */
	onPackToggled?: (packId: string, enabled: boolean) => void | Promise<void>;

	// Interaction callbacks
	onObjectSelected?: (object: SelectableObject) => void;
	onObjectDeselected?: (object: SelectableObject) => void;

	// File handling callbacks
	onInvalidFileType?: (file: File) => void | Promise<void>;
	onLoadingProgress?: (file: File, progress: number) => void | Promise<void>;

	// Simulation callbacks
	onSimulationInitialized?: (schematicName: string) => void;
	onSimulationTicked?: (tickCount: number) => void;
	onSimulationSynced?: () => void;
	onSimulationError?: (error: Error) => void;
	onBlockInteracted?: (x: number, y: number, z: number) => void;

	// UI callbacks
	onRenderSettingsChanged?: (settings: any) => void;
	onScreenshotTaken?: (blob: Blob, filename: string) => void;
	onRecordingComplete?: (blob: Blob, filename: string) => void;
}
