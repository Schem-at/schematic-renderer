import * as THREE from "three";
import { CameraManager } from "./managers/CameraManager";
import { SceneManager } from "./managers/SceneManager";
import { RenderManager } from "./managers/RenderManager";
import { InteractionManager } from "./managers/InteractionManager";
import { HighlightManager } from "./managers/HighlightManager";
import { SchematicManager } from "./managers/SchematicManager";
import { SchematicObject } from "./managers/SchematicObject";
import { WorldMeshBuilder } from "./WorldMeshBuilder";
import { ResourceLoader } from "./ResourceLoader";
import { EventEmitter } from "events";
import {
	ResourcePackManager,
	DefaultPackCallback,
} from "./managers/ResourcePackManager";
// @ts-ignore
import init, { SchematicWrapper } from "./wasm/minecraft_schematic_utils";

export class SchematicRenderer {
	public canvas: HTMLCanvasElement;
	public clock: THREE.Clock;
	public options: any;
	public eventEmitter: EventEmitter;
	public cameraManager: CameraManager;
	public sceneManager: SceneManager;
	public renderManager: RenderManager;
	public interactionManager: InteractionManager;
	public highlightManager: HighlightManager;
	private schematicManager: SchematicManager;
	private worldMeshBuilder: WorldMeshBuilder;
	public resourceLoader: ResourceLoader;
	public materialMap: Map<string, THREE.Material>;
	private resourcePackManager: ResourcePackManager;
	private wasmModule: any;
	public state: any;

	constructor(
		canvas: HTMLCanvasElement,
		schematicData: { [key: string]: () => Promise<ArrayBuffer> } = {},
		defaultResourcePacks: Record<string, DefaultPackCallback> = {},
		options: any = {}
	) {
		this.canvas = canvas;

		this.clock = new THREE.Clock();
		this.materialMap = new Map();

		this.options = options;
		this.eventEmitter = new EventEmitter();

		this.canvas.schematicRenderer = this;

		// Initialize managers
		this.cameraManager = new CameraManager(this);
		this.sceneManager = new SceneManager(this);

		this.resourcePackManager = new ResourcePackManager();

		this.state = {
			cameraPosition: new THREE.Vector3(),
		};

		// Start the initialization process
		this.initialize(schematicData, defaultResourcePacks);
	}

	updateCameraPosition() {
		this.state.cameraPosition.copy(this.cameraManager.activeCamera.position);
		// This will automatically trigger UI updates if bound correctly
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
			this.schematicManager = new SchematicManager();

			// Initialize the render manager
			this.renderManager = new RenderManager(this);

			// Initialize the interaction manager
			this.interactionManager = new InteractionManager(this);

			// Initialize the highlight manager
			this.highlightManager = new HighlightManager(this);

			// Load the schematics
			await this.loadSchematics(schematicData);
			// Start the rendering loop
			this.animate();
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
		this.options.resourcePackBlobs =
			await this.resourcePackManager.getResourcePackBlobs(
				defaultResourcePacks || {}
			);
	}

	private animate() {
		requestAnimationFrame(() => this.animate());
		const deltaTime = this.clock.getDelta();

		// Update interaction manager
		this.interactionManager.update(deltaTime);
		// Update highlight manager
		this.highlightManager.update(deltaTime);
		// Render the scene
		this.renderManager.render();
	}

	public async loadSchematics(
		schematicData: { [key: string]: () => Promise<ArrayBuffer> },
		propertiesMap?: {
			[key: string]: Partial<{
				position: THREE.Vector3;
				rotation: THREE.Euler;
				scale: THREE.Vector3;
				opacity: number;
				visible: boolean;
			}>;
		}
	) {
		for (const key in schematicData) {
			if (schematicData.hasOwnProperty(key)) {
				const arrayBuffer = await schematicData[key]();
				const properties = propertiesMap ? propertiesMap[key] : undefined;
				await this.loadSchematic(key, arrayBuffer, properties);
			}
		}
	}

	// Method to load a single schematic
	public async loadSchematic(
		name: string,
		schematicData: ArrayBuffer,
		properties?: Partial<{
			position: THREE.Vector3;
			rotation: THREE.Euler;
			scale: THREE.Vector3;
			opacity: number;
			visible: boolean;
		}>
	) {
		// Create a SchematicWrapper from the data
		const schematicWrapper = new SchematicWrapper();
		schematicWrapper.from_data(new Uint8Array(schematicData));

		// Create a SchematicObject
		const schematicObject = new SchematicObject(
			name,
			schematicWrapper,
			this.worldMeshBuilder,
			this.eventEmitter,
			this.sceneManager,
			properties
		);

		this.schematicManager.addSchematic(schematicObject);

		// Wait for meshes to be ready before adding them to the scene
		const meshes = await schematicObject.getMeshes();
		meshes.forEach((mesh) => {
			this.sceneManager.add(mesh);
		});
	}
}
