import * as THREE from "three";
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
	private materialCache: Map<string, THREE.MeshStandardMaterial>;
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

	// private modelMergeCache = new Map<string, BlockModel>();


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
		this.resourcePackBlobs = resourcePackBlobs;
		this.textureLoader = new THREE.TextureLoader();
		this.materialCache = new Map();
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

    // Check zips in reverse order (assuming later packs override earlier ones)
    for (let i = this.zips.length - 1; i >= 0; i--) {
        const file = this.zips[i].file(`assets/minecraft/${name}`);
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
		// Faster cache key generation
		const textureKey = this.resolveTextureName(faceData.texture, model).replace("minecraft:", "");
		const colorKey = color ? `${color.r}|${color.g}|${color.b}` : 'none';
		const materialKey = `${textureKey}-${transparent}-${colorKey}`;
	
		if (this.materialCache.has(materialKey)) {
			return this.materialCache.get(materialKey)!;
		}
	
		// Texture loading optimization
		const texture = await this.loadTextureWithCache(textureKey, faceData.rotation);
		if (!texture) return undefined;
	
		const material = this.createMaterial(texture, transparent, color);
		this.materialCache.set(materialKey, material);
		return material;
	}
	
	private async loadTextureWithCache(textureKey: string, rotation?: number): Promise<THREE.Texture | undefined> {
		if (this.textureCache.has(textureKey)) {
			return this.textureCache.get(textureKey)!;
		}
	
		const textureBase64 = await this.getResourceBase64(`textures/${textureKey}.png`);
		if (!textureBase64) return undefined;
	
		const texture = await this.createTexture(textureBase64, rotation);
		this.textureCache.set(textureKey, texture);
		return texture;
	}
	  
	  private async createTexture(base64Resource: string, rotation?: number): Promise<THREE.Texture> {
		return new Promise((resolve) => {
		  this.textureLoader.load(
			`data:image/png;base64,${base64Resource}`,
			(texture) => {
			  texture.minFilter = THREE.NearestFilter;
			  texture.magFilter = THREE.NearestFilter;
			  texture.wrapS = THREE.RepeatWrapping;
			  texture.wrapT = THREE.RepeatWrapping;
			  texture.format = THREE.RGBAFormat;
			  texture.premultiplyAlpha = false;
			  
			  if (rotation) {
				texture.center.set(0.5, 0.5);
				texture.rotation = (rotation * Math.PI) / 180;
			  }
			  
			  texture.needsUpdate = true;
			  resolve(texture);
			}
		  );
		});
	  }
	  
	  private createMaterial(
		texture: THREE.Texture, 
		transparent?: boolean,
		color?: THREE.Color
	  ): THREE.MeshStandardMaterial {
		return new THREE.MeshStandardMaterial({
		  map: texture,
		  transparent: transparent ?? false,
		  opacity: 1.0,
		  alphaTest: 0.1,
		  color: color ?? 0xffffff,
		  side: THREE.FrontSide,
		  shadowSide: THREE.FrontSide,
		  toneMapped: false,
		  blending: transparent ? THREE.CustomBlending : THREE.NormalBlending,
		  blendSrc: THREE.SrcAlphaFactor,  
		  blendDst: THREE.OneMinusSrcAlphaFactor,
		  blendEquation: THREE.AddEquation
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
		if (holders.length === 0) {
			console.warn("No models found for block", data);
			console.log(data, data.models);
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
		if (occludedFacesIntToList(occludedFacesInt)[blockComponent.face]) return;
	
		const group = materialGroups[blockComponent.materialId] ||= {
			positions: new Float32Array(4096 * 3), // Pre-allocated
			normals: new Float32Array(4096 * 3),
			uvs: new Float32Array(4096 * 2),
			indices: new Uint32Array(4096 * 6),
			count: 0,
			vertexCount: 0
		};
	
		// Copy data directly into pre-allocated buffers
		const posOffset = group.count * 3;
		for (let i = 0; i < blockComponent.positions.length; i += 3) {
			group.positions[posOffset + i] = blockComponent.positions[i] + x + offset.x;
			group.positions[posOffset + i + 1] = blockComponent.positions[i + 1] + y + offset.y;
			group.positions[posOffset + i + 2] = blockComponent.positions[i + 2] + z + offset.z;
		}
	
		group.normals.set(blockComponent.normals, posOffset);
		group.uvs.set(blockComponent.uvs, group.count * 2);
	
		const indexOffset = group.vertexCount;
		for (let i = 0; i < blockComponent.positions.length / 3; i += 4) {
			group.indices[group.vertexCount++] = indexOffset + i;
			group.indices[group.vertexCount++] = indexOffset + i + 1;
			group.indices[group.vertexCount++] = indexOffset + i + 2;
			group.indices[group.vertexCount++] = indexOffset + i + 2;
			group.indices[group.vertexCount++] = indexOffset + i + 1;
			group.indices[group.vertexCount++] = indexOffset + i + 3;
		}
	
		group.count += blockComponent.positions.length / 3;
	}
	

	@Monitor
	public createMeshesFromBlocks(blocks: any): THREE.Mesh[] {
		const meshes: THREE.Mesh[] = [];
		
		for (const [materialId, blockList] of Object.entries(blocks)) {
			const material = this.schematicRenderer.materialMap.get(materialId);
			if (!material || !(blockList as any[]).length) continue;
	
			// Pre-calculate totals
			const { totalVertices, totalIndices } = this.calculateGeometrySize(blockList as any[]);
			
			// Use shared buffers
			const geometry = new THREE.BufferGeometry();
			const positions = new Float32Array(totalVertices * 3);
			const normals = new Float32Array(totalVertices * 3);
			const uvs = new Float32Array(totalVertices * 2);
			const indices = new Uint32Array(totalIndices);
	
			this.fillGeometryBuffers(blockList as any[], positions, normals, uvs, indices);
			
			geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
			geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
			geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
			geometry.setIndex(new THREE.BufferAttribute(indices, 1));
	
			const mesh = new THREE.Mesh(geometry, material);
			mesh.castShadow = mesh.receiveShadow = true;
			if (material.transparent) mesh.renderOrder = 1000;
			meshes.push(mesh);
		}
	
		return meshes;
	}
	
	private calculateGeometrySize(blockList: any[]): { totalVertices: number; totalIndices: number } {
		let totalVertices = 0;
		let totalIndices = 0;
	
		for (const block of blockList) {
			const component = block[0];
			const verts = component.positions.length / 3;
			totalVertices += verts;
			totalIndices += Math.floor(verts / 4) * 6; // 6 indices per quad
		}
	
		return { totalVertices, totalIndices };
	}
	
	private fillGeometryBuffers(blockList: any[], positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint32Array) {
		let posOffset = 0, normOffset = 0, uvOffset = 0, idxOffset = 0, vertexOffset = 0;
	
		for (const block of blockList) {
			const [component, [x, y, z]] = block;
			const verts = component.positions.length / 3;
	
			// Positions
			for (let i = 0; i < component.positions.length; i += 3) {
				positions[posOffset++] = component.positions[i] + x;
				positions[posOffset++] = component.positions[i + 1] + y;
				positions[posOffset++] = component.positions[i + 2] + z;
			}
	
			// Normals & UVs
			normals.set(component.normals, normOffset);
			uvs.set(component.uvs, uvOffset);
			normOffset += component.normals.length;
			uvOffset += component.uvs.length;
	
			// Indices
			for (let i = 0; i < verts; i += 4) {
				indices[idxOffset++] = vertexOffset + i;
				indices[idxOffset++] = vertexOffset + i + 1;
				indices[idxOffset++] = vertexOffset + i + 2;
				indices[idxOffset++] = vertexOffset + i + 2;
				indices[idxOffset++] = vertexOffset + i + 1;
				indices[idxOffset++] = vertexOffset + i + 3;
			}
	
			vertexOffset += verts;
		}
	}

	public resolveTextureName(ref: string, model: BlockModel): string {
		const maxDepth = 5;
		let depth = 0;
		if (ref === "#missing") {
			// console.warn(`Texture reference ${ref} is missing.`, model);
			return "missing_texture";
		}
		while (ref.startsWith("#") && depth < maxDepth) {
			if (!model.textures) {
				// console.warn(`Model has no textures defined for reference ${ref}.`);
				return "missing_texture";
			}
			ref = model.textures[ref.substring(1)] ?? ref;
			depth++;
		}
		if (depth === maxDepth) {
			// console.warn(`Texture reference ${ref} exceeded maximum depth.`);
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
		if (models.length === 0) {
			console.warn(`No models found for block ${name}.`);
			// if no models are found, use the first model
			
		}
		return { models, name };
	}

	public async loadBlockStateDefinition(
		block: string
	): Promise<BlockStateDefinition> {
		return JSON.parse(
			(await this.getResourceString(`blockstates/${block}.json`)) ?? "{}"
		) as BlockStateDefinition;
	}

	private handleCustomModels(modelRef: string, properties: any): BlockModel | undefined {
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
		return this.CUSTOM_MODELS[modelRef];
	}

	public async loadModel(
		modelRef: string,
		properties: any
	): Promise<BlockModel | undefined> {
		// Strip namespace first
		if (modelRef.startsWith("minecraft:")) {
			modelRef = modelRef.substring("minecraft:".length);
		}
	
		// const cacheKey = `${modelRef}-${JSON.stringify(properties)}`;
		// if (this.modelMergeCache.has(cacheKey) && false) {
		// 	return this.modelMergeCache.get(cacheKey)!;
		// }
	
		// Handle custom models first
		if (this.CUSTOM_MODELS[modelRef]) {
			const customModel = this.handleCustomModels(modelRef, properties);
			if (customModel) {
				// this.modelMergeCache.set(cacheKey, customModel);
				return customModel;
			}
		}
	
		// Load and merge models
		const model = await this.loadAndMergeModel(modelRef);
		// this.modelMergeCache.set(cacheKey, model);
		return model;
	}
	
	private async loadAndMergeModel(modelRef: string): Promise<BlockModel> {
		const rawModel = JSON.parse(
			(await this.getResourceString(`models/${modelRef}.json`)) ?? "{}"
		) as BlockModel;
	
		if (!rawModel.parent) return rawModel;
	
		// Iterative parent resolution instead of recursive
		let mergedModel = { ...rawModel };
		let parentRef = rawModel.parent;
		let depth = 0;
	
		while (parentRef && depth++ < 5) { // Prevent infinite loops
			const parentModel = await this.loadModel(parentRef, {});
			if (parentModel) {
				mergedModel = this.shallowMergeModels(parentModel, mergedModel);
				parentRef = mergedModel.parent ?? "";
			} else {
				break;
			}
		}
	
		delete mergedModel.parent;
		return mergedModel;
	}
	
	private shallowMergeModels(parent: BlockModel, child: BlockModel): BlockModel {
		return {
			...parent,
			...child,
			textures: { ...parent.textures, ...child.textures },
			elements: child.elements || parent.elements
		};
	}
}
