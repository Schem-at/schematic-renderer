// HoverHighlight.ts
import * as THREE from "three";
import { Highlight } from "./Highlight";
import { EventEmitter } from "./EventEmitter";
import { BlockData } from "./types";

export class HoverHighlight implements Highlight {
	private schematicRenderer: any;
	private eventEmitter: EventEmitter;
	private scene: THREE.Scene;
	private camera: THREE.Camera;
	private renderer: THREE.WebGLRenderer;
	private hoverMesh: THREE.Mesh | null = null;
	private raycaster: THREE.Raycaster;
	private mouse: THREE.Vector2;
	private lastIntersectedObject: THREE.Object3D | null = null;

	constructor(
		schematicRenderer: any,
		scene: THREE.Scene,
		camera: THREE.Camera,
		renderer: THREE.WebGLRenderer,
		eventEmitter: EventEmitter
	) {
		this.schematicRenderer = schematicRenderer;
		this.scene = scene;
		this.camera = camera;
		this.renderer = renderer;
		this.eventEmitter = eventEmitter;
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();
	}

	activate() {
		this.renderer.domElement.addEventListener(
			"pointermove",
			this.onPointerMove
		);
	}

	deactivate() {
		this.renderer.domElement.removeEventListener(
			"pointermove",
			this.onPointerMove
		);
		if (this.hoverMesh) {
			this.scene.remove(this.hoverMesh);
			this.hoverMesh = null;
		}
	}

	update(deltaTime: number) {
		// No periodic update needed for hover effect
	}

	private onPointerMove = (event: PointerEvent) => {
		// Remove previous hover highlight
		if (this.hoverMesh) {
			this.scene.remove(this.hoverMesh);
			this.hoverMesh = null;
		}

		// Calculate mouse position in normalized device coordinates
		const rect = this.renderer.domElement.getBoundingClientRect();
		this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		// Update the raycaster
		this.raycaster.setFromCamera(this.mouse, this.camera);

		// Calculate objects intersecting the raycaster
		const intersects = this.raycaster.intersectObjects(
			this.scene.children,
			true
		);

		if (
			intersects.length > 0 &&
			intersects[0].object.userData.isHighlight !== true
		) {
			const intersect = intersects[0];
			const rawPosition = intersect.point;
			const position = new THREE.Vector3(
				Math.floor(rawPosition.x) + 0.5,
				Math.floor(rawPosition.y) + 0.5,
				Math.floor(rawPosition.z) + 0.5
			);

			// Get face normal
			const faceNormal = intersect.face?.normal.clone();
			if (faceNormal) {
				// Transform normal to world space
				faceNormal.transformDirection(intersect.object.matrixWorld);

				// Emit an event with the position and face normal
				this.eventEmitter.emit("hover", {
					position,
					faceNormal,
				});
			} else {
				this.eventEmitter.emit("hover", null);
			}

			const geometry = new THREE.BoxGeometry(1.1, 1.1, 1.1);
			const material = new THREE.MeshBasicMaterial({
				color: 0x00ff00,
				opacity: 0.2,
				transparent: true,
			});
			this.hoverMesh = new THREE.Mesh(geometry, material);
			this.hoverMesh.position.copy(position);
			this.hoverMesh.userData.isHighlight = true;
			this.scene.add(this.hoverMesh);
		} else {
			this.eventEmitter.emit("hover", null);
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
