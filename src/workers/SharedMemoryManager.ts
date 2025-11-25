/**
 * SharedMemoryManager
 * 
 * Manages SharedArrayBuffer pools for zero-copy communication between
 * the main thread and Web Workers. Falls back to regular ArrayBuffers
 * if SharedArrayBuffer is not available.
 */

// Check if SharedArrayBuffer is available
// Requires: Cross-Origin-Opener-Policy: same-origin
// Requires: Cross-Origin-Embedder-Policy: require-corp
export const isSharedArrayBufferAvailable = (): boolean => {
    try {
        // Check if SharedArrayBuffer exists
        if (typeof SharedArrayBuffer === 'undefined') {
            return false;
        }
        // Try to create one to verify it's actually usable
        new SharedArrayBuffer(1);
        return true;
    } catch {
        return false;
    }
};

/**
 * Memory block descriptor - describes a region of shared memory
 */
export interface MemoryBlock {
    buffer: SharedArrayBuffer | ArrayBuffer;
    byteOffset: number;
    byteLength: number;
    isShared: boolean;
}

/**
 * Chunk input data layout in shared memory
 * 
 * Layout (all values in bytes):
 * [0-3]   : blockCount (uint32)
 * [4-7]   : originX (int32)
 * [8-11]  : originY (int32)
 * [12-15] : originZ (int32)
 * [16...] : blocks data (int32 x 4 per block: x, y, z, paletteIndex)
 */
export const CHUNK_INPUT_HEADER_SIZE = 16; // bytes
export const BYTES_PER_BLOCK = 16; // 4 int32s = 16 bytes

/**
 * Chunk output data layout in shared memory
 * 
 * Layout:
 * [0-3]   : status (uint32): 0=pending, 1=complete, 2=error
 * [4-7]   : vertexCount (uint32)
 * [8-11]  : indexCount (uint32)
 * [12-15] : groupCount (uint32)
 * [16-19] : originX (int32)
 * [20-23] : originY (int32)
 * [24-27] : originZ (int32)
 * [28...] : vertex data (positions: int16 x 3, normals: int8 x 3, uvs: float32 x 2 per vertex)
 * [...] : index data (uint16 or uint32 depending on vertexCount)
 * [...] : group data (start: uint32, count: uint32, materialIndex: uint32 per group)
 */
export const CHUNK_OUTPUT_HEADER_SIZE = 28; // bytes
export const BYTES_PER_VERTEX = 14; // 6 (positions) + 3 (normals) + 4 (uvs as f32, but we pad) = actually let's recalculate
// positions: 3 x int16 = 6 bytes
// normals: 3 x int8 = 3 bytes  
// uvs: 2 x float32 = 8 bytes
// Total: 17 bytes, but we'll pad to 20 for alignment
export const BYTES_PER_VERTEX_ALIGNED = 20;
export const BYTES_PER_INDEX_16 = 2;
export const BYTES_PER_INDEX_32 = 4;
export const BYTES_PER_GROUP = 12; // 3 x uint32

/**
 * SharedMemoryPool - Manages a pool of shared memory buffers
 */
export class SharedMemoryPool {
    private isShared: boolean;
    private inputBuffers: Map<string, SharedArrayBuffer | ArrayBuffer> = new Map();
    private outputBuffers: Map<string, SharedArrayBuffer | ArrayBuffer> = new Map();

    // Pre-allocated large buffer for input data (reserved for future optimization)
    // @ts-expect-error Reserved for future optimization
    private _mainInputBuffer: SharedArrayBuffer | ArrayBuffer | null = null;
    // @ts-expect-error Reserved for future optimization
    private _mainInputSize: number = 0;

    // Pre-allocated large buffer for output data (reserved for future optimization)
    // @ts-expect-error Reserved for future optimization
    private _mainOutputBuffer: SharedArrayBuffer | ArrayBuffer | null = null;
    // @ts-expect-error Reserved for future optimization
    private _mainOutputSize: number = 0;

    constructor() {
        this.isShared = isSharedArrayBufferAvailable();
        if (this.isShared) {
            console.log('[SharedMemoryPool] Using SharedArrayBuffer for zero-copy transfers');
        } else {
            console.log('[SharedMemoryPool] SharedArrayBuffer not available, using standard transfers');
        }
    }

    /**
     * Check if we're using shared memory
     */
    public usingSharedMemory(): boolean {
        return this.isShared;
    }

    /**
     * Allocate input buffer for chunk data
     */
    public allocateInputBuffer(chunkId: string, blockCount: number): {
        buffer: SharedArrayBuffer | ArrayBuffer;
        view: DataView;
        blocksArray: Int32Array;
    } {
        const size = CHUNK_INPUT_HEADER_SIZE + blockCount * BYTES_PER_BLOCK;

        let buffer: SharedArrayBuffer | ArrayBuffer;
        if (this.isShared) {
            buffer = new SharedArrayBuffer(size);
        } else {
            buffer = new ArrayBuffer(size);
        }

        this.inputBuffers.set(chunkId, buffer);

        return {
            buffer,
            view: new DataView(buffer),
            blocksArray: new Int32Array(buffer, CHUNK_INPUT_HEADER_SIZE)
        };
    }

    /**
     * Allocate output buffer for chunk results
     * Estimates size based on worst-case (no culling)
     */
    public allocateOutputBuffer(chunkId: string, maxVertices: number, maxIndices: number, maxGroups: number = 64): {
        buffer: SharedArrayBuffer | ArrayBuffer;
        view: DataView;
    } {
        // Use 32-bit indices if more than 65535 vertices
        const indexSize = maxVertices > 65535 ? BYTES_PER_INDEX_32 : BYTES_PER_INDEX_16;
        const size = CHUNK_OUTPUT_HEADER_SIZE +
            maxVertices * BYTES_PER_VERTEX_ALIGNED +
            maxIndices * indexSize +
            maxGroups * BYTES_PER_GROUP;

        let buffer: SharedArrayBuffer | ArrayBuffer;
        if (this.isShared) {
            buffer = new SharedArrayBuffer(size);
        } else {
            buffer = new ArrayBuffer(size);
        }

        this.outputBuffers.set(chunkId, buffer);

        // Initialize status to pending (0)
        const view = new DataView(buffer);
        view.setUint32(0, 0, true); // status = pending

        return { buffer, view };
    }

    /**
     * Get input buffer for a chunk
     */
    public getInputBuffer(chunkId: string): SharedArrayBuffer | ArrayBuffer | undefined {
        return this.inputBuffers.get(chunkId);
    }

    /**
     * Get output buffer for a chunk
     */
    public getOutputBuffer(chunkId: string): SharedArrayBuffer | ArrayBuffer | undefined {
        return this.outputBuffers.get(chunkId);
    }

    /**
     * Release buffers for a chunk
     */
    public releaseBuffers(chunkId: string): void {
        this.inputBuffers.delete(chunkId);
        this.outputBuffers.delete(chunkId);
    }

    /**
     * Clear all buffers
     */
    public clear(): void {
        this.inputBuffers.clear();
        this.outputBuffers.clear();
    }

    /**
     * Write chunk input data to a buffer
     */
    public writeChunkInput(
        chunkId: string,
        blocks: Int32Array,
        originX: number,
        originY: number,
        originZ: number
    ): SharedArrayBuffer | ArrayBuffer {
        const blockCount = blocks.length / 4;
        const { buffer, view, blocksArray } = this.allocateInputBuffer(chunkId, blockCount);

        // Write header
        view.setUint32(0, blockCount, true);
        view.setInt32(4, originX, true);
        view.setInt32(8, originY, true);
        view.setInt32(12, originZ, true);

        // Copy blocks data
        blocksArray.set(blocks);

        return buffer;
    }

    /**
     * Read chunk output status
     */
    public readOutputStatus(chunkId: string): number {
        const buffer = this.outputBuffers.get(chunkId);
        if (!buffer) return -1;
        const view = new DataView(buffer);
        return view.getUint32(0, true);
    }
}

// Singleton instance
let sharedMemoryPool: SharedMemoryPool | null = null;

export function getSharedMemoryPool(): SharedMemoryPool {
    if (!sharedMemoryPool) {
        sharedMemoryPool = new SharedMemoryPool();
    }
    return sharedMemoryPool;
}
