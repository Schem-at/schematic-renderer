import * as THREE from "three";

import type { BlockModel, Vector } from "./types";

import {
	isExtendedPiston,
	NON_OCCLUDING_BLOCKS,
	normalize,
	TRANSPARENT_BLOCKS,
	getDirectionData,
	hashBlockForMap,
	POSSIBLE_FACES,
	DEFAULT_UV,
	getDegreeRotationMatrix,
	getOppositeFace,
} from "./utils";

import { SchematicWrapper } from "./wasm/minecraft_schematic_utils";
import { Monitor } from "./monitoring";
import { SchematicRenderer } from "./SchematicRenderer";
interface Block {
	name: string;
	properties: Record<string, string>;
}
export class BlockMeshBuilder {
	private schematicRenderer: SchematicRenderer;
	public blockMeshCache: Map<any, any>;
	schematic: any;
	faceDataCache: Map<string, any>;
	DIRECTION_OFFSETS = [
		{ face: "east", x: 1, y: 0, z: 0 },
		{ face: "west", x: -1, y: 0, z: 0 },
		{ face: "up", x: 0, y: 1, z: 0 },
		{ face: "down", x: 0, y: -1, z: 0 },
		{ face: "south", x: 0, y: 0, z: 1 },
		{ face: "north", x: 0, y: 0, z: -1 },
	];
	DEBUG = false;
	FACE_BITMASKS = {
		east: 0b000001,
		west: 0b000010,
		up: 0b000100,
		down: 0b001000,
		south: 0b010000,
		north: 0b100000,
	};
	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.blockMeshCache = new Map();
		this.faceDataCache = new Map();
		if (!this.schematicRenderer) {
			throw new Error("SchematicRenderer is required.");
		}
		if (!this.schematicRenderer.resourceLoader) {
			throw new Error("ResourceLoader is required.");
		}
	}

	@Monitor
	public getMaterialId(model: BlockModel, faceData: any, color: THREE.Color) {
		// console.log("getMaterialId", model, faceData, color);
		if (!this.schematicRenderer.resourceLoader) {
			throw new Error("ResourceLoader is not set");
		}
		const textureName =
			this.schematicRenderer.resourceLoader.resolveTextureName(
				faceData.texture,
				model
			);
		const rotation = faceData.rotation;
		const idSuffix = rotation ? `-${rotation}` : "";
		return `${textureName}-${color?.r ?? 1}-${color?.g ?? 1}-${
			color?.b ?? 1
		}${idSuffix}`;
	}

	@Monitor
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

	@Monitor
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
				// Use default UVs
				// Convert to per-vertex UVs
				uvs[face] = DEFAULT_UV.map((u) => u / 16) as [
					number,
					number,
					number,
					number
				];
				continue;
			}
			
			const textureName =
				this.schematicRenderer.resourceLoader?.resolveTextureName(
					faceData.texture,
					model
				);

			const materialColor =
				this.schematicRenderer.resourceLoader?.getColorForElement(
					faceData,
					textureName as string,
					block
				);
			const materialId = this.getMaterialId(
				model,
				faceData,
				materialColor ?? new THREE.Color(1, 1, 1)
			);
			if (!this.schematicRenderer.materialMap.has(materialId)) {
				const material =
					await this.schematicRenderer.resourceLoader?.getTextureMaterial(
						model,
						faceData,
						TRANSPARENT_BLOCKS.has(block.name) ||
						faceData.texture.includes("overlay"),
						materialColor
					) ?? {
						"material": new THREE.MeshBasicMaterial(),
						"base64Png": null
					};
				this.schematicRenderer.materialMap.set(
					materialId,
					material as any
				);
			
			}
			subMaterials[face] = materialId;
			let faceRotation = faceData.rotation || 0;
			faceData.uv = faceData.uv || DEFAULT_UV;
			

		

			uvs[face] = this.rotateUv(
				faceData.uv.map((u: number) => u / 16),
				faceRotation
			) as [number, number, number, number];
			if (this.DEBUG) {
				let textureName = faceData.texture;

				// Resolve texture references
				textureName = this.schematicRenderer.resourceLoader?.resolveTextureName(textureName, model);

				// Remove "minecraft:" prefix if present
				if (textureName.startsWith("minecraft:")) {
					textureName = textureName.substring("minecraft:".length);
				}

				// Get the base64 image
				const base64Resource = await this.schematicRenderer.resourceLoader?.getResourceBase64(
					`textures/${textureName}.png`
				);
				const base64Png = "data:image/png;base64," + base64Resource;
				this.showTextureOverlay(
					base64Png,
					uvs[face]
				);	

			}
		}
		return { subMaterials, uvs };
	}

	@Monitor
	public rotateUv(uv: [number, number, number, number], rotation: number): [number, number, number, number] {
		const r = ((rotation % 360 + 360) % 360) / 90;
		
		if (r === 0) return uv;
		// uv[0] is x1, uv[1] is y1, uv[2] is x2, uv[3] is y2
		
		switch (r) {
			case 1: // 90° clockwise
				return [uv[1], 1 - uv[0], uv[3], 1 - uv[2]];
			case 2: // 180°
				return [1 - uv[2], 1 - uv[3], 1 - uv[0], 1 - uv[1]];
			case 3: // 270° clockwise
				return [1 - uv[1], uv[0], 1 - uv[3], uv[2]];
			default:
				return uv;
		}
	}

	private popupWindow: Window | null = null;

	@Monitor
	public showTextureOverlay(
		imageData: string,
		uv: [number, number, number, number],
		name: string = ""
	) {
		if (!this.popupWindow || this.popupWindow.closed) {
			this.popupWindow = window.open(
				"",
				"_blank",
				"width=200,height=400,toolbar=no,location=no,menubar=no"
			);
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
		rect.style.width = `${((uv[2] - uv[0])) * 100 - 1}px`;
		rect.style.height = `${((uv[3] - uv[1])) * 100 - 1}px`;
		rect.style.border = "1px solid blue";
		rect.style.left = `${(uv[0]) * 100}px`;
		rect.style.top = `${(uv[1]) * 100}px`;
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
		const allowedFaces = faces;
		const { modelOptions } = await this.schematicRenderer.resourceLoader?.getBlockMeta(block);
		let modelIndex = 0;
		let start = performance.now();
		if (!modelOptions.holders || modelOptions.holders.length === 0) {
			console.error("No model holders", block);
			return {};
		}
		for (const modelHolder of modelOptions.holders) {
			modelIndex++;
			if (modelHolder === undefined) continue;
			let modelHolderRotation = {
				x: modelHolder.x ?? 0,
				y: modelHolder.y ?? 0,
				z: modelHolder.z ?? 0,
			};

			const model = await this.schematicRenderer.resourceLoader?.loadModel(modelHolder.model, block.properties);
			const elements = model?.elements;

			if (!elements) continue;
			let elementIndex = 0;
			for (const element of elements) {
				elementIndex++;
				// if (elementIndex > 1) {
				// 	break;
				// }
				if (!element.from || !element.to) continue;
				this.normalizeElementCoords(element);
				let faceData;
				const blockPropertyHash = JSON.stringify(block.properties);
				const faceDataCacheKey = `${modelHolder.model}-${modelIndex}-${elementIndex}-${blockPropertyHash}`;

				if (this.faceDataCache.has(faceDataCacheKey) ) {
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
					if (!allowedFaces.includes(dir)) continue;
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

					for (let { pos, uv } of dirData.corners) {
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
							blockComponents[uniqueKey].uvs.push(uv[0], 1 - uv[1]);
						blockComponents[uniqueKey].normals.push(...dirData.normal);
					}
				}
			}
		}

		if (performance.now() - start > 50 && this.DEBUG) {
			console.error(
				"Slow block mesh builder",
				block,
				"took",
				performance.now() - start
			);
		}

		return blockComponents;
	}

	@Monitor
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
		rotation: { origin: number[]; axis: string; angle: number; rescale?: boolean }
	) {
		let { origin, axis, angle, rescale } = rotation;
		const angleRad = (angle * Math.PI) / 180;
		
		let rescaleFactor = 1;
		if (rescale) {
			rescaleFactor = 1 / Math.cos(angleRad);
		}
	
		const translatedPosition = [
			position[0] - origin[0],
			position[1] - origin[1],
			position[2] - origin[2]
		];
	
		if (axis === "x" && rescale) {
			translatedPosition[1] *= rescaleFactor;
			translatedPosition[2] *= rescaleFactor;
		} else if (axis === "y" && rescale) {
			translatedPosition[0] *= rescaleFactor;
			translatedPosition[2] *= rescaleFactor;
		} else if (axis === "z" && rescale) {
			translatedPosition[0] *= rescaleFactor;
			translatedPosition[1] *= rescaleFactor;
		}
	
		let rotationMatrix = [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1]
		];
	
		if (axis === "x") {
			rotationMatrix = [
				[1, 0, 0],
				[0, Math.cos(angleRad), -Math.sin(angleRad)],
				[0, Math.sin(angleRad), Math.cos(angleRad)]
			];
		} else if (axis === "y") {
			rotationMatrix = [
				[Math.cos(angleRad), 0, Math.sin(angleRad)],
				[0, 1, 0],
				[-Math.sin(angleRad), 0, Math.cos(angleRad)]
			];
		} else if (axis === "z") {
			rotationMatrix = [
				[Math.cos(angleRad), -Math.sin(angleRad), 0],
				[Math.sin(angleRad), Math.cos(angleRad), 0],
				[0, 0, 1]
			];
		}
	
		// Apply rotation
		const rotatedPosition = [0, 0, 0];
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				rotatedPosition[i] += translatedPosition[j] * rotationMatrix[i][j];
			}
		}
	
		// Translate back from origin
		const finalPosition = [
			rotatedPosition[0] + origin[0],
			rotatedPosition[1] + origin[1],
			rotatedPosition[2] + origin[2]
		];
	
		
	
		return finalPosition;
	}
	
	public occludedFacesListToInt(occludedFaces: { [key: string]: boolean }) {
		// Build the bit field directly with explicit bit positions
		let result = 0;
		
		// Set specific bits based on face occlusion
		if (occludedFaces["south"]) result |= 0b100000;
		if (occludedFaces["north"]) result |= 0b010000;
		if (occludedFaces["east"]) result |= 0b001000;
		if (occludedFaces["west"]) result |= 0b000100;
		if (occludedFaces["up"]) result |= 0b000010;
		if (occludedFaces["down"]) result |= 0b000001;
		
		return result;
	}

	@Monitor
	public getOccludedFacesForBlock(
		schematic: SchematicWrapper,
		block: Block,
		pos: THREE.Vector3,
		renderingBounds?: { min: THREE.Vector3, max: THREE.Vector3, enabled?: boolean }
	): number {
		const { x, y, z } = pos;
		const blockType = block.name.split(":")[1];
		
		// Set up face occlusion flags - true means face is occluded (not rendered)
		const occludedFaces: { [key: string]: boolean } = {
			east: false,
			west: false,
			up: false,
			down: false,
			south: false,
			north: false,
		};
		
		// For transparent blocks, don't occlude any faces
		if (
			NON_OCCLUDING_BLOCKS.has(blockType) ||
			TRANSPARENT_BLOCKS.has(blockType)
		) {
			return this.occludedFacesListToInt(occludedFaces); // No occlusion
		}
		
		// Special case for extended pistons - occlude the face opposite to the facing direction
		if (isExtendedPiston(block)) {
			const facing = block.properties?.["facing"] as string;
			const oppositeFace = getOppositeFace(facing);
			occludedFaces[oppositeFace] = true;
			return this.occludedFacesListToInt(occludedFaces);
		}
		
		// Check if there's a block in each adjacent position
		// If there is, and it's a solid block, occlude that face
		
		// Check east face (x+1)
		const eastBlock = schematic.get_block(x + 1, y, z);
		if (eastBlock) {
			const eastBlockType = eastBlock.split(":")[1];
			if (!NON_OCCLUDING_BLOCKS.has(eastBlockType) && !TRANSPARENT_BLOCKS.has(eastBlockType)) {
				occludedFaces.east = true;
			}
		}
		
		// Check west face (x-1)
		const westBlock = schematic.get_block(x - 1, y, z);
		if (westBlock) {
			const westBlockType = westBlock.split(":")[1];
			if (!NON_OCCLUDING_BLOCKS.has(westBlockType) && !TRANSPARENT_BLOCKS.has(westBlockType)) {
				occludedFaces.west = true;
			}
		}
		
		// Check up face (y+1)
		const upBlock = schematic.get_block(x, y + 1, z);
		if (upBlock) {
			const upBlockType = upBlock.split(":")[1];
			if (!NON_OCCLUDING_BLOCKS.has(upBlockType) && !TRANSPARENT_BLOCKS.has(upBlockType)) {
				occludedFaces.up = true;
			}
		}
		
		// Check down face (y-1)
		const downBlock = schematic.get_block(x, y - 1, z);
		if (downBlock) {
			const downBlockType = downBlock.split(":")[1];
			if (!NON_OCCLUDING_BLOCKS.has(downBlockType) && !TRANSPARENT_BLOCKS.has(downBlockType)) {
				occludedFaces.down = true;
			}
		}
		
		// Check south face (z+1)
		const southBlock = schematic.get_block(x, y, z + 1);
		if (southBlock) {
			const southBlockType = southBlock.split(":")[1];
			if (!NON_OCCLUDING_BLOCKS.has(southBlockType) && !TRANSPARENT_BLOCKS.has(southBlockType)) {
				occludedFaces.south = true;
			}
		}
		
		// Check north face (z-1)
		const northBlock = schematic.get_block(x, y, z - 1);
		if (northBlock) {
			const northBlockType = northBlock.split(":")[1];
			if (!NON_OCCLUDING_BLOCKS.has(northBlockType) && !TRANSPARENT_BLOCKS.has(northBlockType)) {
				occludedFaces.north = true;
			}
		}
			// Get the schematic dimensions to check for edges
			const dimensions = schematic.get_dimensions();
			const [width, height, depth] = dimensions;
			
			// Ensure that faces at the schematic borders are not culled
			if (x === 0) occludedFaces.west = false;            // West edge of schematic
			if (x === width - 1) occludedFaces.east = false;    // East edge of schematic
			if (y === 0) occludedFaces.down = false;            // Bottom edge of schematic
			if (y === height - 1) occludedFaces.up = false;     // Top edge of schematic
			if (z === 0) occludedFaces.north = false;           // North edge of schematic
			if (z === depth - 1) occludedFaces.south = false;   // South edge of schematic
		
		// If rendering bounds are enabled, check for faces at the boundaries
		if (renderingBounds?.enabled) {
			// Faces at the edges of the rendering bounds should be visible
			if (x + 1 >= renderingBounds.max.x) occludedFaces.east = false;
			if (x <= renderingBounds.min.x) occludedFaces.west = false;
			if (y + 1 >= renderingBounds.max.y) occludedFaces.up = false;
			if (y <= renderingBounds.min.y) occludedFaces.down = false;
			if (z + 1 >= renderingBounds.max.z) occludedFaces.south = false;
			if (z <= renderingBounds.min.z) occludedFaces.north = false;
		}
		
		// Convert the face occlusion object to a bit field
		return this.occludedFacesListToInt(occludedFaces);
	}

	public async getBlockMeshFromCache(block: any, pos?: any) {
		const blockUniqueKey = hashBlockForMap(block);
		if (this.blockMeshCache.has(blockUniqueKey)) {
			return this.blockMeshCache.get(blockUniqueKey);
		} else {
			const start = performance.now();
			const blockComponents = await this.getBlockMesh(block, pos);
			if (!blockComponents) {
				console.error("Failed to get block mesh", block);
				return;
			}
			// if over 100ms log the block
			const time = performance.now() - start;
			const previousTimes = this.schematicRenderer.timings.get("getBlockMesh") || 0;
			this.schematicRenderer.timings.set("getBlockMesh", previousTimes + time);
			if (time > 100 && this.DEBUG) {
				console.error(
					"Slow block",
					pos,
					block,
					"took",
					performance.now() - start,
					"cache_key",
					blockUniqueKey
				);
			}
			this.blockMeshCache.set(blockUniqueKey, blockComponents);
			return blockComponents;
		}
	}
}