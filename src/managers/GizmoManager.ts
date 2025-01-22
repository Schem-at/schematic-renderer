import * as THREE from "three";
// @ts-ignore
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import { SchematicRenderer } from "../SchematicRenderer";
import { SelectableObject } from "./SelectableObject";
import { SchematicObject } from "./SchematicObject";

export interface GizmoManagerOptions {
	enableRotation?: boolean; // Enables rotation gizmo
	enableScaling?: boolean; // Enables scaling gizmo
	// Add other gizmo-related options as needed
}

export class GizmoManager {
	private transformControls: TransformControls;
	private schematicRenderer: SchematicRenderer;
	private boundingBoxHelper: THREE.BoxHelper | null = null;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		if (!this.schematicRenderer.sceneManager) {
			throw new Error("SceneManager is required to use GizmoManager");
		}
		this.transformControls = new TransformControls(
			this.schematicRenderer.cameraManager.activeCamera.camera,
			this.schematicRenderer.renderManager?.renderer.domElement
		);
		this.schematicRenderer.sceneManager.scene.add(this.transformControls);

		// Disable camera controls when transforming
		this.transformControls.addEventListener(
			"dragging-changed",
			(event: any) => {
				const controls =
					this.schematicRenderer.cameraManager.controls.get("orbit");
				if (controls) {
					controls.enabled = !event.value;
				}
			}
		);

		// Update bounding box helper when transforming
		this.transformControls.addEventListener("change", () => {
			if (this.boundingBoxHelper) {
				this.boundingBoxHelper.update();
			}
		});

		// Listen to transform change events to synchronize schematic object
		this.transformControls.addEventListener("objectChange", () => {
			const object = this.transformControls.object;
			if (object && object instanceof THREE.Object3D) {
				const schematic = this.schematicRenderer.schematicManager?.getSchematic(
					object.name
				);
				if (schematic) {
					schematic.syncTransformFromGroup();
				}
			}
		});

		this.transformControls.addEventListener(
			"dragging-changed",
			(event: any) => {
				const controls =
					this.schematicRenderer.cameraManager.controls.get("orbit");
				console.log(controls);
				if (controls) {
					controls.enabled = !event.value;
				}
			}
		);

		this.setupEventListeners();
	}

	private setupEventListeners() {
		this.schematicRenderer.eventEmitter.on(
			"objectSelected",
			this.onObjectSelected.bind(this)
		);
		this.schematicRenderer.eventEmitter.on(
			"objectDeselected",
			this.onObjectDeselected.bind(this)
		);
	}

	public detach() {
		this.transformControls.detach();
		if (this.boundingBoxHelper) {
			this.schematicRenderer.sceneManager.scene.remove(this.boundingBoxHelper);
			this.boundingBoxHelper.geometry.dispose();
			this.boundingBoxHelper = null;
		}
	}

	private onObjectSelected(object: SelectableObject) {
		let threeObject: THREE.Object3D | null = null;

		if (object instanceof SchematicObject) {
			threeObject = object.group;
		} else if (object instanceof THREE.Object3D) {
			threeObject = object;
		}

		if (threeObject) {
			this.transformControls.attach(threeObject);
			console.log("Gizmo attached to:", threeObject.name);

			// Remove any existing bounding box helper
			if (this.boundingBoxHelper) {
				this.schematicRenderer.sceneManager.scene.remove(
					this.boundingBoxHelper
				);
				this.boundingBoxHelper = null;
			}

			// Create a new bounding box helper
			this.boundingBoxHelper = new THREE.BoxHelper(threeObject, 0xffff00);
			this.schematicRenderer.sceneManager.scene.add(this.boundingBoxHelper);
		}
	}

	private onObjectDeselected() {
		this.transformControls.detach();
		console.log("Gizmo detached");

		// Remove the bounding box helper
		if (this.boundingBoxHelper) {
			this.schematicRenderer.sceneManager.scene.remove(this.boundingBoxHelper);
			this.boundingBoxHelper = null;
		}
	}

	public setMode(mode: "translate" | "rotate" | "scale") {
		this.transformControls.setMode(mode);
	}

	private handleTransformError() {
		if (
			this.transformControls.object &&
			!this.schematicRenderer.sceneManager.scene.getObjectById(
				this.transformControls.object.id
			)
		) {
			this.detach();
		}
	}

	public update() {
		try {
			this.handleTransformError();
			if (this.boundingBoxHelper) {
				this.boundingBoxHelper.update();
			}
		} catch (error) {
			this.detach();
		}
	}

	public dispose() {
		this.schematicRenderer.sceneManager.scene.remove(this.transformControls);
		this.transformControls.dispose();

		if (this.boundingBoxHelper) {
			this.schematicRenderer.sceneManager.scene.remove(this.boundingBoxHelper);
			this.boundingBoxHelper = null;
		}
	}
}
