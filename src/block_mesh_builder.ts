import * as THREE from "three";

import type { BlockModel, Vector } from "./types";

import {
	isExtendedPiston,
	getOppositeFace,
	NON_OCCLUDING_BLOCKS,
	normalize,
	TRANSPARENT_BLOCKS,
	getDirectionData,
	hashBlockForMap,
	POSSIBLE_FACES,
	DEFAULT_UV,
	getDegreeRotationMatrix,
} from "./utils";

import { ResourceLoader } from "./resource_loader";
import { SchematicWrapper } from "./wasm/minecraft_schematic_utils";
interface Block {
	name: string;
	properties: Record<string, string>;
}
export class BlockMeshBuilder {
	public blockMeshCache: Map<any, any>;
	materialMap: Map<string, THREE.Material>;
	base64MaterialMap: Map<string, string>;
	ressourceLoader: ResourceLoader;
	schematic: any;
	renderer: any;
	faceDataCache: Map<string, any>;

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
		this.faceDataCache = new Map();
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
			const textureName = this.ressourceLoader.resolveTextureName(
				faceData.texture,
				model
			);
			const materialColor = this.ressourceLoader.getColorForElement(
				faceData,
				textureName,
				block
			);
			const materialId = this.getMaterialId(
				model,
				faceData,
				materialColor ?? new THREE.Color(1, 1, 1)
			);
			if (!this.materialMap.has(materialId)) {
				// TODO: check performance, I think there might be redundant calls to getBase 64 Image
				const material = await this.ressourceLoader.getTextureMaterial(
					model,
					faceData,
					TRANSPARENT_BLOCKS.has(block.name) ||
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
			// this.showTextureOverlay(
			// 	this.base64MaterialMap.get(materialId) ?? "",
			// 	faceData.uv,
			// 	faceData.texture
			// );

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
		uv: [number, number, number, number],
		name: string = ""
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

		const nameElement = popupDocument.createElement("div");
		nameElement.innerText = name;
		nameElement.style.color = "white";
		nameElement.style.backgroundColor = "black";
		imageContainer.appendChild(nameElement);

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
		_blockPosition?: any
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
		let start = performance.now();
		for (const modelHolder of modelOptions.holders) {
			modelIndex++;
			if (modelHolder === undefined) continue;
			let modelHolderRotation = {
				x: modelHolder.x ?? 0,
				y: modelHolder.y ?? 0,
				z: modelHolder.z ?? 0,
			};

			const model = await this.ressourceLoader.loadModel(modelHolder.model);

			const elements = model?.elements;

			if (!elements) continue;
			let elementIndex = 0;
			for (const element of elements) {
				elementIndex++;
				if (!element.from || !element.to) continue;
				this.normalizeElementCoords(element);
				let faceData;
				const faceDataCacheKey = `${modelHolder.model}-${modelIndex}-${elementIndex}`;
				if (this.faceDataCache.has(faceDataCacheKey)) {
					faceData = this.faceDataCache.get(faceDataCacheKey);
				} else {
					try {
						faceData = await this.processFaceData(element, model, block);
					} catch (e) {
						continue;
					}
					this.faceDataCache.set(faceDataCacheKey, faceData);
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
							cornerPos = this.applyElementRotation(
								cornerPos,
								elementRotation as any
							);
						}
						cornerPos = this.applyRotation(cornerPos, modelHolderRotation);

						blockComponents[uniqueKey].positions.push(...cornerPos);
						if (block.name === "redstone_wire" || block.name === "chest") {
							blockComponents[uniqueKey].uvs.push(uv[0], 1 - uv[1]);
						} else {
							blockComponents[uniqueKey].uvs.push(uv[0], 1 - uv[1]);
						}
						blockComponents[uniqueKey].normals.push(...dirData.normal);
					}
				}
			}
		}

		if (performance.now() - start > 50) {
			console.error(
				"Slow block mesh builder",
				block,
				"took",
				performance.now() - start
			);
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

		const rotationMatrix = getDegreeRotationMatrix(x, y, z);

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

	public getOccludedFacesForBlock(
		schematic: SchematicWrapper,
		block: Block,
		pos: THREE.Vector3
	): number {
		// const blockType = block.name;
		// remove the minecraft: prefix
		const blockType = block.name.split(":")[1];
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
		if (blockType.includes("glass")) {
			for (const face of POSSIBLE_FACES) {
				const directionVector = directionVectors[face];
				// @ts-ignore
				const adjacentBlock = schematic.get_block(
					new THREE.Vector3(x, y, z).add(directionVector)
				);
				if (adjacentBlock === undefined) {
					continue;
				}
				// @ts-ignore
				if (adjacentBlock.name.includes("glass")) {
					occludedFaces[face] = true;
				}
			}
		}
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
			// @ts-ignore
			const adjacentBlock = schematic.get_block(
				new THREE.Vector3(x, y, z).add(directionVector)
			);
			// @ts-ignore
			const adjacentBlockName = adjacentBlock?.name?.split(":")[1];
			if (adjacentBlockName === undefined) {
				continue;
			}
			if (NON_OCCLUDING_BLOCKS.has(adjacentBlockName)) {
				continue;
			}
			if (TRANSPARENT_BLOCKS.has(adjacentBlockName)) {
				continue;
			}
			occludedFaces[face] = true;
		}
		return this.occludedFacesListToInt(occludedFaces);
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
