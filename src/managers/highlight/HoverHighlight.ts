// HoverHighlight.ts
import * as THREE from "three";
import { Highlight } from "./Highlight";
import { EventEmitter } from "events";
import { BlockData } from "./types";
import { SchematicRenderer } from "../../SchematicRenderer";

export class HoverHighlight implements Highlight {
	private schematicRenderer: any;
	private hoverMesh: THREE.Mesh | null = null;
	private raycaster: THREE.Raycaster;
	private mouse: THREE.Vector2;
	private lastIntersectedObject: THREE.Object3D | null = null;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();
	}

	activate() {
		this.schematicRenderer.renderManager.renderer.domElement.addEventListener(
			"pointermove",
			this.onPointerMove
		);
	}

	deactivate() {
		this.schematicRenderer.renderManager.renderer.domElement.removeEventListener(
			"pointermove",
			this.onPointerMove
		);
		if (this.hoverMesh) {
			this.schematicRenderer.sceneManager.scene.remove(this.hoverMesh);
			this.hoverMesh = null;
		}
	}

	update(deltaTime: number) {
		// No periodic update needed for hover effect
	}

	private onPointerMove = (event: PointerEvent) => {
		// Remove previous hover highlight
		if (this.hoverMesh) {
			this.schematicRenderer.sceneManager.scene.remove(this.hoverMesh);
			this.hoverMesh = null;
		}

		// Calculate mouse position in normalized device coordinates
		const rect =
			this.schematicRenderer.renderManager.renderer.domElement.getBoundingClientRect();
		this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		// Update the raycaster
		this.raycaster.setFromCamera(
			this.mouse,
			this.schematicRenderer.cameraManager.activeCamera.camera
		);

		// Calculate objects intersecting the raycaster
		const intersects = this.raycaster.intersectObjects(
			this.schematicRenderer.sceneManager.scene.children,
			true
		);

		if (
			intersects.length > 0 &&
			intersects[0].object.userData.isHighlight !== true
		) {
			const intersect = intersects[0];

			// Get face normal
			const faceNormal = intersect.face?.normal.clone();
			if (faceNormal) {
				// Transform normal to world space
				faceNormal.transformDirection(intersect.object.matrixWorld);

				// Adjust the intersection point based on the face normal
				const position = intersect.point.clone();
				position.addScaledVector(faceNormal, -0.5);

				// Floor the position to get the block coordinates
				position.set(
					Math.floor(position.x),
					Math.floor(position.y),
					Math.floor(position.z)
				);

				// Emit an event with the position and face normal
				this.schematicRenderer.eventEmitter.emit("hover", {
					position,
					faceNormal,
				});

				// Create the hover mesh and center it within the block
				const geometry = new THREE.BoxGeometry(1.1, 1.1, 1.1);
				const material = new THREE.MeshBasicMaterial({
					color: 0x00ff00,
					opacity: 0.2,
					transparent: true,
				});
				this.hoverMesh = new THREE.Mesh(geometry, material);
				this.hoverMesh.position.copy(position).addScalar(0.5); // Center the mesh
				this.hoverMesh.userData.isHighlight = true;
				this.schematicRenderer.sceneManager.add(this.hoverMesh);
			} else {
				this.schematicRenderer.eventEmitter.emit("hover", null);
			}
		} else {
			this.schematicRenderer.eventEmitter.emit("hover", null);
		}
	};

	private getBlockData(position: THREE.Vector3): BlockData | null {
		// Access the schematic to get block data
		const firstSchematic =
			this.schematicRenderer.schematics[
				Object.keys(this.schematicRenderer.schematics)[0]
			];
		const block = firstSchematic.get_block_with_properties(
			position.x,
			position.y,
			position.z
		);

		if (block) {
			const blockEntity = firstSchematic.get_block_entity(
				position.x,
				position.y,
				position.z
			);

			return {
				name: block.name(),
				properties: block.properties(),
				blockEntity,
			};
		}

		return null;
	}
}
