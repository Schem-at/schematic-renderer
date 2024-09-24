// BlockInteractionHandler.ts
import * as THREE from "three";
import { EventEmitter } from "events";
// @ts-ignore
import { SchematicWrapper } from "../wasm/minecraft_schematic_utils";
import { SceneManager } from "../SceneManager";
import { SchematicManager } from "../SchematicManager";

export class BlockInteractionHandler {
	private eventEmitter: EventEmitter;
	private sceneManager: SceneManager;
	private schematicManager: SchematicManager;
	private chunkDimensions = {
		chunkWidth: 64,
		chunkHeight: 64,
		chunkLength: 64,
	};

	constructor(
		eventEmitter: EventEmitter,
		sceneManager: SceneManager,
		schematicManager: SchematicManager
	) {
		this.eventEmitter = eventEmitter;
		this.sceneManager = sceneManager;
		this.schematicManager = schematicManager;

		this.eventEmitter.on("interactBlock", this.onInteractBlock);
	}

	private onInteractBlock = async (data: {
		interactionPosition: THREE.Vector3;
	}) => {
		const { interactionPosition } = data;

		// Get the schematic
		const schematicObject =
			this.schematicManager.getSchematicAtPosition(interactionPosition);

		if (!schematicObject) {
			console.warn("No schematic found at the interacted position.");
			return;
		}

		const schematic = schematicObject?.getSchematicWrapper();

		if (!schematic) {
			console.warn("No schematic found at the interacted position.");
			return;
		}

		// Get the block at the position
		const block = schematic.get_block_with_properties(
			interactionPosition.x,
			interactionPosition.y,
			interactionPosition.z
		);

		if (!block) {
			console.warn("No block found at the interacted position.");
			return;
		}

		const blockName = block.name();

		// Check if the block is a lever
		if (blockName === "minecraft:lever") {
			await this.toggleLever(schematic, block, interactionPosition);
			// Rebuild the chunk mesh
			await schematicObject.rebuildChunkAtPosition(interactionPosition);
			console.log("Interacted block is not a lever.");
		}
	};

	private async toggleLever(
		schematic: SchematicWrapper,
		block: any,
		position: THREE.Vector3
	) {
		// Get the current 'powered' state of the lever
		const properties = block.properties();
		const isPowered = properties.powered === "true";

		// Toggle the 'powered' state
		const newPoweredState = !isPowered;

		// Update the block's properties
		const newProperties = {
			...properties,
			powered: newPoweredState.toString(),
		};

		// Update the block in the schematic
		schematic.set_block_with_properties(
			position.x,
			position.y,
			position.z,
			block.name(),
			newProperties
		);

		console.log(
			`Lever at ${position.x}, ${position.y}, ${position.z} toggled to ${
				newPoweredState ? "ON" : "OFF"
			}`
		);
	}

	dispose() {
		this.eventEmitter.off("interactBlock", this.onInteractBlock);
	}
}
