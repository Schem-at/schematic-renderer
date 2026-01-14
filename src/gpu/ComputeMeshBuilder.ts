/**
 * ComputeMeshBuilder
 *
 * Uses WebGPU compute shaders to perform geometry merging on the GPU
 * for chunk mesh building. Consolidated buffer layout to fit within
 * WebGPU's 8 storage buffer limit.
 */

import { gpuCapabilityManager, GPUCapabilityManager } from "./GPUCapabilityManager";
import type { ChunkGeometryData, PaletteCache } from "../types";

// Workgroup size for compute shaders
const WORKGROUP_SIZE = 64;

/**
 * GPU buffer structure for palette geometry data
 */
export interface GPUPaletteData {
	// Interleaved vertex data: [px, py, pz, nx, ny, nz, u, v] per vertex
	vertexData: Float32Array;
	// Indices for all palette entries
	indices: Uint32Array;
	// Per-palette entry metadata: [vertexOffset, vertexCount, indexOffset, indexCount, occlusionFlags, category, pad, pad]
	metadata: Uint32Array;

	totalVertices: number;
	totalIndices: number;
	paletteCount: number;
}

/**
 * Result from GPU compute mesh building
 */
export interface GPUChunkResult {
	geometries: ChunkGeometryData[];
	origin: [number, number, number];
}

export class ComputeMeshBuilder {
	private gpuManager: GPUCapabilityManager;
	private initialized: boolean = false;

	// GPU buffers for palette data (uploaded once, reused)
	private paletteVertexBuffer: GPUBuffer | null = null;
	private paletteIndicesBuffer: GPUBuffer | null = null;
	private paletteMetadataBuffer: GPUBuffer | null = null;

	// Cached palette info
	private paletteData: GPUPaletteData | null = null;

	// Compute pipeline and bind group layout
	private computePipeline: GPUComputePipeline | null = null;
	private bindGroupLayout: GPUBindGroupLayout | null = null;

	constructor() {
		this.gpuManager = gpuCapabilityManager;
	}

	/**
	 * Initialize the compute mesh builder
	 */
	public async initialize(): Promise<boolean> {
		if (this.initialized) return true;

		const success = await this.gpuManager.initialize();
		if (!success) {
			console.warn("[ComputeMeshBuilder] Failed to initialize GPU");
			return false;
		}

		// Create compute pipeline
		await this.createComputePipeline();

		this.initialized = true;
		console.log("[ComputeMeshBuilder] Initialized successfully");
		return true;
	}

	/**
	 * Create the WGSL compute shader pipeline
	 * Consolidated to use only 7 storage buffers + 1 uniform buffer
	 */
	private async createComputePipeline(): Promise<void> {
		const device = this.gpuManager.device;
		if (!device) return;

		// Create bind group layout - consolidated to fit within 8 storage buffer limit
		this.bindGroupLayout = device.createBindGroupLayout({
			label: "ComputeMeshBuilder BindGroupLayout",
			entries: [
				// Binding 0: Block data input [x, y, z, paletteIndex] per block
				{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
				// Binding 1: Voxel occupancy map (3D grid)
				{ binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
				// Binding 2: Palette vertex data (interleaved pos/norm/uv)
				{ binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
				// Binding 3: Palette indices
				{ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
				// Binding 4: Palette metadata
				{ binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
				// Binding 5: Output geometry (interleaved)
				{ binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
				// Binding 6: Output indices
				{ binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
				// Binding 7: Atomic counters [vertexCount, indexCount]
				{ binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
				// Binding 8: Uniforms (not a storage buffer)
				{ binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
			],
		});

		// WGSL Compute Shader for mesh building
		const shaderModule = device.createShaderModule({
			label: "ComputeMeshBuilder Shader",
			code: this.getComputeShaderCode(),
		});

		const pipelineLayout = device.createPipelineLayout({
			label: "ComputeMeshBuilder PipelineLayout",
			bindGroupLayouts: [this.bindGroupLayout],
		});

		this.computePipeline = device.createComputePipeline({
			label: "ComputeMeshBuilder Pipeline",
			layout: pipelineLayout,
			compute: {
				module: shaderModule,
				entryPoint: "main",
			},
		});
	}

	/**
	 * WGSL compute shader code - simplified and consolidated
	 */
	private getComputeShaderCode(): string {
		return /* wgsl */ `
			// Constants
			const POSITION_SCALE: f32 = 1024.0;
			const NORMAL_SCALE: f32 = 127.0;
			const WORKGROUP_SIZE: u32 = ${WORKGROUP_SIZE}u;

			// Block data: [x, y, z, paletteIndex]
			@group(0) @binding(0) var<storage, read> blockData: array<vec4<i32>>;
			
			// Voxel occupancy map: stores paletteIndex + 1 (0 = empty)
			@group(0) @binding(1) var<storage, read_write> voxelMap: array<i32>;
			
			// Palette vertex data: interleaved [px, py, pz, nx, ny, nz, u, v] per vertex
			@group(0) @binding(2) var<storage, read> paletteVertexData: array<f32>;
			
			// Palette indices
			@group(0) @binding(3) var<storage, read> paletteIndices: array<u32>;
			
			// Palette metadata: [vertexOffset, vertexCount, indexOffset, indexCount, occlusionFlags, category, pad, pad]
			@group(0) @binding(4) var<storage, read> paletteMetadata: array<u32>;
			
			// Output geometry: interleaved [px(i16), py(i16), pz(i16), nx(i8), ny(i8), nz(i8), pad, u(f32), v(f32)]
			// Stored as array of i32 for simplicity
			@group(0) @binding(5) var<storage, read_write> outputGeometry: array<i32>;
			
			// Output indices
			@group(0) @binding(6) var<storage, read_write> outputIndices: array<u32>;
			
			// Atomic counters: [vertexCount, indexCount]
			@group(0) @binding(7) var<storage, read_write> counters: array<atomic<u32>>;
			
			// Uniforms
			struct Uniforms {
				originX: i32,
				originY: i32,
				originZ: i32,
				blockCount: u32,
				voxelSizeX: u32,
				voxelSizeY: u32,
				voxelSizeZ: u32,
				minX: i32,
				minY: i32,
				minZ: i32,
			}
			@group(0) @binding(8) var<uniform> uniforms: Uniforms;

			// Get voxel map index
			fn getVoxelIndex(x: i32, y: i32, z: i32) -> u32 {
				let lx = x - uniforms.minX + 1;
				let ly = y - uniforms.minY + 1;
				let lz = z - uniforms.minZ + 1;
				let strideY = uniforms.voxelSizeX + 2u;
				let strideZ = strideY * (uniforms.voxelSizeY + 2u);
				return u32(lx) + u32(ly) * strideY + u32(lz) * strideZ;
			}

			// Check if neighbor occludes this face
			fn isNeighborOccluding(x: i32, y: i32, z: i32, faceIdx: u32) -> bool {
				let idx = getVoxelIndex(x, y, z);
				let val = voxelMap[idx];
				if (val <= 0) {
					return false;
				}
				let neighborPaletteIdx = u32(val - 1);
				// Metadata stride is 8 u32s per entry
				let occlusionFlags = paletteMetadata[neighborPaletteIdx * 8u + 4u];
				return (occlusionFlags & (1u << faceIdx)) != 0u;
			}

			// Get face direction index from normal
			fn getFaceIndex(nx: f32, ny: f32, nz: f32) -> u32 {
				let dx = i32(round(nx));
				let dy = i32(round(ny));
				let dz = i32(round(nz));
				
				if (dx == 1) { return 1u; }      // East
				if (dx == -1) { return 0u; }     // West
				if (dy == 1) { return 3u; }      // Up
				if (dy == -1) { return 2u; }     // Down
				if (dz == 1) { return 5u; }      // South
				if (dz == -1) { return 4u; }     // North
				return 6u; // Invalid
			}

			// Check if triangle face is flush with block boundary
			fn isFaceFlush(pos: f32, dir: i32) -> bool {
				let epsilon = 0.01;
				if (dir == 1) { return abs(pos - 1.0) < epsilon || abs(pos - 0.5) < epsilon; }
				if (dir == -1) { return abs(pos - 0.0) < epsilon || abs(pos + 0.5) < epsilon; }
				return false;
			}

			@compute @workgroup_size(WORKGROUP_SIZE)
			fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
				let blockIdx = globalId.x;
				if (blockIdx >= uniforms.blockCount) {
					return;
				}

				let block = blockData[blockIdx];
				let bx = block.x;
				let by = block.y;
				let bz = block.z;
				let paletteIdx = u32(block.w);

				// Get palette geometry metadata (8 u32s per entry)
				let metaBase = paletteIdx * 8u;
				let vertexOffset = paletteMetadata[metaBase + 0u];
				let vertexCount = paletteMetadata[metaBase + 1u];
				let indexOffset = paletteMetadata[metaBase + 2u];
				let indexCount = paletteMetadata[metaBase + 3u];

				if (vertexCount == 0u || indexCount == 0u) {
					return;
				}

				// Process triangles with culling
				let triCount = indexCount / 3u;
				for (var tri = 0u; tri < triCount; tri = tri + 1u) {
					let i0 = paletteIndices[indexOffset + tri * 3u];
					let i1 = paletteIndices[indexOffset + tri * 3u + 1u];
					let i2 = paletteIndices[indexOffset + tri * 3u + 2u];

					// Get normal from first vertex (interleaved: offset 3,4,5 are nx,ny,nz)
					let v0Base = (vertexOffset + i0) * 8u;
					let nx = paletteVertexData[v0Base + 3u];
					let ny = paletteVertexData[v0Base + 4u];
					let nz = paletteVertexData[v0Base + 5u];

					var isVisible = true;

					// Check if axis-aligned face
					let dx = i32(round(nx));
					let dy = i32(round(ny));
					let dz = i32(round(nz));
					
					if (abs(dx) + abs(dy) + abs(dz) == 1) {
						// Get first vertex position to check if flush
						let v0x = paletteVertexData[v0Base + 0u];
						let v0y = paletteVertexData[v0Base + 1u];
						let v0z = paletteVertexData[v0Base + 2u];

						var isFlush = false;
						if (dx != 0) { isFlush = isFaceFlush(v0x, dx); }
						else if (dy != 0) { isFlush = isFaceFlush(v0y, dy); }
						else if (dz != 0) { isFlush = isFaceFlush(v0z, dz); }

						if (isFlush) {
							let faceIdx = getFaceIndex(nx, ny, nz);
							if (faceIdx < 6u) {
								// Check neighbor
								let neighborX = bx + dx;
								let neighborY = by + dy;
								let neighborZ = bz + dz;
								
								// Opposite face index
								var oppositeFaceIdx = faceIdx;
								if (faceIdx == 0u) { oppositeFaceIdx = 1u; }
								else if (faceIdx == 1u) { oppositeFaceIdx = 0u; }
								else if (faceIdx == 2u) { oppositeFaceIdx = 3u; }
								else if (faceIdx == 3u) { oppositeFaceIdx = 2u; }
								else if (faceIdx == 4u) { oppositeFaceIdx = 5u; }
								else if (faceIdx == 5u) { oppositeFaceIdx = 4u; }
								
								if (isNeighborOccluding(neighborX, neighborY, neighborZ, oppositeFaceIdx)) {
									isVisible = false;
								}
							}
						}
					}

					if (isVisible) {
						// Allocate output space atomically
						let outVertBase = atomicAdd(&counters[0], 3u);
						let outIdxBase = atomicAdd(&counters[1], 3u);

						// Copy triangle vertices
						for (var v = 0u; v < 3u; v = v + 1u) {
							var localIdx: u32;
							if (v == 0u) { localIdx = i0; }
							else if (v == 1u) { localIdx = i1; }
							else { localIdx = i2; }

							let srcBase = (vertexOffset + localIdx) * 8u;
							let dstIdx = outVertBase + v;

							// Read source vertex data (interleaved)
							let px = paletteVertexData[srcBase + 0u];
							let py = paletteVertexData[srcBase + 1u];
							let pz = paletteVertexData[srcBase + 2u];
							let pnx = paletteVertexData[srcBase + 3u];
							let pny = paletteVertexData[srcBase + 4u];
							let pnz = paletteVertexData[srcBase + 5u];
							let pu = paletteVertexData[srcBase + 6u];
							let pv = paletteVertexData[srcBase + 7u];
							
							// Position (relative to chunk origin, quantized)
							let rx = (f32(bx - uniforms.originX) + px) * POSITION_SCALE;
							let ry = (f32(by - uniforms.originY) + py) * POSITION_SCALE;
							let rz = (f32(bz - uniforms.originZ) + pz) * POSITION_SCALE;
							
							// Output: 5 i32s per vertex [posX, posY, posZ, packedNormal, uvPacked1, uvPacked2]
							// We'll store as 6 values for simplicity
							let outBase = dstIdx * 6u;
							outputGeometry[outBase + 0u] = i32(rx);
							outputGeometry[outBase + 1u] = i32(ry);
							outputGeometry[outBase + 2u] = i32(rz);
							// Pack normals into one i32: nx in bits 0-7, ny in 8-15, nz in 16-23
							let inx = i32(pnx * NORMAL_SCALE);
							let iny = i32(pny * NORMAL_SCALE);
							let inz = i32(pnz * NORMAL_SCALE);
							outputGeometry[outBase + 3u] = (inx & 0xFF) | ((iny & 0xFF) << 8) | ((inz & 0xFF) << 16);
							// Store UVs as bit-cast floats
							outputGeometry[outBase + 4u] = bitcast<i32>(pu);
							outputGeometry[outBase + 5u] = bitcast<i32>(pv);
						}

						// Output indices
						outputIndices[outIdxBase] = outVertBase;
						outputIndices[outIdxBase + 1u] = outVertBase + 1u;
						outputIndices[outIdxBase + 2u] = outVertBase + 2u;
					}
				}
			}
		`;
	}

	/**
	 * Upload palette geometry data to GPU
	 */
	public async uploadPaletteData(paletteCache: PaletteCache): Promise<void> {
		if (!this.initialized) {
			console.warn("[ComputeMeshBuilder] Not initialized, cannot upload palette");
			return;
		}

		const device = this.gpuManager.device;
		if (!device) return;

		console.log("[ComputeMeshBuilder] Uploading palette data to GPU...");
		const startTime = performance.now();

		// Convert palette cache to GPU-compatible format
		this.paletteData = this.buildGPUPaletteData(paletteCache);

		// Create GPU buffers
		this.paletteVertexBuffer = this.gpuManager.createStorageBuffer(
			this.paletteData.vertexData,
			"palette-vertex-data"
		);

		this.paletteIndicesBuffer = this.gpuManager.createStorageBuffer(
			this.paletteData.indices,
			"palette-indices"
		);

		this.paletteMetadataBuffer = this.gpuManager.createStorageBuffer(
			this.paletteData.metadata,
			"palette-metadata"
		);

		const duration = performance.now() - startTime;
		console.log(`[ComputeMeshBuilder] Palette uploaded to GPU in ${duration.toFixed(2)}ms`);
		console.log(
			`[ComputeMeshBuilder] ${this.paletteData.paletteCount} palette entries, ${this.paletteData.totalVertices} vertices, ${this.paletteData.totalIndices} indices`
		);
	}

	/**
	 * Convert PaletteCache to GPU-compatible interleaved format
	 */
	private buildGPUPaletteData(paletteCache: PaletteCache): GPUPaletteData {
		const blockData = paletteCache.blockData;

		// First pass: calculate total sizes
		let totalVertices = 0;
		let totalIndices = 0;

		for (const block of blockData) {
			if (!block) continue;
			for (const group of block.materialGroups) {
				const geo = group.baseGeometry;
				if (geo && geo.attributes.position) {
					totalVertices += geo.attributes.position.count;
					totalIndices += geo.index ? geo.index.count : geo.attributes.position.count;
				}
			}
		}

		// Allocate arrays - interleaved vertex data: 8 floats per vertex
		const vertexData = new Float32Array(totalVertices * 8);
		const indices = new Uint32Array(totalIndices);
		// 8 u32s per palette entry
		const metadata = new Uint32Array(blockData.length * 8);

		let vertexOffset = 0;
		let indexOffset = 0;

		// Second pass: copy data
		for (let i = 0; i < blockData.length; i++) {
			const block = blockData[i];
			if (!block) {
				// Empty entry
				for (let j = 0; j < 8; j++) {
					metadata[i * 8 + j] = 0;
				}
				continue;
			}

			const startVertex = vertexOffset;
			const startIndex = indexOffset;
			let blockVertexCount = 0;
			let blockIndexCount = 0;

			for (const group of block.materialGroups) {
				const geo = group.baseGeometry;
				if (!geo || !geo.attributes.position) continue;

				const posAttr = geo.attributes.position;
				const normAttr = geo.attributes.normal;
				const uvAttr = geo.attributes.uv;
				const indexAttr = geo.index;

				const vCount = posAttr.count;
				const iCount = indexAttr ? indexAttr.count : vCount;

				// Copy interleaved vertex data
				for (let v = 0; v < vCount; v++) {
					const outBase = (vertexOffset + v) * 8;

					// Position
					vertexData[outBase + 0] = (posAttr.array as Float32Array)[v * 3 + 0];
					vertexData[outBase + 1] = (posAttr.array as Float32Array)[v * 3 + 1];
					vertexData[outBase + 2] = (posAttr.array as Float32Array)[v * 3 + 2];

					// Normal
					if (normAttr) {
						vertexData[outBase + 3] = (normAttr.array as Float32Array)[v * 3 + 0];
						vertexData[outBase + 4] = (normAttr.array as Float32Array)[v * 3 + 1];
						vertexData[outBase + 5] = (normAttr.array as Float32Array)[v * 3 + 2];
					} else {
						vertexData[outBase + 3] = 0;
						vertexData[outBase + 4] = 1;
						vertexData[outBase + 5] = 0;
					}

					// UV
					if (uvAttr) {
						vertexData[outBase + 6] = (uvAttr.array as Float32Array)[v * 2 + 0];
						vertexData[outBase + 7] = (uvAttr.array as Float32Array)[v * 2 + 1];
					} else {
						vertexData[outBase + 6] = 0;
						vertexData[outBase + 7] = 0;
					}
				}

				// Copy indices (offset by current vertex position within this block)
				if (indexAttr) {
					const idxArray = indexAttr.array;
					for (let j = 0; j < idxArray.length; j++) {
						indices[indexOffset + j] = idxArray[j] + blockVertexCount;
					}
				} else {
					// Generate sequential indices
					for (let j = 0; j < vCount; j++) {
						indices[indexOffset + j] = blockVertexCount + j;
					}
				}

				vertexOffset += vCount;
				indexOffset += iCount;
				blockVertexCount += vCount;
				blockIndexCount += iCount;
			}

			// Store metadata (8 u32s per entry)
			metadata[i * 8 + 0] = startVertex;
			metadata[i * 8 + 1] = blockVertexCount;
			metadata[i * 8 + 2] = startIndex;
			metadata[i * 8 + 3] = blockIndexCount;
			metadata[i * 8 + 4] = 0; // occlusionFlags - will be set from palette
			metadata[i * 8 + 5] = this.categoryToNumber(block.category);
			metadata[i * 8 + 6] = 0; // reserved
			metadata[i * 8 + 7] = 0; // reserved
		}

		return {
			vertexData,
			indices,
			metadata,
			totalVertices,
			totalIndices,
			paletteCount: blockData.length,
		};
	}

	private categoryToNumber(category: string): number {
		switch (category) {
			case "solid":
				return 0;
			case "transparent":
				return 1;
			case "water":
				return 2;
			case "emissive":
				return 3;
			case "redstone":
				return 4;
			default:
				return 0;
		}
	}

	/**
	 * Build chunk mesh using GPU compute
	 */
	public async buildChunk(
		blocks: Int32Array | number[][],
		chunkOrigin: [number, number, number],
		_chunkId: string
	): Promise<GPUChunkResult | null> {
		if (!this.initialized || !this.computePipeline || !this.paletteData) {
			console.warn("[ComputeMeshBuilder] Not ready to build chunk");
			return null;
		}

		const device = this.gpuManager.device;
		if (!device) return null;

		// Convert blocks to Int32Array if needed
		let blockArray: Int32Array;
		if (blocks instanceof Int32Array) {
			blockArray = blocks;
		} else {
			blockArray = new Int32Array(blocks.length * 4);
			for (let i = 0; i < blocks.length; i++) {
				blockArray[i * 4] = blocks[i][0];
				blockArray[i * 4 + 1] = blocks[i][1];
				blockArray[i * 4 + 2] = blocks[i][2];
				blockArray[i * 4 + 3] = blocks[i][3];
			}
		}

		const blockCount = blockArray.length / 4;
		if (blockCount === 0) {
			return { geometries: [], origin: chunkOrigin };
		}

		// Calculate bounds
		let minX = Infinity,
			minY = Infinity,
			minZ = Infinity;
		let maxX = -Infinity,
			maxY = -Infinity,
			maxZ = -Infinity;

		for (let i = 0; i < blockArray.length; i += 4) {
			const x = blockArray[i];
			const y = blockArray[i + 1];
			const z = blockArray[i + 2];
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			minZ = Math.min(minZ, z);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
			maxZ = Math.max(maxZ, z);
		}

		const sizeX = maxX - minX + 1;
		const sizeY = maxY - minY + 1;
		const sizeZ = maxZ - minZ + 1;

		// Create voxel map (with padding)
		const pad = 1;
		const voxelMapSize = (sizeX + 2 * pad) * (sizeY + 2 * pad) * (sizeZ + 2 * pad);
		const voxelMap = new Int32Array(voxelMapSize);

		// Populate voxel map
		const strideY = sizeX + 2 * pad;
		const strideZ = strideY * (sizeY + 2 * pad);

		for (let i = 0; i < blockArray.length; i += 4) {
			const x = blockArray[i] - minX + pad;
			const y = blockArray[i + 1] - minY + pad;
			const z = blockArray[i + 2] - minZ + pad;
			const paletteIdx = blockArray[i + 3];
			voxelMap[x + y * strideY + z * strideZ] = paletteIdx + 1;
		}

		// Estimate max output size (worst case: all triangles visible)
		const maxVertices = blockCount * 500; // Rough estimate
		const maxIndices = maxVertices;

		// Create GPU buffers
		const blockBuffer = this.gpuManager.createStorageBuffer(blockArray, "block-data");
		const voxelBuffer = this.gpuManager.createStorageBuffer(voxelMap, "voxel-map");

		// Output geometry buffer: 6 i32s per vertex
		const outGeometryBuffer = device.createBuffer({
			size: maxVertices * 6 * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
			label: "output-geometry",
		});

		const outIndicesBuffer = device.createBuffer({
			size: maxIndices * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
			label: "output-indices",
		});

		const countersBuffer = device.createBuffer({
			size: 8, // 2 x u32
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
			label: "counters",
		});

		// Initialize counters to 0
		device.queue.writeBuffer(countersBuffer, 0, new Uint32Array([0, 0]));

		// Create uniforms
		const uniforms = new Int32Array([
			chunkOrigin[0],
			chunkOrigin[1],
			chunkOrigin[2],
			blockCount,
			sizeX,
			sizeY,
			sizeZ,
			minX,
			minY,
			minZ,
		]);
		const uniformBuffer = device.createBuffer({
			size: 48, // 12 x i32, padded to 16-byte alignment
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			label: "uniforms",
		});
		device.queue.writeBuffer(uniformBuffer, 0, uniforms);

		// Create bind group
		const bindGroup = device.createBindGroup({
			layout: this.bindGroupLayout!,
			entries: [
				{ binding: 0, resource: { buffer: blockBuffer! } },
				{ binding: 1, resource: { buffer: voxelBuffer! } },
				{ binding: 2, resource: { buffer: this.paletteVertexBuffer! } },
				{ binding: 3, resource: { buffer: this.paletteIndicesBuffer! } },
				{ binding: 4, resource: { buffer: this.paletteMetadataBuffer! } },
				{ binding: 5, resource: { buffer: outGeometryBuffer } },
				{ binding: 6, resource: { buffer: outIndicesBuffer } },
				{ binding: 7, resource: { buffer: countersBuffer } },
				{ binding: 8, resource: { buffer: uniformBuffer } },
			],
		});

		// Dispatch compute
		const commandEncoder = device.createCommandEncoder();
		const computePass = commandEncoder.beginComputePass();
		computePass.setPipeline(this.computePipeline);
		computePass.setBindGroup(0, bindGroup);

		const workgroupCount = Math.ceil(blockCount / WORKGROUP_SIZE);
		computePass.dispatchWorkgroups(workgroupCount);
		computePass.end();

		device.queue.submit([commandEncoder.finish()]);

		// Read back counters to know actual output size
		const countersData = await this.gpuManager.readBuffer(countersBuffer, 8);
		const counters = new Uint32Array(countersData);
		const vertexCount = counters[0];
		const indexCount = counters[1];

		let result: GPUChunkResult;

		if (vertexCount > 0 && indexCount > 0) {
			// Read back output data
			const geometryData = await this.gpuManager.readBuffer(outGeometryBuffer, vertexCount * 6 * 4);
			const indicesData = await this.gpuManager.readBuffer(outIndicesBuffer, indexCount * 4);

			// Convert interleaved output to separate arrays
			const geoI32 = new Int32Array(geometryData);

			const positions = new Int16Array(vertexCount * 3);
			const normals = new Int8Array(vertexCount * 3);
			const uvs = new Float32Array(vertexCount * 2);

			for (let i = 0; i < vertexCount; i++) {
				const srcBase = i * 6;

				// Position
				positions[i * 3 + 0] = geoI32[srcBase + 0];
				positions[i * 3 + 1] = geoI32[srcBase + 1];
				positions[i * 3 + 2] = geoI32[srcBase + 2];

				// Unpack normals
				const packedNorm = geoI32[srcBase + 3];
				normals[i * 3 + 0] = packedNorm & 0xff;
				normals[i * 3 + 1] = (packedNorm >> 8) & 0xff;
				normals[i * 3 + 2] = (packedNorm >> 16) & 0xff;

				// UVs (bit-cast back to float)
				const uvView = new DataView(geometryData, (srcBase + 4) * 4, 8);
				uvs[i * 2 + 0] = uvView.getFloat32(0, true);
				uvs[i * 2 + 1] = uvView.getFloat32(4, true);
			}

			const indices =
				vertexCount > 65535
					? new Uint32Array(indicesData)
					: new Uint16Array(new Uint32Array(indicesData));

			result = {
				geometries: [
					{
						category: "solid",
						positions,
						normals,
						uvs,
						indices,
						groups: [{ start: 0, count: indexCount, materialIndex: 0 }],
					},
				],
				origin: chunkOrigin,
			};
		} else {
			result = { geometries: [], origin: chunkOrigin };
		}

		// Cleanup temporary buffers
		blockBuffer?.destroy();
		voxelBuffer?.destroy();
		outGeometryBuffer.destroy();
		outIndicesBuffer.destroy();
		countersBuffer.destroy();
		uniformBuffer.destroy();

		return result;
	}

	/**
	 * Check if the builder is ready
	 */
	public get isReady(): boolean {
		return this.initialized && this.paletteData !== null;
	}

	/**
	 * Dispose GPU resources
	 */
	public dispose(): void {
		this.paletteVertexBuffer?.destroy();
		this.paletteIndicesBuffer?.destroy();
		this.paletteMetadataBuffer?.destroy();

		this.paletteData = null;
		this.initialized = false;

		console.log("[ComputeMeshBuilder] Disposed");
	}
}
