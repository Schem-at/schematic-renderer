// Types definitions
type PaletteGeometryData = {
    index: number;
    occlusionFlags: number; // Bitmask: 0=West, 1=East, 2=Down, 3=Up, 4=North, 5=South
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
    blocks: number[][]; // [x, y, z, paletteIndex]
};

// State
const paletteGeometries = new Map<number, PaletteGeometryData>();

self.onmessage = (event: MessageEvent) => {
    const { type, ...payload } = event.data;

    try {
        switch (type) {
            case "updatePalette":
                updatePalette(payload.paletteData);
                break;
            case "buildChunk":
                buildChunk(payload as unknown as ChunkBuildRequest);
                break;
        }
    } catch (error: any) {
        console.error("Worker Error:", error);
        self.postMessage({ type: "error", error: error.message });
    }
};

function updatePalette(paletteData: PaletteGeometryData[]) {
    for (const item of paletteData) {
        paletteGeometries.set(item.index, item);
    }
    self.postMessage({ type: "paletteUpdated", count: paletteData.length });
}

function buildChunk(request: ChunkBuildRequest) {
    const { chunkId, blocks } = request;

    const categoryBatches = new Map<string, {
        positions: number[]; // flattened x,y,z
        geometryData: any[]; // reference to the geometry data from palette
        occlusionFlags: number[]; // To track occlusion capability of each block
    }>();

    // Calculate bounds for voxel map
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    if (blocks.length > 0) {
        for (const [x, y, z] of blocks) {
            minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
        }
    } else {
        (self as unknown as Worker).postMessage({ type: "chunkBuilt", chunkId, meshes: [] });
        return;
    }

    const sizeX = maxX - minX + 1;
    const sizeY = maxY - minY + 1;
    const sizeZ = maxZ - minZ + 1;

    // Voxel map stores palette index + 1 (0 = empty)
    const pad = 1;
    const strideX = 1;
    const strideY = sizeX + 2 * pad;
    const strideZ = (sizeX + 2 * pad) * (sizeY + 2 * pad);
    const voxelMap = new Int32Array(strideZ * (sizeZ + 2 * pad));

    const getIndex = (x: number, y: number, z: number) => {
        return (x - minX + pad) * strideX + (y - minY + pad) * strideY + (z - minZ + pad) * strideZ;
    };

    // Populate voxel map
    for (const [x, y, z, paletteIndex] of blocks) {
        voxelMap[getIndex(x, y, z)] = paletteIndex + 1; // Store index + 1 so 0 is empty
    }

    // 1. Collect all blocks into categories
    for (const block of blocks) {
        const [x, y, z, paletteIndex] = block;
        const paletteItem = paletteGeometries.get(paletteIndex);

        if (paletteItem) {
            const category = (paletteItem as any).category || 'solid';

            if (!categoryBatches.has(category)) {
                categoryBatches.set(category, { positions: [], geometryData: [], occlusionFlags: [] });
            }

            const batch = categoryBatches.get(category)!;

            for (const geom of paletteItem.geometries) {
                batch.positions.push(x, y, z);
                batch.geometryData.push(geom);
                batch.occlusionFlags.push(paletteItem.occlusionFlags || 0);
            }
        }
    }

    const results: any[] = [];
    const transferables: Transferable[] = [];

    // 2. Merge each category with culling
    for (const [category, batch] of categoryBatches) {
        if (batch.positions.length === 0) continue;

        const merged = mergeGeometriesWithCulling(
            batch.geometryData,
            batch.positions,
            batch.occlusionFlags,
            voxelMap,
            getIndex
        );

        if (merged) {
            results.push({
                category,
                ...merged
            });
            transferables.push(merged.positions.buffer);
            if (merged.normals) transferables.push(merged.normals.buffer);
            if (merged.uvs) transferables.push(merged.uvs.buffer);
            transferables.push(merged.indices.buffer);
        }
    }

    (self as unknown as Worker).postMessage({
        type: "chunkBuilt",
        chunkId,
        meshes: results
    }, transferables);
}

function mergeGeometriesWithCulling(
    geometries: any[],
    positions: number[],
    // occlusionFlags: number[], // Unused directly in loop, but kept for signature if needed
    _occlusionFlags: number[],
    voxelMap: Int32Array,
    getIndex: (x: number, y: number, z: number) => number
) {
    let totalVerts = 0;
    let totalIndices = 0;

    for (let i = 0; i < geometries.length; i++) {
        totalVerts += geometries[i].positions.length / 3;
        totalIndices += geometries[i].indices.length;
    }

    if (totalVerts === 0) return null;

    const mergedPositions = new Float32Array(totalVerts * 3);
    const mergedNormals = new Float32Array(totalVerts * 3);
    const mergedUVs = new Float32Array(totalVerts * 2);
    const mergedIndices = totalVerts > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

    const groups: { start: number, count: number, materialIndex: number }[] = [];

    let vOffset = 0;
    let iOffset = 0;

    let currentGroup = null;

    for (let i = 0; i < geometries.length; i++) {
        const geom = geometries[i];
        const px = positions[i * 3];
        const py = positions[i * 3 + 1];
        const pz = positions[i * 3 + 2];

        const numLocalVerts = geom.positions.length / 3;
        const localIndices = geom.indices;
        const validLocalIndices: number[] = [];

        for (let j = 0; j < localIndices.length; j += 3) {
            const idx0 = localIndices[j];
            const idx1 = localIndices[j + 1];
            const idx2 = localIndices[j + 2];

            let isVisible = true;

            if (geom.normals) {
                const nx = geom.normals[idx0 * 3];
                const ny = geom.normals[idx0 * 3 + 1];
                const nz = geom.normals[idx0 * 3 + 2];

                const dx = Math.round(nx);
                const dy = Math.round(ny);
                const dz = Math.round(nz);

                // Only cull cardinal directions
                if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 1) {

                    // Check if the face is FLUSH with the block boundary
                    let isFlush = false;
                    const EPSILON = 0.01;

                    const v0x = geom.positions[idx0 * 3];
                    const v0y = geom.positions[idx0 * 3 + 1];
                    const v0z = geom.positions[idx0 * 3 + 2];

                    if (dx === 1) isFlush = (Math.abs(v0x - 1.0) < EPSILON) || (Math.abs(v0x - 0.5) < EPSILON);
                    else if (dx === -1) isFlush = (Math.abs(v0x - 0.0) < EPSILON) || (Math.abs(v0x + 0.5) < EPSILON);
                    else if (dy === 1) isFlush = (Math.abs(v0y - 1.0) < EPSILON) || (Math.abs(v0y - 0.5) < EPSILON);
                    else if (dy === -1) isFlush = (Math.abs(v0y - 0.0) < EPSILON) || (Math.abs(v0y + 0.5) < EPSILON);
                    else if (dz === 1) isFlush = (Math.abs(v0z - 1.0) < EPSILON) || (Math.abs(v0z - 0.5) < EPSILON);
                    else if (dz === -1) isFlush = (Math.abs(v0z - 0.0) < EPSILON) || (Math.abs(v0z + 0.5) < EPSILON);

                    // Only proceed with culling check if the face is flush
                    if (isFlush) {
                        const neighborIdx = getIndex(px + dx, py + dy, pz + dz);
                        const neighborVal = voxelMap[neighborIdx];

                        if (neighborVal > 0) { // Neighbor exists
                            const neighborPaletteIdx = neighborVal - 1;
                            const neighborGeomData = paletteGeometries.get(neighborPaletteIdx);

                            if (neighborGeomData && neighborGeomData.occlusionFlags !== undefined) {
                                let neighborFaceIndex = -1;
                                if (dx === 1) neighborFaceIndex = 0; // Neighbor's West face
                                else if (dx === -1) neighborFaceIndex = 1; // Neighbor's East face
                                else if (dy === 1) neighborFaceIndex = 2; // Neighbor's Down face
                                else if (dy === -1) neighborFaceIndex = 3; // Neighbor's Up face
                                else if (dz === 1) neighborFaceIndex = 4; // Neighbor's North face
                                else if (dz === -1) neighborFaceIndex = 5; // Neighbor's South face

                                if (neighborFaceIndex !== -1) {
                                    if ((neighborGeomData.occlusionFlags & (1 << neighborFaceIndex)) !== 0) {
                                        isVisible = false;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (isVisible) {
                validLocalIndices.push(idx0, idx1, idx2);
            }
        }

        if (validLocalIndices.length === 0) continue;

        for (let v = 0; v < numLocalVerts; v++) {
            mergedPositions[(vOffset + v) * 3] = geom.positions[v * 3] + px;
            mergedPositions[(vOffset + v) * 3 + 1] = geom.positions[v * 3 + 1] + py;
            mergedPositions[(vOffset + v) * 3 + 2] = geom.positions[v * 3 + 2] + pz;

            if (geom.normals) {
                mergedNormals[(vOffset + v) * 3] = geom.normals[v * 3];
                mergedNormals[(vOffset + v) * 3 + 1] = geom.normals[v * 3 + 1];
                mergedNormals[(vOffset + v) * 3 + 2] = geom.normals[v * 3 + 2];
            }

            if (geom.uvs) {
                mergedUVs[(vOffset + v) * 2] = geom.uvs[v * 2];
                mergedUVs[(vOffset + v) * 2 + 1] = geom.uvs[v * 2 + 1];
            }
        }

        for (let idx of validLocalIndices) {
            mergedIndices[iOffset++] = idx + vOffset;
        }

        const matIndex = geom.materialIndex;
        if (!currentGroup || currentGroup.materialIndex !== matIndex) {
            if (currentGroup) groups.push(currentGroup);
            currentGroup = { start: iOffset - validLocalIndices.length, count: validLocalIndices.length, materialIndex: matIndex };
        } else {
            currentGroup.count += validLocalIndices.length;
        }

        vOffset += numLocalVerts;
    }

    if (currentGroup) groups.push(currentGroup);

    const finalPositions = mergedPositions.slice(0, vOffset * 3);
    const finalNormals = mergedNormals.slice(0, vOffset * 3);
    const finalUVs = mergedUVs.slice(0, vOffset * 2);
    const finalIndices = mergedIndices.slice(0, iOffset);

    return {
        positions: finalPositions,
        normals: finalNormals,
        uvs: finalUVs,
        indices: finalIndices,
        groups
    };
}
