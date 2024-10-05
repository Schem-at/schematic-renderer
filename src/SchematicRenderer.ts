import * as THREE from "three";
import { CameraManager } from "./managers/CameraManager";
import { SceneManager } from "./managers/SceneManager";
import { RenderManager } from "./managers/RenderManager";
import { InteractionManager } from "./managers/InteractionManager";
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
		options: any = {}
	) {
		this.canvas = canvas;

		this.clock = new THREE.Clock();
		this.materialMap = new Map();

		this.options = options;
		this.eventEmitter = new EventEmitter();

		this.canvas.schematicRenderer = this;

		// Initialize managers
		this.cameraManager = new CameraManager(this, {
			position: [5, 5, 5],
		});
		this.sceneManager = new SceneManager(this);
		this.eventEmitter.emit("sceneReady");

		this.resourcePackManager = new ResourcePackManager();

		this.state = {
			cameraPosition: new THREE.Vector3(),
		};

		// Start the initialization process
		this.initialize(schematicData, defaultResourcePacks);
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
			this.schematicManager = new SchematicManager(
				this.worldMeshBuilder,
				this.eventEmitter,
				this.sceneManager
			);

			// Initialize the render manager
			this.renderManager = new RenderManager(this);

			// Initialize the interaction manager
			this.interactionManager = new InteractionManager(this);

			// Initialize the highlight manager
			this.highlightManager = new HighlightManager(this);

			this.gizmoManager = new GizmoManager(this);

			// Load the schematics using the schematic manager
			await this.schematicManager.loadSchematics(schematicData);

			// Adjust camera based on schematics
			const averagePosition =
				this.schematicManager.getSchematicsAveragePosition();
			const maxDimensions = this.schematicManager.getMaxSchematicDimensions();
			console.log("Schematic dimensions:", maxDimensions);
			console.log(this.worldMeshBuilder.blockMeshCache);
			this.cameraManager.activeCamera.lookAt(averagePosition);
			this.cameraManager.activeCamera.position = new THREE.Vector3(
				averagePosition.x + maxDimensions.x,
				averagePosition.y + maxDimensions.y,
				averagePosition.z + maxDimensions.z
			);
			this.cameraManager.update();

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
		this.interactionManager.update();
		// Update highlight manager
		this.highlightManager.update(deltaTime);

		this.gizmoManager.update();
		// Render the scene
		this.renderManager.render();
	}
}
