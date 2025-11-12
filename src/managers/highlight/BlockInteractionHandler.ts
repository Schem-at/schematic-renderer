// BlockInteractionHandler.ts
import * as THREE from "three";
import { EventEmitter } from "events";
import { SchematicWrapper } from "nucleation";
import { SchematicManager } from "../SchematicManager";
import { SimulationManager } from "../SimulationManager";

export class BlockInteractionHandler {
	private eventEmitter: EventEmitter;
	private simulationManager: SimulationManager | null;

	constructor(
		eventEmitter: EventEmitter,
		_schematicManager: SchematicManager,
		simulationManager?: SimulationManager | null
	) {
		this.eventEmitter = eventEmitter;
		this.simulationManager = simulationManager || null;

		this.eventEmitter.on("interactWithBlock", this.onInteractBlock);
	}

	private onInteractBlock = async (data: {
		interactionPosition: THREE.Vector3;
		schematicObject?: any;
	}) => {
		const { interactionPosition, schematicObject } = data;

		// Block interaction event received

		if (!schematicObject) {
			console.warn("  ❌ No schematic provided in event.");
			return;
		}

		this.processInteraction(schematicObject, interactionPosition);
	};

	private async processInteraction(
		schematicObject: any,
		interactionPosition: THREE.Vector3
	) {

		const schematic = schematicObject?.getSchematicWrapper();

		if (!schematic) {
			console.warn("  ❌ Could not get schematic wrapper");
			return;
		}

		// Get the block at the position
		const block = schematic.get_block_with_properties(
			interactionPosition.x,
			interactionPosition.y,
			interactionPosition.z
		);

		// console.log("  Block found:", block ? block.name() : "NONE");

		if (!block) {
			console.warn("  ❌ No block found at the interacted position.");
			return;
		}

		const blockName = block.name();

		// Check if the block is interactive
		if (blockName === "minecraft:lever") {
			// If simulation is enabled, use it; otherwise fall back to manual toggle
			if (this.simulationManager && this.simulationManager.isSimulationActive()) {
				this.handleSimulatedInteraction(schematicObject, interactionPosition);
			} else {
				await this.toggleLever(schematic, block, interactionPosition);
				// Rebuild the full mesh since chunk rebuild doesn't work
				await schematicObject.rebuildMesh();
			}
		} else {
			console.log(`  ℹ Block ${blockName} is not interactive`);
		}
	}

	private async handleSimulatedInteraction(
		schematicObject: any,
		position: THREE.Vector3
	) {
		if (!this.simulationManager) return;


		// Use simulation to interact with the block - this returns the updated schematic
		const updatedSchematic = this.simulationManager.interactWithBlock(
			position.x,
			position.y,
			position.z
		);

		if (!updatedSchematic) {
			console.warn("Failed to interact with block in simulation");
			return;
		}

		
		// Replace the schematic wrapper with the updated one
		schematicObject.schematicWrapper = updatedSchematic;
		
		// Rebuild the mesh to show the change
		await schematicObject.rebuildMesh();
	}

	private async toggleLever(
		schematic: SchematicWrapper,
		block: any,
		position: THREE.Vector3
	) {
		// Get the current 'powered' state of the lever
		const properties = block.properties();
		const blockName = block.name();
		
		console.log("  Before toggle:", blockName, properties);
		
		const isPowered = properties.powered === "true";

		// Toggle the 'powered' state while preserving ALL other properties
		const newPoweredState = !isPowered;

		// Create new properties object with all existing properties
		const newProperties: Record<string, string> = {};
		for (const key in properties) {
			if (key === "powered") {
				newProperties[key] = newPoweredState.toString();
			} else {
				newProperties[key] = properties[key];
			}
		}
		
		console.log("  After toggle:", blockName, newProperties);

		// Update the block in the schematic
		schematic.set_block_with_properties(
			position.x,
			position.y,
			position.z,
			blockName,
			newProperties
		);

		console.log(
			`Lever at ${position.x}, ${position.y}, ${position.z} toggled to ${
				newPoweredState ? "ON" : "OFF"
			}`
		);
	}

	dispose() {
		this.eventEmitter.off("interactWithBlock", this.onInteractBlock);
	}
}
