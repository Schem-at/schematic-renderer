import * as THREE from "three";

import { BlockMeshBuilder } from "./block_mesh_builder";
import {
	INVISIBLE_BLOCKS,
	TRANSPARENT_BLOCKS,
	facingvectorToFace,
	getDegreeRotationMatrix,
	occludedFacesIntToList,
	rotateVectorMatrix,
} from "./utils";
import { Vector } from "./types";

export class WorldMeshBuilder {
	schematic: any;
	blockMeshBuilder: any;
	ressourceLoader: any;
	renderer: any;
	worldMeshes: any[] = [];
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

	public async getChunkMesh(
		chunk: any,
		offset: { x: number; y: number; z: number }
	) {
		const maxBlocksAllowed = 1000000;

		let count = 0;
		let chunkTimes = {
			blockMeshCreation: 0,
			blockMeshRetrieval: 0,
			occlusion: 0,
			chunkMeshCreation: {
				total_time: 0,
				arrayCreation: 0,
				arrayAllocation: 0,
				indexCalculation: 0,
				vertexTranslation: 0,
				geometryCreation: 0,
				materialRetrieval: 0,
				slicing: 0,
			},
		};
		let start;
		let startTotal = performance.now();
		const offsetValue = offset ?? { x: 0, y: 0, z: 0 };
		const components = {} as any;
		for (let i = 0; i < chunk.length; i++) {
			if (count > maxBlocksAllowed) {
				break;
			}

			const pos = chunk[i];
			let { x, y, z } = pos;
			x += offsetValue.x;
			y += offsetValue.y;
			z += offsetValue.z;

			const block = this.schematic.getBlock(pos);
			if (INVISIBLE_BLOCKS.has(block.type)) {
				continue;
			}
			start = performance.now();
			const occludedFaces = occludedFacesIntToList(
				this.blockMeshBuilder.getOccludedFacesForBlock(block, pos)
			);
			chunkTimes.occlusion += performance.now() - start;

			start = performance.now();
			const blockComponents = await this.blockMeshBuilder.getBlockMeshFromCache(
				block,
				pos
			);
			chunkTimes.blockMeshRetrieval += performance.now() - start;

			for (const key in blockComponents) {
				const materialId = blockComponents[key].materialId;
				const blockComponent = blockComponents[key];

				// Check for rotation with model holder
				const holder = (await this.ressourceLoader.getBlockMeta(block)).modelOptions.holders[0];
				const rotationMatrix = getDegreeRotationMatrix(holder.x ?? 0, holder.y ?? 0, holder.z ?? 0);
				const newNormal = rotateVectorMatrix(blockComponent.normals.slice(0, 3), rotationMatrix) as Vector;
				const newFace = facingvectorToFace(newNormal);

				// TEMP
				console.log("Before:", blockComponent.face, blockComponent.normals.slice(0, 3));
				console.log("Rotation:", {x: holder.x ?? 0, y: holder.y ?? 0, z: holder.z ?? 0});
				console.log("Matrix:", rotationMatrix);
				console.log("Normal & face:", newNormal, newFace);
				console.log("");

				if (occludedFaces[newFace]) {
					continue;
				}

				if (!components[materialId]) {
					components[materialId] = [];
				}
				components[materialId].push([blockComponents[key], [x, y, z]]);
			}

			chunkTimes.blockMeshCreation += performance.now() - start;
			count++;
		}

		start = performance.now();
		const meshes = this.ressourceLoader.createMeshesFromBlocks(
			components,
			chunkTimes
		);
		chunkTimes.chunkMeshCreation.total_time = performance.now() - start;
		console.log("total time", performance.now() - startTotal);

		console.log("Chunk times", chunkTimes);
		return meshes;
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

		for (const chunk of chunks) {
			currentChunk++;
			const chunkMesh = await this.getChunkMesh(
				chunk,
				offset ?? { x: 0, y: 0, z: 0 }
			);
			if (chunkMesh.length === 0) {
				continue;
			}
			this.renderer.scene.add(...chunkMesh);
			this.worldMeshes.push(chunkMesh);
			console.log("Chunk", currentChunk, "of", totalChunks, "processed");
		}
		return this.worldMeshes;
	}
}
