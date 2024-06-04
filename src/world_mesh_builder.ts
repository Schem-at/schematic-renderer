import * as THREE from "three";

import { BlockMeshBuilder } from "./block_mesh_builder";
import { INVISIBLE_BLOCKS, TRANSPARENT_BLOCKS } from "./utils";

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
		const { width, height } = this.schematic;
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
			const blockComponents = await this.blockMeshBuilder.getBlockMeshFromCache(
				block,
				pos
			);

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
		const offset = {
			x: -worldWidth / 2,
			y: 0,
			z: -worldLength / 2,
		};
		return { worldWidth, worldHeight, worldLength, offset };
	}

	public async getSchematicMeshes(
		chunkDimensions = { chunkWidth: 64, chunkHeight: 64, chunkLength: 64 }
	) {
		const { offset } = this.initializeMeshCreation();
		const chunks = await this.splitSchemaIntoChunks(chunkDimensions);
		const totalChunks = chunks.length;
		let currentChunk = 0;
		let materialGroups = {};

		for (const chunk of chunks) {
			currentChunk++;
			await this.processChunkBlocks(
				materialGroups,
				chunk,
				offset ?? { x: 0, y: 0, z: 0 }
			);
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
	}
}
