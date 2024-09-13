// BlockPlacementHandler.ts
import * as THREE from "three";
import { EventEmitter } from "./EventEmitter";
import { SchematicWrapper } from "../wasm/minecraft_schematic_utils";
import { WorldMeshBuilder } from "../WorldMeshBuilder";

export class BlockPlacementHandler {
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

		this.eventEmitter.on("placeBlock", this.onPlaceBlock);
	}

	private onPlaceBlock = async (data: {
		position: THREE.Vector3;
		faceNormal: THREE.Vector3;
	}) => {
		const { position, faceNormal } = data;

		// Calculate the position where the new block should be placed
		const placementPosition = position.clone().add(faceNormal);
		const schematic = this.schematicRenderer.schematics[
			Object.keys(this.schematicRenderer.schematics)[0]
		] as SchematicWrapper;
		// Place the block in the schematic
		schematic.set_block(
			placementPosition.x,
			placementPosition.y,
			placementPosition.z,
			"minecraft:stone" // Replace with desired block type
		);

		// Rebuild the chunk mesh
		await this.rebuildChunkMeshContainingBlock(placementPosition);
	};

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

		let worldMeshBuilder = this.schematicRenderer.worldMeshBuilder;
		// Remove old chunk mesh from the scene
		// You need to keep track of the meshes representing each chunk
		const chunkMesh = worldMeshBuilder.getChunkMeshAt(chunkX, chunkY, chunkZ);
		if (chunkMesh) {
			this.scene.remove(chunkMesh);
		}

		// Build new chunk mesh
		const newChunkMeshes = await worldMeshBuilder.getChunkMesh(
			chunkBlocks,
			chunkOffset,
			schematic
		);

		// Add new chunk mesh to the scene
		newChunkMeshes.forEach((mesh) => {
			this.scene.add(mesh);
		});

		// Update the chunk mesh reference in WorldMeshBuilder
		worldMeshBuilder.setChunkMeshAt(chunkX, chunkY, chunkZ, newChunkMeshes);
	}

	dispose() {
		this.eventEmitter.off("placeBlock", this.onPlaceBlock);
	}
}
