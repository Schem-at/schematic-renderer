// managers/WorldMeshBuilder.ts
import * as THREE from "three";
import { BlockMeshBuilder } from "./BlockMeshBuilder";
import {
	INVISIBLE_BLOCKS,
	faceToFacingVector,
	facingvectorToFace,
	getDegreeRotationMatrix,
	occludedFacesIntToList,
	rotateVectorMatrix,
} from "./utils";
import { Vector } from "./types";
// @ts-ignore
import { SchematicWrapper } from "../wasm/minecraft_schematic_utils";
import { ResourceLoader } from "./ResourceLoader";
import { SchematicRenderer } from "./SchematicRenderer";

export interface ChunkDimensions {
	chunkWidth: number;
	chunkHeight: number;
	chunkLength: number;
}

export interface BlockPosition {
	x: number;
	y: number;
	z: number;
}

export interface BlockData extends BlockPosition {
	name: string;
	properties: Record<string, string>;
}



export class WorldMeshBuilder {
	private schematicRenderer: SchematicRenderer;
	private blockMeshBuilder: BlockMeshBuilder;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.blockMeshBuilder = new BlockMeshBuilder(this.schematicRenderer);
	}
	public async getChunkMesh(
		chunk: BlockData[],
		schematic: SchematicWrapper
	): Promise<THREE.Mesh[]> {
		const maxBlocksAllowed = 100000000;
		let count = 0;
		const components: Record<string, any[]> = {};

		for (const blockData of chunk) {
			if (count > maxBlocksAllowed) {
				break;
			}

			const { x, y, z, name, properties } = blockData;

			if (INVISIBLE_BLOCKS.has(name)) {
				continue;
			}

			// Get occluded faces for the block
			const occludedFaces = occludedFacesIntToList(
				this.blockMeshBuilder.getOccludedFacesForBlock(
					schematic,
					blockData,
					new THREE.Vector3(x, y, z)
				)
			);

			// Get block components (meshes) from cache or build new
			const blockComponents = await this.blockMeshBuilder.getBlockMeshFromCache(
				{ name, properties },
				{ x, y, z }
			);

			for (const key in blockComponents) {
				const materialId = blockComponents[key].materialId;
				const blockComponent = blockComponents[key];

				// Check for rotation with model holder
				const holder = (
					await this.schematicRenderer.resourceLoader.getBlockMeta({
						name,
						properties,
					})
				).modelOptions.holders[0];
				const rotationMatrix = getDegreeRotationMatrix(
					-(holder.x ?? 0),
					-(holder.y ?? 0),
					-(holder.z ?? 0)
				);
				const newNormal = rotateVectorMatrix(
					blockComponent.normals.slice(0, 3),
					rotationMatrix
				) as Vector;
				const newFace = facingvectorToFace(newNormal);

				if (occludedFaces[newFace]) {
					continue;
				}

				if (!components[materialId]) {
					components[materialId] = [];
				}
				components[materialId].push([blockComponents[key], [x, y, z]]);
			}

			count++;
		}
		// Create meshes from block components
		const meshes =
			this.schematicRenderer.resourceLoader.createMeshesFromBlocks(components);
		return meshes;
	}

	public async buildSchematicMeshes(
		schematic: SchematicWrapper,
		chunkDimensions: ChunkDimensions = {
			chunkWidth: 16,
			chunkHeight: 16,
			chunkLength: 16,
		}
	): Promise<{ meshes: THREE.Mesh[]; chunkMap: Map<string, THREE.Mesh[]> }> {
		const chunks = schematic.chunks(
			chunkDimensions.chunkWidth,
			chunkDimensions.chunkHeight,
			chunkDimensions.chunkLength
		);

		const schematicMeshes: THREE.Mesh[] = [];
		const chunkMap: Map<string, THREE.Mesh[]> = new Map();

		const maxChunksAllowed = 100000;
		let chunkCount = 0;
		for (const chunkData of chunks) {
			if (chunkCount > maxChunksAllowed) {
				break;
			}

			chunkCount++;
			const { chunk_x, chunk_y, chunk_z, blocks } = chunkData;

			const chunkMeshes = await this.getChunkMesh(
				blocks as BlockData[],
				schematic
			);
			if (chunkMeshes.length === 0) {
				continue;
			}

			// Create a key for the chunk position
			const chunkKey = `${chunk_x},${chunk_y},${chunk_z}`;
			chunkMap.set(chunkKey, chunkMeshes);

			schematicMeshes.push(...chunkMeshes);
		}
		return { meshes: schematicMeshes, chunkMap };
	}
}
