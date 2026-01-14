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
	blocks: number[][] | Int32Array; // [x, y, z, paletteIndex] or flat array
	chunkOrigin?: [number, number, number]; // [x, y, z] origin for relative coordinates
};

// Constants
const POSITION_SCALE = 1024;
const NORMAL_SCALE = 127;

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
	const { chunkId, blocks, chunkOrigin } = request;

	// Calculate bounds for voxel map
	const startSetup = performance.now();
	let minX = Infinity,
		minY = Infinity,
		minZ = Infinity;
	let maxX = -Infinity,
		maxY = -Infinity,
		maxZ = -Infinity;

	if (blocks.length > 0) {
		if (blocks instanceof Int32Array) {
			for (let i = 0; i < blocks.length; i += 4) {
				const x = blocks[i];
				const y = blocks[i + 1];
				const z = blocks[i + 2];
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				minZ = Math.min(minZ, z);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
				maxZ = Math.max(maxZ, z);
			}
		} else {
			for (const [x, y, z] of blocks) {
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				minZ = Math.min(minZ, z);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
				maxZ = Math.max(maxZ, z);
			}
		}
	} else {
		(self as unknown as Worker).postMessage({ type: "chunkBuilt", chunkId, meshes: [] });
		return;
	}

	// If chunkOrigin is provided, use it. Otherwise fallback to minX/minY/minZ (auto-detected origin)
	// NOTE: For consistent meshing across sparse chunks, chunkOrigin SHOULD be provided by main thread
	const originX = chunkOrigin ? chunkOrigin[0] : minX;
	const originY = chunkOrigin ? chunkOrigin[1] : minY;
	const originZ = chunkOrigin ? chunkOrigin[2] : minZ;

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
	if (blocks instanceof Int32Array) {
		for (let i = 0; i < blocks.length; i += 4) {
			const x = blocks[i];
			const y = blocks[i + 1];
			const z = blocks[i + 2];
			const paletteIndex = blocks[i + 3];
			voxelMap[getIndex(x, y, z)] = paletteIndex + 1;
		}
	} else {
		for (const [x, y, z, paletteIndex] of blocks) {
			voxelMap[getIndex(x, y, z)] = paletteIndex + 1; // Store index + 1 so 0 is empty
		}
	}

	// Intermediate storage: Category -> Map<PaletteIndex, List of block indices (into original array)>
	// OPTIMIZATION: Store indices instead of creating new arrays to reduce GC pressure
	const setupTime = performance.now() - startSetup;
	const startSort = performance.now();
	const categoryBatches = new Map<string, Map<number, number[]>>();

	// 1. Segregate blocks by category and palette index
	// For Int32Array, store the starting index of each block (i) instead of creating new arrays
	if (blocks instanceof Int32Array) {
		for (let i = 0; i < blocks.length; i += 4) {
			const paletteIndex = blocks[i + 3];
			const paletteItem = paletteGeometries.get(paletteIndex);

			if (paletteItem) {
				const category = (paletteItem as any).category || "solid";

				let catMap = categoryBatches.get(category);
				if (!catMap) {
					catMap = new Map();
					categoryBatches.set(category, catMap);
				}

				let pList = catMap.get(paletteIndex);
				if (!pList) {
					pList = [];
					catMap.set(paletteIndex, pList);
				}
				// Store index into blocks array instead of creating new array
				pList.push(i);
			}
		}
	} else {
		// Legacy path for array-of-arrays format
		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i];
			const paletteIndex = block[3];
			const paletteItem = paletteGeometries.get(paletteIndex);

			if (paletteItem) {
				const category = (paletteItem as any).category || "solid";

				let catMap = categoryBatches.get(category);
				if (!catMap) {
					catMap = new Map();
					categoryBatches.set(category, catMap);
				}

				let pList = catMap.get(paletteIndex);
				if (!pList) {
					pList = [];
					catMap.set(paletteIndex, pList);
				}
				pList.push(i);
			}
		}
	}

	const results: any[] = [];
	const transferables: Transferable[] = [];
	const sortTime = performance.now() - startSort;
	let mergeTime = 0;

	// 2. Process each category
	// OPTIMIZATION: Use typed references instead of destructuring
	const isInt32 = blocks instanceof Int32Array;

	for (const [category, paletteMap] of categoryBatches) {
		const mergeStart = performance.now();
		const sortedIndices = Array.from(paletteMap.keys()).sort((a, b) => a - b);

		const positions: number[] = [];
		const geometryData: any[] = [];
		const occlusionFlags: number[] = [];

		// Expand blocks into flat arrays in sorted order
		for (const pIdx of sortedIndices) {
			const blockIndices = paletteMap.get(pIdx)!;
			const paletteItem = paletteGeometries.get(pIdx)!;

			for (const blockIdx of blockIndices) {
				// Extract x, y, z from original blocks array using stored index
				let x: number, y: number, z: number;
				if (isInt32) {
					x = (blocks as Int32Array)[blockIdx];
					y = (blocks as Int32Array)[blockIdx + 1];
					z = (blocks as Int32Array)[blockIdx + 2];
				} else {
					const block = (blocks as number[][])[blockIdx];
					x = block[0];
					y = block[1];
					z = block[2];
				}

				for (const geom of paletteItem.geometries) {
					positions.push(x, y, z);
					geometryData.push(geom);
					occlusionFlags.push(paletteItem.occlusionFlags || 0);
				}
			}
		}

		if (positions.length === 0) continue;

		const merged = mergeGeometriesWithCulling(
			geometryData,
			positions,
			occlusionFlags,
			voxelMap,
			getIndex,
			originX,
			originY,
			originZ
		);

		if (merged) {
			results.push({
				category,
				...merged,
			});
			transferables.push(merged.positions.buffer);
			if (merged.normals) transferables.push(merged.normals.buffer);
			if (merged.uvs) transferables.push(merged.uvs.buffer);
			transferables.push(merged.indices.buffer);
		}
		mergeTime += performance.now() - mergeStart;
	}

	(self as unknown as Worker).postMessage(
		{
			type: "chunkBuilt",
			chunkId,
			meshes: results,
			origin: [originX, originY, originZ],
			timings: {
				setup: setupTime,
				sort: sortTime,
				merge: mergeTime,
				total: performance.now() - startSetup,
			},
		},
		transferables
	);
}

function mergeGeometriesWithCulling(
	geometries: any[],
	positions: number[],
	// occlusionFlags: number[], // Unused directly in loop, but kept for signature if needed
	_occlusionFlags: number[],
	voxelMap: Int32Array,
	getIndex: (x: number, y: number, z: number) => number,
	originX: number,
	originY: number,
	originZ: number
) {
	let totalVerts = 0;
	let totalIndices = 0;

	for (let i = 0; i < geometries.length; i++) {
		totalVerts += geometries[i].positions.length / 3;
		totalIndices += geometries[i].indices.length;
	}

	if (totalVerts === 0) return null;

	// Use quantized types for memory optimization for positions/normals, but Float32 for UVs to avoid tiling issues
	const mergedPositions = new Int16Array(totalVerts * 3);
	const mergedNormals = new Int8Array(totalVerts * 3);
	const mergedUVs = new Float32Array(totalVerts * 2);
	const mergedIndices =
		totalVerts > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

	const groups: { start: number; count: number; materialIndex: number }[] = [];

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

				if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 1) {
					let isFlush = false;
					const EPSILON = 0.01;

					const v0x = geom.positions[idx0 * 3];
					const v0y = geom.positions[idx0 * 3 + 1];
					const v0z = geom.positions[idx0 * 3 + 2];

					if (dx === 1) isFlush = Math.abs(v0x - 1.0) < EPSILON || Math.abs(v0x - 0.5) < EPSILON;
					else if (dx === -1)
						isFlush = Math.abs(v0x - 0.0) < EPSILON || Math.abs(v0x + 0.5) < EPSILON;
					else if (dy === 1)
						isFlush = Math.abs(v0y - 1.0) < EPSILON || Math.abs(v0y - 0.5) < EPSILON;
					else if (dy === -1)
						isFlush = Math.abs(v0y - 0.0) < EPSILON || Math.abs(v0y + 0.5) < EPSILON;
					else if (dz === 1)
						isFlush = Math.abs(v0z - 1.0) < EPSILON || Math.abs(v0z - 0.5) < EPSILON;
					else if (dz === -1)
						isFlush = Math.abs(v0z - 0.0) < EPSILON || Math.abs(v0z + 0.5) < EPSILON;

					if (isFlush) {
						const neighborIdx = getIndex(px + dx, py + dy, pz + dz);
						const neighborVal = voxelMap[neighborIdx];

						if (neighborVal > 0) {
							const neighborPaletteIdx = neighborVal - 1;
							const neighborGeomData = paletteGeometries.get(neighborPaletteIdx);

							if (neighborGeomData && neighborGeomData.occlusionFlags !== undefined) {
								let neighborFaceIndex = -1;
								if (dx === 1) neighborFaceIndex = 0;
								else if (dx === -1) neighborFaceIndex = 1;
								else if (dy === 1) neighborFaceIndex = 2;
								else if (dy === -1) neighborFaceIndex = 3;
								else if (dz === 1) neighborFaceIndex = 4;
								else if (dz === -1) neighborFaceIndex = 5;

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
			// Quantize Positions RELATIVE TO CHUNK ORIGIN
			// px, py, pz are absolute world coords. originX/Y/Z are chunk origin.
			// Relative pos: (px - originX) + geom.pos
			const rx = px - originX + geom.positions[v * 3];
			const ry = py - originY + geom.positions[v * 3 + 1];
			const rz = pz - originZ + geom.positions[v * 3 + 2];

			// Multiply by POSITION_SCALE to preserve precision
			const vx = rx * POSITION_SCALE;
			const vy = ry * POSITION_SCALE;
			const vz = rz * POSITION_SCALE;

			mergedPositions[(vOffset + v) * 3] = vx;
			mergedPositions[(vOffset + v) * 3 + 1] = vy;
			mergedPositions[(vOffset + v) * 3 + 2] = vz;

			if (geom.normals) {
				mergedNormals[(vOffset + v) * 3] = geom.normals[v * 3] * NORMAL_SCALE;
				mergedNormals[(vOffset + v) * 3 + 1] = geom.normals[v * 3 + 1] * NORMAL_SCALE;
				mergedNormals[(vOffset + v) * 3 + 2] = geom.normals[v * 3 + 2] * NORMAL_SCALE;
			}

			if (geom.uvs) {
				mergedUVs[(vOffset + v) * 2] = geom.uvs[v * 2];
				mergedUVs[(vOffset + v) * 2 + 1] = geom.uvs[v * 2 + 1];
			}
		}

		for (const idx of validLocalIndices) {
			mergedIndices[iOffset++] = idx + vOffset;
		}

		const matIndex = geom.materialIndex;
		if (!currentGroup || currentGroup.materialIndex !== matIndex) {
			if (currentGroup) groups.push(currentGroup);
			currentGroup = {
				start: iOffset - validLocalIndices.length,
				count: validLocalIndices.length,
				materialIndex: matIndex,
			};
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
		groups,
	};
}
