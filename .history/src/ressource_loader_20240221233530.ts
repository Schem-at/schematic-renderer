import * as THREE from "three";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import deepmerge from "deepmerge";
import type { Block } from "@enginehub/schematicjs";
import { loadSchematic } from "@enginehub/schematicjs";
import {
	faceToFacingVector,
	INVISIBLE_BLOCKS,
	NON_OCCLUDING_BLOCKS,
	TRANSPARENT_BLOCKS,
	parseNbt,
} from "./utils";
import JSZip from "jszip";
import type {
	BlockModel,
	BlockModelData,
	BlockStateDefinition,
	BlockStateDefinitionVariant,
	BlockStateModelHolder,
	Vector,
} from "./types";
export class RessourceLoader {
	schematic: any;
	textureCache: Map<string, THREE.Texture>;
	blobCache: Map<string, string>;
	stringCache: Map<string, string>;
	blockMeshCache: Map<string, any>;
	blockMetaCache: Map<string, any>;
	blockModelCache: Map<string, BlockModel>;
	faceDataCache: Map<string, any>;
	blockStateDefinitionCache: Map<string, BlockStateDefinition>;

	materialMap: Map<string, THREE.Material>;
	base64MaterialMap: Map<string, THREE.Material>;
	jarUrl: string | string[];
	zip: any;
	textureLoader = new THREE.TextureLoader();

	DEFAULT_UV = [0, 0, 16, 16];
	POSSIBLE_FACES = ["south", "north", "east", "west", "up", "down"] as const;
	REVERSED_POSSIBLE_FACES = this.POSSIBLE_FACES.slice().reverse();
	REDSTONE_COLORS = [
		new THREE.Color(75 / 255, 0, 0),
		new THREE.Color(110 / 255, 0, 0),
		new THREE.Color(120 / 255, 0, 0),
		new THREE.Color(130 / 255, 0, 0),
		new THREE.Color(140 / 255, 0, 0),
		new THREE.Color(151 / 255, 0, 0),
		new THREE.Color(160 / 255, 0, 0),
		new THREE.Color(170 / 255, 0, 0),
		new THREE.Color(180 / 255, 0, 0),
		new THREE.Color(190 / 255, 0, 0),
		new THREE.Color(201 / 255, 0, 0),
		new THREE.Color(211 / 255, 0, 0),
		new THREE.Color(214 / 255, 0, 0),
		new THREE.Color(224 / 255, 6 / 255, 0),
		new THREE.Color(233 / 255, 26 / 255, 0),
		new THREE.Color(244 / 255, 48 / 255, 0),
	];
	TINT_COLOR = new THREE.Color(145 / 255, 189 / 255, 89 / 255);
	WATER_COLOR = new THREE.Color(36 / 255, 57 / 255, 214 / 255);
	LAVA_COLOR = new THREE.Color(232 / 255, 89 / 255, 23 / 255);
	AMBIENT_LIGHT = new THREE.Color(1, 1, 1);
	SHADOW_COLOR = new THREE.Color(0.5, 0.5, 0.5);
	DEG2RAD = Math.PI / 180;

	DEBUG = false;
	constructor(jarUrl: string | string[]) {
		this.textureCache = new Map();
		this.blobCache = new Map();
		this.stringCache = new Map();
		this.blockMeshCache = new Map();
		this.blockMetaCache = new Map();
		this.blockModelCache = new Map();
		this.faceDataCache = new Map();
		this.blockStateDefinitionCache = new Map();
		this.materialMap = new Map();
		this.base64MaterialMap = new Map();
		this.jarUrl = jarUrl;
		this.textureLoader = new THREE.TextureLoader();
		this.schematic = undefined;
	}

	public setSchematic(schematic: any) {
		this.schematic = schematic;
	}
	async initialize() {
		this.zip = await this.loadZip(this.jarUrl);
	}

	public async loadZip(jarUrl: string | string[]) {
		if (Array.isArray(jarUrl)) {
			return await Promise.all(
				jarUrl.map(async (url) => {
					const zipFile = await (await fetch(url)).blob();
					const zip = await JSZip.loadAsync(zipFile);

					return zip;
				})
			);
		} else {
			const zipFile = await (await fetch(jarUrl)).blob();
			const zip = await JSZip.loadAsync(zipFile);

			return zip;
		}
	}

	public async getResourceBase64(name: string): Promise<THREE.Texture> {
		let data: string = "";
		if (Array.isArray(this.zip)) {
			for (const zipFile of this.zip) {
				data = await zipFile.file(`assets/minecraft/${name}`)?.async("base64");
				if (data) {
					break;
				}
			}
		} else {
			data = await this.zip.file(`assets/minecraft/${name}`, { base64: true });
		}
		this.blobCache.set(name, data);
		return data;
	}

	public async getBase64Image(model: BlockModel, faceData: any) {
		const textureName = this.resolveTextureName(faceData.texture, model);
		const base64Resource = await this.getResourceBase64(
			`textures/${textureName}.png`
		);
		if (base64Resource === undefined) {
			return undefined;
		}
		const base64Png = "data:image/png;base64," + base64Resource;
		return base64Png;
	}

	public async getTextureMaterial(
		model: BlockModel,
		faceData: any,
		transparent?: boolean,
		color?: THREE.Color,
		materialRotation?: number
	): Promise<THREE.Material> {
		let textureName = faceData.texture;
		while (textureName.startsWith("#")) {
			textureName = model.textures[textureName.substring(1)];
		}

		let rotation = materialRotation || faceData?.rotation || 0;
		if (rotation === 0) {
			rotation = undefined;
		} else {
			console.log(rotation);
		}
		if (textureName.startsWith("minecraft:")) {
			textureName = textureName.substring("minecraft:".length);
		}
		const base64Resource = await this.getResourceBase64(
			`textures/${textureName}.png`
		);
		if (base64Resource === undefined) {
			return undefined;
		}
		const base64Png = "data:image/png;base64," + base64Resource;
		const texture = this.textureLoader.load(base64Png, () => {
			texture.minFilter = THREE.NearestFilter;
			texture.magFilter = THREE.NearestFilter;
			texture.needsUpdate = true;
		});

		return new THREE.MeshStandardMaterial({
			map: texture,
			side: transparent ? THREE.DoubleSide : THREE.FrontSide,
			alphaTest: 0.1,
			transparent: transparent,
			color: color ?? 0xffffff,
			// vertexColors: true,
		});
	}

	public getModelOption(data: BlockModelData) {
		const weightedRandomIndex = (
			options: BlockModelData["models"][number]["options"]
		) => {
			const weights = [];

			for (let i = 0; i < options.length; i++) {
				weights[i] = options[i].weight + (weights[i - 1] || 0);
			}

			const random = Math.random() * weights[weights.length - 1];

			for (let i = 0; i < weights.length; i++) {
				if (weights[i] > random) {
					return i;
				}
			}

			return weights.length - 1;
		};

		let name = data.name;
		const holders = [];
		for (const model of data.models) {
			const index = weightedRandomIndex(model.options);
			holders.push(model.options[index].holder);
			name = `${name}-${index}`;
		}

		return { name, holders };
	}

	public getColorForElement(
		faceData: any,
		tex: string,
		block: Block | undefined
	) {
		if (tex.startsWith("block/redstone_dust_")) {
			return this.REDSTONE_COLORS[block?.properties?.["power"] ?? 0];
		} else if (faceData.tintindex !== undefined) {
			return this.TINT_COLOR;
		} else if (tex.startsWith("block/water_")) {
			return this.WATER_COLOR;
		} else if (tex.startsWith("block/lava_")) {
			return this.LAVA_COLOR;
		}

		return undefined;
	}

	public getSizeFromElement(element: BlockModel["elements"][0]) {
		return [
			element.to[0] - element.from[0],
			element.to[1] - element.from[1],
			element.to[2] - element.from[2],
		];
	}

	public async getBlockStateDefinition(blockType: string) {
		if (this.blockStateDefinitionCache.has(blockType)) {
			return this.blockStateDefinitionCache.get(blockType);
		}

		const blockStateDefinition = await this.loadBlockStateDefinition(blockType);
		this.blockStateDefinitionCache.set(blockType, blockStateDefinition);
		return blockStateDefinition;
	}

	public async getBlockMeta(block: any) {
		if (this.blockMetaCache.has(this.hashBlockForMap(block))) {
			return this.blockMetaCache.get(this.hashBlockForMap(block));
		}
		const blockStateDefinition = await this.loadBlockStateDefinition(
			block.type
		);
		const modelData = this.getBlockModelData(block, blockStateDefinition);
		const modelOptions = this.getModelOption(modelData);
		const blockMeta = { blockStateDefinition, modelData, modelOptions };
		this.blockMetaCache.set(this.hashBlockForMap(block), blockMeta);
		return blockMeta;
	}

	public applyElementRotation(mesh, rotation) {
		if (rotation) {
			const euler = new THREE.Euler(
				rotation.angle * this.DEG2RAD * rotation.axis[0],
				rotation.angle * this.DEG2RAD * rotation.axis[1],
				rotation.angle * this.DEG2RAD * rotation.axis[2]
			);
			mesh.setRotationFromEuler(euler);
		}
	}

	public normalize(input: number): number {
		return input / 16;
	}

	public normalizeElementCoords(element: BlockModel["elements"][0]) {
		element.from = element.from.map(this.normalize) as Vector;
		element.to = element.to.map(this.normalize) as Vector;
		if (element.rotation) {
			element.rotation.origin = element.rotation.origin.map(
				this.normalize
			) as Vector;
		}
	}

	public async processFaceData(element, model, block, rotation = 0) {
		const subMaterials = {};
		const uvs = {};
		for (const face of this.POSSIBLE_FACES) {
			const faceData = element.faces[face];
			if (!faceData) {
				subMaterials[face] = null;
				uvs[face] = this.DEFAULT_UV.map((u) => u / 16) as [
					number,
					number,
					number,
					number
				];
				continue;
			}
			const materialColor = this.getColorForElement(
				faceData,
				this.resolveTextureName(faceData.texture, model),
				block
			);
			const materialId = this.getMaterialId(model, faceData, materialColor);
			if (!this.materialMap.has(materialId)) {
				const material = await this.getTextureMaterial(
					model,
					faceData,
					TRANSPARENT_BLOCKS.has(block.type) ||
						faceData.texture.includes("overlay"),
					materialColor,
					rotation
				);
				this.materialMap.set(materialId, material);
				this.base64MaterialMap.set(
					materialId,
					await this.getBase64Image(model, faceData)
				);
			}

			subMaterials[face] = materialId;
			uvs[face] = (faceData.uv || this.DEFAULT_UV).map((u) => u / 16) as [
				number,
				number,
				number,
				number
			];
		}
		return { subMaterials, uvs };
	}

	public getMaterialId(model: BlockModel, faceData: any, color: THREE.Color) {
		const textureName = this.resolveTextureName(faceData.texture, model);
		return `${textureName}-${color?.r ?? 1}-${color?.g ?? 1}-${color?.b ?? 1}`;
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
		const { modelOptions } = await this.getBlockMeta(block);
		// console.log("modelOptions", modelOptions);
		for (const modelHolder of modelOptions.holders) {
			// console.log("modelHolder", modelHolder);
			if (modelHolder === undefined) {
				continue;
			}
			const model = await this.loadModel(modelHolder.model);
			const elements = model?.elements;
			if (!elements) {
				continue;
			}
			for (const element of elements) {
				if (Object.keys(element.faces).length === 0) {
					continue;
				}
				this.normalizeElementCoords(element);
				const faceData = await this.processFaceData(element, model, block);
				const from = element.from;
				const to = element.to;
				const size = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
				const directionData = this.getDirectionData(faceData.uvs);
				const faces = this.POSSIBLE_FACES;
				for (const dir of faces) {
					const materialId = faceData.subMaterials[dir];
					if (!materialId) {
						continue;
					}
					const uniqueKey = `${materialId}-${dir}`;
					if (!blockComponents[uniqueKey]) {
						blockComponents[uniqueKey] = {
							materialId: materialId,
							face: dir,
							positions: [],
							normals: [],
							uvs: [],
						};
					}

					const dirData = directionData[dir];
					for (const { pos, uv } of dirData.corners) {
						// if (modelHolder.y) {
						// 	const angle = modelHolder.y;
						// 	const rotatedPos = this.rotateVector(
						// 		[pos[0], pos[1], pos[2]],
						// 		{ angle, axis: [0, 1, 0] },
						// 		[0, 0, 0]
						// 	);
						// 	pos[0] = rotatedPos[0];
						// 	pos[1] = rotatedPos[1];
						// 	pos[2] = rotatedPos[2];

						// }
						blockComponents[uniqueKey].positions.push(
							from[0] + size[0] * pos[0],
							from[1] + size[1] * pos[1],
							from[2] + size[2] * pos[2]
						);
						const invertedUV = [1 - uv[0], 1 - uv[1]];
						blockComponents[uniqueKey].uvs.push(...invertedUV);
						blockComponents[uniqueKey].normals.push(...dirData.normal);
					}
				}
			}
		}
		return blockComponents;
	}

	// async getSchematicMeshes(): Promise<any[]> {
	// 	if (this.schematic === undefined) {
	// 		return [];
	// 	}
	// 	const materialGroups = {};
	// 	const worldWidth = this.schematic.width;
	// 	const worldHeight = this.schematic.height;
	// 	const worldLength = this.schematic.length;
	// 	const offset = new THREE.Vector3(-worldWidth / 2, 0, -worldLength / 2);
	// 	const meshes = [];
	// 	const blockMeshCache = new Map();
	// 	for (const pos of this.schematic) {
	// 		const { x, y, z } = pos;
	// 		const block = this.schematic.getBlock(pos);
	// 		if (INVISIBLE_BLOCKS.has(block.type)) {
	// 			continue;
	// 		}

	// 		let blockComponents;
	// 		const blockUniqueKey = this.hashBlockForMap(block);
	// 		if (blockMeshCache.has(blockUniqueKey)) {
	// 			blockComponents = blockMeshCache.get(blockUniqueKey);
	// 		} else {
	// 			blockComponents = await this.getBlockMesh(block);
	// 			blockMeshCache.set(blockUniqueKey, blockComponents);
	// 		}
	// 		const occludedFaces = this.getOccludedFacesForBlock(block.type, pos);
	// 		for (const key in blockComponents) {
	// 			const { materialId, positions, normals, uvs, face } =
	// 				blockComponents[key];
	// 			if (occludedFaces[face]) {
	// 				continue;
	// 			}
	// 			if (!materialGroups[materialId]) {
	// 				materialGroups[materialId] = {
	// 					positions: [],
	// 					normals: [],
	// 					uvs: [],
	// 					indices: [],
	// 					aoValues: [],
	// 					count: 0,
	// 				};
	// 			}
	// 			const group = materialGroups[materialId];
	// 			for (let i = 0; i < positions.length; i += 3) {

	// 				group.positions.push(
	// 					positions[i] + x + offset.x,
	// 					positions[i + 1] + y + offset.y,
	// 					positions[i + 2] + z + offset.z
	// 				);

	// 			}
	// 			group.normals.push(...normals);
	// 			group.uvs.push(...uvs);
	// 			const indexOffset = group.count;
	// 			for (let i = 0; i < positions.length / 3; i += 4) {
	// 				group.indices.push(
	// 					indexOffset + i,
	// 					indexOffset + i + 1,
	// 					indexOffset + i + 2,
	// 					indexOffset + i + 2,
	// 					indexOffset + i + 1,
	// 					indexOffset + i + 3
	// 				);

	// 			}
	// 			group.count += positions.length / 3;
	// 		}
	// 	}

	// 	Object.keys(materialGroups).forEach((materialId) => {
	// 		const group = materialGroups[materialId];
	// 		const material = this.materialMap.get(materialId);
	// 		const geometry = new THREE.BufferGeometry();
	// 		geometry.setAttribute(
	// 			"position",
	// 			new THREE.Float32BufferAttribute(group.positions, 3)
	// 		);
	// 		geometry.setAttribute(
	// 			"normal",
	// 			new THREE.Float32BufferAttribute(group.normals, 3)
	// 		);
	// 		geometry.setAttribute(
	// 			"uv",
	// 			new THREE.Float32BufferAttribute(group.uvs, 2)
	// 		);
	// 		geometry.setIndex(group.indices);

	// 		const mesh = new THREE.Mesh(geometry, material);
	// 		mesh.castShadow = true;
	// 		mesh.receiveShadow = true;
	// 		meshes.push(mesh);
	// 		this.materialMap.delete(materialId);
	// 	});
	// 	return meshes;
	// }

	public initializeMeshCreation() {
		if (this.schematic === undefined) {
			return { materialGroups: null };
		}
		const worldWidth = this.schematic.width;
		const worldHeight = this.schematic.height;
		const worldLength = this.schematic.length;
		// const offset = new THREE.Vector3(-worldWidth / 2, 0, -worldLength / 2);
		const offset = { x: 0, y: 0, z: 0 };
		return { worldWidth, worldHeight, worldLength, offset };
	}

	public async getBlockMeshFromCache(block) {
		const blockUniqueKey = this.hashBlockForMap(block);
		if (this.blockMeshCache.has(blockUniqueKey)) {
			return this.blockMeshCache.get(blockUniqueKey);
		} else {
			const blockComponents = await this.getBlockMesh(block);
			this.blockMeshCache.set(blockUniqueKey, blockComponents);
			return blockComponents;
		}
	}

	public rotateVector(
		position: number[],
		rotation: { angle: number; axis: number[] },
		center = [0, 0, 0]
	): number[] {
		if (!rotation || rotation.angle % 360 === 0) {
			return position;
		}
		let [x, y, z] = position;
		const [cx, cy, cz] = center;
		x -= cx;
		y -= cy;
		z -= cz;
		const { angle, axis } = rotation;
		const cos = Math.cos(angle * this.DEG2RAD);
		const sin = Math.sin(angle * this.DEG2RAD);
		const [xAxis, yAxis, zAxis] = axis;
		const result = [
			x * (xAxis * xAxis * (1 - cos) + cos) +
				y * (xAxis * yAxis * (1 - cos) - zAxis * sin) +
				z * (xAxis * zAxis * (1 - cos) + yAxis * sin),
			x * (yAxis * xAxis * (1 - cos) + zAxis * sin) +
				y * (yAxis * yAxis * (1 - cos) + cos) +
				z * (yAxis * zAxis * (1 - cos) - xAxis * sin),
			x * (zAxis * xAxis * (1 - cos) - yAxis * sin) +
				y * (zAxis * yAxis * (1 - cos) + xAxis * sin) +
				z * (zAxis * zAxis * (1 - cos) + cos),
		];
		result[0] += cx;
		result[1] += cy;
		result[2] += cz;
		return result;
	}

	public faceToRotation(face) {
		switch (face) {
			case "north":
				return { angle: 180, axis: [0, 1, 0] };
			case "south":
				return { angle: 0, axis: [0, 1, 0] };
			case "east":
				return { angle: 90, axis: [0, 1, 0] };
			case "west":
				return { angle: 270, axis: [0, 1, 0] };
			case "up":
				return { angle: 270, axis: [1, 0, 0] };
			case "down":
				return { angle: 90, axis: [1, 0, 0] };
			default:
				return { angle: 0, axis: [0, 1, 0] };
		}
	}

	public rotateBlockComponents(blockComponents, facing) {
		const rotation = this.faceToRotation(facing);
		// console.log("rotation", rotation);
		const rotatedBlockComponents = {};
		for (const key in blockComponents) {
			const blockComponent = blockComponents[key];
			const { positions, normals, uvs } = blockComponent;
			const rotatedPositions = [];
			const rotatedNormals = [];
			const rotatedUvs = [];
			for (let i = 0; i < positions.length; i += 3) {
				const [x, y, z] = this.rotateVector(
					[positions[i], positions[i + 1], positions[i + 2]],
					rotation,
					[0.5, 0.5, 0.5]
				);
				rotatedPositions.push(x, y, z);
			}
			for (let i = 0; i < normals.length; i += 3) {
				const [x, y, z] = this.rotateVector(
					[normals[i], normals[i + 1], normals[i + 2]],
					rotation
				);
				rotatedNormals.push(x, y, z);
			}
			for (let i = 0; i < uvs.length; i += 2) {
				rotatedUvs.push(uvs[i], uvs[i + 1]);
			}
			rotatedBlockComponents[key] = {
				...blockComponent,
				positions: rotatedPositions,
				normals: rotatedNormals,
				uvs: rotatedUvs,
			};
		}
		return rotatedBlockComponents;
	}

	public occludedFacesListToInt(occludedFaces) {
		let result = 0;
		for (const face of this.POSSIBLE_FACES) {
			result = (result << 1) | (occludedFaces[face] ? 1 : 0);
		}
		return result;
	}

	public occludedFacesIntToList(occludedFaces) {
		const result = {};
		for (const face of this.REVERSED_POSSIBLE_FACES) {
			result[face] = !!(occludedFaces & 1);
			occludedFaces = occludedFaces >> 1;
		}
		return result;
	}

	recalculateIndex(index) {
		return [index, index + 1, index + 2, index + 2, index + 1, index + 3];
	}

	// public async processSchematicBlocks(materialGroups, worldDimensions, offset) {
	// 	const maxBlocksAllowed = 100000;
	// 	let count = 0;
	// 	for (const pos of this.schematic) {
	// 		if (count > maxBlocksAllowed) {
	// 			break;
	// 		}
	// 		const { x, y, z } = pos;
	// 		const block = this.schematic.getBlock(pos);
	// 		if (INVISIBLE_BLOCKS.has(block.type)) {
	// 			continue;
	// 		}
	// 		let blockComponents = await this.getBlockMeshFromCache(block);
	// 		const occludedFaces = this.getOccludedFacesForBlock(block.type, pos);

	// 		for (const key in blockComponents) {
	// 			this.addBlockToMaterialGroup(
	// 				materialGroups,
	// 				blockComponents[key],
	// 				occludedFaces,
	// 				x,
	// 				y,
	// 				z,
	// 				offset
	// 			);
	// 		}
	// 		count++;
	// 	}
	// }

	public splitSchemaIntoChunks(
		dimensions = { chunkWidth: 64, chunkHeight: 64, chunkLength: 64 }
	) {
		const chunks = [];
		// each chunk is a list of positions
		const { chunkWidth, chunkHeight, chunkLength } = dimensions;
		const { width, height, length } = this.schematic;
		const chunkCountX = Math.ceil(width / chunkWidth);
		const chunkCountY = Math.ceil(height / chunkHeight);
		const chunkCountZ = Math.ceil(length / chunkLength);
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
		materialGroups,
		chunk,
		chunkDimensions,
		offset
	) {
		const maxBlocksAllowed = 100000;
		let count = 0;
		for (const pos of chunk) {
			if (count > maxBlocksAllowed) {
				break;
			}
			const { x, y, z } = pos;
			const block = this.schematic.getBlock(pos);
			if (INVISIBLE_BLOCKS.has(block.type)) {
				continue;
			}
			console.log("position", pos, " block", block);

			const blockComponents = await this.getBlockMeshFromCache(block);
			const rotatedBlockComponents = this.rotateBlockComponents(
				blockComponents,
				block.properties?.["facing"]
			);

			const occludedFaces = this.getOccludedFacesForBlock(block.type, pos);

			for (const key in rotatedBlockComponents) {
				this.addBlockToMaterialGroup(
					materialGroups,
					rotatedBlockComponents[key],
					occludedFaces,
					x,
					y,
					z,
					offset
				);
			}
			count++;
		}
	}

	public binaryStringToInt(binaryString) {
		return parseInt(binaryString, 2);
	}

	public addBlockToMaterialGroup(
		materialGroups,
		blockComponent,
		occludedFacesInt,
		x,
		y,
		z,
		offset
	) {
		const { materialId, positions, normals, uvs, face } = blockComponent;
		const occludedFaces = this.occludedFacesIntToList(occludedFacesInt);
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
		for (let i = 0; i < positions.length; i += 3) {
			const positionX = positions[i] + x + offset.x;
			const positionY = positions[i + 1] + y + offset.y;
			const positionZ = positions[i + 2] + z + offset.z;
			group.positions.push(positionX, positionY, positionZ);
		}
		group.normals.push(...normals);
		group.uvs.push(...uvs);
		const indexOffset = group.count;
		for (let i = 0; i < positions.length / 3; i += 4) {
			group.indices.push(indexOffset + i);
		}
		group.count += positions.length / 3;
	}

	public createMeshesFromMaterialGroups(materialGroups) {
		const meshes = [];
		Object.keys(materialGroups).forEach((materialId) => {
			const group = materialGroups[materialId];
			const material = this.materialMap.get(materialId);
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute(
				"position",
				new THREE.Float32BufferAttribute(group.positions, 3)
			);
			geometry.setAttribute(
				"normal",
				new THREE.Float32BufferAttribute(group.normals, 3)
			);
			geometry.setAttribute(
				"uv",
				new THREE.Float32BufferAttribute(group.uvs, 2)
			);
			// geometry.setAttribute(
			// 	"color",
			// 	new THREE.Float32BufferAttribute(group.colors, 3)
			// );
			const recalculateIndices = group.indices
				.map((index) => this.recalculateIndex(index))
				.flat();
			geometry.setIndex(recalculateIndices);

			const mesh = new THREE.Mesh(geometry, material);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			meshes.push(mesh);
			// this.materialMap.delete(materialId);
		});

		return meshes;
	}

	// public async getSchematicMeshes() {
	// 	const {worldWidth, worldHeight, worldLength, offset } = this.initializeMeshCreation();
	// 	const materialGroups = {};
	// 	await this.processSchematicBlocks(materialGroups, { worldWidth, worldHeight, worldLength }, offset);
	// return this.createMeshesFromMaterialGroups(materialGroups);
	// }

	// create a chunk mesh for each chunk
	public async getSchematicMeshes(
		chunkDimensions = { chunkWidth: 16, chunkHeight: 16, chunkLength: 16 }
	) {
		const { worldWidth, worldHeight, worldLength, offset } =
			this.initializeMeshCreation();
		const chunks = this.splitSchemaIntoChunks({
			chunkWidth: 64,
			chunkHeight: 64,
			chunkLength: 64,
		});
		const chunkMeshes = [];
		const totalChunks = chunks.length;
		let currentChunk = 0;
		for (const chunk of chunks) {
			console.log(`Processing chunk ${currentChunk} of ${totalChunks}`);
			currentChunk++;
			const materialGroups = {};
			await this.processChunkBlocks(
				materialGroups,
				chunk,
				chunkDimensions,
				offset
			);
			chunkMeshes.push(...this.createMeshesFromMaterialGroups(materialGroups));
		}
		return chunkMeshes;
	}

	calculateAmbientOcclusion(side1, side2, corner) {
		console.log(side1, side2, corner);
		if (side1 && side2) {
			return 0;
		}
		return 3 - (side1 + side2 + corner);
	}

	public isSolid(x: number, y: number, z: number) {
		const block = this.schematic.getBlock(new THREE.Vector3(x, y, z));
		return block && !TRANSPARENT_BLOCKS.has(block.type);
	}

	public getOccludedFacesForBlock(blockType: string, pos: Vector): int {
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
		};
		if (
			NON_OCCLUDING_BLOCKS.has(blockType) ||
			TRANSPARENT_BLOCKS.has(blockType)
		) {
			return occludedFaces;
		}
		for (const face of this.POSSIBLE_FACES) {
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

	public getCornerDictionary() {
		return {
			east: {
				normal: [1, 0, 0],
				corners: [
					{ pos: [1, 0, 0], uv: [0, 1] },
					{ pos: [1, 1, 0], uv: [0, 0] },
					{ pos: [1, 0, 1], uv: [1, 1] },
					{ pos: [1, 1, 1], uv: [1, 0] },
				],
			},
			west: {
				normal: [-1, 0, 0],
				corners: [
					{ pos: [0, 0, 1], uv: [0, 1] },
					{ pos: [0, 1, 1], uv: [0, 0] },
					{ pos: [0, 0, 0], uv: [1, 1] },
					{ pos: [0, 1, 0], uv: [1, 0] },
				],
			},
			up: {
				normal: [0, 1, 0],
				corners: [
					{ pos: [0, 1, 1], uv: [0, 1] },
					{ pos: [1, 1, 1], uv: [1, 1] },
					{ pos: [0, 1, 0], uv: [0, 0] },
					{ pos: [1, 1, 0], uv: [1, 0] },
				],
			},
			down: {
				normal: [0, -1, 0],
				corners: [
					{ pos: [1, 0, 1], uv: [0, 0] },
					{ pos: [0, 0, 1], uv: [1, 0] },
					{ pos: [1, 0, 0], uv: [0, 1] },
					{ pos: [0, 0, 0], uv: [1, 1] },
				],
			},
			south: {
				normal: [0, 0, 1],
				corners: [
					{ pos: [1, 1, 1], uv: [1, 0] },
					{ pos: [0, 1, 1], uv: [0, 0] },
					{ pos: [1, 0, 1], uv: [1, 1] },
					{ pos: [0, 0, 1], uv: [0, 1] },
				],
			},
			north: {
				normal: [0, 0, -1],
				corners: [
					{ pos: [1, 0, 0], uv: [1, 1] },
					{ pos: [0, 0, 0], uv: [0, 1] },
					{ pos: [1, 1, 0], uv: [1, 0] },
					{ pos: [0, 1, 0], uv: [0, 0] },
				],
			},
		};
	}

	// getDirectionData(faceUVs: any) {
	// 	return {
	// 		east: {
	// 			normal: [1, 0, 0],
	// 			corners: [
	// 				{ pos: [1, 0, 0], uv: [faceUVs["east"][0], faceUVs["east"][3]] },
	// 				{ pos: [1, 1, 0], uv: [faceUVs["east"][0], faceUVs["east"][1]] },
	// 				{ pos: [1, 0, 1], uv: [faceUVs["east"][2], faceUVs["east"][3]] },
	// 				{ pos: [1, 1, 1], uv: [faceUVs["east"][2], faceUVs["east"][1]] },
	// 			],
	// 		},
	// 		west: {
	// 			normal: [-1, 0, 0],
	// 			corners: [
	// 				{ pos: [0, 0, 1], uv: [faceUVs["west"][0], faceUVs["west"][3]] },
	// 				{ pos: [0, 1, 1], uv: [faceUVs["west"][0], faceUVs["west"][1]] },
	// 				{ pos: [0, 0, 0], uv: [faceUVs["west"][2], faceUVs["west"][3]] },
	// 				{ pos: [0, 1, 0], uv: [faceUVs["west"][2], faceUVs["west"][1]] },
	// 			],
	// 		},
	// 		up: {
	// 			normal: [0, 1, 0],
	// 			corners: [
	// 				{ pos: [0, 1, 1], uv: [faceUVs["up"][0], faceUVs["up"][3]] },
	// 				{ pos: [1, 1, 1], uv: [faceUVs["up"][2], faceUVs["up"][3]] },
	// 				{ pos: [0, 1, 0], uv: [faceUVs["up"][0], faceUVs["up"][1]] },
	// 				{ pos: [1, 1, 0], uv: [faceUVs["up"][2], faceUVs["up"][1]] },
	// 			],
	// 		},

	// 		down: {
	// 			normal: [0, -1, 0],
	// 			corners: [
	// 				{ pos: [1, 0, 1], uv: [faceUVs["down"][0], faceUVs["down"][1]] },
	// 				{ pos: [0, 0, 1], uv: [faceUVs["down"][2], faceUVs["down"][1]] },
	// 				{ pos: [1, 0, 0], uv: [faceUVs["down"][0], faceUVs["down"][3]] },
	// 				{ pos: [0, 0, 0], uv: [faceUVs["down"][2], faceUVs["down"][3]] },
	// 			],
	// 		},
	// 		south: {
	// 			normal: [0, 0, 1],
	// 			corners: [
	// 				{ pos: [1, 1, 1], uv: [faceUVs["south"][2], faceUVs["south"][1]] },
	// 				{ pos: [0, 1, 1], uv: [faceUVs["south"][0], faceUVs["south"][1]] },
	// 				{ pos: [1, 0, 1], uv: [faceUVs["south"][2], faceUVs["south"][3]] },
	// 				{ pos: [0, 0, 1], uv: [faceUVs["south"][0], faceUVs["south"][3]] },
	// 			],
	// 		},
	// 		north: {
	// 			normal: [0, 0, -1],
	// 			corners: [
	// 				{ pos: [1, 0, 0], uv: [faceUVs["north"][2], faceUVs["north"][3]] },
	// 				{ pos: [0, 0, 0], uv: [faceUVs["north"][0], faceUVs["north"][3]] },
	// 				{ pos: [1, 1, 0], uv: [faceUVs["north"][2], faceUVs["north"][1]] },
	// 				{ pos: [0, 1, 0], uv: [faceUVs["north"][0], faceUVs["north"][1]] },
	// 			],
	// 		},
	// 	};
	// }

	getDirectionData(faceUVs: any) {
		const cornerDictionary = this.getCornerDictionary();
		return {
			east: {
				normal: cornerDictionary["east"]["normal"],
				corners: [
					{
						pos: cornerDictionary["east"]["corners"][0]["pos"],
						uv: [faceUVs["east"][0], faceUVs["east"][3]],
					},
					{
						pos: cornerDictionary["east"]["corners"][1]["pos"],
						uv: [faceUVs["east"][0], faceUVs["east"][1]],
					},
					{
						pos: cornerDictionary["east"]["corners"][2]["pos"],
						uv: [faceUVs["east"][2], faceUVs["east"][3]],
					},
					{
						pos: cornerDictionary["east"]["corners"][3]["pos"],
						uv: [faceUVs["east"][2], faceUVs["east"][1]],
					},
				],
			},
			west: {
				normal: cornerDictionary["west"]["normal"],
				corners: [
					{
						pos: cornerDictionary["west"]["corners"][0]["pos"],
						uv: [faceUVs["west"][0], faceUVs["west"][3]],
					},
					{
						pos: cornerDictionary["west"]["corners"][1]["pos"],
						uv: [faceUVs["west"][0], faceUVs["west"][1]],
					},
					{
						pos: cornerDictionary["west"]["corners"][2]["pos"],
						uv: [faceUVs["west"][2], faceUVs["west"][3]],
					},
					{
						pos: cornerDictionary["west"]["corners"][3]["pos"],
						uv: [faceUVs["west"][2], faceUVs["west"][1]],
					},
				],
			},
			up: {
				normal: cornerDictionary["up"]["normal"],
				corners: [
					{
						pos: cornerDictionary["up"]["corners"][0]["pos"],
						uv: [faceUVs["up"][0], faceUVs["up"][3]],
					},
					{
						pos: cornerDictionary["up"]["corners"][1]["pos"],
						uv: [faceUVs["up"][2], faceUVs["up"][3]],
					},
					{
						pos: cornerDictionary["up"]["corners"][2]["pos"],
						uv: [faceUVs["up"][0], faceUVs["up"][1]],
					},
					{
						pos: cornerDictionary["up"]["corners"][3]["pos"],
						uv: [faceUVs["up"][2], faceUVs["up"][1]],
					},
				],
			},
			down: {
				normal: cornerDictionary["down"]["normal"],
				corners: [
					{
						pos: cornerDictionary["down"]["corners"][0]["pos"],
						uv: [faceUVs["down"][0], faceUVs["down"][1]],
					},
					{
						pos: cornerDictionary["down"]["corners"][1]["pos"],
						uv: [faceUVs["down"][2], faceUVs["down"][1]],
					},
					{
						pos: cornerDictionary["down"]["corners"][2]["pos"],
						uv: [faceUVs["down"][0], faceUVs["down"][3]],
					},
					{
						pos: cornerDictionary["down"]["corners"][3]["pos"],
						uv: [faceUVs["down"][2], faceUVs["down"][3]],
					},
				],
			},
			south: {
				normal: cornerDictionary["south"]["normal"],
				corners: [
					{
						pos: cornerDictionary["south"]["corners"][0]["pos"],
						uv: [faceUVs["south"][2], faceUVs["south"][1]],
					},
					{
						pos: cornerDictionary["south"]["corners"][1]["pos"],
						uv: [faceUVs["south"][0], faceUVs["south"][1]],
					},
					{
						pos: cornerDictionary["south"]["corners"][2]["pos"],
						uv: [faceUVs["south"][2], faceUVs["south"][3]],
					},
					{
						pos: cornerDictionary["south"]["corners"][3]["pos"],
						uv: [faceUVs["south"][0], faceUVs["south"][3]],
					},
				],
			},
			north: {
				normal: cornerDictionary["north"]["normal"],
				corners: [
					{
						pos: cornerDictionary["north"]["corners"][0]["pos"],
						uv: [faceUVs["north"][2], faceUVs["north"][3]],
					},
					{
						pos: cornerDictionary["north"]["corners"][1]["pos"],
						uv: [faceUVs["north"][0], faceUVs["north"][3]],
					},
					{
						pos: cornerDictionary["north"]["corners"][2]["pos"],
						uv: [faceUVs["north"][2], faceUVs["north"][1]],
					},
					{
						pos: cornerDictionary["north"]["corners"][3]["pos"],
						uv: [faceUVs["north"][0], faceUVs["north"][1]],
					},
				],
			},
		};
	}

	public resolveTextureName(ref: string, model: BlockModel): string {
		while (ref.startsWith("#")) {
			ref = model.textures[ref.substring(1)];
		}
		return ref;
	}

	public getBlockModelData(
		block: Block,
		blockState: BlockStateDefinition
	): BlockModelData {
		const models: BlockModelData["models"] = [];

		const validVariantProperties = blockState.variants
			? new Set(
					Object.keys(blockState.variants)[0]
						.split(",")
						.map((a) => a.split("=")[0])
			  )
			: new Set(Object.keys(block.properties));
		const variantName = Object.keys(block.properties)
			.sort()
			.reduce((a, b) => {
				if (!validVariantProperties.has(b)) {
					return a;
				}
				a.push(`${b}=${block.properties[b]}`);
				return a;
			}, [])
			.join(",");
		const createWeightedModels = (
			model: BlockStateModelHolder | BlockStateModelHolder[]
		): BlockModelData["models"][number]["options"] => {
			if (Array.isArray(model)) {
				return model.map((m) => ({ holder: m, weight: m.weight ?? 1 }));
			}
			return [{ holder: model, weight: 1 }];
		};
		if (blockState.variants?.[""]) {
			models.push({
				options: createWeightedModels(blockState.variants[""]),
			});
		} else if (blockState.variants) {
			models.push({
				options: createWeightedModels(blockState.variants[variantName]),
			});
		} else if (blockState.multipart) {
			const doesFilterPass = (filter: BlockStateDefinitionVariant<string>) => {
				for (const property of Object.keys(filter)) {
					const filterProperties = filter[property].split("|");

					if (filterProperties.indexOf(block.properties[property]) === -1) {
						return false;
					}
				}
				return true;
			};

			for (const part of blockState.multipart) {
				if (part.when) {
					if (part.when.OR) {
						let anyPassed = false;
						for (const test of part.when.OR) {
							if (doesFilterPass(test)) {
								anyPassed = true;
								break;
							}
						}
						if (!anyPassed) {
							continue;
						}
					} else {
						if (!doesFilterPass(part.when)) {
							continue;
						}
					}
				}

				models.push({ options: createWeightedModels(part.apply) });
			}
		}

		const name =
			variantName.length > 0 ? `${block.type}[${variantName}]` : block.type;

		return { models, name };
	}

	public hashBlockForMap(block: Block) {
		return `${block.type}:${JSON.stringify(block.properties)}`;
	}

	public async updateBlockModelLookup(
		blockModelLookup: Map<string, BlockModelData>,
		loadedSchematic: ReturnType<typeof loadSchematic>
	): Promise<Map<string, BlockModelData>> {
		for (const block of loadedSchematic.blockTypes) {
			if (INVISIBLE_BLOCKS.has(block.type)) {
				continue;
			}

			if (blockModelLookup.get(this.hashBlockForMap(block))) {
				continue;
			}
			const blockState = await this.loadBlockStateDefinition(block.type);
			const blockModelData = this.getBlockModelData(block, blockState);
			if (!blockModelData.models.length) {
				continue;
			}

			blockModelLookup.set(this.hashBlockForMap(block), blockModelData);
		}
		return blockModelLookup;
	}

	public async getResourceString(name: string) {
		if (this.stringCache.has(name)) {
			return this.stringCache.get(name);
		} else {
			let data: string;
			if (Array.isArray(this.zip)) {
				for (const zipFile of this.zip) {
					data = await zipFile
						.file(`assets/minecraft/${name}`)
						?.async("string");
					if (data) {
						break;
					}
				}
			} else {
				data = await this.zip.file(`assets/minecraft/${name}`)?.async("string");
			}
			this.stringCache.set(name, data);
			return data;
		}
	}

	public async loadBlockStateDefinition(
		block: string
	): Promise<BlockStateDefinition> {
		return JSON.parse(
			await this.getResourceString(`blockstates/${block}.json`)
		) as BlockStateDefinition;
	}

	public async loadModel(modelRef: string): Promise<BlockModel> {
		if (this.blockModelCache.has(modelRef)) {
			return this.blockModelCache.get(modelRef);
		}
		if (modelRef.startsWith("minecraft:")) {
			modelRef = modelRef.substring("minecraft:".length);
		}
		let model = JSON.parse(
			await this.getResourceString(`models/${modelRef}.json`)
		) as BlockModel;

		if (model.parent) {
			const parent = await this.loadModel(model.parent);
			if (model["elements"] && parent["elements"]) {
				delete parent["elements"];
			}
			model = deepmerge(parent, model);
			delete model.parent;
		}
		this.blockModelCache.set(modelRef, model);
		return model;
	}
}
