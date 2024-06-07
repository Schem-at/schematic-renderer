import * as THREE from "three";

import { BlockMeshBuilder } from "./block_mesh_builder";
import {
	INVISIBLE_BLOCKS,
	TRANSPARENT_BLOCKS,
	occludedFacesIntToList,
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
		_offset: { x: number; y: number; z: number }
	) {
		const maxBlocksAllowed = 1000000;

		let count = 0;
		let chunkTimes = {
			mesh_creation: 0,
			occlusion: 0,
			material_group: {
				total_time: 0,
				occluded_faces: 0,
				position_push: 0,
				normal_push: 0,
				uv_push: 0,
			},
		};
		let start;

		// const offsetValue = offset ?? { x: 0, y: 0, z: 0 };
		const components = {} as any;
		for (let i = 0; i < chunk.length; i++) {
			if (count > maxBlocksAllowed) {
				break;
			}

			const pos = chunk[i];
			let { x, y, z } = pos;
			// x += offsetValue.x;
			// y += offsetValue.y;
			// z += offsetValue.z;

			const block = this.schematic.getBlock(pos);
			if (INVISIBLE_BLOCKS.has(block.type)) {
				continue;
			}
			start = performance.now();
			const occludedFaces = this.blockMeshBuilder.getOccludedFacesForBlock(
				block,
				pos
			);
			chunkTimes.occlusion += performance.now() - start;

			start = performance.now();
			const blockComponents = await this.blockMeshBuilder.getBlockMeshFromCache(
				block,
				pos
			);
			chunkTimes.mesh_creation += performance.now() - start;

			for (const key in blockComponents) {
				const materialId = blockComponents[key].materialId;

				const blockComponent = blockComponents[key];
				if (occludedFacesIntToList(occludedFaces)[blockComponent.face]) {
					continue;
				}
				if (!components[materialId]) {
					components[materialId] = [];
				}
				components[materialId].push([blockComponents[key], [x, y, z]]);
			}

			chunkTimes.material_group.total_time += performance.now() - start;
			count++;
		}

		console.log("Chunk times", chunkTimes);
		return this.ressourceLoader.createMeshesFromBlocks(components);
	}

	public static addBlockToMaterialGroup(
		materialGroups: any,
		blockComponent: any,
		occludedFacesInt: number,
		x: number,
		y: number,
		z: number,
		offset: { x: number; y: number; z: number },
		chunkTimes: any
	) {
		const { materialId, positions, normals, uvs, face } = blockComponent;

		let start = performance.now();
		const occludedFaces = occludedFacesIntToList(occludedFacesInt);
		chunkTimes.material_group.occluded_faces += performance.now() - start;

		if (occludedFaces[face]) {
			return;
		}

		if (!materialGroups[materialId]) {
			materialGroups[materialId] = {
				positions: [],
				normals: [],
				uvs: [],
				colors: [],
				indices: [],
				count: 0,
			};
		}

		const group = materialGroups[materialId];
		start = performance.now();

		// Using a single loop to push positions
		for (let i = 0; i < positions.length; i += 3) {
			group.positions.push(
				positions[i] + x + offset.x,
				positions[i + 1] + y + offset.y,
				positions[i + 2] + z + offset.z
			);
		}
		chunkTimes.material_group.position_push += performance.now() - start;

		start = performance.now();
		group.normals.push(...normals);
		chunkTimes.material_group.normal_push += performance.now() - start;

		start = performance.now();
		group.uvs.push(...uvs);
		chunkTimes.material_group.uv_push += performance.now() - start;

		const indexOffset = group.count;
		for (let i = 0; i < positions.length / 3; i += 4) {
			group.indices.push(indexOffset + i);
		}
		group.count += positions.length / 3;
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
			console.log(chunkMesh);
			if (chunkMesh.length === 0) {
				continue;
			}
			this.renderer.scene.add(...chunkMesh);

			console.log("Chunk", currentChunk, "of", totalChunks, "processed");
		}
	}
}
