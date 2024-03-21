import * as THREE from "three";
import deepmerge from "deepmerge";
import type { Block } from "@enginehub/schematicjs";
import { loadSchematic } from "@enginehub/schematicjs";
import {
	faceToFacingVector,
	hashBlockForMap,
	INVISIBLE_BLOCKS,
	NON_OCCLUDING_BLOCKS,
	normalize,
	occludedFacesIntToList,
	REDSTONE_COLORS,
	rotateVector,
	TRANSPARENT_BLOCKS,
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
export class ResourceLoader {
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
	base64MaterialMap: Map<string, string>;
	jarUrl: string | string[];
	progressController: any;
	zip: any;
	textureLoader = new THREE.TextureLoader();

	TINT_COLOR = new THREE.Color(145 / 255, 189 / 255, 89 / 255);
	WATER_COLOR = new THREE.Color(36 / 255, 57 / 255, 214 / 255);
	LAVA_COLOR = new THREE.Color(232 / 255, 89 / 255, 23 / 255);
	AMBIENT_LIGHT = new THREE.Color(1, 1, 1);
	SHADOW_COLOR = new THREE.Color(0.5, 0.5, 0.5);
	DEG2RAD = Math.PI / 180;

	DEBUG = false;
	constructor(jarUrl: string | string[], progressController?: any) {
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
		this.progressController = progressController;
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

	public async getResourceBase64(name: string): Promise<string> {
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
	): Promise<THREE.MeshStandardMaterial | undefined> {
		let textureName = faceData.texture;
		while (textureName.startsWith("#")) {
			if (!model.textures) {
				throw new Error(
					`Model ${model} has a reference to a texture but no textures are defined`
				);
			}
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
			//side: transparent ? THREE.DoubleSide : THREE.FrontSide,
			side: THREE.FrontSide,
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
		block: Block | undefined
	) {
		if (tex.startsWith("block/redstone_dust_")) {
			const power = block?.properties?.["power"] ?? 0;
			return REDSTONE_COLORS[power as number];
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
		if (!element.from || !element.to) {
			throw new Error("Element is missing from or to");
		}
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
		if (this.blockMetaCache.has(hashBlockForMap(block))) {
			return this.blockMetaCache.get(hashBlockForMap(block));
		}
		const blockStateDefinition = await this.loadBlockStateDefinition(
			block.type
		);
		const modelData = this.getBlockModelData(block, blockStateDefinition);
		const modelOptions = this.getModelOption(modelData);
		const blockMeta = { blockStateDefinition, modelData, modelOptions };
		this.blockMetaCache.set(hashBlockForMap(block), blockMeta);
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

	public createMeshesFromMaterialGroups(materialGroups: any) {
		const meshes: THREE.Mesh[] = [];
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
				.map((index: number) => this.recalculateIndex(index))
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

	public resolveTextureName(ref: string, model: BlockModel): string {
		while (ref.startsWith("#")) {
			if (!model.textures) {
				return ref;
			}
			ref = model.textures[ref.substring(1)] ?? ref;
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

	public async getResourceString(name: string) {
		if (this.stringCache.has(name)) {
			return this.stringCache.get(name);
		} else {
			let data: string = "";
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
			(await this.getResourceString(`blockstates/${block}.json`)) ?? "{}"
		) as BlockStateDefinition;
	}

	public async loadModel(modelRef: string): Promise<BlockModel | undefined> {
		if (this.blockModelCache.has(modelRef)) {
			return this.blockModelCache.get(modelRef);
		}
		if (modelRef.startsWith("minecraft:")) {
			modelRef = modelRef.substring("minecraft:".length);
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