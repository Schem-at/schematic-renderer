import * as THREE from "three";
import { SchematicRenderer } from "../../SchematicRenderer";
import { EditableRegionHighlight } from "./EditableRegionHighlight";

export class RegionInteractionHandler {
	private renderer: SchematicRenderer;
	private raycaster: THREE.Raycaster;
	private mouse: THREE.Vector2;

	private hoveredHandle: THREE.Mesh | null = null;
	private draggingHandle: THREE.Mesh | null = null;
	private dragOffset: number = 0;
	private activeRegion: EditableRegionHighlight | null = null;
	private dragPlane: THREE.Plane = new THREE.Plane();

	// Helper to track original colors
	private originalHandleColor: number = 0x00ff00;
	private hoverHandleColor: number = 0xffff00;

	constructor(renderer: SchematicRenderer) {
		this.renderer = renderer;
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();

		this.renderer.canvas.addEventListener("mousemove", this.onMouseMove.bind(this));
		this.renderer.canvas.addEventListener("mousedown", this.onMouseDown.bind(this));
		window.addEventListener("mouseup", this.onMouseUp.bind(this)); // Window to catch release outside canvas
	}

	private updateMouse(event: MouseEvent) {
		const rect = this.renderer.canvas.getBoundingClientRect();
		this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	}

	private onMouseMove(event: MouseEvent) {
		this.updateMouse(event);

		if (this.draggingHandle && this.activeRegion) {
			this.handleDrag();
			return;
		}

		this.checkHover();
	}

	private checkHover() {
		if (!this.renderer.regionManager || !this.renderer.cameraManager) return;

		const camera = this.renderer.cameraManager.activeCamera.camera;
		this.raycaster.setFromCamera(this.mouse, camera);

		const regions = this.renderer.regionManager.getAllRegions();
		const handleObjects: THREE.Object3D[] = [];

		// Collect all handles from all regions
		regions.forEach((region) => {
			region.group.traverse((child) => {
				if (child.userData && child.userData.isHandle) {
					handleObjects.push(child);
				}
			});
		});

		const intersects = this.raycaster.intersectObjects(handleObjects);

		if (intersects.length > 0) {
			const object = intersects[0].object as THREE.Mesh;

			// Double check visibility just in case
			if (!object.visible) return;

			if (this.hoveredHandle !== object) {
				this.clearHover();
				this.hoveredHandle = object;
				this.setHandleColor(this.hoveredHandle, this.hoverHandleColor);
				this.renderer.canvas.style.cursor = "pointer";
			}
		} else {
			this.clearHover();
		}
	}

	private clearHover() {
		if (this.hoveredHandle) {
			this.setHandleColor(this.hoveredHandle, this.originalHandleColor);
			this.hoveredHandle = null;
			this.renderer.canvas.style.cursor = "default";
		}
	}

	private setHandleColor(handle: THREE.Mesh, color: number) {
		if (handle.material instanceof THREE.MeshBasicMaterial) {
			handle.material.color.setHex(color);
		}
	}

	private onMouseDown() {
		if (this.hoveredHandle && !this.draggingHandle) {
			// Used to prevent default selection or similar if needed,
			// though not currently using 'event' directly other than knowing mousedown happened.
			// event.preventDefault();
			this.draggingHandle = this.hoveredHandle;

			// Find the region belonging to this handle
			const regions = this.renderer.regionManager?.getAllRegions() || [];
			this.activeRegion =
				regions.find((r) => r.name === this.draggingHandle!.userData.regionName) || null;

			if (this.activeRegion) {
				this.startDrag();
				// Select the region as well
				this.renderer.regionManager?.editRegion(this.activeRegion.name);
			}
		}
	}

	private startDrag() {
		if (!this.draggingHandle || !this.activeRegion || !this.renderer.cameraManager) return;

		// Disable orbit controls
		const controls = this.renderer.cameraManager.controls.get(
			this.renderer.cameraManager.activeControlKey
		);
		if (controls) {
			controls.enabled = false;
		}

		// Setup drag plane
		const face = this.draggingHandle.userData.face as string;
		const handlePos = new THREE.Vector3();
		this.draggingHandle.getWorldPosition(handlePos);

		const camera = this.renderer.cameraManager.activeCamera.camera;
		const cameraDir = new THREE.Vector3();
		camera.getWorldDirection(cameraDir);

		// Determine best plane for dragging
		// Axis of movement
		const axis = new THREE.Vector3();
		if (face.includes("X")) axis.set(1, 0, 0);
		else if (face.includes("Y")) axis.set(0, 1, 0);
		else if (face.includes("Z")) axis.set(0, 0, 1);

		// We want a plane containing the handle position
		// Normal should be one of the other two axes, whichever is most aligned with camera view (most perpendicular to camera plane is bad? No.)
		// We want plane normal to be roughly parallel to camera direction so the plane faces the camera.

		const planeNormal = new THREE.Vector3();

		if (axis.x !== 0) {
			// Moving on X
			// Candidates: Y (0,1,0) or Z (0,0,1)
			if (Math.abs(cameraDir.y) > Math.abs(cameraDir.z)) {
				planeNormal.set(0, 1, 0); // XZ plane (top/bottom view)
			} else {
				planeNormal.set(0, 0, 1); // XY plane (front/back view)
			}
		} else if (axis.y !== 0) {
			// Moving on Y
			// Candidates: X (1,0,0) or Z (0,0,1)
			if (Math.abs(cameraDir.x) > Math.abs(cameraDir.z)) {
				planeNormal.set(1, 0, 0); // YZ plane
			} else {
				planeNormal.set(0, 0, 1); // XY plane
			}
		} else {
			// Moving on Z
			// Candidates: X (1,0,0) or Y (0,1,0)
			if (Math.abs(cameraDir.x) > Math.abs(cameraDir.y)) {
				planeNormal.set(1, 0, 0); // YZ plane
			} else {
				planeNormal.set(0, 1, 0); // XZ plane
			}
		}

		this.dragPlane.setFromNormalAndCoplanarPoint(planeNormal, handlePos);

		// Calculate initial offset
		const intersect = new THREE.Vector3();
		this.raycaster.ray.intersectPlane(this.dragPlane, intersect);

		// Project intersect onto axis
		if (axis.x !== 0) this.dragOffset = intersect.x - handlePos.x;
		if (axis.y !== 0) this.dragOffset = intersect.y - handlePos.y;
		if (axis.z !== 0) this.dragOffset = intersect.z - handlePos.z;
	}

	private handleDrag() {
		if (!this.draggingHandle || !this.activeRegion) return;

		const camera = this.renderer.cameraManager.activeCamera.camera;
		this.raycaster.setFromCamera(this.mouse, camera);

		const intersect = new THREE.Vector3();
		if (this.raycaster.ray.intersectPlane(this.dragPlane, intersect)) {
			const face = this.draggingHandle.userData.face as string;
			const bounds = this.activeRegion.getBounds();
			const newMin = bounds.min.clone();
			const newMax = bounds.max.clone();

			// Snap to integer grid
			const snap = (val: number) => Math.round(val);

			if (face === "minX") newMin.x = snap(intersect.x - this.dragOffset);
			if (face === "maxX") newMax.x = snap(intersect.x - this.dragOffset);
			if (face === "minY") newMin.y = snap(intersect.y - this.dragOffset);
			if (face === "maxY") newMax.y = snap(intersect.y - this.dragOffset);
			if (face === "minZ") newMin.z = snap(intersect.z - this.dragOffset);
			if (face === "maxZ") newMax.z = snap(intersect.z - this.dragOffset);

			// Constraint: min <= max
			newMin.min(newMax); // ensure min is smaller
			newMax.max(newMin); // ensure max is larger

			this.activeRegion.setBounds(newMin, newMax);

			// If we modify via handle, we should also notify gizmo manager or update it
			// The RegionManager listens for gizmoObjectModified, but here we modify directly.
			// The activeRegion.setBounds updates the mesh, but gizmo might need sync if it's attached.
			// Triggering 'gizmoObjectModified' might be backwards.
			// But region.updateMeshTransform() handles the visual update.
			// If Gizmo is attached, it will follow the group automatically.
		}
	}

	private onMouseUp() {
		if (this.draggingHandle) {
			this.draggingHandle = null;
			this.activeRegion = null;

			// Re-enable orbit controls
			if (this.renderer.cameraManager) {
				const controls = this.renderer.cameraManager.controls.get(
					this.renderer.cameraManager.activeControlKey
				);
				if (controls) {
					controls.enabled = true;
				}
			}
		}
	}

	public dispose() {
		// cleanup listeners
	}
}
