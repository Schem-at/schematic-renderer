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
import { ResourceLoader } from "./ResourceLoader";
import { EventEmitter } from "events";
import {
	ResourcePackManager,
	DefaultPackCallback,
} from "./managers/ResourcePackManager";
// @ts-ignore
import init from "./wasm/minecraft_schematic_utils";
import { GizmoManager } from "./managers/GizmoManager";
import { CameraPathManager } from "./managers/CameraPathManager";
import { CircularCameraPath } from "./camera/CircularCameraPath";
import { SchematicRendererOptions } from "./SchematicRendererOptions";
import { merge } from "lodash";
import { UIManager } from "./managers/UIManager";

const DEFAULT_OPTIONS: SchematicRendererOptions = {
	showCameraPathVisualization: false,
	enableInteraction: false,
	enableDragAndDrop: false,
	enableGizmos: false,
	callbacks: {},
	interactionOptions: {
		enableSelection: false,
		enableMovingSchematics: false,
	},
	dragAndDropOptions: {
		acceptedFileTypes: [],
	},
	gizmoOptions: {
		enableRotation: false,
		enableScaling: false,
	},
	cameraOptions: {
		position: [5, 5, 5],
	},
};

export class SchematicRenderer {
	public canvas: HTMLCanvasElement;
	public clock: THREE.Clock;
	public options: any;
	public eventEmitter: EventEmitter;
	public cameraManager: CameraManager;
	public sceneManager: SceneManager;
	public cameraPathManager: CameraPathManager;
	public uiManager: UIManager;
	public renderManager: RenderManager;
	public interactionManager: InteractionManager;
	public dragAndDropManager?: DragAndDropManager;
	public highlightManager: HighlightManager;
	public schematicManager: SchematicManager;
	public worldMeshBuilder: WorldMeshBuilder;
	public gizmoManager: GizmoManager;
	public resourceLoader: ResourceLoader;
	public materialMap: Map<string, THREE.Material>;
	private resourcePackManager: ResourcePackManager;
	private wasmModule: any;
	public state: any;

	constructor(
		canvas: HTMLCanvasElement,
		schematicData: { [key: string]: () => Promise<ArrayBuffer> } = {},
		defaultResourcePacks: Record<string, DefaultPackCallback> = {},
		options: SchematicRendererOptions = {}
	) {
		this.canvas = canvas;
		this.options = merge({}, DEFAULT_OPTIONS, options);

		this.clock = new THREE.Clock();
		this.materialMap = new Map();

		this.eventEmitter = new EventEmitter();

		// Attach this instance to the canvas for external access
		(this.canvas as any).schematicRenderer = this;


		// Initialize other managers that do not depend on the initialization process
		this.sceneManager = new SceneManager(this);
		
		// Initialize the camera manager first
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

		// Start the initialization process
		this.initialize(schematicData, defaultResourcePacks);

		this.uiManager = new UIManager(this);
	}

	updateCameraPosition() {
		this.state.cameraPosition.copy(this.cameraManager.activeCamera.position);
	}

	private async initialize(
		schematicData: { [key: string]: () => Promise<ArrayBuffer> },
		defaultResourcePacks: Record<string, DefaultPackCallback>
	) {
		try {
			// Initialize WASM module
			await this.initWasm();

			// Initialize resource packs
			await this.initializeResourcePacks(defaultResourcePacks);

			// Initialize the resource loader
			this.resourceLoader = new ResourceLoader(
				this.options.resourcePackBlobs,
				this
			);
			await this.resourceLoader.initialize();

			// Initialize the world mesh builder
			this.worldMeshBuilder = new WorldMeshBuilder(this);

			// Initialize the schematic manager
			this.schematicManager = new SchematicManager(this, {
				singleSchematicMode: this.options.singleSchematicMode,
			});

			// Initialize the render manager
			this.renderManager = new RenderManager(this);

			// Initialize the highlight manager
			this.highlightManager = new HighlightManager(this);

			// Initialize the gizmo manager if enabled
			if (this.options.enableGizmos) {
				this.gizmoManager = new GizmoManager(
					this,
					this.options.gizmoOptions || {}
				);
			}

			// Load the schematics using the schematic manager
			await this.schematicManager.loadSchematics(schematicData);

			// Adjust camera based on schematics
			const averagePosition =
				this.schematicManager.getSchematicsAveragePosition();
			const maxDimensions = this.schematicManager.getMaxSchematicDimensions();
			console.log("Schematic dimensions:", maxDimensions);

			this.cameraManager.activeCamera.lookAt(averagePosition);
			this.cameraManager.activeCamera.position.set(
				averagePosition.x + maxDimensions.x,
				averagePosition.y + maxDimensions.y,
				averagePosition.z + maxDimensions.z
			);
			this.cameraManager.update();

			// Initialize the interaction manager after all dependencies are ready
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
						onSchematicLoaded: this.options.callbacks?.onSchematicLoaded,
					},
				};
				this.dragAndDropManager = new DragAndDropManager(
					this,
					dragAndDropOptions
				);
			}

			// Start the rendering loop
			this.animate();

			const callback = this.options.callbacks?.onRendererInitialized;
			if (callback) {
				callback();
			}
		} catch (error) {
			console.error("Failed to initialize SchematicRenderer:", error);
		}

		const event = new CustomEvent("rendererInitialized");
		this.canvas.dispatchEvent(event);
	}


	private async initWasm() {
		try {
			this.wasmModule = await init();
		} catch (error) {
			console.error("Failed to initialize WASM module:", error);
		}
	}

	private async initializeResourcePacks(
		defaultResourcePacks?: Record<string, DefaultPackCallback>
	) {
		// Wait for ResourcePackManager to initialize
		await this.resourcePackManager.initPromise;

		this.options.resourcePackBlobs =
			await this.resourcePackManager.getResourcePackBlobs(
				defaultResourcePacks || {}
			);
	}

	private animate() {
		requestAnimationFrame(() => this.animate());
		const deltaTime = this.clock.getDelta();

		// Update highlight manager
		this.highlightManager.update(deltaTime);

		// Update gizmo manager if it exists
		this.gizmoManager?.update();

		// Render the scene
		this.renderManager.render();

		// Update interaction manager if it exists
		this.interactionManager?.update();
	}

	// Method to capture a screenshot
	public captureScreenshot(
		options: {
			format?: string; // e.g., 'image/png', 'image/jpeg'
			quality?: number; // 0 to 1 (for 'image/jpeg')
			callback?: (blob: Blob) => void;
		} = {}
	) {
		const canvas = this.renderManager.renderer.domElement;
		const { format = "image/png", quality = 1, callback } = options;

		canvas.toBlob(
			(blob) => {
				if (blob && callback) {
					callback(blob);
				}
			},
			format,
			quality
		);
	}

	// Method to record an animation
	public recordAnimation(options: {
		mimeType?: string; // e.g., 'video/webm; codecs=vp9'
		frameRate?: number;
		duration: number; // Duration in seconds
		onProgress?: (progress: number) => void;
		callback?: (blob: Blob) => void;
	}) {
		const canvas = this.renderManager.renderer.domElement;
		const {
			mimeType = "video/webm; codecs=vp9",
			frameRate = 30,
			duration,
			onProgress,
			callback,
		} = options;

		if (!canvas.captureStream) {
			console.error("Your browser does not support canvas.captureStream.");
			return;
		}

		const stream = canvas.captureStream(frameRate);
		const mediaRecorder = new MediaRecorder(stream, { mimeType });
		const chunks: BlobPart[] = [];

		mediaRecorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				chunks.push(event.data);
			}
		};

		mediaRecorder.onstop = () => {
			const blob = new Blob(chunks, { type: mimeType });
			if (callback) {
				callback(blob);
			}
		};

		mediaRecorder.start();

		const startTime = performance.now();
		const totalDuration = duration * 1000; // Convert to milliseconds

		const trackProgress = () => {
			const elapsed = performance.now() - startTime;
			const progress = Math.min(elapsed / totalDuration, 1);

			if (onProgress) {
				onProgress(progress);
			}

			if (progress < 1) {
				requestAnimationFrame(trackProgress);
			}
		};

		trackProgress();

		setTimeout(() => {
			mediaRecorder.stop();
		}, totalDuration);
	}

	// Exposed methods for resource pack management

	/**
	 * Returns a list of resource packs with their names, enabled status, and order.
	 */
	public async getResourcePacks(): Promise<
		{ name: string; enabled: boolean; order: number }[]
	> {
		await this.resourcePackManager.initPromise;
		return await this.resourcePackManager.listPacks();
	}

	/**
	 * Adds a new resource pack from a File object.
	 * @param file The resource pack file (.zip)
	 */
	public async addResourcePack(file: File): Promise<void> {
		await this.resourcePackManager.uploadPack(file);
		// Reload resources if necessary
		await this.reloadResources();
	}

	/**
	 * Toggles the enabled state of a resource pack.
	 * @param name The name of the resource pack
	 * @param enabled The new enabled state
	 */
	public async toggleResourcePackEnabled(
		name: string,
		enabled: boolean
	): Promise<void> {
		await this.resourcePackManager.togglePackEnabled(name, enabled);
		// Reload resources if necessary
		await this.reloadResources();
	}

	/**
	 * Removes a resource pack by name.
	 * @param name The name of the resource pack to remove
	 */
	public async removeResourcePack(name: string): Promise<void> {
		await this.resourcePackManager.removePack(name);
		// Reload resources if necessary
		await this.reloadResources();
	}

	/**
	 * Reloads the resources and updates the scene.
	 */
	private async reloadResources(): Promise<void> {
		// Re-initialize resource packs
		await this.initializeResourcePacks();

		// Re-initialize the resource loader with updated resource packs
		this.resourceLoader = new ResourceLoader(
			this.options.resourcePackBlobs,
			this
		);
		await this.resourceLoader.initialize();

		// Rebuild the materials
		this.materialMap.clear();

		// Rebuild the world mesh
		await this.worldMeshBuilder.rebuildWorldMesh();

		// Update the scene
		this.sceneManager.updateScene();
	}

	public dispose() {
		// Dispose managers
		this.highlightManager.dispose();
		this.dragAndDropManager?.dispose();
		this.uiManager.dispose();
	}
}
