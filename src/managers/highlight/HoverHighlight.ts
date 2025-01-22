// HoverHighlight.ts
import * as THREE from "three";
import { Highlight } from "./Highlight";
import { BlockData } from "./types";
import { SchematicRenderer } from "../../SchematicRenderer";
import { SelectableObject } from "../../managers/SelectableObject";


export class HoverHighlight implements Highlight {
	private schematicRenderer: SchematicRenderer;
	private hoverMesh: THREE.Mesh | null = null;
	// @ts-ignore
	private raycaster: THREE.Raycaster;
	// @ts-ignore
	private mouse: THREE.Vector2;
	private lastHoveredObject: SelectableObject | null = null;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();

		// Bind the methods to ensure correct 'this' context
		this.onHoverEnter = this.onHoverEnter.bind(this);
		this.onHoverExit = this.onHoverExit.bind(this);
	}

	activate() {
		console.log("HoverHighlight activated");
		this.schematicRenderer.eventEmitter.on("hoverEnter", this.onHoverEnter);
		this.schematicRenderer.eventEmitter.on("hoverExit", this.onHoverExit);
	}

	deactivate() {
		console.log("HoverHighlight deactivated");
		this.schematicRenderer.eventEmitter.off("hoverEnter", this.onHoverEnter);
		this.schematicRenderer.eventEmitter.off("hoverExit", this.onHoverExit);
		this.removeHoverMesh();
	}

	// @ts-ignore
	update(deltaTime: number) {
		// No periodic update needed for hover effect
	}

	private onHoverEnter = (
		object: SelectableObject,
		intersect: THREE.Intersection
	) => {
		this.removeHoverMesh();
		this.lastHoveredObject = object;
		console.log("Hovering over object", object);

		const position = new THREE.Vector3();
		position.copy(intersect.point).floor();

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

		// Emit an event with the position and face normal
		this.schematicRenderer.eventEmitter.emit("hover", {
			object,
			position,
			faceNormal: intersect.face?.normal
				.clone()
				.transformDirection(intersect.object.matrixWorld),
		});
	};

	private onHoverExit = (object: SelectableObject) => {
		if (object === this.lastHoveredObject) {
			this.removeHoverMesh();
			this.lastHoveredObject = null;
			this.schematicRenderer.eventEmitter.emit("hover", null);
		}
	};

	private removeHoverMesh() {
		if (this.hoverMesh) {
			this.schematicRenderer.sceneManager.scene.remove(this.hoverMesh);
			this.hoverMesh = null;
		}
	}



	// @ts-ignore
	private getBlockData(position: THREE.Vector3): BlockData | null {
		// Access the schematic to get block data
		if (!this.schematicRenderer.schematicManager) return null;
		const firstSchematic =
			this.schematicRenderer.schematicManager.getAllSchematics()[0];
		if (!firstSchematic) return null;

		const block = firstSchematic.schematicWrapper.get_block_with_properties(
			position.x,
			position.y,
			position.z
		);

		if (block) {
			const blockEntity = firstSchematic.schematicWrapper.get_block_entity(
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
