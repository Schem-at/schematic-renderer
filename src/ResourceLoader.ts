import * as THREE from "three";
import deepmerge from "deepmerge";
import { BlockStateWrapper } from "./wasm/minecraft_schematic_utils";

import chestModel from "./custom_models/chest.json";
import chestLeftModel from "./custom_models/chest_left.json";
import chestRightModel from "./custom_models/chest_right.json";
import shulkerBoxModel from "./custom_models/shulker_box.json";
import {
	hashBlockForMap,
	occludedFacesIntToList,
	REDSTONE_COLORS,
} from "./utils";
import JSZip from "jszip";
import type {
	BlockModel,
	BlockModelData,
	BlockStateDefinition,
	BlockStateDefinitionVariant,
	BlockStateModelHolder,
} from "./types";

import { Monitor } from "./monitoring";
import { SchematicRenderer } from "./SchematicRenderer";

interface Block {
	name: string;
	properties: Record<string, string>;
}
export class ResourceLoader {
	schematicRenderer: SchematicRenderer;
	schematic: any;
	textureCache: Map<string, THREE.Texture>;
	blobCache: Map<string, string>;
	stringCache: Map<string, string>;
	blockMeshCache: Map<string, any>;
	blockMetaCache: Map<string, any>;
	blockModelCache: Map<string, BlockModel>;
	faceDataCache: Map<string, any>;
	blockStateDefinitionCache: Map<string, BlockStateDefinition>;

	base64MaterialMap: Map<string, string>;
	resourcePackBlobs: any;
	zips: any;
	textureLoader = new THREE.TextureLoader();

	TINT_COLOR = new THREE.Color(145 / 255, 189 / 255, 89 / 255);
	WATER_COLOR = new THREE.Color(36 / 255, 57 / 255, 214 / 255);
	LAVA_COLOR = new THREE.Color(232 / 255, 89 / 255, 23 / 255);
	AMBIENT_LIGHT = new THREE.Color(1, 1, 1);
	SHADOW_COLOR = new THREE.Color(0.5, 0.5, 0.5);
	DEG2RAD = Math.PI / 180;

	DEBUG = true;
	CUSTOM_MODELS: { [key: string]: any } = {
		"block/chest": chestModel,
		"block/chest_left": chestLeftModel,
		"block/chest_right": chestRightModel,
		"block/shulker_box": shulkerBoxModel,
	};
	constructor(resourcePackBlobs: any, schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.textureCache = new Map();
		this.blobCache = new Map();
		this.stringCache = new Map();
		this.blockMeshCache = new Map();
		this.blockMetaCache = new Map();
		this.blockModelCache = new Map();
		this.faceDataCache = new Map();
		this.blockStateDefinitionCache = new Map();
		this.base64MaterialMap = new Map();
		this.resourcePackBlobs = resourcePackBlobs;
		this.textureLoader = new THREE.TextureLoader();
	}

	async initialize() {
		//this.zip = await this.loadZip(this.resourcePackBlob);
		this.zips = await Promise.all(
			this.resourcePackBlobs.map((blob: string) => this.loadZip(blob))
		);
	}

	public async loadZip(resourcePackBlob: string | string[]) {
		if (Array.isArray(resourcePackBlob)) {
			throw new Error("Invalid resource pack blob");
		}
		return await JSZip.loadAsync(resourcePackBlob);
	}

	public async getResourceBase64(name: string): Promise<string | undefined> {
		for (const zip of this.zips) {
			const data = await zip.file(`assets/minecraft/${name}`)?.async("base64");
			if (data) {
				return data;
			}
		}
		return undefined;
	}

	public async getResourceBase64FromZip(
		zip: JSZip,
		name: string
	): Promise<string> {
		let data: string = "";
		if (Array.isArray(zip)) {
			for (const zipFile of zip) {
				data =
					(await zipFile.file(`assets/minecraft/${name}`)?.async("base64")) ??
					"";
				if (data) {
					break;
				}
			}
		} else {
			data =
				(await zip.file(`assets/minecraft/${name}`)?.async("base64")) ?? "";
		}
		this.blobCache.set(name, data);
		return data;
	}

	public async getResourceString(name: string): Promise<string | undefined> {
		if (this.stringCache.has(name)) {
			return this.stringCache.get(name);
		}
		for (const zip of this.zips) {
			const file = zip.file(`assets/minecraft/${name}`);
			if (file) {
				const data = await file.async("text");
				this.stringCache.set(name, data);
				return data;
			}
		}
		console.warn(`Resource ${name} not found.`);
		return undefined;
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
		color?: THREE.Color
	): Promise<THREE.MeshStandardMaterial | undefined> {
		let textureName = faceData.texture;

		// Resolve texture references
		textureName = this.resolveTextureName(textureName, model);

		// Remove "minecraft:" prefix if present
		if (textureName.startsWith("minecraft:")) {
			textureName = textureName.substring("minecraft:".length);
		}

		// Get the base64 image
		const base64Resource = await this.getResourceBase64(
			`textures/${textureName}.png`
		);
		if (!base64Resource) {
			console.warn(`Texture ${textureName} not found.`);
			return undefined;
		}
		const base64Png = "data:image/png;base64," + base64Resource;

		// Load the texture
		const texture = this.textureLoader.load(base64Png, () => {
			texture.minFilter = THREE.NearestFilter;
			texture.magFilter = THREE.NearestFilter;
			texture.wrapS = THREE.RepeatWrapping;
			texture.wrapT = THREE.RepeatWrapping;
			texture.needsUpdate = true;
		});

		// Handle rotation
		const rotation = faceData.rotation;
		if (rotation) {
			texture.center = new THREE.Vector2(0.5, 0.5);
			texture.rotation = (rotation * Math.PI) / 180;
		}

		return new THREE.MeshStandardMaterial({
			map: texture,
			side: THREE.FrontSide,
			alphaTest: 0.1,
			transparent: transparent ?? false,
			color: color ?? 0xffffff,
		});
	}

	public getModelOption(data: BlockModelData) {
		const weightedRandomIndex = (
			options: BlockModelData["models"][number]["options"]
		) => {
			const weights: number[] = [];

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
		block: BlockStateWrapper | undefined
	) {
		if (faceData.tintindex !== undefined) {
			if (tex.startsWith("block/water_")) {
				return this.WATER_COLOR;
			} else if (tex.startsWith("block/lava_")) {
				return this.LAVA_COLOR;
			} else if (
				tex.startsWith("block/redstone_dust_") ||
				tex.startsWith("block/redstone_power")
			) {
				// @ts-ignore
				const power = block?.properties?.["power"] ?? 0;
				return REDSTONE_COLORS[power as number];
			} else if (faceData.tintindex !== undefined) {
				return this.TINT_COLOR;
			}
		}

		return undefined;
	}

	public getSizeFromElement(element: BlockModel["elements"][0]) {
		if (!element.from || !element.to) {
			throw new Error("Element is missing from or to");
		}
		return [
			element.to[0] - element.from[0],
			element.to[1] - element.from[1],
			element.to[2] - element.from[2],
		];
	}

	public async getBlockStateDefinition(
		blockType: string
	): Promise<BlockStateDefinition> {
		if (this.blockStateDefinitionCache.has(blockType)) {
			return this.blockStateDefinitionCache.get(
				blockType
			) as BlockStateDefinition;
		}

		const jsonString = await this.getResourceString(
			`blockstates/${blockType}.json`
		);
		if (!jsonString) {
			console.warn(`Block state definition for ${blockType} not found.`);
			this.blockStateDefinitionCache.set(blockType, {} as BlockStateDefinition);
			return {} as BlockStateDefinition;
		}

		const blockStateDefinition = JSON.parse(jsonString) as BlockStateDefinition;
		this.blockStateDefinitionCache.set(blockType, blockStateDefinition);
		return blockStateDefinition;
	}

	public async getBlockMeta(block: Block) {
		// Remove the "minecraft:" prefix
		block.name = block.name.replace("minecraft:", "");

		const blockKey = hashBlockForMap(block);
		if (this.blockMetaCache.has(blockKey)) {
			return this.blockMetaCache.get(blockKey);
		}

		const blockStateDefinition = await this.getBlockStateDefinition(block.name);
		const modelData = this.getBlockModelData(block, blockStateDefinition);
		const modelOptions = this.getModelOption(modelData);

		const blockMeta = { blockStateDefinition, modelData, modelOptions };
		this.blockMetaCache.set(blockKey, blockMeta);
		return blockMeta;
	}

	public applyElementRotation(mesh: THREE.Mesh, rotation: any) {
		if (rotation) {
			const euler = new THREE.Euler(
				rotation.angle * this.DEG2RAD * rotation.axis[0],
				rotation.angle * this.DEG2RAD * rotation.axis[1],
				rotation.angle * this.DEG2RAD * rotation.axis[2]
			);
			mesh.setRotationFromEuler(euler);
		}
	}

	recalculateIndex(index: number) {
		return [index, index + 1, index + 2, index + 2, index + 1, index + 3];
	}

	public addBlockToMaterialGroup(
		materialGroups: any,
		blockComponent: any,
		occludedFacesInt: number,
		x: number,
		y: number,
		z: number,
		offset: { x: number; y: number; z: number }
	) {
		const { materialId, positions, normals, uvs, face } = blockComponent;
		const occludedFaces = occludedFacesIntToList(occludedFacesInt);
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

	@Monitor
	public createMeshesFromBlocks(blocks: any): THREE.Mesh[] {
		const meshes: THREE.Mesh[] = [];

		for (const [materialId, blockList] of Object.entries(blocks)) {
			const material = this.schematicRenderer.materialMap.get(materialId);
			let totalVertices = 0;
			let totalIndices = 0;

			// First pass: calculate total vertices and indices
			for (const block of blockList as any) {
				const vertexCount = block[0].positions.length / 3;
				totalVertices += vertexCount;
				totalIndices += (vertexCount / 4) * 6; // Each quad becomes two triangles
			}

			const geometry = new THREE.BufferGeometry();
			const positions = new Float32Array(totalVertices * 3);
			const normals = new Float32Array(totalVertices * 3);
			const uvs = new Float32Array(totalVertices * 2);
			const indices = new Uint32Array(totalIndices);

			let positionOffset = 0;
			let normalOffset = 0;
			let uvOffset = 0;
			let indexOffset = 0;
			let indicesOffset = 0;

			for (const block of blockList as any) {
				const blockComponent = block[0];
				const worldPos = block[1];
				const vertexCount = blockComponent.positions.length / 3;

				// Positions
				for (let i = 0; i < blockComponent.positions.length; i += 3) {
					positions[positionOffset++] =
						blockComponent.positions[i] + worldPos[0];
					positions[positionOffset++] =
						blockComponent.positions[i + 1] + worldPos[1];
					positions[positionOffset++] =
						blockComponent.positions[i + 2] + worldPos[2];
				}

				// Normals
				normals.set(blockComponent.normals, normalOffset);
				normalOffset += blockComponent.normals.length;

				// UVs
				uvs.set(blockComponent.uvs, uvOffset);
				uvOffset += blockComponent.uvs.length;

				// Indices
				for (let i = 0; i < vertexCount; i += 4) {
					indices[indicesOffset++] = indexOffset + i;
					indices[indicesOffset++] = indexOffset + i + 1;
					indices[indicesOffset++] = indexOffset + i + 2;
					indices[indicesOffset++] = indexOffset + i + 2;
					indices[indicesOffset++] = indexOffset + i + 1;
					indices[indicesOffset++] = indexOffset + i + 3;
				}

				indexOffset += vertexCount;
			}

			// Set attributes
			geometry.setAttribute(
				"position",
				new THREE.BufferAttribute(positions, 3)
			);
			geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
			geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
			geometry.setIndex(new THREE.BufferAttribute(indices, 1));
			const mesh = new THREE.Mesh(geometry, material);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			meshes.push(mesh);
		}

		return meshes;
	}

	public resolveTextureName(ref: string, model: BlockModel): string {
		const maxDepth = 5;
		let depth = 0;
		if (ref === "#missing") {
			console.warn(`Texture reference ${ref} is missing.`, model);
			return "missing_texture";
		}
		while (ref.startsWith("#") && depth < maxDepth) {
			if (!model.textures) {
				console.warn(`Model has no textures defined for reference ${ref}.`);
				return "missing_texture";
			}
			ref = model.textures[ref.substring(1)] ?? ref;
			depth++;
		}
		if (depth === maxDepth) {
			console.warn(`Texture reference ${ref} exceeded maximum depth.`);
			return "missing_texture";
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
			.reduce((a: string[], b) => {
				if (!validVariantProperties.has(b)) {
					return a;
				}
				const valueToPush = `${b}=${block.properties[b]}`;
				a.push(valueToPush);
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
					if (!block.properties[property]) {
						return false;
					}
					const filterValue = filter[property];
					const blockValue = block.properties[property];
					if (!isNaN(Number(blockValue)) && !isNaN(Number(filterValue))) {
						if (Number(blockValue) !== Number(filterValue)) {
							return false;
						}
						continue;
					}
					const splitFilterValues = filterValue.split("|");
					if (!splitFilterValues.includes(blockValue)) {
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
			variantName.length > 0 ? `${block.name}[${variantName}]` : block.name;

		return { models, name };
	}

	public async loadBlockStateDefinition(
		block: string
	): Promise<BlockStateDefinition> {
		return JSON.parse(
			(await this.getResourceString(`blockstates/${block}.json`)) ?? "{}"
		) as BlockStateDefinition;
	}

	public async loadModel(
		modelRef: string,
		properties: any
	): Promise<BlockModel | undefined> {
		if (modelRef.startsWith("minecraft:")) {
			modelRef = modelRef.substring("minecraft:".length);
		}
		if (modelRef.includes("shulker_box")) {
			modelRef = "block/shulker_box";
		}
		if (this.CUSTOM_MODELS[modelRef]) {
			if (modelRef === "block/chest") {
				if (properties.type === "single") {
					return this.CUSTOM_MODELS[modelRef];
				}
				if (properties.type === "left") {
					return this.CUSTOM_MODELS["block/chest_left"];
				}
				if (properties.type === "right") {
					return this.CUSTOM_MODELS["block/chest_right"];
				}
			}
			console.log("Returning custom model", modelRef);
			return this.CUSTOM_MODELS[modelRef];
		}
		let model = JSON.parse(
			(await this.getResourceString(`models/${modelRef}.json`)) ?? "{}"
		) as BlockModel;

		if (model.parent) {
			const parent = await this.loadModel(model.parent);
			if (!parent) {
				return model;
			}
			if (model["elements"] && parent["elements"]) {
				delete (parent as any)["elements"];
			}
			model = deepmerge(parent, model);
			delete model.parent;
		}
		this.blockModelCache.set(modelRef, model);
		return model;
	}
}
