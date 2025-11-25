/**
 * GPU Compute Module
 * 
 * WebGPU-based compute shaders for accelerated mesh building.
 * Falls back to Web Workers when WebGPU is not available.
 */

export { GPUCapabilityManager, gpuCapabilityManager } from './GPUCapabilityManager';
export type { GPUCapabilities } from './GPUCapabilityManager';

export { ComputeMeshBuilder } from './ComputeMeshBuilder';
export type { GPUPaletteData, GPUChunkResult } from './ComputeMeshBuilder';

export {
	ChunkComputePipeline,
	getChunkComputePipeline,
	disposeChunkComputePipeline
} from './ChunkComputePipeline';
export type {
	ChunkBuildRequest,
	ChunkBuildResult,
	GPUComputeStats
} from './ChunkComputePipeline';

export { GPUMeshFactory } from './GPUMeshFactory';
export type { GPUMeshOptions } from './GPUMeshFactory';
