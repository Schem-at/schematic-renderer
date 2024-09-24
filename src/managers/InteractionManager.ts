// managers/InteractionManager.ts
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as THREE from "three";
import { CameraManager } from "./CameraManager";
import { EventEmitter } from "events";
import { SchematicRenderer } from "../SchematicRenderer";

export class InteractionManager {
	private schematicRenderer: SchematicRenderer;
	private cameraManager: CameraManager;
	private renderer: THREE.WebGLRenderer;
	private canvas: HTMLCanvasElement;
	private eventEmitter: EventEmitter;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.cameraManager = this.schematicRenderer.cameraManager;
		this.renderer = this.schematicRenderer.renderManager.renderer;
		this.canvas = this.schematicRenderer.canvas;
		this.eventEmitter = this.schematicRenderer.eventEmitter;

		// Setup event listeners
		this.setupEventListeners();
	}

	private setupEventListeners() {
		// Handle user interactions
		this.canvas.addEventListener("mousedown", this.onMouseDown.bind(this));
		// Other event listeners as needed
	}

	private onMouseDown(event: MouseEvent) {
		// Emit events based on interaction
		this.eventEmitter.emit("mouseDown", event);
	}

	public update(deltaTime: number) {
		// Handle other updates if necessary
	}

	public dispose() {
		// Clean up event listeners
		this.canvas.removeEventListener("mousedown", this.onMouseDown);
	}
}
