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
	renderer: any;

	constructor(
		ressourceLoader: any,
		materialMap: Map<string, THREE.Material>,
		renderer: any
	) {
		this.blockMeshCache = new Map();
		this.materialMap = materialMap;
		this.base64MaterialMap = new Map();
		this.ressourceLoader = ressourceLoader;
		this.renderer = renderer;
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
				// TODO: check performance, I think there might be redundant calls to getBase64Image
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
				// console.log(faceData, materialColor, model, block);

				// this.showTextureOverlay(base64Material, faceData.uv);

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
		//convert rotation to radians
		rotation = (rotation * Math.PI) / 180;
		const center = [0.5, 0.5];
		const uvCentered = [
			uv[0] - center[0],
			uv[1] - center[1],
			uv[2] - center[0],
			uv[3] - center[1],
		];
		const uvRotated = [
			uvCentered[0] * Math.cos(rotation) - uvCentered[1] * Math.sin(rotation),
			uvCentered[0] * Math.sin(rotation) + uvCentered[1] * Math.cos(rotation),
			uvCentered[2] * Math.cos(rotation) - uvCentered[3] * Math.sin(rotation),
			uvCentered[2] * Math.sin(rotation) + uvCentered[3] * Math.cos(rotation),
		];
		const uvFinal = [
			uvRotated[0] + center[0],
			uvRotated[1] + center[1],
			uvRotated[2] + center[0],
			uvRotated[3] + center[1],
		];
		return uvFinal;
	}

	private popupWindow: Window | null = null;

	public showTextureOverlay(
		imageData: string,
		uv: [number, number, number, number]
	) {
		if (!this.popupWindow || this.popupWindow.closed) {
			this.popupWindow = window.open("", "_blank", "width=200,height=400");
		}

		if (!this.popupWindow) {
			console.error("Failed to open popup window");
			return;
		}

		const popupDocument = this.popupWindow.document;

		let allImagesContainer = popupDocument.getElementById(
			"all-images-container"
		);
		if (!allImagesContainer) {
			allImagesContainer = popupDocument.createElement("div");
			allImagesContainer.id = "all-images-container";
			allImagesContainer.style.backgroundColor = "darkgrey";
			allImagesContainer.style.display = "block";
			allImagesContainer.style.width = "100%";
			allImagesContainer.style.height = "100%";
			allImagesContainer.style.overflowY = "auto";
			popupDocument.body.appendChild(allImagesContainer);
		}

		const imageContainer = popupDocument.createElement("div");
		imageContainer.style.backgroundColor = "black";
		imageContainer.style.height = "100px";
		imageContainer.style.position = "relative";
		imageContainer.style.marginBottom = "10px";

		const image = popupDocument.createElement("img");
		image.src = imageData;
		image.style.imageRendering = "pixelated";
		image.style.position = "absolute";
		image.style.width = "100px";
		image.style.height = "100px";
		image.style.backgroundColor = "gray";
		imageContainer.appendChild(image);

		if (!uv) {
			uv = [0, 0, 16, 16];
		}

		const rect = popupDocument.createElement("div");
		rect.style.position = "absolute";
		rect.style.width = `${((uv[2] - uv[0]) / 16) * 100 - 1}px`;
		rect.style.height = `${((uv[3] - uv[1]) / 16) * 100 - 1}px`;
		rect.style.border = "1px solid blue";
		rect.style.left = `${(uv[0] / 16) * 100}px`;
		rect.style.top = `${(uv[1] / 16) * 100}px`;
		imageContainer.appendChild(rect);

		allImagesContainer.appendChild(imageContainer);
	}

	public async getBlockMesh(
		block: any,
		blockPosition?: any
	): Promise<{
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
		const faces = ["east", "west", "up", "down", "south", "north"];
		const { modelOptions } = await this.ressourceLoader.getBlockMeta(block);
		let modelIndex = 0;
		for (const modelHolder of modelOptions.holders) {
			modelIndex++;
			// if (modelIndex != 1) continue;
			if (modelHolder === undefined) continue;
			// if (modelHolder.model.includes("redstone_power_level_")) continue;
			let modelHolderRotation = {
				x: (modelHolder.x ?? 0) * (Math.PI / 180),
				y: (modelHolder.y ?? 0) * (Math.PI / 180),
				z: (modelHolder.z ?? 0) * (Math.PI / 180),
			};
			const start = performance.now();
			const model = await this.ressourceLoader.loadModel(modelHolder.model);
			// if over 100ms log the model
			if (performance.now() - start > 100) {
				console.error(
					"Slow model",
					modelHolder.model,
					"took",
					performance.now() - start
				);
			}
			const elements = model?.elements;
			if (!elements) continue;
			let elementIndex = 0;
			for (const element of elements) {
				elementIndex++;
				// if (elementIndex != 2) continue;
				if (!element.from || !element.to) continue;
				this.normalizeElementCoords(element);
				let faceData;
				try {
					faceData = await this.processFaceData(element, model, block);
				} catch (e) {
					continue;
				}
				const from = element.from;
				const to = element.to;
				const elementRotation = element.rotation || null;

				if (!from || !to) continue;

				const size = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
				const directionData = getDirectionData(faceData.uvs);
				let faceIndex = 0;
				for (const dir of faces) {
					faceIndex++;
					// if (faceIndex != 1) continue;
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
						let cornerPos = [
							from[0] + size[0] * pos[0],
							from[1] + size[1] * pos[1],
							from[2] + size[2] * pos[2],
						];
						if (elementRotation) {
							cornerPos = this.applyElementRotation(cornerPos, elementRotation);
						}
						cornerPos = this.applyRotation(cornerPos, modelHolderRotation);

						blockComponents[uniqueKey].positions.push(...cornerPos);
						if (block.type === "redstone_wire") {
							blockComponents[uniqueKey].uvs.push(uv[0], 1 - uv[1]);
						} else {
							blockComponents[uniqueKey].uvs.push(1 - uv[0], 1 - uv[1]);
						}
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
		center: number[] = [0.5, 0.5, 0.5]
	) {
		let { x, y, z } = rotation;
		y = -y;
		x = -x;
		z = -z;

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

	private applyElementRotation(
		position: number[],
		rotation: { origin: number[]; axis: string; angle: number }
	) {
		let { origin, axis, angle } = rotation;
		//convert angle to radians
		angle = (angle * Math.PI) / 180;
		const translatedPosition = [
			position[0] - origin[0],
			position[1] - origin[1],
			position[2] - origin[2],
		];

		let rotationMatrix = [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		];

		if (axis === "x") {
			rotationMatrix = [
				[1, 0, 0],
				[0, Math.cos(angle), -Math.sin(angle)],
				[0, Math.sin(angle), Math.cos(angle)],
			];
		} else if (axis === "y") {
			rotationMatrix = [
				[Math.cos(angle), 0, Math.sin(angle)],
				[0, 1, 0],
				[-Math.sin(angle), 0, Math.cos(angle)],
			];
		} else if (axis === "z") {
			rotationMatrix = [
				[Math.cos(angle), -Math.sin(angle), 0],
				[Math.sin(angle), Math.cos(angle), 0],
				[0, 0, 1],
			];
		}

		const rotatedPosition = [0, 0, 0];

		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				rotatedPosition[i] += translatedPosition[j] * rotationMatrix[i][j];
			}
		}

		const finalPosition = [
			rotatedPosition[0] + origin[0],
			rotatedPosition[1] + origin[1],
			rotatedPosition[2] + origin[2],
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

	public async getBlockMeshFromCache(block: any, pos?: any) {
		const blockUniqueKey = hashBlockForMap(block);
		if (this.blockMeshCache.has(blockUniqueKey)) {
			return this.blockMeshCache.get(blockUniqueKey);
		} else {
			const start = performance.now();
			const blockComponents = await this.getBlockMesh(block, pos);
			// if over 100ms log the block
			if (performance.now() - start > 100) {
				console.error(
					"Slow block",
					pos,
					block,
					"took",
					performance.now() - start
				);
			}
			this.blockMeshCache.set(blockUniqueKey, blockComponents);
			return blockComponents;
		}
	}
}
