/**
 * ChunkComputePipeline
 * 
 * High-level orchestration for GPU compute-based chunk mesh building.
 * Manages the compute passes (occupancy map + geometry merge) and
 * provides a clean interface for the WorldMeshBuilder.
 */

import * as THREE from 'three';
import { ComputeMeshBuilder } from './ComputeMeshBuilder';
import type { ChunkGeometryData, PaletteCache } from '../types';

// Constants matching worker output format
const POSITION_SCALE = 1024;

/**
 * Convert Int8 normals to Float32 for WebGPU compatibility.
 * WebGPU requires vertex buffer strides to be multiples of 4 bytes.
 */
function convertInt8NormalsToFloat32(int8Normals: Int8Array): Float32Array {
	const float32Normals = new Float32Array(int8Normals.length);
	for (let i = 0; i < int8Normals.length; i++) {
		float32Normals[i] = int8Normals[i] / 127.0;
	}
	return float32Normals;
}

export interface ChunkBuildRequest {
	chunkId: string;
	blocks: Int32Array | number[][];
	chunkX: number;
	chunkY: number;
	chunkZ: number;
	chunkSize: number;
}

export interface ChunkBuildResult {
	geometries: ChunkGeometryData[];
	origin: [number, number, number];
	buildTimeMs: number;
}

/**
 * Statistics for GPU compute performance
 */
export interface GPUComputeStats {
	totalChunksBuilt: number;
	totalBuildTimeMs: number;
	averageBuildTimeMs: number;
	lastBuildTimeMs: number;
	gpuMemoryUsed: number;
}

export class ChunkComputePipeline {
	private computeMeshBuilder: ComputeMeshBuilder;
	private initialized: boolean = false;
	private paletteUploaded: boolean = false;

	// Statistics
	private stats: GPUComputeStats = {
		totalChunksBuilt: 0,
		totalBuildTimeMs: 0,
		averageBuildTimeMs: 0,
		lastBuildTimeMs: 0,
		gpuMemoryUsed: 0,
	};

	// Pending builds queue for batching
	private pendingBuilds: Map<string, {
		request: ChunkBuildRequest;
		resolve: (result: ChunkBuildResult) => void;
		reject: (error: Error) => void;
	}> = new Map();

	// Build in progress flag
	private buildingChunks: boolean = false;

	constructor() {
		this.computeMeshBuilder = new ComputeMeshBuilder();
	}

	/**
	 * Initialize the compute pipeline
	 */
	public async initialize(): Promise<boolean> {
		if (this.initialized) return true;

		const success = await this.computeMeshBuilder.initialize();
		if (!success) {
			console.warn('[ChunkComputePipeline] Failed to initialize compute mesh builder');
			return false;
		}

		this.initialized = true;
		console.log('[ChunkComputePipeline] Initialized successfully');
		return true;
	}

	/**
	 * Upload palette data to GPU
	 */
	public async uploadPalette(paletteCache: PaletteCache): Promise<void> {
		if (!this.initialized) {
			throw new Error('[ChunkComputePipeline] Not initialized');
		}

		await this.computeMeshBuilder.uploadPaletteData(paletteCache);
		this.paletteUploaded = true;
	}

	/**
	 * Build a single chunk using GPU compute
	 */
	public async buildChunk(request: ChunkBuildRequest): Promise<ChunkBuildResult> {
		if (!this.initialized || !this.paletteUploaded) {
			throw new Error('[ChunkComputePipeline] Not ready - initialize and upload palette first');
		}

		const startTime = performance.now();

		const origin: [number, number, number] = [
			request.chunkX * request.chunkSize,
			request.chunkY * request.chunkSize,
			request.chunkZ * request.chunkSize
		];

		const gpuResult = await this.computeMeshBuilder.buildChunk(
			request.blocks,
			origin,
			request.chunkId
		);

		const buildTime = performance.now() - startTime;

		// Update stats
		this.stats.totalChunksBuilt++;
		this.stats.totalBuildTimeMs += buildTime;
		this.stats.averageBuildTimeMs = this.stats.totalBuildTimeMs / this.stats.totalChunksBuilt;
		this.stats.lastBuildTimeMs = buildTime;

		if (!gpuResult) {
			return {
				geometries: [],
				origin,
				buildTimeMs: buildTime
			};
		}

		return {
			geometries: gpuResult.geometries,
			origin: gpuResult.origin,
			buildTimeMs: buildTime
		};
	}

	/**
	 * Queue a chunk for building (for potential batching)
	 */
	public queueChunkBuild(request: ChunkBuildRequest): Promise<ChunkBuildResult> {
		return new Promise((resolve, reject) => {
			this.pendingBuilds.set(request.chunkId, { request, resolve, reject });

			// Process immediately if not already building
			if (!this.buildingChunks) {
				this.processQueue();
			}
		});
	}

	/**
	 * Process queued chunk builds
	 */
	private async processQueue(): Promise<void> {
		if (this.buildingChunks || this.pendingBuilds.size === 0) {
			return;
		}

		this.buildingChunks = true;

		try {
			// Process all pending builds
			const builds = Array.from(this.pendingBuilds.entries());
			this.pendingBuilds.clear();

			for (const [_chunkId, { request, resolve, reject }] of builds) {
				try {
					const result = await this.buildChunk(request);
					resolve(result);
				} catch (error) {
					reject(error as Error);
				}
			}
		} finally {
			this.buildingChunks = false;

			// Check if more builds were queued while processing
			if (this.pendingBuilds.size > 0) {
				this.processQueue();
			}
		}
	}

	/**
	 * Create THREE.js mesh objects from GPU compute result
	 */
	public createMeshesFromResult(
		result: ChunkBuildResult,
		globalMaterials: THREE.Material[]
	): THREE.Object3D[] {
		const meshes: THREE.Object3D[] = [];

		for (const geoData of result.geometries) {
			const geometry = new THREE.BufferGeometry();

			// Handle quantized positions
			if (geoData.positions) {
				const posAttr = new THREE.BufferAttribute(geoData.positions, 3, false);
				geometry.setAttribute("position", posAttr);
			}

			if (geoData.normals) {
				// Convert Int8 to Float32 for WebGPU compatibility
				const float32Normals = convertInt8NormalsToFloat32(geoData.normals as Int8Array);
				const normAttr = new THREE.BufferAttribute(float32Normals, 3);
				geometry.setAttribute("normal", normAttr);
			}

			if (geoData.uvs) {
				const uvAttr = new THREE.BufferAttribute(geoData.uvs, 2);
				geometry.setAttribute("uv", uvAttr);
			}

			if (geoData.indices) {
				geometry.setIndex(new THREE.BufferAttribute(geoData.indices, 1));
			}

			// Add material groups
			if (geoData.groups) {
				for (const group of geoData.groups) {
					geometry.addGroup(group.start, group.count, group.materialIndex);
				}
			}

			const mesh = new THREE.Mesh(geometry, globalMaterials);
			mesh.name = `${geoData.category}_chunk_gpu`;

			// Apply de-quantization scale
			const scale = 1.0 / POSITION_SCALE;
			mesh.scale.setScalar(scale);

			// Apply chunk origin offset
			mesh.position.set(result.origin[0], result.origin[1], result.origin[2]);

			// Configure rendering properties based on category
			this.configureMeshForCategory(mesh, geoData.category);

			meshes.push(mesh);
		}

		return meshes;
	}

	/**
	 * Configure mesh properties based on block category
	 */
	private configureMeshForCategory(mesh: THREE.Mesh, category: string): void {
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.frustumCulled = true;

		const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

		materials.forEach((mat) => {
			if (!(mat instanceof THREE.Material)) return;

			switch (category) {
				case 'water':
					mesh.renderOrder = 3;
					mat.transparent = true;
					if ('opacity' in mat) (mat as any).opacity = 0.8;
					break;
				case 'transparent':
					mesh.renderOrder = 2;
					mat.transparent = true;
					break;
				case 'emissive':
					mesh.renderOrder = 1;
					break;
				case 'redstone':
					mesh.userData.isDynamic = true;
					break;
			}
		});
	}

	/**
	 * Get pipeline statistics
	 */
	public getStats(): GPUComputeStats {
		return { ...this.stats };
	}

	/**
	 * Reset statistics
	 */
	public resetStats(): void {
		this.stats = {
			totalChunksBuilt: 0,
			totalBuildTimeMs: 0,
			averageBuildTimeMs: 0,
			lastBuildTimeMs: 0,
			gpuMemoryUsed: 0,
		};
	}

	/**
	 * Check if the pipeline is ready
	 */
	public get isReady(): boolean {
		return this.initialized && this.paletteUploaded && this.computeMeshBuilder.isReady;
	}

	/**
	 * Dispose GPU resources
	 */
	public dispose(): void {
		// Reject any pending builds
		this.pendingBuilds.forEach(({ reject }) => {
			reject(new Error('Pipeline disposed'));
		});
		this.pendingBuilds.clear();

		this.computeMeshBuilder.dispose();
		this.initialized = false;
		this.paletteUploaded = false;

		console.log('[ChunkComputePipeline] Disposed');
	}
}

// Export singleton factory
let pipelineInstance: ChunkComputePipeline | null = null;

export function getChunkComputePipeline(): ChunkComputePipeline {
	if (!pipelineInstance) {
		pipelineInstance = new ChunkComputePipeline();
	}
	return pipelineInstance;
}

export function disposeChunkComputePipeline(): void {
	if (pipelineInstance) {
		pipelineInstance.dispose();
		pipelineInstance = null;
	}
}
