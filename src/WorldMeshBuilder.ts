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
	ChunkGeometryData,
} from "./types";
// @ts-ignore
import { Cubane } from "cubane";
import { InstancedBlockRenderer } from "./InstancedBlockRenderer";
import { performanceMonitor } from "./performance/PerformanceMonitor";
// Worker imports - Vite handles bundling
// @ts-ignore
import MeshBuilderWorker from "./workers/MeshBuilder.worker?worker&inline";
// @ts-ignore
import MeshBuilderWasmWorker from "./workers/MeshBuilderWasm.worker?worker&inline";
import { GPUCapabilityManager } from "./gpu/GPUCapabilityManager";
import { ComputeMeshBuilder } from "./gpu/ComputeMeshBuilder";
import { getSharedMemoryPool, SharedMemoryPool, CHUNK_INPUT_HEADER_SIZE } from "./workers/SharedMemoryManager";

export const INVISIBLE_BLOCKS = new Set([
	"minecraft:air",
	"minecraft:cave_air",
	"minecraft:void_air",
	"minecraft:structure_void",
	"minecraft:light",
	"minecraft:barrier",
]);

// Constants matching worker
const POSITION_SCALE = 1024;

export class WorldMeshBuilder {
	// @ts-ignore
	private schematicRenderer: SchematicRenderer;
	private cubane: Cubane;
	private paletteCache: PaletteCache | null = null;
	private instancedRenderer: InstancedBlockRenderer | null = null;
	private useInstancedRendering: boolean = false;

	// Worker Pool
	private workers: Worker[] = [];
	private freeWorkers: Worker[] = [];
	private workerQueue: ((worker: Worker) => void)[] = []; // Queue for waiting tasks
	private pendingRequests = new Map<
		string,
		{ resolve: (value: any) => void; reject: (reason?: any) => void; worker: Worker }
	>();
	private maxWorkers: number = navigator.hardwareConcurrency || 4;

	// Chunk size configuration for buffer sizing
	private chunkSize: number = 16; // Default Minecraft chunk size

	// Phase 2 optimizations configuration
	private useQuantization: boolean = false;

	// WebGPU Compute
	private useGPUCompute: boolean = false;
	private computeMeshBuilder: ComputeMeshBuilder | null = null;
	private gpuInitPromise: Promise<boolean> | null = null;

	// WASM Mesh Builder
	private useWasmMeshBuilder: boolean = false;

	// SharedArrayBuffer for zero-copy transfers
	private sharedMemoryPool: SharedMemoryPool | null = null;
	private useSharedMemory: boolean = false;

	constructor(schematicRenderer: SchematicRenderer, cubane: Cubane) {
		this.cubane = cubane;
		this.schematicRenderer = schematicRenderer;
		// Check WASM option (enabled by default)
		this.useWasmMeshBuilder = schematicRenderer.options.wasmMeshBuilderOptions?.enabled ?? true;
		// Try GPU compute first, fall back to workers
		this.initializeGPUCompute();
	}

	/**
	 * Initialize WebGPU compute for mesh building
	 * Falls back to workers if WebGPU is not available
	 */
	private async initializeGPUCompute(): Promise<boolean> {
		if (this.gpuInitPromise) {
			return this.gpuInitPromise;
		}

		this.gpuInitPromise = this._doInitializeGPU();
		return this.gpuInitPromise;
	}

	private async _doInitializeGPU(): Promise<boolean> {
		try {
			// Check if GPU compute is enabled in options
			const gpuOptions = this.schematicRenderer.options.gpuComputeOptions;
			if (!gpuOptions?.enabled) {
				console.log('%c[WorldMeshBuilder] GPU Compute: DISABLED', 'color: #ff9800; font-weight: bold');
				console.log('  → Using Web Worker fallback (12 workers parallel)');
				console.log('  → To enable GPU compute: set gpuComputeOptions.enabled = true');
				console.log('  → Note: GPU compute is experimental and may have texture issues');
				this.initializeWorkers();
				return false;
			}

			// Check if WebGPU is available
			const isAvailable = await GPUCapabilityManager.isWebGPUAvailable();
			if (!isAvailable) {
				console.log('[WorldMeshBuilder] WebGPU not available, using worker fallback');
				this.initializeWorkers();
				return false;
			}

			// Initialize compute mesh builder
			this.computeMeshBuilder = new ComputeMeshBuilder();
			const success = await this.computeMeshBuilder.initialize();

			if (success) {
				this.useGPUCompute = true;
				console.log('%c[WorldMeshBuilder] GPU Compute: ENABLED', 'color: #ff9800; font-weight: bold');
				console.warn('  ⚠️ WARNING: GPU compute is ~6x SLOWER than workers due to GPU→CPU readback!');
				console.warn('  ⚠️ Textures will not render correctly (wireframe only).');
				console.warn('  ⚠️ Set gpuComputeOptions.enabled = false for better performance.');
				return true;
			} else {
				console.warn('[WorldMeshBuilder] GPU compute init failed, using worker fallback');
				this.computeMeshBuilder = null;
				this.initializeWorkers();
				return false;
			}
		} catch (error) {
			console.warn('[WorldMeshBuilder] GPU compute error, using worker fallback:', error);
			this.computeMeshBuilder = null;
			this.initializeWorkers();
			return false;
		}
	}

	/**
	 * Check if GPU compute is being used
	 */
	public isUsingGPUCompute(): boolean {
		return this.useGPUCompute && this.computeMeshBuilder !== null;
	}

	private initializeWorkers() {
		if (this.workers.length > 0) return;

		const workerType = this.useWasmMeshBuilder ? 'WASM' : 'JavaScript';
		console.log(`[WorldMeshBuilder] Initializing ${workerType} worker pool with ${this.maxWorkers} workers`);

		// Initialize shared memory pool for zero-copy transfers
		this.sharedMemoryPool = getSharedMemoryPool();
		this.useSharedMemory = this.sharedMemoryPool.usingSharedMemory();

		if (this.useSharedMemory) {
			console.log('%c[WorldMeshBuilder] SharedArrayBuffer enabled - zero-copy transfers active', 'color: #4caf50');
		} else {
			console.log('[WorldMeshBuilder] SharedArrayBuffer not available - using standard transfers');
		}

		for (let i = 0; i < this.maxWorkers; i++) {
			// Use WASM worker if enabled, otherwise use JavaScript worker
			const worker = this.useWasmMeshBuilder
				? new MeshBuilderWasmWorker()
				: new MeshBuilderWorker();
			worker.onmessage = (event: MessageEvent) => this.handleWorkerMessage(worker, event);
			this.workers.push(worker);
			this.freeWorkers.push(worker);
		}
	}

	/**
	 * Check if using WASM mesh builder
	 */
	public isUsingWasmMeshBuilder(): boolean {
		return this.useWasmMeshBuilder && this.workers.length > 0;
	}

	/**
	 * Check if using SharedArrayBuffer
	 */
	public isUsingSharedMemory(): boolean {
		return this.useSharedMemory && this.sharedMemoryPool !== null;
	}

	// Static stats collector
	static stats = {
		totalSetup: 0,
		totalSort: 0,
		totalMerge: 0,
		totalWorkerTime: 0,
		chunkCount: 0
	};

	static resetStats() {
		this.stats = {
			totalSetup: 0,
			totalSort: 0,
			totalMerge: 0,
			totalWorkerTime: 0,
			chunkCount: 0
		};
	}

	private handleWorkerMessage(worker: Worker, event: MessageEvent) {
		const { type, chunkId, error, timings, ...data } = event.data;

		if (type === "chunkBuilt") {
			if (timings) {
				WorldMeshBuilder.stats.totalSetup += timings.setup;
				WorldMeshBuilder.stats.totalSort += timings.sort;
				WorldMeshBuilder.stats.totalMerge += timings.merge;
				WorldMeshBuilder.stats.totalWorkerTime += timings.total;
				WorldMeshBuilder.stats.chunkCount++;

				if (WorldMeshBuilder.stats.chunkCount % 50 === 0) {
					const avg = (val: number) => (val / WorldMeshBuilder.stats.chunkCount).toFixed(2);
					console.log(`[WorkerStats] Avg (n=${WorldMeshBuilder.stats.chunkCount}): Setup ${avg(WorldMeshBuilder.stats.totalSetup)}ms, Sort ${avg(WorldMeshBuilder.stats.totalSort)}ms, Merge ${avg(WorldMeshBuilder.stats.totalMerge)}ms, Total ${avg(WorldMeshBuilder.stats.totalWorkerTime)}ms`);
				}
			}

			const request = this.pendingRequests.get(chunkId);
			if (request) {
				request.resolve(data);
				this.pendingRequests.delete(chunkId);

				// Return worker to pool
				this.returnWorker(worker);
			}
		} else if (type === "error") {
			if (chunkId) {
				const request = this.pendingRequests.get(chunkId);
				if (request) {
					request.reject(new Error(error));
					this.pendingRequests.delete(chunkId);
					this.returnWorker(worker);
				}
			} else {
				console.error("[WorldMeshBuilder] Worker error:", error);
			}
		} else if (type === "paletteUpdated") {
			// Optional: handle palette update confirmation
		}
	}

	private returnWorker(worker: Worker) {
		if (!this.workers.includes(worker)) return; // Worker might have been terminated

		if (this.workerQueue.length > 0) {
			const resolve = this.workerQueue.shift()!;
			resolve(worker);
		} else {
			this.freeWorkers.push(worker);
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

			return flags;
		} catch (e) {
			return 0;
		}
	}

	public async precomputePaletteGeometries(palette: any[]): Promise<void> {
		performanceMonitor.startOperation("precomputePaletteGeometries");
		console.time("precomputePaletteGeometries");

		// Check if palette is effectively the same
		if (this.paletteCache?.isReady && this.paletteCache.palette.length === palette.length) {
			// Quick heuristic check: if length is same and first/last items match, assume same palette
			// (Since palette order is usually deterministic from WASM)
			const firstMatch = palette.length === 0 || (
				palette[0].name === this.paletteCache.palette[0].name &&
				JSON.stringify(palette[0].properties) === JSON.stringify(this.paletteCache.palette[0].properties)
			);
			const lastIdx = palette.length - 1;
			const lastMatch = palette.length === 0 || (
				palette[lastIdx].name === this.paletteCache.palette[lastIdx].name &&
				JSON.stringify(palette[lastIdx].properties) === JSON.stringify(this.paletteCache.palette[lastIdx].properties)
			);

			if (firstMatch && lastMatch) {
				console.log(`[WorldMeshBuilder] Palette cache hit (${palette.length} entries). Skipping precomputation.`);
				console.timeEnd("precomputePaletteGeometries");
				performanceMonitor.endOperation("precomputePaletteGeometries");
				return;
			}
		}

		// Reset stats on start
		WorldMeshBuilder.resetStats();
		console.log(`[WorldMeshBuilder] Precomputing geometry for ${palette.length} palette entries...`);

		// Re-initialize GPU compute if it was disposed (e.g., during cleanup between runs)
		// This must happen BEFORE worker initialization to allow GPU to take precedence
		if (!this.gpuInitPromise && this.schematicRenderer.options.gpuComputeOptions?.enabled) {
			console.log('[WorldMeshBuilder] Re-initializing GPU compute (was disposed)...');
			this.gpuInitPromise = this._doInitializeGPU();
		}

		// Wait for GPU init if in progress - GPU init will create workers as fallback if needed
		if (this.gpuInitPromise) {
			await this.gpuInitPromise;
		} else {
			// Only initialize workers if GPU is not being used
			this.initializeWorkers();
		}

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
					const occlusionFlags = await this.computeOcclusionFlags(blockString);
					paletteGeometryData.push({
						index,
						category: this.getBlockCategory(blockState.name),
						occlusionFlags: occlusionFlags,
						isCubic: occlusionFlags === 63, // Optimization: All 6 faces are occluding = full cube
						geometries: geometryData,
					});
				}
			} catch (error) {
				console.warn(`Error processing palette index ${index}:`, error);
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

		// Wait for GPU init to complete
		if (this.gpuInitPromise) {
			await this.gpuInitPromise;
		}

		// Upload to GPU if using GPU compute, otherwise broadcast to workers
		if (this.useGPUCompute && this.computeMeshBuilder) {
			console.log(`[WorldMeshBuilder] Uploading palette to GPU...`);
			await this.computeMeshBuilder.uploadPaletteData(this.paletteCache);
		} else {
			// Broadcast geometry data to ALL workers (fallback path)
			console.log(`[WorldMeshBuilder] Broadcasting palette to ${this.workers.length} workers...`);
			this.workers.forEach(worker => {
				worker.postMessage({
					type: "updatePalette",
					paletteData: paletteGeometryData,
				});
			});
		}

		console.log("[WorldMeshBuilder] Palette precomputation complete.");
		console.timeEnd("precomputePaletteGeometries");
		performanceMonitor.endOperation("precomputePaletteGeometries");

		// Log summary of build mode
		if (this.useGPUCompute) {
			console.log('%c[Performance Mode] GPU Compute (NOT RECOMMENDED - slower)', 'background: #ff9800; color: white; padding: 2px 6px; border-radius: 3px');
		} else if (this.useWasmMeshBuilder && this.useSharedMemory) {
			console.log(`%c[Performance Mode] WASM + SharedArrayBuffer (${this.workers.length}x parallel, zero-copy) ✓✓ OPTIMAL`, 'background: #4caf50; color: white; padding: 2px 6px; border-radius: 3px');
		} else if (this.useWasmMeshBuilder) {
			console.log(`%c[Performance Mode] WASM Workers (${this.workers.length}x parallel)`, 'background: #8bc34a; color: white; padding: 2px 6px; border-radius: 3px');
		} else {
			console.log(`%c[Performance Mode] JavaScript Workers (${this.workers.length}x parallel)`, 'background: #2196f3; color: white; padding: 2px 6px; border-radius: 3px');
		}
	}

	// Helper to acquire a worker
	private async getFreeWorker(): Promise<Worker> {
		if (this.freeWorkers.length > 0) {
			return this.freeWorkers.pop()!;
		}

		// Wait for a worker to become free
		return new Promise<Worker>(resolve => {
			this.workerQueue.push(resolve);
		});
	}

	public async getChunkGeometries(
		chunkData: {
			blocks: Array<number[]> | Int32Array;
			chunk_x: number;
			chunk_y: number;
			chunk_z: number;
		},
		renderingBounds?: {
			min: THREE.Vector3;
			max: THREE.Vector3;
			enabled?: boolean;
		}
	): Promise<{ geometries: ChunkGeometryData[], origin: number[] }> {
		const chunkId = `${chunkData.chunk_x},${chunkData.chunk_y},${chunkData.chunk_z}`;

		if (!this.paletteCache?.isReady) {
			throw new Error(
				"Palette cache not ready. Call precomputePaletteGeometries() first."
			);
		}

		if (chunkData.blocks.length === 0) return { geometries: [], origin: [0, 0, 0] };

		// Filter blocks based on bounds
		let blocksToProcess = chunkData.blocks;
		const skipBoundsCheck = !renderingBounds?.enabled;

		if (!skipBoundsCheck) {
			if (chunkData.blocks instanceof Int32Array) {
				const filtered: number[] = [];
				const blocks = chunkData.blocks;
				for (let i = 0; i < blocks.length; i += 4) {
					const x = blocks[i];
					const y = blocks[i + 1];
					const z = blocks[i + 2];
					if (
						x >= renderingBounds!.min.x &&
						x < renderingBounds!.max.x &&
						y >= renderingBounds!.min.y &&
						y < renderingBounds!.max.y &&
						z >= renderingBounds!.min.z &&
						z < renderingBounds!.max.z
					) {
						filtered.push(x, y, z, blocks[i + 3]);
					}
				}
				blocksToProcess = new Int32Array(filtered);
			} else {
				blocksToProcess = chunkData.blocks.filter((block) => {
					const [x, y, z] = block;
					return (
						x >= renderingBounds!.min.x &&
						x < renderingBounds!.max.x &&
						y >= renderingBounds!.min.y &&
						y < renderingBounds!.max.y &&
						z >= renderingBounds!.min.z &&
						z < renderingBounds!.max.z
					);
				});
			}
		}

		if (blocksToProcess.length === 0) return { geometries: [], origin: [0, 0, 0] };

		const originX = chunkData.chunk_x * this.chunkSize;
		const originY = chunkData.chunk_y * this.chunkSize;
		const originZ = chunkData.chunk_z * this.chunkSize;

		// GPU Compute path
		if (this.useGPUCompute && this.computeMeshBuilder?.isReady) {
			try {
				const gpuResult = await this.computeMeshBuilder.buildChunk(
					blocksToProcess as Int32Array,
					[originX, originY, originZ],
					chunkId
				);

				if (gpuResult) {
					return {
						geometries: gpuResult.geometries,
						origin: gpuResult.origin
					};
				}
			} catch (error) {
				console.warn('[WorldMeshBuilder] GPU compute failed, falling back to workers:', error);
				// Fall through to worker path
			}
		}

		// Worker fallback path
		const workerBlocks = blocksToProcess;

		const workerPromise = new Promise<any>(async (resolve, reject) => {
			if (workerBlocks.length === 0) {
				resolve({ meshes: [] });
				return;
			}

			// Ensure workers exist
			if (this.workers.length === 0) {
				this.initializeWorkers();
			}

			// Get a free worker
			const worker = await this.getFreeWorker();

			// Add timeout to prevent hanging
			const timeoutId = setTimeout(() => {
				if (this.pendingRequests.has(chunkId)) {
					const req = this.pendingRequests.get(chunkId);
					this.pendingRequests.delete(chunkId);
					// Release worker even on timeout
					if (req) {
						this.returnWorker(req.worker);
					}
					reject(new Error(`Chunk build timeout for ${chunkId}`));
				}
			}, 30000); // 30 seconds timeout

			this.pendingRequests.set(chunkId, {
				resolve: (data) => {
					clearTimeout(timeoutId);
					// Clean up shared memory buffer if used
					if (this.sharedMemoryPool) {
						this.sharedMemoryPool.releaseBuffers(chunkId);
					}
					resolve(data);
				},
				reject: (err) => {
					clearTimeout(timeoutId);
					// Clean up shared memory buffer if used
					if (this.sharedMemoryPool) {
						this.sharedMemoryPool.releaseBuffers(chunkId);
					}
					reject(err);
				},
				worker: worker
			});

			// Use SharedArrayBuffer for zero-copy transfer if available
			if (this.useSharedMemory && this.sharedMemoryPool && workerBlocks instanceof Int32Array) {
				// Write data to shared memory - worker reads directly, no copy!
				const sharedBuffer = this.sharedMemoryPool.writeChunkInput(
					chunkId,
					workerBlocks,
					originX,
					originY,
					originZ
				);

				worker.postMessage({
					type: "buildChunk",
					chunkId,
					sharedInputBuffer: sharedBuffer, // Worker reads from this directly
					chunkOrigin: [originX, originY, originZ]
				});
			} else {
				// Fallback: transfer via postMessage (copies data)
				const transferList: Transferable[] = [];
				if (workerBlocks instanceof Int32Array) {
					transferList.push(workerBlocks.buffer);
				}

				worker.postMessage({
					type: "buildChunk",
					chunkId,
					blocks: workerBlocks,
					chunkOrigin: [originX, originY, originZ]
				}, transferList);
			}
		});

		try {
			const workerResult = await workerPromise;
			return {
				geometries: workerResult.meshes as ChunkGeometryData[],
				origin: workerResult.origin || [originX, originY, originZ]
			};
		} catch (error) {
			console.error("Error building chunk geometry:", error);
			return { geometries: [], origin: [0, 0, 0] };
		}
	}

	public async getChunkMesh(
		chunkData: {
			blocks: Array<number[]> | Int32Array;
			chunk_x: number;
			chunk_y: number;
			chunk_z: number;
		},
		schematicObject: SchematicObject,
		renderingBounds?: {
			min: THREE.Vector3;
			max: THREE.Vector3;
			enabled?: boolean;
		},
		preFilteredEntities?: any[] // Optimization: entities already filtered by WASM
	): Promise<THREE.Object3D[]> {
		const chunkId = `${chunkData.chunk_x},${chunkData.chunk_y},${chunkData.chunk_z}`;

		if (!this.paletteCache?.isReady) {
			throw new Error(
				"Palette cache not ready. Call precomputePaletteGeometries() first."
			);
		}

		if (chunkData.blocks.length === 0) return [];

		// Filter blocks based on bounds
		let blocksToProcess = chunkData.blocks;
		// Optimization: Skip main-thread filtering if bounds are disabled or cover full chunk
		const skipBoundsCheck = !renderingBounds?.enabled;

		if (!skipBoundsCheck) {
			if (chunkData.blocks instanceof Int32Array) {
				const filtered: number[] = [];
				const blocks = chunkData.blocks;
				for (let i = 0; i < blocks.length; i += 4) {
					const x = blocks[i];
					const y = blocks[i + 1];
					const z = blocks[i + 2];
					if (
						x >= renderingBounds!.min.x &&
						x < renderingBounds!.max.x &&
						y >= renderingBounds!.min.y &&
						y < renderingBounds!.max.y &&
						z >= renderingBounds!.min.z &&
						z < renderingBounds!.max.z
					) {
						filtered.push(x, y, z, blocks[i + 3]);
					}
				}
				blocksToProcess = new Int32Array(filtered);
			} else {
				blocksToProcess = chunkData.blocks.filter((block) => {
					const [x, y, z] = block;
					return (
						x >= renderingBounds!.min.x &&
						x < renderingBounds!.max.x &&
						y >= renderingBounds!.min.y &&
						y < renderingBounds!.max.y &&
						z >= renderingBounds!.min.z &&
						z < renderingBounds!.max.z
					);
				});
			}
		}

		if (blocksToProcess.length === 0) return [];

		// Identify tile entities separately - Optimized
		const tileEntityBlocks: any[] = [];
		// Optimization: Pass all blocks to worker directly. Worker filters invisible blocks.
		const workerBlocks = blocksToProcess;

		// Use cached map from SchematicObject instead of fetching all entities every chunk
		// If preFilteredEntities is provided (WASM optimized path), use that directly

		if (preFilteredEntities) {
			for (const entity of preFilteredEntities) {
				// With WASM getChunkData, we get entity ID but not the full block state string.
				// However, the block at this position determines the visual appearance.
				// We need to query the block state to handle rotation/variants properly.

				// Note: entity.position from getChunkData is [x, y, z]
				const pos = entity.position; // [x, y, z]

				// Bounds checking is already done by WASM, but double check against renderingBounds if needed
				// (WASM getChunkData cuts by chunk, but renderingBounds might be tighter)
				if (renderingBounds?.enabled) {
					if (
						pos[0] < renderingBounds.min.x ||
						pos[0] >= renderingBounds.max.x ||
						pos[1] < renderingBounds.min.y ||
						pos[1] >= renderingBounds.max.y ||
						pos[2] < renderingBounds.min.z ||
						pos[2] >= renderingBounds.max.z
					) {
						continue;
					}
				}

				const blockName = schematicObject.schematicWrapper.get_block(pos[0], pos[1], pos[2]);

				if (blockName && (blockName.includes("sign") || blockName.includes("chest") || blockName.includes("banner"))) {
					tileEntityBlocks.push({
						x: pos[0],
						y: pos[1],
						z: pos[2],
						paletteIndex: -1,
						blockName: blockName,
						nbtData: entity // The entity structure from WASM is compatible enough or we use it as is
					});
				}
			}
		} else {
			// Fallback: JS-side filtering using cached map
			const blockEntityMap = schematicObject.getBlockEntitiesMap();

			// Only scan for entities if map is not empty
			if (blockEntityMap.size > 0) {
				// Iterate ENTITIES instead of blocks (sparse iteration)
				// Find entities that fall within this chunk's bounds
				const chunkMinX = chunkData.chunk_x * this.chunkSize;
				const chunkMinY = chunkData.chunk_y * this.chunkSize;
				const chunkMinZ = chunkData.chunk_z * this.chunkSize;
				const chunkMaxX = chunkMinX + this.chunkSize;
				const chunkMaxY = chunkMinY + this.chunkSize;
				const chunkMaxZ = chunkMinZ + this.chunkSize;

				// NOTE: Iterating the whole map might still be slow if map is huge.
				// But usually tile entities are rare.
				// Optimally we'd have a spatial index for entities, but iteration is O(E) vs O(Blocks)
				for (const [, entity] of blockEntityMap) {
					const pos = entity.position; // [x,y,z]
					if (pos[0] >= chunkMinX && pos[0] < chunkMaxX &&
						pos[1] >= chunkMinY && pos[1] < chunkMaxY &&
						pos[2] >= chunkMinZ && pos[2] < chunkMaxZ) {

						// It's in this chunk. We need the palette index to know block type.
						// We have to look it up or assume we can just re-get it from schematic.
						// But wait, we only need paletteIndex to check if it's a "sign" etc.
						// Let's just query schematic wrapper for this single block type if needed.
						// Actually, 'workerBlocks' has the data.
						// Let's iterate workerBlocks ONLY if we found entities? No, that defeats the purpose.

						// Let's do a quick lookup in the workerBlocks? No, that's O(N).
						// Actually, we can just use schematic.get_block(x,y,z) since it's cached/fast?
						// Or just use the entity data. Entity data usually doesn't have block type.

						// Compromise: Since we stripped the main loop, we can't easily pair blocks with entities.
						// BUT we only need to pair them to call `cubane.getBlockMesh`.
						// `cubane.getBlockMesh` needs the block string (e.g. "minecraft:chest[facing=north]").

						// We can look up the block state from the schematic wrapper for this specific position.
						const blockName = schematicObject.schematicWrapper.get_block(pos[0], pos[1], pos[2]);
						// const paletteIndex = -1; // We don't strictly need index if we have name

						// Check if valid tile entity type
						if (blockName && (blockName.includes("sign") || blockName.includes("chest") || blockName.includes("banner"))) {
							// Emulate the struct expected by tile processing
							tileEntityBlocks.push({
								x: pos[0],
								y: pos[1],
								z: pos[2],
								paletteIndex: -1, // Special flag
								blockName: blockName, // Pass name directly
								nbtData: entity
							});
						}
					}
				}
			}
		}

		// Determine chunk origin
		const originX = chunkData.chunk_x * this.chunkSize;
		const originY = chunkData.chunk_y * this.chunkSize;
		const originZ = chunkData.chunk_z * this.chunkSize;

		const resultMeshes: THREE.Object3D[] = [];

		// Try GPU compute first, then fall back to workers
		let buildResult: { meshes: any[], origin: number[] } | null = null;

		// GPU Compute path
		if (this.useGPUCompute && this.computeMeshBuilder?.isReady) {
			try {
				const gpuResult = await this.computeMeshBuilder.buildChunk(
					workerBlocks as Int32Array,
					[originX, originY, originZ],
					chunkId
				);

				if (gpuResult) {
					buildResult = {
						meshes: gpuResult.geometries,
						origin: gpuResult.origin
					};
				}
			} catch (error) {
				console.warn('[WorldMeshBuilder] GPU compute failed, falling back to workers:', error);
				// Fall through to worker path
			}
		}

		// Worker fallback path
		if (!buildResult) {
			const workerPromise = new Promise<any>(async (resolve, reject) => {
				if (workerBlocks.length === 0) {
					resolve({ meshes: [] });
					return;
				}

				// Ensure workers exist
				if (this.workers.length === 0) {
					this.initializeWorkers();
				}

				// Get a free worker
				const worker = await this.getFreeWorker();

				// Add timeout to prevent hanging
				const timeoutId = setTimeout(() => {
					if (this.pendingRequests.has(chunkId)) {
						const req = this.pendingRequests.get(chunkId);
						this.pendingRequests.delete(chunkId);
						// Release worker even on timeout
						if (req) {
							this.returnWorker(req.worker);
						}
						reject(new Error(`Chunk build timeout for ${chunkId}`));
					}
				}, 30000); // 30 seconds timeout

				this.pendingRequests.set(chunkId, {
					resolve: (data) => {
						clearTimeout(timeoutId);
						// Clean up shared memory buffer if used
						if (this.sharedMemoryPool) {
							this.sharedMemoryPool.releaseBuffers(chunkId);
						}
						resolve(data);
					},
					reject: (err) => {
						clearTimeout(timeoutId);
						// Clean up shared memory buffer if used
						if (this.sharedMemoryPool) {
							this.sharedMemoryPool.releaseBuffers(chunkId);
						}
						reject(err);
					},
					worker: worker
				});

				// Use SharedArrayBuffer for zero-copy transfer if available
				if (this.useSharedMemory && this.sharedMemoryPool && workerBlocks instanceof Int32Array) {
					// Write data to shared memory - worker reads directly, no copy!
					const sharedBuffer = this.sharedMemoryPool.writeChunkInput(
						chunkId,
						workerBlocks,
						originX,
						originY,
						originZ
					);

					worker.postMessage({
						type: "buildChunk",
						chunkId,
						sharedInputBuffer: sharedBuffer,
						chunkOrigin: [originX, originY, originZ]
					});
				} else {
					// Fallback: transfer via postMessage (copies data)
					const transferList: Transferable[] = [];
					if (workerBlocks instanceof Int32Array) {
						transferList.push(workerBlocks.buffer);
					}

					worker.postMessage({
						type: "buildChunk",
						chunkId,
						blocks: workerBlocks,
						chunkOrigin: [originX, originY, originZ]
					}, transferList);
				}
			});

			buildResult = await workerPromise;
		}

		try {
			// Process build result (same for GPU and worker)
			const workerResult = buildResult;

			if (!workerResult) {
				console.warn('[WorldMeshBuilder] No build result available');
				return resultMeshes;
			}

			// Reconstruct meshes from worker buffers
			if (workerResult.meshes) {
				for (const meshData of workerResult.meshes) {
					const geometry = new THREE.BufferGeometry();

					// Handle quantized positions
					// Worker sends Int16Array, we load it as BufferAttribute
					if (meshData.positions) {
						// BufferAttribute(array, itemSize, normalized)
						// Int16Array with normalized=false sends raw integer values to shader, which are cast to float
						const posAttr = new THREE.BufferAttribute(meshData.positions, 3, false);
						geometry.setAttribute("position", posAttr);
					}

					if (meshData.normals) {
						// Int8Array, normalized=true maps [-128, 127] to [-1.0, 1.0]
						const normAttr = new THREE.Int8BufferAttribute(meshData.normals, 3);
						normAttr.normalized = true;
						geometry.setAttribute("normal", normAttr);
					}

					if (meshData.uvs) {
						// Float32Array for UVs to support tiling > 1.0
						const uvAttr = new THREE.BufferAttribute(meshData.uvs, 2);
						geometry.setAttribute("uv", uvAttr);
					}

					if (meshData.indices) {
						geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
					}

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

					// Apply de-quantization scale for position
					// 1.0 / POSITION_SCALE
					const scale = 1.0 / POSITION_SCALE;
					mesh.scale.setScalar(scale);

					// Apply chunk origin offset
					// The worker produces geometry relative to this origin
					if (workerResult.origin) {
						mesh.position.set(
							workerResult.origin[0],
							workerResult.origin[1],
							workerResult.origin[2]
						);
					}

					this.configureMeshForCategory(
						mesh,
						meshData.category as keyof ChunkMeshes
					);
					resultMeshes.push(mesh);
				}
			}

			// Process tile entities (Main Thread)
			if (tileEntityBlocks.length > 0) {
				// const palette = this.paletteCache.palette; // Not needed if we use blockName
				for (const tileBlock of tileEntityBlocks) {
					const { x, y, z, paletteIndex, blockName, nbtData } = tileBlock;

					// If we have direct blockName, use it. Otherwise look up via paletteIndex (legacy path)
					let blockString = "";
					if (blockName) {
						blockString = blockName;
						// Note: We might need properties. get_block returns just name?
						// get_block returns full state string "minecraft:chest[facing=north]" usually? 
						// Actually nucleation get_block returns just name or state?
						// Let's assume we might need to fetch full state if get_block returns only "minecraft:chest"

						// Optimization: If needed, we can assume 'blockName' from the loop above is sufficient
						// or fetch properties if missing.
					} else if (paletteIndex >= 0) {
						const blockState = this.paletteCache.palette[paletteIndex];
						blockString = this.createBlockStringFromPaletteEntry(blockState);
					}

					if (blockString) {
						try {
							// const blockString = this.createBlockStringFromPaletteEntry(blockState);
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
								customMesh.name = `tile_entity_${blockString}_${x}_${y}_${z}`;
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
		// Reject any pending requests before destroying workers
		this.pendingRequests.forEach((request, chunkId) => {
			request.reject(new Error(`Worker terminated before processing chunk ${chunkId}`));
		});
		this.pendingRequests.clear();

		// Clear worker queue
		this.workerQueue = [];

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

		// Dispose GPU compute resources
		if (this.computeMeshBuilder) {
			this.computeMeshBuilder.dispose();
			this.computeMeshBuilder = null;
		}
		this.useGPUCompute = false;
		this.gpuInitPromise = null;

		// Terminate all workers
		this.workers.forEach(w => w.terminate());
		this.workers = [];
		this.freeWorkers = [];

		console.log("[WorldMeshBuilder] Disposed palette cache, GPU compute, and workers.");
	}
}
