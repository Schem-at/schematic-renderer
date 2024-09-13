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
import { Renderer } from "./renderer";
import { Vector } from "./types";
// @ts-ignore
import { SchematicWrapper } from "./wasm/minecraft_schematic_utils";

interface ChunkDimensions {
	chunkWidth: number;
	chunkHeight: number;
	chunkLength: number;
}

interface BlockPosition {
	x: number;
	y: number;
	z: number;
}

interface BlockData extends BlockPosition {
	name: string;
	properties: Record<string, string>;
}
export class WorldMeshBuilder {
	schematic: any;
	blockMeshBuilder: BlockMeshBuilder;
	ressourceLoader: any;
	renderer: Renderer;
	worldMeshes: any[] = [];

	private chunkMeshes: Map<string, THREE.Mesh[]> = new Map();

	constructor(
		ressourceLoader: any,
		materialMap: Map<string, THREE.Material>,
		renderer: Renderer
	) {
		this.ressourceLoader = ressourceLoader;
		this.renderer = renderer;

		this.blockMeshBuilder = new BlockMeshBuilder(
			ressourceLoader,
			materialMap,
			this.renderer
		);
	}

	public async getChunkMesh(
		chunk: BlockData[],
		offset: { x: number; y: number; z: number },
		schematic: SchematicWrapper
	): Promise<THREE.Mesh[]> {
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
		const components: Record<string, any[]> = {};

		for (const blockData of chunk) {
			if (count > maxBlocksAllowed) {
				break;
			}

			let { x, y, z, name, properties } = blockData;
			x += offset.x;
			y += offset.y;
			z += offset.z;
			if (INVISIBLE_BLOCKS.has(name)) {
				continue;
			}

			start = performance.now();
			const occludedFaces = occludedFacesIntToList(
				this.blockMeshBuilder.getOccludedFacesForBlock(
					schematic,
					blockData,
					new THREE.Vector3(x, y, z)
				)
			);
			chunkTimes.occlusion += performance.now() - start;
			start = performance.now();
			const blockComponents = await this.blockMeshBuilder.getBlockMeshFromCache(
				{ name, properties },
				{ x, y, z }
			);
			chunkTimes.blockMeshRetrieval += performance.now() - start;

			for (const key in blockComponents) {
				const materialId = blockComponents[key].materialId;
				const blockComponent = blockComponents[key];

				// Check for rotation with model holder
				const holder = (
					await this.ressourceLoader.getBlockMeta({ name, properties })
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

			chunkTimes.blockMeshCreation += performance.now() - start;
			count++;
		}

		start = performance.now();
		const meshes = this.ressourceLoader.createMeshesFromBlocks(
			components,
			chunkTimes
		);
		chunkTimes.chunkMeshCreation.total_time = performance.now() - start;
		return meshes;
	}

	public isSolid(schematic: any, x: number, y: number, z: number) {
		const block = schematic.getBlock(new THREE.Vector3(x, y, z));
		return block && !TRANSPARENT_BLOCKS.has(block.name);
	}

	public async getSchematicMeshes(
		schematic: SchematicWrapper,
		chunkDimensions: ChunkDimensions = {
			chunkWidth: 16,
			chunkHeight: 16,
			chunkLength: 16,
		}
	): Promise<THREE.Mesh[]> {
		const schematicDimensions = schematic.get_dimensions();
		const offset = {
			x: 0,
			y: 0,
			z: 0,
		};

		const chunks = schematic.chunks(
			chunkDimensions.chunkWidth,
			chunkDimensions.chunkHeight,
			chunkDimensions.chunkLength
		);
		const totalChunks = chunks.length;
		let currentChunk = 0;
		const schematicMeshes: THREE.Mesh[] = [];

		for (const chunk of chunks) {
			currentChunk++;
			const chunkOffset = {
				x:
					(currentChunk % chunkDimensions.chunkWidth) *
					chunkDimensions.chunkWidth,
				y:
					Math.floor(
						currentChunk /
							(chunkDimensions.chunkWidth * chunkDimensions.chunkLength)
					) * chunkDimensions.chunkHeight,
				z:
					(Math.floor(currentChunk / chunkDimensions.chunkWidth) %
						chunkDimensions.chunkLength) *
					chunkDimensions.chunkLength,
			};

			const chunkMeshes = await this.getChunkMesh(
				chunk as BlockData[],
				chunkOffset,
				schematic
			);

			if (chunkMeshes.length === 0) {
				console.log("Chunk", currentChunk, "of", totalChunks, "is empty");
				continue;
			}

			// Store the chunk meshes
			const chunkX = chunkOffset.x / chunkDimensions.chunkWidth;
			const chunkY = chunkOffset.y / chunkDimensions.chunkHeight;
			const chunkZ = chunkOffset.z / chunkDimensions.chunkLength;
			this.setChunkMeshAt(chunkX, chunkY, chunkZ, chunkMeshes);

			this.renderer.scene.add(...chunkMeshes);
			schematicMeshes.push(...chunkMeshes);
			console.log("Chunk", currentChunk, "of", totalChunks, "processed");
		}
		return schematicMeshes;
	}
	public getChunkMeshAt(
		chunkX: number,
		chunkY: number,
		chunkZ: number
	): THREE.Mesh[] | null {
		const key = `${chunkX},${chunkY},${chunkZ}`;
		return this.chunkMeshes.get(key) || null;
	}

	public setChunkMeshAt(
		chunkX: number,
		chunkY: number,
		chunkZ: number,
		meshes: THREE.Mesh[]
	) {
		const key = `${chunkX},${chunkY},${chunkZ}`;
		this.chunkMeshes.set(key, meshes);
	}
}
