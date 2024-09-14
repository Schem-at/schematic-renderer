// BlockInteractionHandler.ts
import * as THREE from "three";
import { EventEmitter } from "./EventEmitter";
import { SchematicWrapper } from "../wasm/minecraft_schematic_utils";
import { WorldMeshBuilder } from "../WorldMeshBuilder";

export class BlockInteractionHandler {
	private eventEmitter: EventEmitter;
	private schematicRenderer: any;
	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private chunkDimensions = {
		chunkWidth: 64,
		chunkHeight: 64,
		chunkLength: 64,
	};

	constructor(
		eventEmitter: EventEmitter,
		schematicRenderer: any,
		renderer: THREE.WebGLRenderer,
		scene: THREE.Scene
	) {
		this.eventEmitter = eventEmitter;
		this.schematicRenderer = schematicRenderer;
		this.renderer = renderer;
		this.scene = scene;

		this.eventEmitter.on("interactBlock", this.onInteractBlock);
	}

	private onInteractBlock = async (data: { position: THREE.Vector3 }) => {
		const { position } = data;

		// Get the schematic
		const schematic = this.schematicRenderer.schematics[
			Object.keys(this.schematicRenderer.schematics)[0]
		] as SchematicWrapper;

		// Get the block at the position
		const block = schematic.get_block_with_properties(
			position.x,
			position.y,
			position.z
		);

		if (!block) {
			console.warn("No block found at the interacted position.");
			return;
		}

		const blockName = block.name();

		// Check if the block is a lever
		if (blockName === "minecraft:lever") {
			await this.toggleLever(schematic, block, position);
			// Rebuild the chunk mesh
			await this.rebuildChunkMeshContainingBlock(position);
		} else {
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

	private async rebuildChunkMeshContainingBlock(blockPosition: THREE.Vector3) {
		// Determine which chunk contains the block
		const chunkX = Math.floor(
			blockPosition.x / this.chunkDimensions.chunkWidth
		);
		const chunkY = Math.floor(
			blockPosition.y / this.chunkDimensions.chunkHeight
		);
		const chunkZ = Math.floor(
			blockPosition.z / this.chunkDimensions.chunkLength
		);

		const chunkOffset = {
			x: chunkX * this.chunkDimensions.chunkWidth,
			y: chunkY * this.chunkDimensions.chunkHeight,
			z: chunkZ * this.chunkDimensions.chunkLength,
		};

		const schematic = this.schematicRenderer.schematics[
			Object.keys(this.schematicRenderer.schematics)[0]
		] as SchematicWrapper;

		// Get the blocks in the chunk
		const chunkBlocks = schematic.get_chunk_blocks(
			chunkOffset.x,
			chunkOffset.y,
			chunkOffset.z,
			this.chunkDimensions.chunkWidth,
			this.chunkDimensions.chunkHeight,
			this.chunkDimensions.chunkLength
		);

		const worldMeshBuilder = this.schematicRenderer.worldMeshBuilder;

		// Remove old chunk meshes from the scene
		const chunkMeshes = worldMeshBuilder.getChunkMeshAt(chunkX, chunkY, chunkZ);
		if (chunkMeshes) {
			chunkMeshes.forEach((mesh: THREE.Mesh) => {
				this.scene.remove(mesh);
				mesh.geometry.dispose(); // Dispose of geometry
				if (Array.isArray(mesh.material)) {
					mesh.material.forEach((material) => material.dispose());
				} else {
					mesh.material.dispose();
				}
			});
		}

		// Build new chunk meshes
		const newChunkMeshes = await worldMeshBuilder.getChunkMesh(
			chunkBlocks,
			chunkOffset,
			schematic
		);

		// Add new chunk meshes to the scene
		newChunkMeshes.forEach((mesh) => {
			this.scene.add(mesh);
		});

		// Update the chunk mesh reference in WorldMeshBuilder
		worldMeshBuilder.setChunkMeshAt(chunkX, chunkY, chunkZ, newChunkMeshes);
	}

	dispose() {
		this.eventEmitter.off("interactBlock", this.onInteractBlock);
	}
}
