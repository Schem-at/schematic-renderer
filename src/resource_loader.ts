import * as THREE from "three";
import deepmerge from "deepmerge";
import type { Block } from "@enginehub/schematicjs";
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
	constructor(
		resourcePackBlobs: any,
		materialMap?: Map<string, THREE.Material>
	) {
		this.textureCache = new Map();
		this.blobCache = new Map();
		this.stringCache = new Map();
		this.blockMeshCache = new Map();
		this.blockMetaCache = new Map();
		this.blockModelCache = new Map();
		this.faceDataCache = new Map();
		this.blockStateDefinitionCache = new Map();
		this.materialMap = materialMap ?? new Map();
		this.base64MaterialMap = new Map();
		this.resourcePackBlobs = resourcePackBlobs;
		this.textureLoader = new THREE.TextureLoader();
		this.schematic = undefined;
	}

	public setSchematic(schematic: any) {
		this.schematic = schematic;
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

	public async getResourceString(name: string) {
		if (this.stringCache.has(name)) {
			return this.stringCache.get(name);
		} else {
			for (const zip of this.zips) {
				const data = await zip.file(`assets/minecraft/${name}`)?.async("text");
				if (data) {
					this.stringCache.set(name, data);
					return data;
				}
			}
			return undefined;
		}
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

		while (textureName.startsWith("#")) {
			if (!model.textures) {
				throw new Error(
					`Model ${model} has a reference to a texture but no textures are defined`
				);
			}
			textureName = model.textures[textureName.substring(1)];
			if (!textureName) {
				throw new Error(`Texture ${textureName} not found`);
			}
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

		//check if the faceData is rotated if so rotate the texture
		const rotation = faceData.rotation;
		if (rotation) {
			texture.center = new THREE.Vector2(0.5, 0.5);
			texture.rotation = rotation * Math.PI * 0.25;
		}
		return new THREE.MeshStandardMaterial({
			map: texture,
			//side: transparent ? THREE.DoubleSide : THREE.FrontSide,
			side: THREE.FrontSide,
			alphaTest: 0.1,
			transparent: transparent,
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
		block: Block | undefined
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

	public createMeshesFromMaterialGroups(materialGroups: any) {
		const meshes: THREE.Mesh[] = [];
		const materialGroupKeys = Object.keys(materialGroups);
		for (const materialId of materialGroupKeys) {
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
			const recalculateIndices = group.indices.map((index: number) =>
				this.recalculateIndex(index)
			);

			geometry.setIndex(recalculateIndices);

			const mesh = new THREE.Mesh(geometry, material);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			meshes.push(mesh);
		}
		return meshes;
	}
	public createMeshesFromBlocks(blocks: any): THREE.Mesh[] {
		const meshes: THREE.Mesh[] = [];
		for (const [materialId, blockList] of Object.entries(blocks)) {
			const material = this.materialMap.get(materialId);
			let totalVertices = 0;
			for (const block of blockList as any) {
				totalVertices += block[0].positions.length / 3;
			}

			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute(
				"position",
				new THREE.Float32BufferAttribute(totalVertices * 3, 3)
			);
			geometry.setAttribute(
				"normal",
				new THREE.Float32BufferAttribute(totalVertices * 3, 3)
			);
			geometry.setAttribute(
				"uv",
				new THREE.Float32BufferAttribute(totalVertices * 2, 2)
			);

			const positions = geometry.attributes.position.array;
			const normals = geometry.attributes.normal.array;
			const uvs = geometry.attributes.uv.array;
			const indices: number[] = [];
			let vertexOffset = 0;
			let indexOffset = 0;

			for (const block of blockList as any) {
				const blockComponent = block[0];
				const worldPos = block[1];
				let newPositions = blockComponent.positions;
				for (let i = 0; i < newPositions.length; i += 3) {
					newPositions[i] += worldPos[0];
					newPositions[i + 1] += worldPos[1];
					newPositions[i + 2] += worldPos[2];
				}
				positions.set(newPositions, vertexOffset * 3);
				normals.set(blockComponent.normals, vertexOffset * 3);
				uvs.set(blockComponent.uvs, vertexOffset * 2);

				for (let i = 0; i < blockComponent.positions.length / 3; i += 4) {
					indices.push(...this.recalculateIndex(indexOffset + i));
				}
				vertexOffset += blockComponent.positions.length / 3;
				indexOffset += blockComponent.positions.length / 3;
			}
			geometry.setIndex(indices);

			const mesh = new THREE.Mesh(geometry, material);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			meshes.push(mesh);
		}

		return meshes;
	}

	public resolveTextureName(ref: string, model: BlockModel): string {
		// check if the texture is "#missing"
		if (ref === "#missing") {
			return ref;
		}

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
			variantName.length > 0 ? `${block.type}[${variantName}]` : block.type;

		return { models, name };
	}

	public async loadBlockStateDefinition(
		block: string
	): Promise<BlockStateDefinition> {
		return JSON.parse(
			(await this.getResourceString(`blockstates/${block}.json`)) ?? "{}"
		) as BlockStateDefinition;
	}

	public async loadModel(modelRef: string): Promise<BlockModel | undefined> {
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
