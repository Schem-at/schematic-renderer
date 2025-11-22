import * as THREE from "three";
import { SchematicRenderer } from "./SchematicRenderer";
import { SchematicObject } from "./managers/SchematicObject";
import { MaterialRegistry } from "./MaterialRegistry";
import type {
	ChunkMeshes,
	ProcessedBlockGeometry,
	PaletteMaterialGroup,
	PaletteBlockData,
	PaletteCache,
} from "./types";
// @ts-ignore
import { Cubane } from "cubane";
import { InstancedBlockRenderer } from "./InstancedBlockRenderer";
import { performanceMonitor } from "./performance/PerformanceMonitor";
// @ts-ignore
import MeshBuilderWorker from "./workers/MeshBuilder.worker?worker&inline";

export const INVISIBLE_BLOCKS = new Set([
	"minecraft:air",
	"minecraft:cave_air",
	"minecraft:void_air",
	"minecraft:structure_void",
	"minecraft:light",
	"minecraft:barrier",
]);

// Keywords that indicate a block is NOT a full opaque cube and should not occlude neighbors
// const NON_OCCLUDING_KEYWORDS = [...]; // Removed as we now analyze geometry

export class WorldMeshBuilder {
	// @ts-ignore
	private schematicRenderer: SchematicRenderer;
	private cubane: Cubane;
	private paletteCache: PaletteCache | null = null;
	private instancedRenderer: InstancedBlockRenderer | null = null;
	private useInstancedRendering: boolean = false;
	private worker: Worker | null = null;
	private pendingRequests = new Map<
		string,
		{ resolve: (value: any) => void; reject: (reason?: any) => void }
	>();

	// Chunk size configuration for buffer sizing
	private chunkSize: number = 16; // Default Minecraft chunk size

	// Phase 2 optimizations configuration
	private useQuantization: boolean = false;

	constructor(schematicRenderer: SchematicRenderer, cubane: Cubane) {
		this.cubane = cubane;
		this.schematicRenderer = schematicRenderer;
		this.initializeWorker();
	}

	private initializeWorker() {
		if (this.worker) return;
		this.worker = new MeshBuilderWorker();
		this.worker!.onmessage = this.handleWorkerMessage.bind(this);
	}

	private handleWorkerMessage(event: MessageEvent) {
		const { type, chunkId, error, ...data } = event.data;

		if (type === "chunkBuilt") {
			const request = this.pendingRequests.get(chunkId);
			if (request) {
				request.resolve(data);
				this.pendingRequests.delete(chunkId);
			}
		} else if (type === "error") {
			// If chunkId is present, reject specific request, else log global error
			if (chunkId) {
				const request = this.pendingRequests.get(chunkId);
				if (request) {
					request.reject(new Error(error));
					this.pendingRequests.delete(chunkId);
				}
			} else {
				console.error("[WorldMeshBuilder] Worker error:", error);
			}
		} else if (type === "paletteUpdated") {
			// Optional: handle palette update confirmation
		}
	}

	public setChunkSize(newChunkSize: number): void {
		if (newChunkSize <= 0 || newChunkSize > 64) {
			throw new Error("Chunk size must be between 1 and 64");
		}
		const oldChunkSize = this.chunkSize;
		this.chunkSize = newChunkSize;
		console.log(
			`[WorldMeshBuilder] Chunk size changed from ${oldChunkSize} to ${newChunkSize}`
		);
	}

	public getChunkSize(): number {
		return this.chunkSize;
	}

	public setQuantization(enabled: boolean): void {
		const oldValue = this.useQuantization;
		this.useQuantization = enabled;
		console.log(
			`[WorldMeshBuilder] Quantization ${enabled ? "enabled" : "disabled"} (was ${oldValue ? "enabled" : "disabled"
			})`
		);
	}

	public getQuantization(): boolean {
		return this.useQuantization;
	}


	// Removed unused isBlockOccluding method

	private async computeOcclusionFlags(blockString: string): Promise<number> {
		try {
			// @ts-ignore - Accessing Cubane's optimization data
			const data = await this.cubane.getBlockOptimizationData(blockString, "plains", true);

			if (!data || !data.cullableFaces) {
				// console.warn(`[Occlusion] No optimization data for ${blockString}`);
				return 0;
			}

			let flags = 0;
			const mapping: Record<string, number> = {
				"west": 0,
				"east": 1,
				"down": 2,
				"up": 3,
				"north": 4,
				"south": 5
			};

			// @ts-ignore
			for (const [dir, faces] of data.cullableFaces.entries()) {
				const bit = mapping[dir];
				if (bit === undefined) continue;

				let isOpaque = true;
				let isFullFace = false;

				if (Array.isArray(faces)) {
					for (const face of faces) {
						// Check opacity
						if (face.material && (face.material.transparent && face.material.opacity < 1.0)) {
							isOpaque = false;
							break;
						}

						// Check bounds if available to ensure it's a full face
						if (face.elementBounds) {
							const [min, max] = face.elementBounds;
							// min and max are [x, y, z] in 0..16 coordinates typically

							let width = 0, height = 0;

							if (dir === 'up' || dir === 'down') { // Check X and Z
								width = max[0] - min[0];
								height = max[2] - min[2];
							} else if (dir === 'north' || dir === 'south') { // Check X and Y
								width = max[0] - min[0];
								height = max[1] - min[1];
							} else if (dir === 'east' || dir === 'west') { // Check Y and Z
								width = max[1] - min[1];
								height = max[2] - min[2];
							}

							// Assume 16 is the full block size. 
							// Allow small epsilon for float precision.
							if (width > 15.9 && height > 15.9) {
								isFullFace = true;
							}
						} else {
							// Fallback if no bounds: trust 'isCube' property if available.
							// If it's a cube, all cullable faces are full faces.
							// @ts-ignore
							if (data.isCube) isFullFace = true;
						}
					}
				}

				if (isOpaque && isFullFace) {
					flags |= (1 << bit);
				}
			}

			// Debug log for common blocks
			if (blockString.includes("stone") || blockString.includes("dirt") || blockString.includes("grass_block")) {
				// console.log(`[Occlusion] ${blockString} flags: ${flags.toString(2).padStart(6, '0')}`);
			}

			return flags;
		} catch (e) {
			return 0;
		}
	}

	public async precomputePaletteGeometries(palette: any[]): Promise<void> {
		performanceMonitor.startOperation("precomputePaletteGeometries");

		// Ensure worker is initialized
		this.initializeWorker();

		const paletteBlockData: PaletteBlockData[] = new Array(palette.length);
		const globalMaterialMap = new Map<string, THREE.Material>();
		const globalMaterials: THREE.Material[] = [];
		const paletteGeometryData: any[] = [];

		// Process all palette entries
		const CONCURRENCY_LIMIT = 8;
		let currentIndex = 0;
		const workerPromises: Promise<void>[] = [];

		const processBlock = async (index: number) => {
			const blockState = palette[index];
			const blockString = this.createBlockStringFromPaletteEntry(blockState);
			const biome = "plains";

			try {
				// Get geometry from Cubane (Main Thread)
				const cubaneObj = await this.cubane.getBlockMesh(
					blockString,
					biome,
					true
				);
				const extractedGeometries = cubaneObj
					? this.extractAllMeshData(cubaneObj)
					: this.extractAllMeshData(this.createFallbackObject3D(blockString));

				// Create material groups for this block type
				const materialGroups: PaletteMaterialGroup[] = [];
				const geometryData: any[] = [];

				for (const { geometry, material } of extractedGeometries) {
					if (geometry.attributes.position.count === 0) continue;

					// Get or create shared material
					const sharedMaterial = MaterialRegistry.getMaterial(material);
					const materialKey = sharedMaterial.uuid;

					// Get or assign global material index
					let globalMaterial = globalMaterialMap.get(materialKey);
					if (!globalMaterial) {
						globalMaterial = sharedMaterial;
						globalMaterialMap.set(materialKey, globalMaterial);
						globalMaterials.push(globalMaterial);
					}

					const materialIndex = globalMaterials.indexOf(globalMaterial);

					materialGroups.push({
						material: globalMaterial,
						baseGeometry: geometry,
						positions: [],
						materialIndex: materialIndex,
					});

					// Extract buffers for worker
					geometryData.push({
						positions: geometry.attributes.position.array,
						normals: geometry.attributes.normal?.array,
						uvs: geometry.attributes.uv?.array,
						indices: geometry.index?.array || null,
						materialIndex: materialIndex,
					});
				}

				paletteBlockData[index] = {
					blockName: blockState.name,
					materialGroups,
					category: this.getBlockCategory(blockState.name),
				};

				// Add to worker payload
				if (geometryData.length > 0) {
					paletteGeometryData.push({
						index,
						category: this.getBlockCategory(blockState.name),
						occlusionFlags: await this.computeOcclusionFlags(blockString),
						geometries: geometryData,
					});
				}
			} catch (error) {
				console.warn(`Error processing palette index ${index}:`, error);
				// Fallback logic omitted for brevity, but should be similar
			}
		};

		// Process with concurrency limit
		while (currentIndex < palette.length || workerPromises.length > 0) {
			while (
				workerPromises.length < CONCURRENCY_LIMIT &&
				currentIndex < palette.length
			) {
				const index = currentIndex++;
				const promise = processBlock(index).then(() => {
					const idx = workerPromises.indexOf(promise);
					if (idx > -1) workerPromises.splice(idx, 1);
				});
				workerPromises.push(promise);
			}

			if (workerPromises.length > 0) {
				await Promise.race(workerPromises.map((p) => p.catch(() => { })));
			} else if (currentIndex >= palette.length) {
				break;
			}
		}

		this.paletteCache = {
			palette: palette,
			blockData: paletteBlockData,
			globalMaterials,
			isReady: true,
		};

		// Send geometry data to worker
		this.worker!.postMessage({
			type: "updatePalette",
			paletteData: paletteGeometryData,
		});

		performanceMonitor.endOperation("precomputePaletteGeometries");
	}

	public async getChunkMesh(
		chunkData: {
			blocks: Array<number[]>;
			chunk_x: number;
			chunk_y: number;
			chunk_z: number;
		},
		schematicObject: SchematicObject,
		renderingBounds?: {
			min: THREE.Vector3;
			max: THREE.Vector3;
			enabled?: boolean;
		}
	): Promise<THREE.Object3D[]> {
		const chunkId = `${chunkData.chunk_x},${chunkData.chunk_y},${chunkData.chunk_z}`;

		if (!this.paletteCache?.isReady) {
			throw new Error(
				"Palette cache not ready. Call precomputePaletteGeometries() first."
			);
		}

		if (chunkData.blocks.length === 0) return [];

		// Filter blocks based on bounds (can also be done in worker, but cheap enough here)
		// Actually, doing it in worker saves transfer time if bounds are tight.
		// For now, let's stick to original logic or pass bounds to worker.
		// Original logic filtered before creating meshes.
		let blocksToProcess = chunkData.blocks;
		if (renderingBounds?.enabled) {
			blocksToProcess = chunkData.blocks.filter((block) => {
				const [x, y, z] = block;
				return (
					x >= renderingBounds.min.x &&
					x < renderingBounds.max.x &&
					y >= renderingBounds.min.y &&
					y < renderingBounds.max.y &&
					z >= renderingBounds.min.z &&
					z < renderingBounds.max.z
				);
			});
		}

		if (blocksToProcess.length === 0) return [];

		// Identify tile entities separately (logic from original)
		// We'll process tile entities on main thread as they are special/custom
		// and regular blocks via worker.
		const tileEntityBlocks: any[] = [];
		const workerBlocks: number[][] = [];

		// Get all block entities
		const blockEntities =
			schematicObject.schematicWrapper.get_all_block_entities() || [];
		const blockEntityMap = new Map<string, any>();
		for (const entity of blockEntities) {
			if (
				entity &&
				entity.position &&
				Array.isArray(entity.position) &&
				entity.position.length === 3
			) {
				const [x, y, z] = entity.position;
				blockEntityMap.set(`${x},${y},${z}`, entity);
			}
		}

		for (const block of blocksToProcess) {
			const [x, y, z, paletteIndex] = block;
			const blockData = this.paletteCache.blockData[paletteIndex];
			if (blockData && !INVISIBLE_BLOCKS.has(blockData.blockName)) {
				const entity = blockEntityMap.get(`${x},${y},${z}`);
				if (entity && blockData.blockName.includes("sign")) {
					tileEntityBlocks.push({ x, y, z, paletteIndex, nbtData: entity });
				} else {
					workerBlocks.push(block);
				}
			}
		}

		// Send regular blocks to worker
		const workerPromise = new Promise<any>((resolve, reject) => {
			if (workerBlocks.length === 0) {
				resolve({ meshes: [] });
				return;
			}

			// Double check worker exists
			if (!this.worker) {
				this.initializeWorker();
			}

			this.pendingRequests.set(chunkId, { resolve, reject });
			this.worker!.postMessage({
				type: "buildChunk",
				chunkId,
				blocks: workerBlocks,
			});
		});

		const resultMeshes: THREE.Object3D[] = [];

		try {
			// Wait for worker result
			const workerResult = await workerPromise;

			// Reconstruct meshes from worker buffers
			if (workerResult.meshes) {
				for (const meshData of workerResult.meshes) {
					const geometry = new THREE.BufferGeometry();
					geometry.setAttribute(
						"position",
						new THREE.BufferAttribute(meshData.positions, 3)
					);
					if (meshData.normals)
						geometry.setAttribute(
							"normal",
							new THREE.BufferAttribute(meshData.normals, 3)
						);
					if (meshData.uvs)
						geometry.setAttribute(
							"uv",
							new THREE.BufferAttribute(meshData.uvs, 2)
						);
					if (meshData.indices)
						geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));

					// Groups
					if (meshData.groups) {
						for (const group of meshData.groups) {
							geometry.addGroup(
								group.start,
								group.count,
								group.materialIndex
							);
						}
					}

					const mesh = new THREE.Mesh(
						geometry,
						this.paletteCache.globalMaterials
					);
					mesh.name = `${meshData.category}_chunk`;
					this.configureMeshForCategory(
						mesh,
						meshData.category as keyof ChunkMeshes
					);
					resultMeshes.push(mesh);
				}
			}

			// Process tile entities (Main Thread)
			if (tileEntityBlocks.length > 0) {
				const palette = this.paletteCache.palette;
				for (const tileBlock of tileEntityBlocks) {
					const { x, y, z, paletteIndex, nbtData } = tileBlock;
					const blockState = palette[paletteIndex];
					// ... (Rest of tile entity logic same as original)
					if (blockState) {
						try {
							const blockString =
								this.createBlockStringFromPaletteEntry(blockState);
							const customMesh = await this.cubane.getBlockMesh(
								blockString,
								"plains",
								false,
								nbtData.nbt || nbtData
							);
							if (customMesh) {
								const currentOffset = customMesh.position.clone();
								customMesh.position.set(
									x + currentOffset.x,
									y + currentOffset.y,
									z + currentOffset.z
								);
								customMesh.name = `tile_entity_${blockState.name}_${x}_${y}_${z}`;
								resultMeshes.push(customMesh);
							}
						} catch (e) {
							console.warn("Tile entity error", e);
						}
					}
				}
			}
		} catch (error) {
			console.error("Error building chunk mesh:", error);
		}

		return resultMeshes;
	}

	// Helper methods...
	private createBlockStringFromPaletteEntry(blockState: any): string {
		let blockString = blockState.name || "minecraft:stone";
		if (!blockString.includes(":")) blockString = `minecraft:${blockString}`;

		if (
			blockState.properties &&
			Object.keys(blockState.properties).length > 0
		) {
			const props = Object.entries(blockState.properties)
				.map(([k, v]) => `${k}=${v}`)
				.join(",");
			blockString += `[${props}]`;
		}
		return blockString;
	}

	private getBlockCategory(blockName: string): keyof ChunkMeshes {
		if (blockName.includes("water") || blockName.includes("lava"))
			return "water";
		if (
			blockName.includes("glass") ||
			blockName.includes("leaves") ||
			blockName.includes("ice") ||
			blockName === "minecraft:barrier"
		)
			return "transparent";
		return "solid";
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
		rootCubaneObject.updateMatrixWorld(true);

		rootCubaneObject.traverse((child) => {
			if (
				child instanceof THREE.Mesh &&
				child.geometry &&
				child.material &&
				child.visible &&
				child !== rootCubaneObject
			) {
				const material = Array.isArray(child.material)
					? child.material[0]
					: child.material;
				if (!material || !(material instanceof THREE.Material)) return;

				const geometry = child.geometry.clone();
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
		const group = new THREE.Group();
		group.add(mesh);
		group.name = `fallback-object-${blockString}`;
		return group;
	}

	public getPaletteStats() {
		return {
			isReady: this.paletteCache?.isReady || false,
			paletteSize: this.paletteCache?.blockData.length || 0,
			uniqueMaterials: this.paletteCache?.globalMaterials.length || 0,
			memoryEstimate:
				this.paletteCache?.blockData.reduce((total, blockData) => {
					return (
						total +
						blockData.materialGroups.reduce((subtotal, group) => {
							return (
								subtotal +
								(group.baseGeometry.attributes.position?.count || 0) * 3 * 4
							);
						}, 0)
					);
				}, 0) || 0,
		};
	}

	public enableInstancedRendering(
		group: THREE.Group,
		merged: boolean = false
	): void {
		this.useInstancedRendering = true;
		this.instancedRenderer = new InstancedBlockRenderer(
			group,
			this.paletteCache
		);

		if (merged) {
			console.log("🔥 Enabling MERGED instanced rendering...");
			this.instancedRenderer.initializeInstancedMeshesMerged();
		} else {
			console.log("🔥 Enabling COMPLETE instanced rendering...");
			this.instancedRenderer.initializeInstancedMeshes();
		}
	}

	public disableInstancedRendering(): void {
		this.useInstancedRendering = false;
		if (this.instancedRenderer) {
			this.instancedRenderer.disposeInstancedMeshes();
			this.instancedRenderer = null;
		}
		console.log(
			"🔄 Instanced rendering disabled, reverted to individual meshes"
		);
	}

	public async renderSchematicInstanced(
		schematicObject: SchematicObject
	): Promise<void> {
		if (!this.useInstancedRendering || !this.instancedRenderer) {
			throw new Error(
				"Instanced rendering not enabled. Call enableInstancedRendering() first."
			);
		}

		console.log("🚀 Starting instanced schematic rendering...");
		const startTime = performance.now();

		const schematic = schematicObject.schematicWrapper;

		const allBlockIndices = schematic.blocks_indices();

		const allBlocks: Array<{
			x: number;
			y: number;
			z: number;
			paletteIndex: number;
		}> = [];

		for (const blockData of allBlockIndices) {
			const [x, y, z, paletteIndex] = blockData;

			const renderingBounds = schematicObject.renderingBounds;
			if (renderingBounds?.enabled) {
				if (
					x < renderingBounds.min.x ||
					x > renderingBounds.max.x ||
					y < renderingBounds.min.y ||
					y > renderingBounds.max.y ||
					z < renderingBounds.min.z ||
					z > renderingBounds.max.z
				) {
					continue;
				}
			}

			allBlocks.push({ x, y, z, paletteIndex });
		}

		this.instancedRenderer.renderBlocksInstanced(allBlocks);

		const duration = performance.now() - startTime;
		console.log(
			`✨ Instanced schematic rendering completed in ${duration.toFixed(2)}ms`
		);
		console.log(
			`   Rendered ${allBlocks.length} blocks using instanced meshes`
		);
	}

	public dispose(): void {
		if (this.paletteCache) {
			this.paletteCache.blockData.forEach((blockData) => {
				blockData.materialGroups.forEach((group) => {
					if (group.baseGeometry) {
						group.baseGeometry.dispose();
					}
				});
			});
			this.paletteCache = null;
		}
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		console.log("[OptWMB] Disposed palette cache and worker.");
	}
}
