import * as THREE from "three";
import { SchematicRenderer } from "../SchematicRenderer";
import { SelectableObject } from "./SelectableObject";
import { SchematicObject } from "./SchematicObject";

export interface InteractionManagerOptions {
	enableSelection?: boolean;
	enableMovingSchematics?: boolean;
}

export class InteractionManager {
	private schematicRenderer: SchematicRenderer;
	private options: InteractionManagerOptions;
	private raycaster: THREE.Raycaster;
	private mouse: THREE.Vector2;
	private camera: THREE.Camera;
	private hoveredObject: SelectableObject | null = null;
	private canvas: HTMLCanvasElement;
	private selectedObject: SelectableObject | null = null;

	constructor(schematicRenderer: SchematicRenderer, options: InteractionManagerOptions) {
		this.schematicRenderer = schematicRenderer;
		this.options = options;

		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();
		this.camera = this.schematicRenderer.cameraManager.activeCamera.camera;
		this.canvas = this.schematicRenderer.canvas;

		this.addEventListeners();
	}

	private addEventListeners() {
		// Only add event listeners if the corresponding functionality is enabled
		if (this.options.enableSelection) {
			this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
			this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
			window.addEventListener('keydown', this.onKeyDown.bind(this));
		}

		// Listen for external selection events (e.g. from RegionManager) to keep state in sync
		this.schematicRenderer.eventEmitter.on("objectSelected", (object: SelectableObject) => {
			if (this.selectedObject !== object) {
				this.selectedObject = object;
				console.log("InteractionManager synced selection:", object.id);
			}
		});

		this.schematicRenderer.eventEmitter.on("objectDeselected", () => {
			if (this.selectedObject) {
				this.selectedObject = null;
			}
		});
	}

	private onMouseMove(event: MouseEvent) {
		if (!this.options.enableSelection) return;

		this.updateMousePosition(event);
		// Uncomment if hover functionality is needed
		// this.checkHover();
	}

	private onMouseDown(event: MouseEvent) {
		if (!this.options.enableSelection) return;

		this.updateMousePosition(event);
		this.checkSelection();
	}

	private onKeyDown(event: KeyboardEvent) {
		if (!this.options.enableMovingSchematics) return;

		switch (event.key) {
			case 'g': // Press 'g' for translate mode
				this.schematicRenderer.gizmoManager?.setMode('translate');
				break;
			case 'r': // Press 'r' for rotate mode
				this.schematicRenderer.gizmoManager?.setMode('rotate');
				break;
			case 's': // Press 's' for scale mode
				this.schematicRenderer.gizmoManager?.setMode('scale');
				break;
			case 'Escape': // Press 'Escape' to deselect object
				this.deselectObject();
				break;
		}
	}


	private updateMousePosition(event: MouseEvent) {
		const rect = this.canvas.getBoundingClientRect();
		this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	}

	// @ts-ignore
	private checkHover() {
		this.raycaster.setFromCamera(this.mouse, this.camera);

		const selectableObjects =
			this.schematicRenderer.schematicManager?.getSelectableObjects();

		if (!selectableObjects || selectableObjects.length === 0) {
			console.warn("No selectable objects found");
			return;
		}

		// Filter out any undefined objects
		const validObjects = selectableObjects.filter((obj) => obj !== undefined);

		if (validObjects.length !== selectableObjects.length) {
			console.warn(
				`Filtered out ${selectableObjects.length - validObjects.length
				} undefined objects`
			);
		}

		try {
			const intersects = this.raycaster.intersectObjects(validObjects, true);

			if (intersects.length > 0) {
				const intersectedObject = intersects[0].object;
				const selectableObject = this.findSelectableParent(intersectedObject);

				if (selectableObject && selectableObject !== this.hoveredObject) {
					if (this.hoveredObject) {
						this.schematicRenderer.eventEmitter.emit(
							"hoverExit",
							this.hoveredObject
						);
					}
					this.hoveredObject = selectableObject;
					this.schematicRenderer.eventEmitter.emit(
						"hoverEnter",
						selectableObject,
						intersects[0]
					);
					console.log("Hovering over object", selectableObject.id);
				}
			} else if (this.hoveredObject) {
				this.schematicRenderer.eventEmitter.emit(
					"hoverExit",
					this.hoveredObject
				);
				this.hoveredObject = null;
			}
		} catch (error) {
			// console.error("Error in checkHover:", error);
			// console.log("Camera:", this.camera);
			// console.log("Mouse:", this.mouse);
			// console.log("Valid objects:", validObjects);
		}
	}

	private findSelectableParent(
		object: THREE.Object3D
	): SelectableObject | null {
		let current: THREE.Object3D | null = object;
		while (current) {
			if (current instanceof THREE.Group && current.name) {
				const schematic = this.schematicRenderer.schematicManager?.getSchematic(
					current.name
				);
				if (schematic) {
					console.log("Found selectable parent:", schematic.id);
					return schematic;
				}
			}
			current = current.parent;
		}
		console.log("No selectable parent found");
		return null;
	}

	// @ts-ignore
	private visualizeBoundingBoxes() {
		const selectableObjects =
			this.schematicRenderer.schematicManager?.getSelectableObjects();
		if (!selectableObjects) {
			console.warn("No selectable objects found");
			return;
		}
		selectableObjects.forEach((object) => {
			const box = new THREE.Box3().setFromObject(object);
			const helper = new THREE.Box3Helper(box, new THREE.Color(0xffff00));
			this.schematicRenderer.sceneManager.scene.add(helper);

			console.log("Object:", object.name);
			console.log("  Position:", object.position);
			console.log("  Scale:", object.scale);
			console.log("  Bounding box min:", box.min);
			console.log("  Bounding box max:", box.max);
			console.log("  Bounding box size:", box.getSize(new THREE.Vector3()));
		});
		console.log("Added bounding box visualizations");
	}

	private checkSelection() {
		this.raycaster.setFromCamera(this.mouse, this.camera);
		const selectableObjects = this.schematicRenderer.schematicManager?.getSelectableObjects();

		if (!selectableObjects?.length) {
			console.warn("No selectable objects available");
			return;
		}

		// Verify objects are in scene
		const validObjects = selectableObjects.filter(obj =>
			this.schematicRenderer.sceneManager.scene.getObjectById(obj.id)
		);

		const intersects = this.raycaster.intersectObjects(validObjects, true);

		if (intersects.length > 0) {
			const intersectedObject = intersects[0].object;

			// Check if we hit a region handle (prevent main selection logic from overriding handle drag)
			if (intersectedObject.userData && intersectedObject.userData.isHandle) {
				return;
			}

			const selectableObject = this.findSelectableParent(intersectedObject);

			// Prevent selecting regions via click (they should be edited via API/UI)
			if (selectableObject && (
				selectableObject.id?.startsWith("region_") ||
				(selectableObject as any).name?.startsWith("region_") ||
				(selectableObject as any).group?.name?.startsWith("region_")
			)) {
				return;
			}

			if (selectableObject) {
				// Don't auto-edit regions on simple click unless we implement a specific double-click or UI button
				// However, if we select it, we want the gizmo to attach.

				// Ensure that if it is a region, we don't accidentally force handles visible if they weren't

				// NEW: If currently selected object is a Region, and the new object is a Schematic,
				// assume the user is interacting with the schematic content (placing/breaking/toggling)
				// while keeping the region active.
				if (this.selectedObject &&
					(this.selectedObject as any).id?.startsWith("region_") &&
					selectableObject instanceof SchematicObject) {
					console.log("Ignoring selection change from Region to Schematic (preserving region context)");
					return; // Don't switch selection to schematic
				}

				this.selectObject(selectableObject);
			}
		} else {
			// this.deselectObject();
		}
	}
	private selectObject(object: SelectableObject) {
		if (this.selectedObject !== object) {
			this.deselectObject(); // Deselect previous object if any
			this.selectedObject = object;
			this.schematicRenderer.eventEmitter.emit("objectSelected", object);
			console.log("Selected object:", object.id);
		}
	}

	private deselectObject() {
		if (this.selectedObject) {
			this.schematicRenderer.gizmoManager?.detach();
			this.schematicRenderer.eventEmitter.emit("objectDeselected", this.selectedObject);
			this.selectedObject = null;
		}
	}

	public update() {
		// This method can be called in the render loop if continuous updates are needed
	}

	public dispose() {
		this.canvas.removeEventListener("mousemove", this.onMouseMove);
		this.canvas.removeEventListener("mousedown", this.onMouseDown);
	}
}
