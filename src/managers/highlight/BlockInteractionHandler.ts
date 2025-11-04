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

		this.eventEmitter.on("interactBlock", this.onInteractBlock);
	}

	private onInteractBlock = async (data: {
		interactionPosition: THREE.Vector3;
		schematicObject?: any;
	}) => {
		const { interactionPosition, schematicObject } = data;

		console.log("%c🎮 [INTERACT] BlockInteractionHandler received event", "color: #4ecdc4; font-weight: bold;");
		console.log("  Interaction position:", interactionPosition.toArray());
		console.log("  Schematic provided:", schematicObject ? schematicObject.id : "NONE");

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

		console.log("  Block found:", block ? block.name() : "NONE");

		if (!block) {
			console.warn("  ❌ No block found at the interacted position.");
			return;
		}

		const blockName = block.name();

		// Check if the block is interactive
		if (blockName === "minecraft:lever") {
			console.log("  ✓ Lever detected - processing interaction");
			console.log("  Simulation manager exists:", !!this.simulationManager);
			if (this.simulationManager) {
				console.log("  Simulation active:", this.simulationManager.isSimulationActive());
			}
			
			// If simulation is enabled, use it; otherwise fall back to manual toggle
			if (this.simulationManager && this.simulationManager.isSimulationActive()) {
				console.log("  🎮 Using simulation path");
				this.handleSimulatedInteraction(schematicObject, interactionPosition);
			} else {
				console.log("  ⚠️ Using manual toggle (simulation not active)");
				await this.toggleLever(schematic, block, interactionPosition);
				// Rebuild the full mesh since chunk rebuild doesn't work
				console.log("  Rebuilding full mesh...");
				await schematicObject.rebuildMesh();
				console.log(
					`Lever at ${interactionPosition.x}, ${interactionPosition.y}, ${interactionPosition.z} toggled`
				);
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

		console.log(`Interacting with block at ${position.x}, ${position.y}, ${position.z} in simulation`);

		// Use simulation to interact with the block - this returns the updated schematic
		const updatedSchematic = this.simulationManager.interactBlock(
			position.x,
			position.y,
			position.z
		);

		if (!updatedSchematic) {
			console.warn("Failed to interact with block in simulation");
			return;
		}

		// Verify the lever state changed
		const leverBlock = updatedSchematic.get_block_with_properties(
			position.x, position.y, position.z
		);
		if (leverBlock) {
			const props = leverBlock.properties();
			console.log(`Lever state in updated schematic: powered=${props.powered}`);
		}
		
		console.log(
			`Block at ${position.x}, ${position.y}, ${position.z} interacted - updating schematic and rebuilding ALL meshes`
		);
		
		// Replace the schematic wrapper with the updated one
		schematicObject.schematicWrapper = updatedSchematic;
		
		// Force a full rebuild since we replaced the wrapper
		console.log("Starting full mesh rebuild...");
		await schematicObject.rebuildMesh();
		console.log("Full mesh rebuild complete!");
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
		this.eventEmitter.off("interactBlock", this.onInteractBlock);
	}
}
