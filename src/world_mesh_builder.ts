import * as THREE from "three";

import { BlockMeshBuilder } from "./block_mesh_builder";
import {
	INVISIBLE_BLOCKS,
	TRANSPARENT_BLOCKS,
	rotateBlockComponents,
} from "./utils";

export class WorldMeshBuilder {
	schematic: any;
	blockMeshBuilder: any;
	ressourceLoader: any;
	renderer: any;
	constructor(
		ressourceLoader: any,
		materialMap: Map<string, THREE.Material>,
		renderer: any
	) {
		this.ressourceLoader = ressourceLoader;
		this.renderer = renderer;

		this.blockMeshBuilder = new BlockMeshBuilder(
			ressourceLoader,
			materialMap,
			this.renderer
		);
	}

	public setSchematic(schematic: any) {
		this.schematic = schematic;
		this.blockMeshBuilder.setSchematic(schematic);
	}

	public splitSchemaIntoChunks(
		dimensions = { chunkWidth: 64, chunkHeight: 64, chunkLength: 64 }
	) {
		const chunks: any[] = [];
		const { chunkWidth, chunkHeight, chunkLength } = dimensions;
		const { width, height, length } = this.schematic;
		const chunkCountX = Math.ceil(width / chunkWidth);
		const chunkCountY = Math.ceil(height / chunkHeight);
		for (const pos of this.schematic) {
			const { x, y, z } = pos;
			const chunkX = Math.floor(x / chunkWidth);
			const chunkY = Math.floor(y / chunkHeight);
			const chunkZ = Math.floor(z / chunkLength);
			const chunkIndex =
				chunkX + chunkY * chunkCountX + chunkZ * chunkCountX * chunkCountY;
			if (!chunks[chunkIndex]) {
				chunks[chunkIndex] = [];
			}
			chunks[chunkIndex].push(pos);
		}
		return chunks;
	}

	public async processChunkBlocks(
		materialGroups: any,
		chunk: any,
		chunkDimensions: any,
		offset: { x: number; y: number; z: number }
	) {
		const maxBlocksAllowed = 1000000;
		let count = 0;

		for (let i = 0; i < chunk.length; i++) {
			const pos = chunk[i];
			if (count > maxBlocksAllowed) {
				break;
			}

			const { x, y, z } = pos;

			const block = this.schematic.getBlock(pos);
			if (INVISIBLE_BLOCKS.has(block.type)) {
				continue;
			}
			const start = performance.now();
			const blockComponents = await this.blockMeshBuilder.getBlockMeshFromCache(
				block,
				pos
			);
			if (performance.now() - start > 100) {
				console.error(
					"Slow block",
					pos,
					block,
					"took",
					performance.now() - start
				);
			}
			const occludedFaces = this.blockMeshBuilder.getOccludedFacesForBlock(
				block,
				pos
			);

			for (const key in blockComponents) {
				this.ressourceLoader.addBlockToMaterialGroup(
					materialGroups,
					blockComponents[key],
					occludedFaces,
					x,
					y,
					z,
					offset ?? { x: 0, y: 0, z: 0 }
				);
			}
			count++;
		}
	}

	public isSolid(x: number, y: number, z: number) {
		const block = this.schematic.getBlock(new THREE.Vector3(x, y, z));
		return block && !TRANSPARENT_BLOCKS.has(block.type);
	}

	public initializeMeshCreation() {
		if (this.schematic === undefined) {
			return { materialGroups: null };
		}
		const worldWidth = this.schematic.width;
		const worldHeight = this.schematic.height;
		const worldLength = this.schematic.length;
		const offset = { x: 0, y: 0, z: 0 };
		return { worldWidth, worldHeight, worldLength, offset };
	}

	public async getSchematicMeshes(
		chunkDimensions = { chunkWidth: 16, chunkHeight: 16, chunkLength: 16 }
	) {
		const { worldWidth, worldHeight, worldLength, offset } =
			this.initializeMeshCreation();
		const chunks = await this.splitSchemaIntoChunks({
			chunkWidth: 16,
			chunkHeight: 16,
			chunkLength: 16,
		});
		const chunkMeshes = [];
		const totalChunks = chunks.length;
		let currentChunk = 0;
		let materialGroups = {};
		for (const chunk of chunks) {
			currentChunk++;
			const start = performance.now();
			await this.processChunkBlocks(
				materialGroups,
				chunk,
				chunkDimensions,
				offset ?? { x: 0, y: 0, z: 0 }
			);
			if (performance.now() - start > 100) {
				console.error("Slow chunk", currentChunk, "of", totalChunks);
			}
			const materialGroupMeshs = [
				...this.ressourceLoader.createMeshesFromMaterialGroups(materialGroups),
			];
			if (materialGroupMeshs.length === 0) {
				continue;
			}
			this.renderer.scene.add(...materialGroupMeshs);
			console.log("Chunk", currentChunk, "of", totalChunks, "processed");
			materialGroups = {};
		}
		this.renderer.animate();
	}
}
