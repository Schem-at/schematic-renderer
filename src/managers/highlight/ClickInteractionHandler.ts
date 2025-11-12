// ClickInteractionHandler.ts - Handles click interactions for blocks
import * as THREE from "three";
import { SchematicRenderer } from "../../SchematicRenderer";
import { Highlight } from "./Highlight";

export class ClickInteractionHandler implements Highlight {
	private schematicRenderer: SchematicRenderer;
	private raycaster: THREE.Raycaster;
	private mouse: THREE.Vector2;
	private canvas: HTMLCanvasElement;
	private debugHelpers: THREE.Object3D[] = [];

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();
		this.canvas = schematicRenderer.canvas;

		this.onClick = this.onClick.bind(this);
	}

	private clearDebugHelpers() {
		// Remove old debug helpers
		for (const helper of this.debugHelpers) {
			this.schematicRenderer.sceneManager.scene.remove(helper);
		}
		this.debugHelpers = [];
	}

	activate() {
		this.canvas.addEventListener("click", this.onClick);
	}

	deactivate() {
		this.canvas.removeEventListener("click", this.onClick);
	}

	update(_deltaTime: number) {
		// No periodic update needed
	}

	private onClick = (event: MouseEvent) => {
		// Calculate mouse position in normalized device coordinates
		const rect = this.canvas.getBoundingClientRect();
		this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		// Update the raycaster
		this.raycaster.setFromCamera(
			this.mouse,
			this.schematicRenderer.cameraManager.activeCamera.camera
		);

		// Get all schematic meshes
		const schematics =
			this.schematicRenderer.schematicManager?.getAllSchematics();
		if (!schematics || schematics.length === 0) return;

		// Collect all mesh children from all schematics
		const meshes: THREE.Object3D[] = [];
		for (const schematic of schematics) {
			schematic.group.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					meshes.push(child);
				}
			});
		}

		// Perform raycasting
		const intersects = this.raycaster.intersectObjects(meshes, false);

		if (intersects.length > 0) {
			this.clearDebugHelpers();
			
			const intersect = intersects[0];
			const worldHitPoint = new THREE.Vector3();
			worldHitPoint.copy(intersect.point);


			// Find which schematic this mesh belongs to
			let targetSchematic = null;
			for (const schematic of schematics) {
				if (schematic.group === intersect.object.parent || 
					schematic.group.getObjectById(intersect.object.id)) {
					targetSchematic = schematic;
					// console.log("  Found schematic:", schematic.id);
					break;
				}
			}

			if (!targetSchematic) {
				console.error("  ❌ Could not find parent schematic for mesh");
				return;
			}

			// console.log("  Schematic group position:", targetSchematic.group.position.toArray());
			// console.log("  Schematic position:", targetSchematic.position.toArray());
			// console.log("  Intersected object position:", intersect.object.position.toArray());
			// console.log("  Intersected object parent:", intersect.object.parent?.position.toArray());

			// Convert world hit point to local coordinates using the MESH's transformation
			const localHitPoint = worldHitPoint.clone();
			intersect.object.worldToLocal(localHitPoint);
			// console.log("  Local hit point in mesh space:", localHitPoint.toArray());
			
			// Now convert from mesh space to schematic space
			// The mesh is a child of the group, so we need to account for that
			const meshLocalToGroup = localHitPoint.clone();
			intersect.object.localToWorld(meshLocalToGroup);
			targetSchematic.group.worldToLocal(meshLocalToGroup);
			// console.log("  Local hit point in schematic space (raw):", meshLocalToGroup.toArray());
			
			// Minecraft blocks are rendered offset by 0.5 in all axes
			// Subtract 0.5 from all coordinates to get schematic block coordinates
			const schematicCoords = meshLocalToGroup.clone();
			schematicCoords.x -= 0.5;
			schematicCoords.y -= 0.5;
			schematicCoords.z -= 0.5;
			// console.log("  Local hit point after offset adjustment:", schematicCoords.toArray());
			
			// Floor in schematic space to get the block coordinates
			const localPosition = schematicCoords.clone().floor();
			// console.log("  Local position (floored):", localPosition.toArray());
			
			// Adjust for face hits - when we hit a boundary, select the block on the solid side
			if (intersect.face) {
					const faceNormal = intersect.face.normal;
					// console.log("  Face normal:", faceNormal.toArray());
				
				const fractional = new THREE.Vector3(
					schematicCoords.x - localPosition.x,
					schematicCoords.y - localPosition.y,
					schematicCoords.z - localPosition.z
				);
					// console.log("  Fractional position in block:", fractional.toArray());
				
				// Transform face normal to local space
				const localFaceNormal = faceNormal.clone().transformDirection(
					targetSchematic.group.matrixWorld
				).normalize();
					// console.log("  Local face normal:", localFaceNormal.toArray());
				
				// When hitting a face at a block boundary (fractional ~0), select the block BEHIND the face
				const epsilon = 0.001;
					if (Math.abs(localFaceNormal.x) > 0.9 && Math.abs(fractional.x) < epsilon && localFaceNormal.x > 0) {
						localPosition.x -= 1;
					}
					if (Math.abs(localFaceNormal.y) > 0.9 && Math.abs(fractional.y) < epsilon && localFaceNormal.y > 0) {
						localPosition.y -= 1;
					}
					if (Math.abs(localFaceNormal.z) > 0.9 && Math.abs(fractional.z) < epsilon && localFaceNormal.z > 0) {
						localPosition.z -= 1;
					}
			}
			
			// console.log("  Final selected position (for rendering):", localPosition.toArray());
			
			// Schematic data uses different coordinates - add 1 to all axes
			const schematicDataPosition = new THREE.Vector3(
				localPosition.x + 1,
				localPosition.y + 1,
				localPosition.z + 1
			);
			// console.log("  Schematic data position:", schematicDataPosition.toArray());
			
			// Calculate block center for visualization
			// The blocks are rendered with +0.5 offset, so we need to add that back for visualization
			const blockCenterLocal = new THREE.Vector3(
				localPosition.x + 0.5 + 0.5, // block pos + center + render offset
				localPosition.y + 0.5 + 0.5, // block pos + center + render offset
				localPosition.z + 0.5 + 0.5  // block pos + center + render offset
			);
			// console.log("  Block center in local space:", blockCenterLocal.toArray());
			const blockCenterWorld = blockCenterLocal.clone();
			targetSchematic.group.localToWorld(blockCenterWorld);
			
			// Draw polished block highlight with slight scale and better material
			const highlightBox = new THREE.Mesh(
				new THREE.BoxGeometry(1.01, 1.01, 1.01), // Slightly larger for outline effect
				new THREE.MeshBasicMaterial({
					color: 0xffffff,
					opacity: 0.3,
					transparent: true,
					depthWrite: false,
					side: THREE.BackSide // Render inside faces for subtle glow
				})
			);
			highlightBox.position.copy(blockCenterWorld);
			this.schematicRenderer.sceneManager.scene.add(highlightBox);
			this.debugHelpers.push(highlightBox);
			
			// Draw sharper edge outline
			const boxGeometry = new THREE.BoxGeometry(1.02, 1.02, 1.02);
			const boxEdges = new THREE.EdgesGeometry(boxGeometry);
			const boxLine = new THREE.LineSegments(
				boxEdges,
				new THREE.LineBasicMaterial({ 
					color: 0xffffff,
					linewidth: 2,
					transparent: true,
					opacity: 0.8
				})
			);
			boxLine.position.copy(blockCenterWorld);
			this.schematicRenderer.sceneManager.scene.add(boxLine);
			this.debugHelpers.push(boxLine);

			// Position validation omitted for cleaner logs

			// Emit interactBlock event with schematic data position
			this.schematicRenderer.eventEmitter.emit("interactBlock", {
				interactionPosition: schematicDataPosition,
				schematicObject: targetSchematic,
			});
		}
	};
}
