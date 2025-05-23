// SchematicRenderer.ts
import * as THREE from "three";
import { CameraManager } from "./managers/CameraManager";
import { SceneManager } from "./managers/SceneManager";
import { RenderManager } from "./managers/RenderManager";
import {
	DragAndDropManager,
	DragAndDropManagerOptions,
} from "./managers/DragAndDropManager";
import {
	InteractionManager,
	InteractionManagerOptions,
} from "./managers/InteractionManager";
import { HighlightManager } from "./managers/HighlightManager";
import { SchematicManager } from "./managers/SchematicManager";
import { WorldMeshBuilder } from "./WorldMeshBuilder";
import { EventEmitter } from "events";
import {
	ResourcePackManager,
	DefaultPackCallback,
} from "./managers/ResourcePackManager";
// @ts-ignore
import init from "./wasm/minecraft_schematic_utils";
import { GizmoManager } from "./managers/GizmoManager";
import {
	SchematicRendererOptions,
	DEFAULT_OPTIONS,
} from "./SchematicRendererOptions";
import { merge } from "lodash";
import { UIManager } from "./managers/UIManager";
// @ts-ignore
import { CreativeControls } from "three-creative-controls";

import { AssetWorkerManager } from "./managers/AssetWorkerManager";

import { Cubane } from "cubane";

export class SchematicRenderer {
	public canvas: HTMLCanvasElement;
	public assetWorkerManager: AssetWorkerManager;
	public clock: THREE.Clock;
	public options: SchematicRendererOptions;
	public eventEmitter: EventEmitter;
	public cameraManager: CameraManager;
	public sceneManager: SceneManager;
	public uiManager: UIManager | undefined;
	public renderManager: RenderManager | undefined;
	public interactionManager: InteractionManager | undefined;
	public dragAndDropManager?: DragAndDropManager;
	public highlightManager: HighlightManager | undefined;
	public schematicManager: SchematicManager | undefined;
	public worldMeshBuilder: WorldMeshBuilder | undefined;
	public gizmoManager: GizmoManager | undefined;
	public materialMap: Map<string, THREE.Material>;
	public timings: Map<string, number> = new Map();
	private resourcePackManager: ResourcePackManager;
	// @ts-ignore
	private wasmModule: any;
	public cubane: Cubane;
	public state: {
		cameraPosition: THREE.Vector3;
	};

	constructor(
		canvas: HTMLCanvasElement,
		schematicData: { [key: string]: () => Promise<ArrayBuffer> } = {},
		defaultResourcePacks: Record<string, DefaultPackCallback> = {},
		options: SchematicRendererOptions = {}
	) {
		this.canvas = canvas;
		// Initialize worker managers
		this.assetWorkerManager = new AssetWorkerManager({
			disableWorkers: options.disableWorkers,
			workerPath: options.assetWorkerPath,
			createWorker: options.createAssetWorker,
		});

		this.options = merge({}, DEFAULT_OPTIONS, options);
		this.clock = new THREE.Clock();
		this.materialMap = new Map();
		this.eventEmitter = new EventEmitter();

		// Attach this instance to the canvas for external access
		(this.canvas as any).schematicRenderer = this;

		// Initialize managers that don't depend on initialization process
		this.sceneManager = new SceneManager(this);

		this.uiManager = new UIManager(this);

		// Initialize camera manager
		this.cameraManager = new CameraManager(this, {
			position: options.cameraOptions?.position || [5, 5, 5],
			showCameraPathVisualization: this.options.showCameraPathVisualization,
		});

		this.sceneManager.updateHelpers();
		this.eventEmitter.emit("sceneReady");

		// Initialize ResourcePackManager
		this.resourcePackManager = new ResourcePackManager();

		this.state = {
			cameraPosition: new THREE.Vector3(),
		};

		// Show initialization progress bar
		if (this.options.enableProgressBar && this.uiManager) {
			this.uiManager.showProgressBar("Initializing renderer...");
			this.uiManager.updateProgress(0.1);
		}

		this.cubane = new Cubane();

		// Start the initialization process
		this.initialize(schematicData, defaultResourcePacks);
	}

	public updateCameraPosition(): void {
		this.state.cameraPosition.copy(
			this.cameraManager.activeCamera.position as THREE.Vector3
		);
	}

	/**
	 * Sets whether auto-orbit is enabled
	 * @param enabled True to enable auto-orbit, false to disable
	 */
	public setAutoOrbit(enabled: boolean): void {
		this.options.enableAutoOrbit = enabled;

		if (enabled) {
			this.cameraManager.startAutoOrbit();
		} else {
			this.cameraManager.stopAutoOrbit();
		}
	}

	/**
	 * Sets the duration of a full auto-orbit rotation
	 * @param duration Duration in seconds
	 */
	public setAutoOrbitDuration(duration: number): void {
		this.options.autoOrbitDuration = duration;
		this.cameraManager.setAutoOrbitDuration(duration);
	}

	/**
	 * Toggles the auto-orbit feature
	 * @returns The new state of auto-orbit (true = enabled, false = disabled)
	 */
	public toggleAutoOrbit(): boolean {
		const newState = this.cameraManager.toggleAutoOrbit();
		this.options.enableAutoOrbit = newState;
		return newState;
	}

	private async initialize(
		schematicData: { [key: string]: () => Promise<ArrayBuffer> },
		defaultResourcePacks: Record<string, DefaultPackCallback>
	): Promise<void> {
		try {
			// Update progress bar for each initialization step
			const showProgress = (message: string, progress: number) => {
				if (this.options.enableProgressBar && this.uiManager) {
					this.uiManager.updateProgress(progress, message);
				}
			};

			// Step 1: Initialize WebAssembly module
			showProgress("Loading WebAssembly module...", 0.15);
			await this.initWasm();

			// Step 2: Initialize resource packs
			showProgress("Initializing resource packs...", 0.3);
			await this.initializeResourcePacks(defaultResourcePacks);

			// Step 4: Initialize builders and managers
			showProgress("Setting up renderer components...", 0.6);
			this.worldMeshBuilder = new WorldMeshBuilder(this, this.cubane);
			this.schematicManager = new SchematicManager(this, {
				singleSchematicMode: this.options.singleSchematicMode,
			});
			this.renderManager = new RenderManager(this);
			this.highlightManager = new HighlightManager(this);

			// Initialize optional components
			if (this.options.enableGizmos) {
				this.gizmoManager = new GizmoManager(this);
			}

			// Step 5: Load initial schematics if provided
			if (Object.keys(schematicData).length > 0) {
				showProgress("Loading initial schematics...", 0.75);
				await this.schematicManager.loadSchematics(schematicData);
			}

			// Step 6: Setup camera and interaction
			showProgress("Finalizing setup...", 0.9);
			this.adjustCameraToSchematics();
			this.initializeInteractionComponents();

			// Initialization complete
			showProgress("Ready", 1.0);

			// Start rendering
			this.animate();

			// Trigger callbacks and events
			this.options.callbacks?.onRendererInitialized?.();
			this.canvas.dispatchEvent(new CustomEvent("rendererInitialized"));

			// Hide progress bar after a short delay to show completion state
			setTimeout(() => {
				if (this.options.enableProgressBar && this.uiManager) {
					this.uiManager.hideProgressBar();
				}
			}, 500);
		} catch (error) {
			console.error("Failed to initialize SchematicRenderer:", error);

			// Show error in progress bar
			if (this.options.enableProgressBar && this.uiManager) {
				this.uiManager.updateProgress(1.0, "Initialization failed");
				setTimeout(() => this.uiManager?.hideProgressBar(), 2000);
			}

			console.error(error);
		}
	}

	private adjustCameraToSchematics(): void {
		if (!this.schematicManager) {
			return;
		}

		if (this.schematicManager.isEmpty()) {
			this.uiManager?.showEmptyState();
			return;
		}
		const averagePosition =
			this.schematicManager.getSchematicsAveragePosition();
		const maxDimensions = this.schematicManager.getMaxSchematicDimensions();

		this.cameraManager.activeCamera.lookAt(averagePosition);
		(this.cameraManager.activeCamera.position as THREE.Vector3).set(
			averagePosition.x + maxDimensions.x,
			averagePosition.y + maxDimensions.y,
			averagePosition.z + maxDimensions.z
		);
		this.cameraManager.update();
	}

	private initializeInteractionComponents(): void {
		if (this.options.enableInteraction) {
			const interactionOptions: InteractionManagerOptions = {
				enableSelection:
					this.options.interactionOptions?.enableSelection || false,
				enableMovingSchematics:
					this.options.interactionOptions?.enableMovingSchematics || false,
			};
			this.interactionManager = new InteractionManager(
				this,
				interactionOptions
			);
		}

		if (this.options.enableDragAndDrop) {
			const dragAndDropOptions: DragAndDropManagerOptions = {
				acceptedFileTypes:
					this.options.dragAndDropOptions?.acceptedFileTypes || [],
				callbacks: {
					// Schematic callbacks
					onSchematicLoaded: this.options.callbacks?.onSchematicLoaded,
					onSchematicDropped: this.options.callbacks?.onSchematicDropped,
					onSchematicDropSuccess:
						this.options.callbacks?.onSchematicDropSuccess,
					onSchematicDropFailed: this.options.callbacks?.onSchematicDropFailed,

					// Resource pack callbacks
					onResourcePackLoaded: this.options.callbacks?.onResourcePackLoaded,
					onResourcePackDropped: this.options.callbacks?.onResourcePackDropped,
					onResourcePackDropSuccess:
						this.options.callbacks?.onResourcePackDropSuccess,
					onResourcePackDropFailed:
						this.options.callbacks?.onResourcePackDropFailed,

					// General callbacks
					onInvalidFileType: this.options.callbacks?.onInvalidFileType,
					onLoadingProgress: this.options.callbacks?.onLoadingProgress,
				},
			};
			this.dragAndDropManager = new DragAndDropManager(
				this,
				dragAndDropOptions
			);
		}
	}

	private async initWasm(): Promise<void> {
		try {
			this.wasmModule = await init();
		} catch (error) {
			console.error("Failed to initialize WASM module:", error);
		}
	}

	private async initializeResourcePacks(
		defaultResourcePacks?: Record<string, DefaultPackCallback>
	): Promise<void> {
		await this.resourcePackManager.initPromise;

		// Get resource pack blobs from your existing system
		const resourcePackBlobs =
			await this.resourcePackManager.getResourcePackBlobs(
				defaultResourcePacks || {}
			);

		// Load each resource pack into Cubane
		// Cubane loads packs in order, with later packs having higher priority
		for (let i = 0; i < resourcePackBlobs.length; i++) {
			const blob = resourcePackBlobs[i];
			try {
				await this.cubane.loadResourcePack(blob);
				console.log(
					`Loaded resource pack ${i + 1}/${resourcePackBlobs.length}`
				);
			} catch (error) {
				console.error(`Failed to load resource pack ${i + 1}:`, error);
			}
		}

		// Store the blobs for backward compatibility if needed
		this.options.resourcePackBlobs = resourcePackBlobs;
	}

	private animate(): void {
		requestAnimationFrame(() => this.animate());
		const deltaTime = this.clock.getDelta();

		// Update creative controls if active
		const activeControlKey = this.cameraManager.activeControlKey;
		if (activeControlKey?.includes("creative")) {
			const controls = this.cameraManager.controls.get(activeControlKey);
			const speed = new THREE.Vector3(200, 200, 200);
			if (controls) {
				CreativeControls.update(controls, speed);
			}
		}

		// Rest of your existing updates
		if (!this.highlightManager) return;
		if (!this.renderManager) return;

		this.highlightManager.update(deltaTime);
		this.gizmoManager?.update();
		this.renderManager.render();
		this.interactionManager?.update();
	}

	// Schematic rendering bounds management

	/**
	 * Gets the rendering bounds for a schematic
	 * @param schematicId ID of the schematic
	 * @param asArrays If true, returns min/max as arrays instead of Vector3s
	 * @returns The rendering bounds or null if schematic not found
	 */
	public getRenderingBounds(
		schematicId: string,
		asArrays: boolean = true
	): { min: THREE.Vector3 | number[]; max: THREE.Vector3 | number[] } | null {
		const schematic = this.schematicManager?.getSchematic(schematicId);
		if (!schematic) {
			console.error(`Schematic with ID ${schematicId} not found`);
			return null;
		}

		if (asArrays) {
			return {
				min: schematic.renderingBounds.min.toArray(),
				max: schematic.renderingBounds.max.toArray(),
			};
		} else {
			return {
				min: schematic.renderingBounds.min.clone(),
				max: schematic.renderingBounds.max.clone(),
			};
		}
	}

	/**
	 * Sets the rendering bounds for a schematic and enables them
	 * @param schematicId ID of the schematic
	 * @param min Minimum coordinates (Vector3 or array [x,y,z])
	 * @param max Maximum coordinates (Vector3 or array [x,y,z])
	 * @param showHelper Whether to show a visual helper for the bounds
	 */
	public setRenderingBounds(
		schematicId: string,
		min: THREE.Vector3 | number[],
		max: THREE.Vector3 | number[],
		showHelper: boolean = true
	): void {
		const schematic = this.schematicManager?.getSchematic(schematicId);
		if (!schematic) {
			console.error(`Schematic with ID ${schematicId} not found`);
			return;
		}

		schematic.setRenderingBounds(min, max, showHelper);
		// Enable the bounds when explicitly set
		schematic.renderingBounds.enabled = true;
	}

	/**
	 * Sets a specific axis of the rendering bounds
	 * @param schematicId ID of the schematic
	 * @param axis The axis to set ('x', 'y', or 'z')
	 * @param minValue Minimum value for the axis
	 * @param maxValue Maximum value for the axis
	 */
	public setRenderingBoundsAxis(
		schematicId: string,
		axis: "x" | "y" | "z",
		minValue: number,
		maxValue: number
	): void {
		const schematic = this.schematicManager?.getSchematic(schematicId);
		if (!schematic) {
			console.error(`Schematic with ID ${schematicId} not found`);
			return;
		}

		const bounds = this.getRenderingBounds(schematicId, false);
		if (!bounds) return;

		const min = bounds.min as THREE.Vector3;
		const max = bounds.max as THREE.Vector3;

		// Update just the specified axis
		min[axis] = minValue;
		max[axis] = maxValue;

		schematic.setRenderingBounds(min, max);
	}

	/**
	 * Resets the rendering bounds to include the full schematic or disables them
	 * @param schematicId ID of the schematic
	 * @param disable Whether to disable the rendering bounds (default: true)
	 */
	public resetRenderingBounds(
		schematicId: string,
		disable: boolean = true
	): void {
		const schematic = this.schematicManager?.getSchematic(schematicId);
		if (!schematic) {
			console.error(`Schematic with ID ${schematicId} not found`);
			return;
		}

		schematic.resetRenderingBounds();
		// By default, disable the bounds when reset
		schematic.renderingBounds.enabled = !disable;
	}

	/**
	 * Shows or hides the rendering bounds helper
	 * @param schematicId ID of the schematic
	 * @param visible Whether the helper should be visible
	 */
	public showRenderingBoundsHelper(
		schematicId: string,
		visible: boolean
	): void {
		const schematic = this.schematicManager?.getSchematic(schematicId);
		if (!schematic) {
			console.error(`Schematic with ID ${schematicId} not found`);
			return;
		}

		schematic.showRenderingBoundsHelper(visible);
	}

	/**
	 * Gets the dimensions of a schematic
	 * @param schematicId ID of the schematic
	 * @returns The dimensions as an array [width, height, depth] or null if schematic not found
	 */
	public getSchematicDimensions(
		schematicId: string
	): Int32Array | number[] | null {
		const schematic = this.schematicManager?.getSchematic(schematicId);
		if (!schematic) {
			console.error(`Schematic with ID ${schematicId} not found`);
			return null;
		}

		return Array.from(schematic.schematicWrapper.get_dimensions());
	}

	/**
	 * Gets all currently loaded schematics
	 * @returns Array of schematic IDs
	 */
	public getLoadedSchematics(): string[] {
		if (!this.schematicManager) return [];
		return this.schematicManager
			.getAllSchematics()
			.map((schematic) => schematic.id);
	}

	/**
	 * Creates console-friendly settings for working with rendering bounds
	 * Delegates to the SchematicObject's createBoundsControls method
	 * @param schematicId ID of the schematic
	 * @returns Functions for easy console usage
	 */
	public createBoundsControls(schematicId: string): any {
		const schematic = this.schematicManager?.getSchematic(schematicId);
		if (!schematic) {
			console.error(`Schematic with ID ${schematicId} not found`);
			return null;
		}

		return schematic.createBoundsControls();
	}

	/**
	 * Provides direct access to a schematic's bounds for easy manipulation
	 * @param schematicId ID of the schematic
	 * @returns The schematic's reactive bounds object or null if not found
	 */
	public getBounds(schematicId: string): any {
		const schematic = this.schematicManager?.getSchematic(schematicId);
		if (!schematic) {
			console.error(`Schematic with ID ${schematicId} not found`);
			return null;
		}

		return schematic.bounds;
	}

	// Resource pack management methods
	public async getResourcePacks(): Promise<
		Array<{ name: string; enabled: boolean; order: number }>
	> {
		await this.resourcePackManager.initPromise;
		return await this.resourcePackManager.listPacks();
	}

	public async addResourcePack(file: File): Promise<void> {
		// Show progress for resource pack upload
		if (this.options.enableProgressBar && this.uiManager) {
			this.uiManager.showProgressBar(`Adding resource pack: ${file.name}`);
			this.uiManager.updateProgress(0.1, "Processing pack file...");
		}

		// Add to your existing system
		await this.resourcePackManager.uploadPack(file);

		if (this.options.enableProgressBar && this.uiManager) {
			this.uiManager.updateProgress(0.3, "Loading into Cubane...");
		}

		// Also load directly into Cubane for immediate use
		try {
			await this.cubane.loadResourcePack(file);
		} catch (error) {
			console.error("Failed to load new resource pack into Cubane:", error);
		}

		if (this.options.enableProgressBar && this.uiManager) {
			this.uiManager.updateProgress(0.6, "Rebuilding meshes...");
		}

		// Rebuild world meshes if needed
		if (this.worldMeshBuilder && this.schematicManager) {
			for (const schematic of this.schematicManager.getAllSchematics()) {
				await this.worldMeshBuilder.rebuildSchematic(schematic.id);
			}
		}

		if (this.options.enableProgressBar && this.uiManager) {
			this.uiManager.updateProgress(1.0, "Resource pack added");
			setTimeout(() => this.uiManager?.hideProgressBar(), 500);
		}
	}

	public async toggleResourcePackEnabled(
		name: string,
		enabled: boolean
	): Promise<void> {
		// Show progress for resource pack toggling
		if (this.options.enableProgressBar && this.uiManager) {
			const actionText = enabled ? "Enabling" : "Disabling";
			this.uiManager.showProgressBar(`${actionText} resource pack: ${name}`);
			this.uiManager.updateProgress(0.2, `${actionText} ${name}...`);
		}

		await this.resourcePackManager.togglePackEnabled(name, enabled);
		await this.reloadResources();
	}

	public async removeResourcePack(name: string): Promise<void> {
		// Show progress for resource pack removal
		if (this.options.enableProgressBar && this.uiManager) {
			this.uiManager.showProgressBar(`Removing resource pack: ${name}`);
			this.uiManager.updateProgress(0.2, `Removing ${name}...`);
		}

		await this.resourcePackManager.removePack(name);
		await this.reloadResources();
	}

	private async reloadResources(): Promise<void> {
		// Show progress bar for resource reload
		if (this.options.enableProgressBar && this.uiManager) {
			this.uiManager.showProgressBar("Reloading resources...");
			this.uiManager.updateProgress(0.2, "Processing resource packs...");
		}

		// Clear Cubane's existing resources
		this.cubane.dispose();
		this.cubane = new Cubane(); // Recreate fresh instance

		// Reinitialize resource packs in Cubane
		await this.initializeResourcePacks();

		if (this.options.enableProgressBar && this.uiManager) {
			this.uiManager.updateProgress(0.5, "Loading textures and models...");
		}

		// Rebuild world meshes with new resources
		if (this.worldMeshBuilder && this.schematicManager) {
			this.uiManager?.updateProgress(0.7, "Rebuilding schematic meshes...");

			// Trigger rebuild of all schematic meshes
			for (const schematic of this.schematicManager.getAllSchematics()) {
				await this.worldMeshBuilder.rebuildSchematic(schematic.id);
			}
		}

		if (this.options.enableProgressBar && this.uiManager) {
			this.uiManager.updateProgress(1.0, "Resources loaded");

			// Hide progress bar after a short delay
			setTimeout(() => {
				this.uiManager?.hideProgressBar();
			}, 500);
		}

		this.materialMap.clear();
	}

	public dispose(): void {
		if (!this.renderManager) {
			return;
		}
		if (!this.highlightManager) {
			return;
		}
		if (!this.uiManager) {
			return;
		}

		this.highlightManager.dispose();
		this.renderManager.renderer.dispose();
		this.dragAndDropManager?.dispose();
		this.uiManager.dispose();
		this.cameraManager.dispose();

		// Clean up Cubane resources
		this.cubane.dispose();

		// Cleanup event listeners
		this.eventEmitter.removeAllListeners();
	}
}
