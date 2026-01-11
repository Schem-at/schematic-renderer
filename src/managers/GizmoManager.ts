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
		// Ensure it's on top of everything
		(this.transformControls as any).depthTest = false;
		(this.transformControls as any).depthWrite = false;
		(this.transformControls as any).renderOrder = 999;
		// TransformControls returns the gizmo helper from .getHelper(), not itself
		// Adding TransformControls directly will cause "object not an instance of THREE.Object3D" error
		const gizmoHelper = this.transformControls.getHelper?.() ?? this.transformControls;
		if (gizmoHelper instanceof THREE.Object3D) {
			this.schematicRenderer.sceneManager.scene.add(gizmoHelper);
		}

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
			// Emit modification event
			if (this.transformControls.object) {
				this.schematicRenderer.eventEmitter.emit("gizmoObjectModified", {
					object: this.transformControls.object,
					mode: this.transformControls.getMode()
				});
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

		// Listen for camera changes to update TransformControls
		this.schematicRenderer.cameraManager.on("cameraChanged", () => {
			this.transformControls.camera = this.schematicRenderer.cameraManager.activeCamera.camera;
		});
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
		} else if ((object as any).group instanceof THREE.Object3D) {
			// Handle objects that wrap a THREE.Group (like EditableRegionHighlight)
			threeObject = (object as any).group;
		}

		if (threeObject) {
			// Re-verify object existence in scene before attaching
			if (!this.schematicRenderer.sceneManager.scene.getObjectById(threeObject.id)) {
				// Special check: Regions are parented to Schematics, not Scene directly
				// const isRegion = (object as any).id?.startsWith("region_");
				let hasParent = false;
				let p = threeObject.parent;
				while (p) {
					if (p === this.schematicRenderer.sceneManager.scene) {
						hasParent = true;
						break;
					}
					p = p.parent;
				}

				if (!hasParent) {
					console.warn("Attempted to attach gizmo to detached object:", threeObject.name);
					return;
				}
			}

			this.transformControls.attach(threeObject);
			console.log("Gizmo attached to:", threeObject.name);

			// Remove any existing bounding box helper
			if (this.boundingBoxHelper) {
				this.schematicRenderer.sceneManager.scene.remove(
					this.boundingBoxHelper
				);
				this.boundingBoxHelper = null;
			}

			// Determine if we should set default mode based on object type
			// If it's a region, default to translate because handles handle scaling
			// Check both wrapper pattern (object.group exists) and direct object pattern
			if (
				((object as any).group && (object as any).id.startsWith("region_")) ||
				((object as any).name && (object as any).name.startsWith("region_"))
			) {
				this.setMode("translate");
			}

			// Force visibility and update
			this.transformControls.visible = true;
			this.transformControls.enabled = true;

			// Re-apply renderOrder and depthTest settings on attach
			if (typeof this.transformControls.traverse === 'function') {
				this.transformControls.traverse((child: THREE.Object3D) => {
					if ((child as any).material) {
						(child as any).material.depthTest = false;
						(child as any).material.depthWrite = false;
					}
					child.renderOrder = 999;
				});
			} else if (this.transformControls.children) {
				// Fallback for direct children
				this.transformControls.children.forEach((child: THREE.Object3D) => {
					if ((child as any).material) {
						(child as any).material.depthTest = false;
						(child as any).material.depthWrite = false;
					}
					child.renderOrder = 999;
				});
			}

			// Also set on the root just in case (though it's an Object3D)
			(this.transformControls as any).renderOrder = 999;

			// Reset size to default to ensure visibility
			this.transformControls.setSize(1.0);
			if (this.transformControls.getRaycaster()) {
				// Ensure raycaster checks all objects
				this.transformControls.getRaycaster().layers.enableAll();
			}

			// Create a new bounding box helper
			this.boundingBoxHelper = new THREE.BoxHelper(threeObject, 0xffff00);
			this.schematicRenderer.sceneManager.scene.add(this.boundingBoxHelper);

			// Force update immediately
			this.update();
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
			// Ensure visibility persists
			if (this.transformControls.object) {
				this.transformControls.visible = true;
				(this.transformControls as any).depthTest = false;
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
