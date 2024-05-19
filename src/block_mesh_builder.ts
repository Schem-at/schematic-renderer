import * as THREE from "three";

import type { Block, loadSchematic } from "@enginehub/schematicjs";

import type {
	BlockModel,
	BlockModelData,
	BlockStateDefinition,
	BlockStateDefinitionVariant,
	BlockStateModelHolder,
	Vector,
} from "./types";

import {
	faceToFacingVector,
	isExtendedPiston,
	getOppositeFace,
	INVISIBLE_BLOCKS,
	NON_OCCLUDING_BLOCKS,
	normalize,
	rotateVector,
	TRANSPARENT_BLOCKS,
	REDSTONE_COLORS,
	getDirectionData,
	hashBlockForMap,
	POSSIBLE_FACES,
	DEFAULT_UV,
} from "./utils";

import { ResourceLoader } from "./resource_loader";

export class BlockMeshBuilder {
	public blockMeshCache: Map<any, any>;
	materialMap: Map<string, THREE.Material>;
	base64MaterialMap: Map<string, string>;
	ressourceLoader: ResourceLoader;
	schematic: any;

	constructor(ressourceLoader: any, materialMap: Map<string, THREE.Material>) {
		this.blockMeshCache = new Map();
		this.materialMap = materialMap;
		this.base64MaterialMap = new Map();
		this.ressourceLoader = ressourceLoader;
	}

	public setSchematic(schematic: any) {
		this.schematic = schematic;
	}

	public getMaterialId(model: BlockModel, faceData: any, color: THREE.Color) {
		const textureName = this.ressourceLoader.resolveTextureName(
			faceData.texture,
			model
		);
		const rotation = faceData.rotation;
		const idSuffix = rotation ? `-${rotation}` : "";
		return `${textureName}-${color?.r ?? 1}-${color?.g ?? 1}-${
			color?.b ?? 1
		}${idSuffix}`;
	}

	public normalizeElementCoords(element: BlockModel["elements"][0]) {
		if (!element.from || !element.to) {
			throw new Error("Element is missing from or to");
		}
		element.from = element.from.map(normalize) as Vector;
		element.to = element.to.map(normalize) as Vector;
		if (element.rotation && element.rotation.origin) {
			element.rotation.origin = element.rotation.origin.map(
				normalize
			) as Vector;
		}
	}

	public async processFaceData(
		element: BlockModel["elements"][0],
		model: BlockModel,
		block: any
	) {
		const subMaterials: { [key: string]: string | null } = {};
		const uvs: { [key: string]: [number, number, number, number] } = {};
		if (!element.faces) {
			return { subMaterials, uvs };
		}
		for (const face of POSSIBLE_FACES) {
			const faceData: any = element.faces[face];
			if (!faceData || faceData.texture == "#overlay") {
				subMaterials[face] = null;
				uvs[face] = DEFAULT_UV.map((u) => u / 16) as [
					number,
					number,
					number,
					number
				];
				continue;
			}

			const materialColor = this.ressourceLoader.getColorForElement(
				faceData,
				this.ressourceLoader.resolveTextureName(faceData.texture, model),
				block
			);
			const materialId = this.getMaterialId(
				model,
				faceData,
				materialColor ?? new THREE.Color(1, 1, 1)
			);
			if (!this.materialMap.has(materialId)) {
				const material = await this.ressourceLoader.getTextureMaterial(
					model,
					faceData,
					TRANSPARENT_BLOCKS.has(block.type) ||
						faceData.texture.includes("overlay"),
					materialColor
				);
				this.materialMap.set(
					materialId,
					material ?? new THREE.MeshBasicMaterial()
				);
				const base64Material = await this.ressourceLoader.getBase64Image(
					model,
					faceData
				);
				this.base64MaterialMap.set(materialId, base64Material ?? "");
			}

			subMaterials[face] = materialId;
			const faceRotation = faceData.rotation || 0;

			uvs[face] = this.rotateUv(
				(faceData.uv || DEFAULT_UV).map((u: number) => u / 16),
				faceRotation
			) as [number, number, number, number];
		}
		return { subMaterials, uvs };
	}

	public rotateUv(uv: [number, number, number, number], rotation: number) {
		if (rotation === 0) {
			return uv;
		}
		const uvArray = [...uv];
		const numberOfRotations = rotation / 90;
		for (let i = 0; i < numberOfRotations; i++) {
			const temp = uvArray[0];
			const temp2 = uvArray[2];
			uvArray[2] = 1 - uvArray[1];
			uvArray[1] = temp2;
			uvArray[0] = 1 - uvArray[3];
			uvArray[3] = temp;
		}
		return uvArray;
	}
	public async getBlockMesh(block: any): Promise<{
		[key: string]: {
			materialId: string;
			face: string;
			positions: number[];
			normals: number[];
			uvs: number[];
		};
	}> {
		const blockComponents: {
			[key: string]: {
				materialId: string;
				face: string;
				positions: number[];
				normals: number[];
				uvs: number[];
			};
		} = {};

		const { modelOptions } = await this.ressourceLoader.getBlockMeta(block);
		for (const modelHolder of modelOptions.holders) {
			if (modelHolder === undefined) continue;

			let modelHolderRotation = { x: 0, y: 0, z: 0 };

			if (block.type === "redstone_wire") {
				modelHolderRotation = {
					x: (modelHolder.x ?? 0) * (Math.PI / 180),
					y: (modelHolder.y ?? 0) * (Math.PI / 180),
					z: (modelHolder.z ?? 0) * (Math.PI / 180),
				};
			}

			const model = await this.ressourceLoader.loadModel(modelHolder.model);
			const elements = model?.elements;
			if (!elements) continue;

			for (const element of elements) {
				// TODO: handle elements with a name, it's a special vanilla tweaks thing
				if (element.name) continue;
				if (!element.from || !element.to) continue;

				this.normalizeElementCoords(element);

				const faceData = await this.processFaceData(element, model, block);
				const from = element.from;
				const to = element.to;

				if (!from || !to) continue;

				const size = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
				const directionData = getDirectionData(faceData.uvs);
				const faces = ["east", "west", "up", "down", "south", "north"];

				for (const dir of faces) {
					const materialId = faceData.subMaterials[dir];
					if (!materialId) continue;

					const uniqueKey = `${materialId}-${dir}`;

					if (!blockComponents[uniqueKey]) {
						blockComponents[uniqueKey] = {
							materialId,
							face: dir,
							positions: [],
							normals: [],
							uvs: [],
						};
					}

					const dirData = directionData[dir];

					for (const { pos, uv } of dirData.corners) {
						if (!from || !size || !pos || !uv) continue;

						const rotatedPos = this.applyRotation(
							[
								from[0] + size[0] * pos[0],
								from[1] + size[1] * pos[1],
								from[2] + size[2] * pos[2],
							],
							modelHolderRotation
						);

						blockComponents[uniqueKey].positions.push(...rotatedPos);
						blockComponents[uniqueKey].uvs.push(1 - uv[0], 1 - uv[1]);
						blockComponents[uniqueKey].normals.push(...dirData.normal);
					}
				}
			}
		}

		return blockComponents;
	}

	private applyRotation(
		position: number[],
		rotation: { x: number; y: number; z: number },
		center: number[] = [0.5, 0, 0.5]
	) {
		let { x, y, z } = rotation;

		y = -y;

		const translatedPosition = [
			position[0] - center[0],
			position[1] - center[1],
			position[2] - center[2],
		];

		const rotationMatrix = [
			[
				Math.cos(y) * Math.cos(z),
				Math.sin(x) * Math.sin(y) * Math.cos(z) - Math.cos(x) * Math.sin(z),
				Math.cos(x) * Math.sin(y) * Math.cos(z) + Math.sin(x) * Math.sin(z),
			],
			[
				Math.cos(y) * Math.sin(z),
				Math.sin(x) * Math.sin(y) * Math.sin(z) + Math.cos(x) * Math.cos(z),
				Math.cos(x) * Math.sin(y) * Math.sin(z) - Math.sin(x) * Math.cos(z),
			],
			[-Math.sin(y), Math.sin(x) * Math.cos(y), Math.cos(x) * Math.cos(y)],
		];

		const rotatedPosition = [0, 0, 0];

		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				rotatedPosition[i] += translatedPosition[j] * rotationMatrix[i][j];
			}
		}

		const finalPosition = [
			rotatedPosition[0] + center[0],
			rotatedPosition[1] + center[1],
			rotatedPosition[2] + center[2],
		];

		return finalPosition;
	}

	public occludedFacesListToInt(occludedFaces: { [key: string]: boolean }) {
		let result = 0;
		for (const face of POSSIBLE_FACES) {
			result = (result << 1) | (occludedFaces[face] ? 1 : 0);
		}
		return result;
	}

	public getOccludedFacesForBlock(block: any, pos: THREE.Vector3): number {
		const blockType = block.type;
		const { x, y, z } = pos;
		const directionVectors = {
			east: new THREE.Vector3(1, 0, 0),
			west: new THREE.Vector3(-1, 0, 0),
			up: new THREE.Vector3(0, 1, 0),
			down: new THREE.Vector3(0, -1, 0),
			south: new THREE.Vector3(0, 0, 1),
			north: new THREE.Vector3(0, 0, -1),
		};
		const occludedFaces = {
			east: false,
			west: false,
			up: false,
			down: false,
			south: false,
			north: false,
		} as { [key: string]: boolean };
		if (
			NON_OCCLUDING_BLOCKS.has(blockType) ||
			TRANSPARENT_BLOCKS.has(blockType)
		) {
			return this.occludedFacesListToInt(occludedFaces);
		}

		if (isExtendedPiston(block)) {
			const facing = block.properties?.["facing"] as string;
			const oppositeFace = getOppositeFace(facing);
			occludedFaces[oppositeFace] = true;
			return this.occludedFacesListToInt(occludedFaces);
		}
		for (const face of POSSIBLE_FACES) {
			const directionVector = directionVectors[face];
			const adjacentBlock = this.schematic.getBlock(
				new THREE.Vector3(x, y, z).add(directionVector)
			);
			if (adjacentBlock === undefined) {
				continue;
			}
			if (NON_OCCLUDING_BLOCKS.has(adjacentBlock.type)) {
				continue;
			}
			if (TRANSPARENT_BLOCKS.has(adjacentBlock.type)) {
				continue;
			}
			occludedFaces[face] = true;
		}
		return this.occludedFacesListToInt(occludedFaces);
	}

	public async updateBlockModelLookup(
		blockModelLookup: Map<string, BlockModelData>,
		loadedSchematic: ReturnType<typeof loadSchematic>
	): Promise<Map<string, BlockModelData>> {
		for (const block of loadedSchematic.blockTypes) {
			if (INVISIBLE_BLOCKS.has(block.type)) {
				continue;
			}

			if (blockModelLookup.get(hashBlockForMap(block))) {
				continue;
			}
			const blockState = await this.ressourceLoader.loadBlockStateDefinition(
				block.type
			);
			const blockModelData = this.ressourceLoader.getBlockModelData(
				block,
				blockState
			);
			if (!blockModelData.models.length) {
				continue;
			}

			blockModelLookup.set(hashBlockForMap(block), blockModelData);
		}
		return blockModelLookup;
	}

	public async getBlockMeshFromCache(block: any) {
		const blockUniqueKey = hashBlockForMap(block);
		if (this.blockMeshCache.has(blockUniqueKey)) {
			return this.blockMeshCache.get(blockUniqueKey);
		} else {
			const blockComponents = await this.getBlockMesh(block);
			this.blockMeshCache.set(blockUniqueKey, blockComponents);
			return blockComponents;
		}
	}
}
