/**
 * WASM-based Mesh Builder Worker
 * 
 * Uses Rust/WASM for high-performance geometry merging with face culling.
 * Supports SharedArrayBuffer for zero-copy data transfer when available.
 */

// Import the WASM module - Vite will handle the bundling
// @ts-ignore - WASM imports are handled specially
import initWasm, { MeshBuilder, get_version } from '../wasm/mesh_builder_wasm.js';
// @ts-ignore - WASM binary import
import wasmBase64 from '../wasm/mesh_builder_wasm_bg.wasm?inline';
import { CHUNK_INPUT_HEADER_SIZE } from './SharedMemoryManager';

// Types
type PaletteGeometryData = {
    index: number;
    occlusionFlags: number;
    category?: string;
    geometries: Array<{
        positions: Float32Array;
        normals: Float32Array;
        uvs: Float32Array;
        indices: Uint16Array | Uint32Array;
        materialIndex: number;
    }>;
};

type ChunkBuildRequest = {
    chunkId: string;
    blocks: number[][] | Int32Array;
    chunkOrigin?: [number, number, number];
    // SharedArrayBuffer support
    sharedInputBuffer?: SharedArrayBuffer;
};

// State
let meshBuilder: MeshBuilder | null = null;
let isInitialized = false;
let initPromise: Promise<void> | null = null;
let useSharedMemory = false;
let useGreedyMeshing = false;  // Enable greedy meshing optimization

// Batch mode state - accumulates all chunks before returning
// Uses Float32 for positions to avoid Int16 overflow with world coordinates
// @ts-expect-error State tracking variable used internally
let _batchMode = false;
let batchAccumulators: Map<string, {
    positions: number[];  // Will become Float32Array (world coordinates, not quantized)
    normals: number[];    // Will become Int8Array
    uvs: number[];        // Will become Float32Array
    indices: number[];
    groups: Array<{ start: number; count: number; materialIndex: number }>;
    vertexOffset: number;
}> = new Map();

// Performance tracking
let buildCount = 0;
let totalBuildTime = 0;
let totalDataTransferTime = 0;

/**
 * Initialize the WASM module
 */
async function initialize(): Promise<void> {
    if (isInitialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            // Initialize WASM - use new API format to avoid deprecation warning
            await initWasm({ module_or_path: wasmBase64 });

            // Create mesh builder instance
            meshBuilder = new MeshBuilder();
            isInitialized = true;

            // Check if SharedArrayBuffer is available for this worker
            try {
                new SharedArrayBuffer(1);
                useSharedMemory = true;
            } catch {
                useSharedMemory = false;
            }

            const version = get_version();
            const memMode = useSharedMemory ? 'SharedArrayBuffer' : 'standard';
            console.log(`[MeshBuilderWasm Worker] Initialized v${version} (${memMode})`);
        } catch (error) {
            console.error('[MeshBuilderWasm Worker] Failed to initialize:', error);
            throw error;
        }
    })();

    return initPromise;
}

// Initialize immediately when worker loads
initialize().catch(console.error);

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent) => {
    const { type, ...payload } = event.data;

    try {
        // Ensure WASM is initialized before processing
        await initialize();

        switch (type) {
            case "updatePalette":
                updatePalette(payload.paletteData);
                break;
            case "buildChunk":
                buildChunk(payload as unknown as ChunkBuildRequest);
                break;
            case "startBatch":
                startBatch();
                break;
            case "finishBatch":
                finishBatch();
                break;
            case "buildChunkBatched":
                buildChunkBatched(payload as unknown as ChunkBuildRequest);
                break;
            case "setGreedyMeshing":
                useGreedyMeshing = payload.enabled;
                console.log(`[MeshBuilderWasm Worker] Greedy meshing ${useGreedyMeshing ? 'enabled' : 'disabled'}`);
                self.postMessage({ type: "greedyMeshingSet", enabled: useGreedyMeshing });
                break;
            default:
                console.warn(`[MeshBuilderWasm Worker] Unknown message type: ${type}`);
        }
    } catch (error: any) {
        console.error("[MeshBuilderWasm Worker] Error:", error);
        self.postMessage({
            type: "error",
            error: error.message,
            chunkId: payload.chunkId
        });
    }
};

/**
 * Start batch mode - chunks will be accumulated instead of returned
 */
function startBatch() {
    _batchMode = true;
    batchAccumulators.clear();
    self.postMessage({ type: "batchStarted" });
}

/**
 * Finish batch mode - return all accumulated geometry as merged buffers
 * Uses Float32 for positions (no quantization) to support world-space coordinates
 */
function finishBatch() {
    const startTime = performance.now();
    const meshes: any[] = [];
    const transferables: Transferable[] = [];

    for (const [category, acc] of batchAccumulators) {
        if (acc.vertexOffset === 0) continue;

        // Convert accumulated arrays to typed arrays
        // Positions are Float32 (world coordinates, not quantized)
        const positions = new Float32Array(acc.positions);
        const normals = new Int8Array(acc.normals);
        const uvs = new Float32Array(acc.uvs);
        const indices = acc.vertexOffset > 65535
            ? new Uint32Array(acc.indices)
            : new Uint16Array(acc.indices);

        meshes.push({
            category,
            positions,
            normals,
            uvs,
            indices,
            groups: acc.groups,
            vertexCount: acc.vertexOffset,
            isFloat32Positions: true  // Flag to tell main thread not to de-quantize
        });

        transferables.push(positions.buffer);
        transferables.push(normals.buffer);
        transferables.push(uvs.buffer);
        transferables.push(indices.buffer);
    }

    const elapsed = performance.now() - startTime;
    console.log(`[MeshBuilderWasm Worker] Batch finished: ${meshes.length} meshes in ${elapsed.toFixed(2)}ms`);

    _batchMode = false;
    batchAccumulators.clear();

    (self as unknown as Worker).postMessage({
        type: "batchFinished",
        meshes,
        origin: [0, 0, 0],
        timings: { finalize: elapsed }
    }, { transfer: transferables });
}

/**
 * Build chunk in batch mode - accumulates results instead of returning
 */
function buildChunkBatched(request: ChunkBuildRequest) {
    if (!meshBuilder) {
        throw new Error("WASM MeshBuilder not initialized");
    }

    const { chunkId, blocks, chunkOrigin, sharedInputBuffer } = request;
    const startTime = performance.now();

    let blocksArray: Int32Array;
    let originX: number;
    let originY: number;
    let originZ: number;

    // Get blocks data (same logic as buildChunk)
    if (sharedInputBuffer) {
        const view = new DataView(sharedInputBuffer);
        const blockCount = view.getUint32(0, true);
        originX = view.getInt32(4, true);
        originY = view.getInt32(8, true);
        originZ = view.getInt32(12, true);
        blocksArray = new Int32Array(sharedInputBuffer, CHUNK_INPUT_HEADER_SIZE, blockCount * 4);
    } else if (blocks instanceof Int32Array) {
        blocksArray = blocks;
        originX = chunkOrigin?.[0] ?? 0;
        originY = chunkOrigin?.[1] ?? 0;
        originZ = chunkOrigin?.[2] ?? 0;
    } else {
        // Acknowledge even empty chunks in batch mode
        self.postMessage({ type: "chunkAccumulated", chunkId });
        return;
    }

    if (blocksArray.length === 0) {
        self.postMessage({ type: "chunkAccumulated", chunkId });
        return;
    }

    // Build chunk with WASM - use chunk's min position as origin
    // Use greedy meshing if enabled for better vertex reduction
    const result = useGreedyMeshing
        ? meshBuilder.build_chunk_greedy(blocksArray, originX, originY, originZ)
        : meshBuilder.build_chunk(blocksArray, originX, originY, originZ);

    // The WASM returns quantized Int16 positions relative to the origin we passed
    // We need to de-quantize and convert to world Float32 coordinates
    const POSITION_SCALE = 1024;
    const invScale = 1.0 / POSITION_SCALE;

    // Accumulate results into batch buffers
    const meshes = result.meshes || [];
    for (const mesh of meshes) {
        const category = mesh.category || 'solid';

        // Get or create accumulator for this category
        let acc = batchAccumulators.get(category);
        if (!acc) {
            acc = {
                positions: [],
                normals: [],
                uvs: [],
                indices: [],
                groups: [],
                vertexOffset: 0
            };
            batchAccumulators.set(category, acc);
        }

        const baseVertex = acc.vertexOffset;

        // Accumulate positions - de-quantize and add chunk origin for world coordinates
        // Result is Float32 world positions
        if (mesh.positions) {
            for (let i = 0; i < mesh.positions.length; i += 3) {
                // De-quantize (Int16 / 1024) and add chunk origin to get world position
                const worldX = (mesh.positions[i] * invScale) + originX;
                const worldY = (mesh.positions[i + 1] * invScale) + originY;
                const worldZ = (mesh.positions[i + 2] * invScale) + originZ;
                acc.positions.push(worldX, worldY, worldZ);
            }
        }

        // Accumulate normals (Int8Array) - no offset needed
        if (mesh.normals) {
            for (let i = 0; i < mesh.normals.length; i++) {
                acc.normals.push(mesh.normals[i]);
            }
        }

        // Accumulate UVs (Float32Array) - no offset needed
        if (mesh.uvs) {
            for (let i = 0; i < mesh.uvs.length; i++) {
                acc.uvs.push(mesh.uvs[i]);
            }
        }

        // Accumulate indices with vertex offset
        if (mesh.indices) {
            const indexStart = acc.indices.length;
            for (let i = 0; i < mesh.indices.length; i++) {
                acc.indices.push(mesh.indices[i] + baseVertex);
            }

            // Accumulate groups with adjusted start
            if (mesh.groups) {
                for (const group of mesh.groups) {
                    acc.groups.push({
                        start: indexStart + group.start,
                        count: group.count,
                        materialIndex: group.materialIndex
                    });
                }
            }
        }

        // Update vertex offset
        acc.vertexOffset += mesh.positions ? mesh.positions.length / 3 : 0;
    }

    const elapsed = performance.now() - startTime;
    buildCount++;
    totalBuildTime += elapsed;

    // Acknowledge chunk processed (no data returned in batch mode)
    self.postMessage({
        type: "chunkAccumulated",
        chunkId,
        timings: { total: elapsed }
    });
}

/**
 * Update palette geometry data in WASM
 */
function updatePalette(paletteData: PaletteGeometryData[]) {
    if (!meshBuilder) {
        throw new Error("WASM MeshBuilder not initialized");
    }

    const startTime = performance.now();

    // Convert palette data to format expected by WASM
    // The WASM module expects: { index, occlusionFlags, category, geometries: [...] }
    const wasmPaletteData = paletteData.map(item => ({
        index: item.index,
        occlusionFlags: item.occlusionFlags || 0,
        category: item.category || 'solid',
        geometries: item.geometries.map(geom => ({
            positions: geom.positions,
            normals: geom.normals,
            uvs: geom.uvs,
            indices: geom.indices instanceof Uint16Array
                ? new Uint32Array(geom.indices)
                : geom.indices,
            materialIndex: geom.materialIndex
        }))
    }));

    meshBuilder.update_palette(wasmPaletteData);

    const elapsed = performance.now() - startTime;
    console.log(`[MeshBuilderWasm Worker] Palette updated in ${elapsed.toFixed(2)}ms (${paletteData.length} entries)`);

    self.postMessage({ type: "paletteUpdated", count: paletteData.length });
}

/**
 * Build chunk mesh using WASM
 * Supports both SharedArrayBuffer (zero-copy) and regular transfers
 */
function buildChunk(request: ChunkBuildRequest) {
    if (!meshBuilder) {
        throw new Error("WASM MeshBuilder not initialized");
    }

    const { chunkId, blocks, chunkOrigin, sharedInputBuffer } = request;
    const startTime = performance.now();
    let dataTransferStart = startTime;

    let blocksArray: Int32Array;
    let originX: number;
    let originY: number;
    let originZ: number;

    // Check if using SharedArrayBuffer (zero-copy path)
    if (sharedInputBuffer) {
        // Read directly from shared memory - NO COPY!
        const view = new DataView(sharedInputBuffer);
        const blockCount = view.getUint32(0, true);
        originX = view.getInt32(4, true);
        originY = view.getInt32(8, true);
        originZ = view.getInt32(12, true);

        // Create view into shared buffer - NO COPY!
        blocksArray = new Int32Array(sharedInputBuffer, CHUNK_INPUT_HEADER_SIZE, blockCount * 4);

        const dataTransferTime = performance.now() - dataTransferStart;
        totalDataTransferTime += dataTransferTime;
    } else {
        // Traditional path - data was copied via postMessage
        dataTransferStart = performance.now();

        if (blocks instanceof Int32Array) {
            blocksArray = blocks;
        } else if (Array.isArray(blocks)) {
            // Convert array of [x, y, z, paletteIndex] to flat Int32Array
            blocksArray = new Int32Array(blocks.length * 4);
            for (let i = 0; i < blocks.length; i++) {
                const block = blocks[i];
                blocksArray[i * 4] = block[0];
                blocksArray[i * 4 + 1] = block[1];
                blocksArray[i * 4 + 2] = block[2];
                blocksArray[i * 4 + 3] = block[3];
            }
        } else {
            self.postMessage({ type: "chunkBuilt", chunkId, meshes: [], origin: [0, 0, 0] });
            return;
        }

        // Calculate origin if not provided
        originX = chunkOrigin?.[0] ?? 0;
        originY = chunkOrigin?.[1] ?? 0;
        originZ = chunkOrigin?.[2] ?? 0;

        if (!chunkOrigin) {
            // Auto-detect origin from block positions
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            for (let i = 0; i < blocksArray.length; i += 4) {
                minX = Math.min(minX, blocksArray[i]);
                minY = Math.min(minY, blocksArray[i + 1]);
                minZ = Math.min(minZ, blocksArray[i + 2]);
            }
            originX = minX;
            originY = minY;
            originZ = minZ;
        }
    }

    if (blocksArray.length === 0) {
        self.postMessage({ type: "chunkBuilt", chunkId, meshes: [], origin: [0, 0, 0] });
        return;
    }

    const wasmStart = performance.now();

    // Call WASM build_chunk (with or without greedy meshing)
    const result = useGreedyMeshing
        ? meshBuilder.build_chunk_greedy(blocksArray, originX, originY, originZ)
        : meshBuilder.build_chunk(blocksArray, originX, originY, originZ);

    const wasmTime = performance.now() - wasmStart;
    const elapsed = performance.now() - startTime;

    // Track performance
    buildCount++;
    totalBuildTime += elapsed;

    // Log performance periodically
    if (buildCount % 50 === 0) {
        const avgTime = totalBuildTime / buildCount;
        const avgDataTime = totalDataTransferTime / buildCount;
        const memMode = sharedInputBuffer ? 'SharedArrayBuffer' : 'postMessage copy';
        console.log(`[MeshBuilderWasm Stats] Avg total: ${avgTime.toFixed(2)}ms, data: ${avgDataTime.toFixed(3)}ms (${memMode})`);
    }

    // Extract transferable buffers (still need to transfer output data)
    const transferables: Transferable[] = [];
    const meshes = result.meshes || [];

    for (const mesh of meshes) {
        if (mesh.positions?.buffer) transferables.push(mesh.positions.buffer);
        if (mesh.normals?.buffer) transferables.push(mesh.normals.buffer);
        if (mesh.uvs?.buffer) transferables.push(mesh.uvs.buffer);
        if (mesh.indices?.buffer) transferables.push(mesh.indices.buffer);
    }

    self.postMessage({
        type: "chunkBuilt",
        chunkId,
        meshes,
        origin: result.origin || [originX, originY, originZ],
        timings: {
            total: elapsed,
            wasm: wasmTime,
            dataTransfer: sharedInputBuffer ? 0 : (elapsed - wasmTime)
        }
    }, { transfer: transferables });
}
