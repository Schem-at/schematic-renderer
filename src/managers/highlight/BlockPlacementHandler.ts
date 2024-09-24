// managers/BlockPlacementHandler.ts
import * as THREE from "three";
import { EventEmitter } from "./EventEmitter";
import { SceneManager } from "./SceneManager";
import { SchematicManager } from "./SchematicManager";

export class BlockPlacementHandler {
	private eventEmitter: EventEmitter;
	private sceneManager: SceneManager;
	private schematicManager: SchematicManager;

	constructor(
		eventEmitter: EventEmitter,
		sceneManager: SceneManager,
		schematicManager: SchematicManager
	) {
		this.eventEmitter = eventEmitter;
		this.sceneManager = sceneManager;
		this.schematicManager = schematicManager;

		this.eventEmitter.on("placeBlock", this.onPlaceBlock);
	}

	private onPlaceBlock = async (data: {
		position: THREE.Vector3;
		faceNormal: THREE.Vector3;
	}) => {
		const { position, faceNormal } = data;

		// Calculate the position where the new block should be placed
		const placementPosition = position.clone().add(faceNormal);

		// Identify the appropriate SchematicObject
		// For simplicity, we'll assume a method to get the schematic at a position
		const schematicObject =
			this.schematicManager.getSchematicAtPosition(placementPosition);

		if (!schematicObject) {
			console.warn("No schematic found at the placement position.");
			return;
		}

		// Place the block in the schematic
		await schematicObject.setBlock(placementPosition, "minecraft:stone");
	};

	public dispose() {
		this.eventEmitter.off("placeBlock", this.onPlaceBlock);
	}
}
