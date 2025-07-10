// WorldMeshBuilder.ts - Optimized with geometry buffer reuse and material registry
import * as THREE from "three";
import { SchematicRenderer } from "./SchematicRenderer"; // Adjust path
import { SchematicObject } from "./managers/SchematicObject"; // Adjust path
import { MaterialRegistry } from "./MaterialRegistry"; // Import the material registry
import type { BlockData } from "./types"; // Adjust path
// @ts-ignore
import { Cubane } from "cubane"; // Adjust path

const INVISIBLE_BLOCKS = new Set([
	"minecraft:air",
	"minecraft:cave_air",
	"minecraft:void_air",
	"minecraft:structure_void",
	"minecraft:light",
	"minecraft:barrier",
]);

interface ChunkMeshes {
	// Represents categories within a single call to getChunkMesh
	solid: THREE.Mesh | null;
	water: THREE.Mesh | null;
	redstone: THREE.Mesh | null;
	transparent: THREE.Mesh | null;
	emissive: THREE.Mesh | null;
}

interface ProcessedBlockGeometry {
	geometry: THREE.BufferGeometry; // Transformed, ready-to-be-cloned geometry for a part of a block
	material: THREE.Material;
}

export class WorldMeshBuilder {
	// @ts-ignore
	private schematicRenderer: SchematicRenderer;
	private cubane: Cubane;

	// Cache for Cubane's raw Object3D output (keyed by blockString:biome)
	private cubaneBlockMeshCache: Map<string, THREE.Object3D | undefined> =
		new Map();
	// Cache for our processed geometry data from Cubane's Object3D (keyed by blockString:biome)
	private extractedBlockDataCache: Map<string, ProcessedBlockGeometry[]> =
		new Map();

	constructor(schematicRenderer: SchematicRenderer, cubane: Cubane) {
		this.cubane = cubane;
		this.schematicRenderer = schematicRenderer;
	}

	/**
	 * Public method called by SchematicObject for each of its logical chunks.
	 * schematicObject is passed for context (e.g., its ID for logging, or if WMB needed more info from it).
	 * renderingBounds is passed from SchematicObject and applied here.
	 */
	public async getChunkMesh(
		blocksInLogicalChunk: BlockData[],
		schematicObject: SchematicObject, // The calling SchematicObject
		renderingBounds?: {
			min: THREE.Vector3;
			max: THREE.Vector3;
			enabled?: boolean;
		}
	): Promise<THREE.Object3D[]> {
		if (blocksInLogicalChunk.length === 0) return [];

		// 1. Filter by INVISIBLE_BLOCKS
		let visibleBlocks = blocksInLogicalChunk.filter(
			(b) => !INVISIBLE_BLOCKS.has(b.name)
		);

		// 2. Filter by schematicObject's renderingBounds if enabled and provided
		if (renderingBounds && renderingBounds.enabled) {
			visibleBlocks = visibleBlocks.filter((block) => {
				const x = block.x || 0;
				const y = block.y || 0;
				const z = block.z || 0;
				return (
					x >= renderingBounds.min.x &&
					x <= renderingBounds.max.x &&
					y >= renderingBounds.min.y &&
					y <= renderingBounds.max.y &&
					z >= renderingBounds.min.z &&
					z <= renderingBounds.max.z
				);
			});
		}

		if (visibleBlocks.length === 0) return [];

		// 3. Categorize blocks
		const categories = this.categorizeBlocks(visibleBlocks);

		// 4. Pre-process unique block types found in this logical chunk's blocks
		const uniqueBlockStringsWithBiome = new Set<string>();
		Object.values(categories).forEach((blockList) => {
			blockList.forEach((block) => {
				// Assuming biome is 'plains' for now, or needs to be passed/determined
				const biome = "plains";
				uniqueBlockStringsWithBiome.add(
					this.createBlockStringWithBiome(block, biome)
				);
			});
		});

		await this.preprocessUniqueBlockTypes(
			Array.from(uniqueBlockStringsWithBiome)
		);

		// 5. Create categorized meshes
		const chunkCategoryMeshes = await this.createCategorizedMeshes(
			categories,
			`schem_${schematicObject.id}_logicalChunk` // Mesh naming prefix
		);

		const resultMeshes: THREE.Object3D[] = [];
		const meshOrder = [
			"solid",
			"transparent",
			"water",
			"redstone",
			"emissive",
		] as const;
		for (const category of meshOrder) {
			const mesh = chunkCategoryMeshes[category];
			if (mesh) resultMeshes.push(mesh);
		}

		// console.log(`[WMB] Meshing for logical chunk of ${schematicObject.id} took ${(performance.now() - startTime).toFixed(2)}ms, ${resultMeshes.length} category meshes produced.`);
		// this.logCategoryStats(chunkCategoryMeshes, categories, schematicObject.id);
		return resultMeshes;
	}

	private async preprocessUniqueBlockTypes(
		blockStringsWithBiome: string[]
	): Promise<void> {
		const keysToProcess: string[] = [];
		for (const key of blockStringsWithBiome) {
			// Process if Cubane object OR extracted data is missing for this key
			if (
				!this.cubaneBlockMeshCache.has(key) ||
				!this.extractedBlockDataCache.has(key)
			) {
				keysToProcess.push(key);
			}
		}

		if (keysToProcess.length === 0) return;

		const CONCURRENCY_LIMIT_PREPROCESS = 8; // Tune this
		let currentIndex = 0;

		const processKey = async (key: string) => {
			const [blockString, biome] = this.parseBlockStringWithBiome(key);

			try {
				let cubaneObj = this.cubaneBlockMeshCache.get(key);
				if (!cubaneObj) {
					cubaneObj = await this.cubane.getBlockMesh(blockString, biome, true);
					if (!cubaneObj) {
						console.warn(`[WMB] Cubane returned null for ${key}`);
					}
					this.cubaneBlockMeshCache.set(key, cubaneObj);
				}

				if (!this.extractedBlockDataCache.has(key)) {
					// Check again, might have been processed by another concurrent call if not careful
					if (cubaneObj) {
						// cubaneObj should exist here
						const extractedData = this.extractAllMeshData(cubaneObj);
						this.extractedBlockDataCache.set(key, extractedData);
					} else {
						// Fallback if cubaneObj somehow ended up null
						const fallbackObj = this.createFallbackObject3D(blockString);
						this.cubaneBlockMeshCache.set(key, fallbackObj); // Cache fallback cubane obj
						this.extractedBlockDataCache.set(
							key,
							this.extractAllMeshData(fallbackObj)
						);
					}
				}
			} catch (error) {
				console.warn(`[WMB] Error during preprocessing for ${key}:`, error);
				// Ensure fallback is cached for both if not already
				if (!this.cubaneBlockMeshCache.has(key)) {
					this.cubaneBlockMeshCache.set(
						key,
						this.createFallbackObject3D(blockString)
					);
				}
				if (!this.extractedBlockDataCache.has(key)) {
					const objToExtract = this.cubaneBlockMeshCache.get(key)!;
					this.extractedBlockDataCache.set(
						key,
						this.extractAllMeshData(objToExtract)
					);
				}
			}
		};

		// Simple concurrency limiting loop
		const workerPromises: Promise<void>[] = [];
		while (currentIndex < keysToProcess.length || workerPromises.length > 0) {
			while (
				workerPromises.length < CONCURRENCY_LIMIT_PREPROCESS &&
				currentIndex < keysToProcess.length
			) {
				const keyToProcess = keysToProcess[currentIndex++];
				const promise = processKey(keyToProcess).then(() => {
					// Remove itself from workerPromises once done
					const index = workerPromises.indexOf(promise);
					if (index > -1) workerPromises.splice(index, 1);
				});
				workerPromises.push(promise);
			}
			if (workerPromises.length > 0) {
				await Promise.race(workerPromises.map((p) => p.catch(() => {}))); // Wait for one to complete or fail
			} else if (currentIndex >= keysToProcess.length) {
				break; // All processed and all workers done
			}
		}
	}

	private categorizeBlocks(blocks: BlockData[]): {
		solid: BlockData[];
		water: BlockData[];
		redstone: BlockData[];
		transparent: BlockData[];
		emissive: BlockData[];
	} {
		const categories = {
			solid: [] as BlockData[],
			water: [] as BlockData[],
			redstone: [] as BlockData[],
			transparent: [] as BlockData[],
			emissive: [] as BlockData[],
		};
		for (const block of blocks) {
			const category = this.getBlockCategory(block.name);
			categories[category].push(block);
		}
		return categories;
	}

	private getBlockCategory(blockName: string): keyof ChunkMeshes {
		if (blockName.includes("water") || blockName.includes("lava"))
			return "water";
		if (
			blockName.includes("redstone") ||
			blockName.includes("repeater") ||
			blockName.includes("comparator") ||
			blockName.includes("observer") ||
			blockName.includes("piston")
		)
			return "redstone";
		if (
			blockName.includes("glass") ||
			blockName.includes("leaves") ||
			blockName.includes("ice") ||
			blockName === "minecraft:barrier"
		)
			return "transparent";
		if (
			blockName.includes("torch") ||
			blockName.includes("lantern") ||
			blockName.includes("glowstone") ||
			blockName.includes("sea_lantern") ||
			blockName.includes("shroomlight")
		)
			return "emissive";
		return "solid";
	}

	private async createCategorizedMeshes(
		categories: {
			solid: BlockData[];
			water: BlockData[];
			redstone: BlockData[];
			transparent: BlockData[];
			emissive: BlockData[];
		},
		meshPrefix: string
	): Promise<ChunkMeshes> {
		return {
			solid: await this.createCategoryMesh(
				categories.solid,
				"solid",
				meshPrefix
			),
			water: await this.createCategoryMesh(
				categories.water,
				"water",
				meshPrefix
			),
			redstone: await this.createCategoryMesh(
				categories.redstone,
				"redstone",
				meshPrefix
			),
			transparent: await this.createCategoryMesh(
				categories.transparent,
				"transparent",
				meshPrefix
			),
			emissive: await this.createCategoryMesh(
				categories.emissive,
				"emissive",
				meshPrefix
			),
		};
	}

	// OPTIMIZED VERSION with geometry buffer reuse and material registry
	private async createCategoryMesh(
		blocks: BlockData[],
		category: string,
		meshPrefix: string
	): Promise<THREE.Mesh | null> {
		if (blocks.length === 0) return null;

		const materialToGeometries = new Map<
			THREE.Material,
			THREE.BufferGeometry[]
		>();
		const biome = "plains";

		for (const block of blocks) {
			const blockStringWithBiomeKey = this.createBlockStringWithBiome(
				block,
				biome
			);
			const cachedExtractedDatas = this.extractedBlockDataCache.get(
				blockStringWithBiomeKey
			);

			if (!cachedExtractedDatas || cachedExtractedDatas.length === 0) {
				continue;
			}

			const blockPosition = new THREE.Vector3(
				block.x || 0,
				block.y || 0,
				block.z || 0
			);

			for (const { geometry: baseGeo, material } of cachedExtractedDatas) {
				if (baseGeo.attributes.position.count === 0) continue;

				// Get the shared material from the registry
				const sharedMaterial = MaterialRegistry.getMaterial(material);

				// Create positioned geometry without cloning
				const positionedGeometry = this.createPositionedGeometry(
					baseGeo,
					blockPosition
				);

				if (!materialToGeometries.has(sharedMaterial)) {
					materialToGeometries.set(sharedMaterial, []);
				}
				materialToGeometries.get(sharedMaterial)!.push(positionedGeometry);
			}
		}

		if (materialToGeometries.size === 0) return null;

		// Build the final mesh using the optimized merge
		const materials: THREE.Material[] = [];
		const allGeometries: THREE.BufferGeometry[] = [];

		materialToGeometries.forEach((geometries, material) => {
			const materialIndex = materials.length;
			materials.push(material);

			geometries.forEach((geo) => {
				// Tag each geometry with its material index for merging
				(geo as any).__materialIndex = materialIndex;
				allGeometries.push(geo);
			});
		});

		// Merge geometries
		let mergedGeometry: THREE.BufferGeometry | null = null;
		try {
			mergedGeometry = this.mergeGeometriesOptimized(allGeometries);
		} catch (error) {
			console.error(
				`[WMB] Error merging geometries for ${meshPrefix}-${category}:`,
				error
			);
		}

		// Clean up temporary geometries
		allGeometries.forEach((geo) => geo.dispose());

		if (!mergedGeometry || mergedGeometry.attributes.position.count === 0) {
			mergedGeometry?.dispose();
			return null;
		}

		try {
			const mergedMesh = new THREE.Mesh(mergedGeometry, materials);
			mergedMesh.name = `${meshPrefix}-${category}-${blocks.length}b-${materials.length}m`;
			this.configureMeshForCategory(mergedMesh, category as keyof ChunkMeshes);

			// Track mesh for cleanup
			mergedMesh.userData.materialRegistry = true;

			return mergedMesh;
		} catch (error) {
			console.error(
				`[WMB] Failed to create final mesh for ${meshPrefix}-${category}:`,
				error
			);
			mergedGeometry?.dispose();
			return null;
		}
	}

	// Helper to create positioned geometry without cloning
	private createPositionedGeometry(
		baseGeometry: THREE.BufferGeometry,
		position: THREE.Vector3
	): THREE.BufferGeometry {
		const positionAttribute = baseGeometry.attributes.position;
		const normalAttribute = baseGeometry.attributes.normal;
		const uvAttribute = baseGeometry.attributes.uv;
		const indexAttribute = baseGeometry.index;


		// TODO: Check if expensive operation
		// Create new geometry with same structure
		const newGeometry = new THREE.BufferGeometry();

		// Copy and translate positions
		const positions = new Float32Array(positionAttribute.array.length);
		for (let i = 0; i < positionAttribute.array.length; i += 3) {
			positions[i] = positionAttribute.array[i] + position.x;
			positions[i + 1] = positionAttribute.array[i + 1] + position.y;
			positions[i + 2] = positionAttribute.array[i + 2] + position.z;
		}
		newGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(positions, 3)
		);

		// Copy normals directly (they don't change with translation)
		if (normalAttribute) {
			newGeometry.setAttribute(
				"normal",
				new THREE.BufferAttribute(new Float32Array(normalAttribute.array), 3)
			);
		}

		// Copy UVs directly
		if (uvAttribute) {
			newGeometry.setAttribute(
				"uv",
				new THREE.BufferAttribute(new Float32Array(uvAttribute.array), 2)
			);
		}

		// Copy index
		if (indexAttribute) {
			newGeometry.setIndex(
				new THREE.BufferAttribute(new Uint16Array(indexAttribute.array), 1)
			);
		}

		return newGeometry;
	}

	// Custom merge that preserves material groups
	private mergeGeometriesOptimized(
		geometries: THREE.BufferGeometry[]
	): THREE.BufferGeometry {
		if (geometries.length === 0) return new THREE.BufferGeometry();

		// Calculate total counts
		let totalPositions = 0;
		let totalIndices = 0;

		geometries.forEach((geo) => {
			totalPositions += geo.attributes.position.count;
			if (geo.index) {
				totalIndices += geo.index.count;
			} else {
				totalIndices += geo.attributes.position.count;
			}
		});

		// Allocate buffers
		const positions = new Float32Array(totalPositions * 3);
		const normals = new Float32Array(totalPositions * 3);
		const uvs = new Float32Array(totalPositions * 2);
		const indices = new Uint32Array(totalIndices);

		// Track offsets
		let positionOffset = 0;
		let indexOffset = 0;
		let vertexOffset = 0;

		// Groups for materials
		const groups: { start: number; count: number; materialIndex: number }[] =
			[];
		let currentGroup: {
			start: number;
			count: number;
			materialIndex: number;
		} | null = null;

		// Merge geometries
		for (const geo of geometries) {
			const materialIndex = (geo as any).__materialIndex || 0;
			const posAttr = geo.attributes.position;
			const normAttr = geo.attributes.normal;
			const uvAttr = geo.attributes.uv;

			// Copy positions
			positions.set(posAttr.array, positionOffset);

			// Copy normals
			if (normAttr) {
				normals.set(normAttr.array, positionOffset);
			}

			// Copy UVs
			if (uvAttr) {
				uvs.set(uvAttr.array, (positionOffset / 3) * 2);
			}

			// Copy indices
			let indexCount = 0;
			if (geo.index) {
				const geoIndices = geo.index.array;
				for (let i = 0; i < geoIndices.length; i++) {
					indices[indexOffset + i] = geoIndices[i] + vertexOffset;
				}
				indexCount = geoIndices.length;
			} else {
				// Generate indices for non-indexed geometry
				for (let i = 0; i < posAttr.count; i++) {
					indices[indexOffset + i] = vertexOffset + i;
				}
				indexCount = posAttr.count;
			}

			// Update groups
			if (!currentGroup || currentGroup.materialIndex !== materialIndex) {
				if (currentGroup) {
					groups.push(currentGroup);
				}
				currentGroup = {
					start: indexOffset,
					count: indexCount,
					materialIndex: materialIndex,
				};
			} else {
				currentGroup.count += indexCount;
			}

			positionOffset += posAttr.array.length;
			indexOffset += indexCount;
			vertexOffset += posAttr.count;
		}

		if (currentGroup) {
			groups.push(currentGroup);
		}

		// Create merged geometry
		const mergedGeometry = new THREE.BufferGeometry();
		mergedGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(positions, 3)
		);
		mergedGeometry.setAttribute(
			"normal",
			new THREE.BufferAttribute(normals, 3)
		);
		mergedGeometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
		mergedGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
		mergedGeometry.groups = groups;

		return mergedGeometry;
	}

	private configureMeshForCategory(
		mesh: THREE.Mesh,
		category: keyof ChunkMeshes
	): void {
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.frustumCulled = true;
		const materials = Array.isArray(mesh.material)
			? mesh.material
			: [mesh.material];
		materials.forEach((mat) => {
			if (!(mat instanceof THREE.Material)) return;
			switch (category) {
				case "water":
					mesh.renderOrder = 3;
					mat.transparent = true;
					if ("opacity" in mat) (mat as any).opacity = 0.8;
					break;
				case "transparent":
					mesh.renderOrder = 2;
					mat.transparent = true;
					break;
				case "emissive":
					mesh.renderOrder = 1;
					break;
				case "redstone":
					mesh.userData.isDynamic = true;
					break;
			}
		});
	}

	private extractAllMeshData(
		rootCubaneObject: THREE.Object3D
	): ProcessedBlockGeometry[] {
		const allMeshData: ProcessedBlockGeometry[] = [];
		// We still need to ensure children's world matrices are up-to-date
		// relative to the rootCubaneObject if it's assumed to be at origin.
		rootCubaneObject.updateMatrixWorld(true); // Update world matrix of root and its descendants

		rootCubaneObject.traverse((child) => {
			if (
				child instanceof THREE.Mesh &&
				child.geometry &&
				child.material &&
				child.visible &&
				child !== rootCubaneObject // Don't process the root if it happens to be a mesh
			) {
				const material = Array.isArray(child.material)
					? child.material[0]
					: child.material;
				if (!material || !(material instanceof THREE.Material)) return;

				const geometry = child.geometry.clone();

				// SIMPLIFIED ASSUMPTION: rootCubaneObject.matrixWorld is identity.
				// Therefore, child.matrixWorld IS the transform relative to root's origin.
				// However, it's usually better to get the matrix that transforms from child's local
				// space to the root's local space. This is child.matrix IF child is a direct
				// descendant of rootCubaneObject AND rootCubaneObject has no transform itself.
				// If child is nested deeper, we need its matrix relative to rootCubaneObject.

				// Let's find the matrix of 'child' relative to 'rootCubaneObject'
				// This is tricky without iterating upwards or using the original robust formula.
				// The original formula is the most reliable way.

				// Sticking to the original robust formula as it's safer:
				const matrixRelativeToRoot = child.matrixWorld
					.clone()
					.multiply(
						new THREE.Matrix4().copy(rootCubaneObject.matrixWorld).invert()
					);
				geometry.applyMatrix4(matrixRelativeToRoot);

				if (geometry.attributes.position.count > 0) {
					allMeshData.push({ geometry, material });
				} else {
					geometry.dispose();
				}
			}
		});
		return allMeshData;
	}

	// Helper to create a consistent cache key including biome
	private createBlockStringWithBiome(block: BlockData, biome: string): string {
		return `${this.createBlockString(block)}:${biome}`;
	}

	private parseBlockStringWithBiome(key: string): [string, string] {
		const lastColon = key.lastIndexOf(":");
		if (lastColon === -1) return [key, "plains"]; // Should not happen if created with helper
		return [key.substring(0, lastColon), key.substring(lastColon + 1)];
	}

	private createBlockString(block: BlockData): string {
		let blockString = block.name || "minecraft:stone";
		if (!blockString.includes(":")) blockString = `minecraft:${blockString}`;
		if (block.properties && Object.keys(block.properties).length > 0) {
			const props = Object.entries(block.properties)
				.map(([k, v]) => `${k}=${v}`)
				.join(",");
			blockString += `[${props}]`;
		}
		return blockString;
	}

	private createFallbackObject3D(blockString: string): THREE.Object3D {
		const mesh = new THREE.Mesh(
			new THREE.BoxGeometry(0.7, 0.7, 0.7),
			new THREE.MeshBasicMaterial({
				color: 0xee00ee,
				wireframe: true,
				name: `fallback-mat-${blockString}`,
			})
		);
		mesh.name = `fallback-mesh-${blockString}`;
		const group = new THREE.Group(); // Cubane returns an Object3D (often a Group)
		group.add(mesh);
		group.name = `fallback-object-${blockString}`;
		return group;
	}

	public clearCaches(): void {
		// Dispose geometries in our extracted data cache
		this.extractedBlockDataCache.forEach((datas) => {
			datas.forEach(({ geometry }) => geometry.dispose());
		});
		this.extractedBlockDataCache.clear();

		// Dispose Object3Ds from Cubane that we cached (traversing to dispose their content)
		this.cubaneBlockMeshCache.forEach((obj) => {
			if (!obj) return; // Skip if undefined
			obj.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.geometry?.dispose();
					if (Array.isArray(child.material)) {
						child.material.forEach((m) => m?.dispose());
					} else {
						child.material?.dispose();
					}
				}
			});
		});
		this.cubaneBlockMeshCache.clear();
		console.log("[WMB] Internal caches cleared and resources disposed.");
	}

	public dispose(): void {
		// Clear caches first
		this.clearCaches();

		// Log material registry stats before cleanup
		console.log("[WMB] Material Registry stats before disposal:");
		MaterialRegistry.logStats();

		// Note: You might want to keep materials if other chunks are still using them
		// Only clear if this is the last WorldMeshBuilder instance
		// MaterialRegistry.clear();

		console.log("[WMB] Disposed.");
	}

	// Add method to get optimization statistics
	public getOptimizationStats(): {
		cacheStats: { extractedDataCount: number; cubaneObjectCount: number };
		materialStats: ReturnType<typeof MaterialRegistry.getStats>;
	} {
		return {
			cacheStats: {
				extractedDataCount: this.extractedBlockDataCache.size,
				cubaneObjectCount: this.cubaneBlockMeshCache.size,
			},
			materialStats: MaterialRegistry.getStats(),
		};
	}
}
