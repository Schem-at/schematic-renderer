// WorldMeshBuilder.ts
import * as THREE from "three";
import { SchematicRenderer } from "./SchematicRenderer"; // Adjust path
import { SchematicObject } from "./managers/SchematicObject"; // Adjust path
import { MaterialRegistry } from "./MaterialRegistry"; // Import the material registry
import type {
	ChunkMeshes,
	ProcessedBlockGeometry,
	PaletteMaterialGroup,
	PaletteBlockData,
	PaletteCache,
} from "./types"; 
// @ts-ignore
import { Cubane } from "cubane"; 
import { GeometryBufferPool } from "./GeometryBufferPool";
import { InstancedBlockRenderer } from "./InstancedBlockRenderer"; // Adjust path
import { performanceMonitor } from "./performance/PerformanceMonitor";
const BUFFER_ANALYSIS_LOG_INTERVAL = 100;
let bufferAnalysisCounter = 0;
let maxVerticesUsed = 0;

export const INVISIBLE_BLOCKS = new Set([
	"minecraft:air",
	"minecraft:cave_air",
	"minecraft:void_air",
	"minecraft:structure_void",
	"minecraft:light",
	"minecraft:barrier",
]);

export class WorldMeshBuilder {
	// @ts-ignore
	private schematicRenderer: SchematicRenderer;
	private cubane: Cubane;
	private paletteCache: PaletteCache | null = null;
	private instancedRenderer: InstancedBlockRenderer | null = null;
	private useInstancedRendering: boolean = false;
	
    // Chunk size configuration for buffer sizing
    private chunkSize: number = 16; // Default Minecraft chunk size
    
    // Phase 2 optimizations configuration
    private useQuantization: boolean = false; // Disable quantization by default until custom shaders are implemented

	constructor(schematicRenderer: SchematicRenderer, cubane: Cubane) {
		this.cubane = cubane;
		this.schematicRenderer = schematicRenderer;
	}
	
	/**
	 * Set the chunk size for optimization
	 * This affects chunk size calculations and is useful for testing different chunk sizes
	 * @param newChunkSize The new chunk size to use (e.g., 16, 32, 8)
	 */
	public setChunkSize(newChunkSize: number): void {
		if (newChunkSize <= 0 || newChunkSize > 64) {
			throw new Error('Chunk size must be between 1 and 64');
		}
		
		const oldChunkSize = this.chunkSize;
		this.chunkSize = newChunkSize;
		
		console.log(`[WorldMeshBuilder] Chunk size changed from ${oldChunkSize} to ${newChunkSize}`);
	}
	
    /**
     * Get the current chunk size configuration
     * @returns The current chunk size
     */
    public getChunkSize(): number {
        return this.chunkSize;
    }
    
    /**
     * Enable or disable vertex quantization optimizations
     * @param enabled Whether to use quantization (default: true)
     */
    public setQuantization(enabled: boolean): void {
        const oldValue = this.useQuantization;
        this.useQuantization = enabled;
        
        console.log(`[WorldMeshBuilder] Quantization ${enabled ? 'enabled' : 'disabled'} (was ${oldValue ? 'enabled' : 'disabled'})`);
        if (enabled) {
            console.log('  - Position quantization: 4-bit per component (67% memory reduction)');
            console.log('  - Normal quantization: Octahedron encoding (67% memory reduction)');
        }
    }
    
    /**
     * Get the current quantization setting
     * @returns Whether quantization is enabled
     */
    public getQuantization(): boolean {
        return this.useQuantization;
    }
	

public async precomputePaletteGeometries(palette: any[]): Promise<void> {
    performanceMonitor.startOperation('precomputePaletteGeometries');


		const paletteBlockData: PaletteBlockData[] = new Array(palette.length);
		const globalMaterialMap = new Map<string, THREE.Material>();
		const globalMaterials: THREE.Material[] = [];

		// Process all palette entries
		const CONCURRENCY_LIMIT = 8;
		let currentIndex = 0;
		const workerPromises: Promise<void>[] = [];

		const processBlock = async (index: number) => {
			const blockState = palette[index];
			const blockString = this.createBlockStringFromPaletteEntry(blockState);
			const biome = "plains";

			try {
				// Get geometry from Cubane
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

					materialGroups.push({
						material: globalMaterial,
						baseGeometry: geometry,
						positions: [], // Will be populated during meshing
						materialIndex: globalMaterials.indexOf(globalMaterial),
					});
				}

				paletteBlockData[index] = {
					blockName: blockState.name,
					materialGroups,
					category: this.getBlockCategory(blockState.name),
				};
			} catch (error) {
				console.warn(
					`Error processing palette index ${index}:`,
					error
				);
				// Fallback
				const fallbackObj = this.createFallbackObject3D(blockString);
				const fallbackGeometries = this.extractAllMeshData(fallbackObj);

				paletteBlockData[index] = {
					blockName: blockState.name,
					materialGroups: fallbackGeometries.map(({ geometry, material }) => ({
						material: MaterialRegistry.getMaterial(material),
						baseGeometry: geometry,
						positions: [],
						materialIndex: 0, // Fallback material index
					})),
					category: this.getBlockCategory(blockState.name),
				};
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
				await Promise.race(workerPromises.map((p) => p.catch(() => {})));
			} else if (currentIndex >= palette.length) {
				break;
			}
		}

this.paletteCache = {
    blockData: paletteBlockData,
    globalMaterials,
    isReady: true,
};

performanceMonitor.endOperation('precomputePaletteGeometries');

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
		const initialChunkMemory = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;
		
		// Get call stack trace to identify caller
		const callStack = new Error().stack?.split('\n') || [];
		const caller = callStack[2]?.trim() || 'unknown';
		const callerMethod = caller.includes('at ') ? caller.split('at ')[1]?.split(' ')[0] || 'unknown' : caller;
		
		
		performanceMonitor.startOperation('getChunkMesh', {
			chunkCoords: [chunkData.chunk_x, chunkData.chunk_y, chunkData.chunk_z],
			caller: callerMethod,
			blockCount: chunkData.blocks.length
		});
		if (!this.paletteCache?.isReady) {
			
			throw new Error(
				"Palette cache not ready. Call precomputePaletteGeometries() first."
			);
		}

		if (chunkData.blocks.length === 0) return [];

		// Group blocks by category using precomputed categories
		const categorizedBlocks: {
			solid: Array<{ paletteIndex: number; position: THREE.Vector3 }>;
			water: Array<{ paletteIndex: number; position: THREE.Vector3 }>;
			redstone: Array<{ paletteIndex: number; position: THREE.Vector3 }>;
			transparent: Array<{ paletteIndex: number; position: THREE.Vector3 }>;
			emissive: Array<{ paletteIndex: number; position: THREE.Vector3 }>;
		} = {
		solid: [],
			water: [],
			redstone: [],
			transparent: [],
			emissive: [],
		};

		performanceMonitor.startOperation('categorizeBlocks');

		for (const blockArray of chunkData.blocks) {
			const [x, y, z, paletteIndex] = blockArray;

			if (renderingBounds?.enabled) {
				if (
					x < renderingBounds.min.x ||
					x >= renderingBounds.max.x ||
					y < renderingBounds.min.y ||
					y >= renderingBounds.max.y ||
					z < renderingBounds.min.z ||
					z >= renderingBounds.max.z
				) {
					continue;
				}
			}

			const blockData = this.paletteCache.blockData[paletteIndex];
			if (blockData && blockData.materialGroups.length > 0) {
				if (!INVISIBLE_BLOCKS.has(blockData.blockName)) {
					const position = new THREE.Vector3(x, y, z);
					categorizedBlocks[blockData.category].push({
						paletteIndex,
						position,
					});
				}
			}
		}
		performanceMonitor.endOperation('categorizeBlocks');

		// Create meshes for each category
		const resultMeshes: THREE.Object3D[] = [];
		const meshOrder = [
			"solid",
			"transparent",
			"water",
			"redstone",
			"emissive",
		] as const;

		performanceMonitor.startOperation('createMeshes');

		for (const category of meshOrder) {
			const blocks = categorizedBlocks[category];
			if (blocks.length > 0) {
				const mesh = await this.createCategoryMesh(
					blocks,
					category,
					`schem_${schematicObject.id}_chunk_${chunkData.chunk_x}_${chunkData.chunk_y}_${chunkData.chunk_z}`
				);
				if (mesh) resultMeshes.push(mesh);
			}
		}

		performanceMonitor.endOperation('createMeshes');

performanceMonitor.recordChunkProcessing({
    chunkId: `${chunkData.chunk_x},${chunkData.chunk_y},${chunkData.chunk_z}`,
    chunkCoords: [chunkData.chunk_x, chunkData.chunk_y, chunkData.chunk_z],
    blockCount: chunkData.blocks.length,
    processingTime: performanceMonitor.getCurrentSession()?.timingData.slice(-1)[0].duration || 0,
    meshCount: resultMeshes.length,
    totalVertices: resultMeshes.reduce((sum, mesh) => sum + ((mesh as THREE.Mesh).geometry?.attributes.position.count || 0), 0),
    totalIndices: resultMeshes.reduce((sum, mesh) => sum + ((mesh as THREE.Mesh).geometry?.index?.count || 0), 0),
    memoryUsed: performanceMonitor.takeMemorySnapshot(`chunk_${chunkData.chunk_x}_${chunkData.chunk_y}_${chunkData.chunk_z}`).usedJSHeapSize,
    materialGroups: resultMeshes.reduce((sum, mesh) => sum + ((mesh as THREE.Mesh).geometry?.groups?.length || 0), 0),
    blockTypes: Array.from(new Set(chunkData.blocks.map(block => this.paletteCache?.blockData[block[3]]?.blockName).filter(Boolean))) as string[],
    renderingPhases: [],
    blockTypeTimings: new Map(),
    geometryStats: {
        facesCulled: 0,
        facesGenerated: resultMeshes.reduce((sum, mesh) => sum + ((mesh as THREE.Mesh).geometry?.groups?.length || 0), 0),
        cullingEfficiency: 0,
        averageVerticesPerBlock: chunkData.blocks.length > 0 ? resultMeshes.reduce((sum, mesh) => sum + ((mesh as THREE.Mesh).geometry?.attributes.position.count || 0), 0) / chunkData.blocks.length : 0,
        textureAtlasUsage: []
    },
    memoryBreakdown: {
        vertexBuffers: performanceMonitor.takeMemorySnapshot(`chunk_${chunkData.chunk_x}_${chunkData.chunk_y}_${chunkData.chunk_z}`).usedJSHeapSize * 0.4,
        indexBuffers: performanceMonitor.takeMemorySnapshot(`chunk_${chunkData.chunk_x}_${chunkData.chunk_y}_${chunkData.chunk_z}`).usedJSHeapSize * 0.3,
        materials: performanceMonitor.takeMemorySnapshot(`chunk_${chunkData.chunk_x}_${chunkData.chunk_y}_${chunkData.chunk_z}`).usedJSHeapSize * 0.1,
        textures: performanceMonitor.takeMemorySnapshot(`chunk_${chunkData.chunk_x}_${chunkData.chunk_y}_${chunkData.chunk_z}`).usedJSHeapSize * 0.1,
        other: performanceMonitor.takeMemorySnapshot(`chunk_${chunkData.chunk_x}_${chunkData.chunk_y}_${chunkData.chunk_z}`).usedJSHeapSize * 0.1
    }
});

performanceMonitor.endOperation('getChunkMesh');

		const finalChunkMemory = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;
		const chunkMemoryUsed = finalChunkMemory - initialChunkMemory;


		performanceMonitor.recordOperationDetails('getChunkMesh', {
			chunkCoords: [chunkData.chunk_x, chunkData.chunk_y, chunkData.chunk_z],
			memoryUsed: chunkMemoryUsed
		});

		return resultMeshes;
	}

	private async createCategoryMesh(
		blocks: Array<{ paletteIndex: number; position: THREE.Vector3 }>,
		category: string,
		meshPrefix: string
	): Promise<THREE.Mesh | null> {
		if (blocks.length === 0) return null;

		// Start detailed performance tracking
		performanceMonitor.startOperation(`createCategoryMesh-${category}`, {
			category,
			meshPrefix,
			blockCount: blocks.length
		});

		// Track initial memory state
  const initialMemory = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;
		const materialGroupingStart = performance.now();

		performanceMonitor.startOperation('collectMaterialGroups');

		// Clear positions from previous use and populate with current blocks
		const activeMaterialGroups: PaletteMaterialGroup[] = [];

		// Collect all unique material groups for this category
		const materialGroupSet = new Set<PaletteMaterialGroup>();

		for (const { paletteIndex, position } of blocks) {
			const blockData = this.paletteCache!.blockData[paletteIndex];

			// Add position to each material group for this block
			for (const materialGroup of blockData.materialGroups) {
				materialGroupSet.add(materialGroup);
				materialGroup.positions.push(position);
			}
		}

		performanceMonitor.endOperation('collectMaterialGroups');

		// Convert set to array for processing
		activeMaterialGroups.push(...materialGroupSet);

		if (activeMaterialGroups.length === 0) return null;

		performanceMonitor.startOperation('mergeGeometries');

		// Create merged geometries for each material group
		const allMergedGeometries: THREE.BufferGeometry[] = [];

		for (const materialGroup of activeMaterialGroups) {
			if (materialGroup.positions.length > 0) {
				const mergedGeometry = this.mergeGeometryAtPositions(
					materialGroup.baseGeometry,
					materialGroup.positions
				);
				(mergedGeometry as any).__materialIndex = materialGroup.materialIndex;
				allMergedGeometries.push(mergedGeometry);

				// Clear positions for next use
				materialGroup.positions.length = 0;
			}
		}

		// Final merge
		let finalGeometry: THREE.BufferGeometry | null = null;
		try {
			finalGeometry = this.mergeGeometries(allMergedGeometries);
		} catch (error) {
			console.error(
				`Error merging geometries for ${meshPrefix}-${category}:`,
				error
			);
		}

		performanceMonitor.endOperation('mergeGeometries');

		// Clean up temporary geometries
		allMergedGeometries.forEach((geo) => geo.dispose());

		if (!finalGeometry || finalGeometry.attributes.position.count === 0) {
			finalGeometry?.dispose();
			return null;
		}

		// Track geometry creation performance
		const geometryMergeTime = performance.now() - materialGroupingStart;
  const finalMemory = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;
		const memoryDelta = finalMemory - initialMemory;

		try {
			const mergedMesh = new THREE.Mesh(
				finalGeometry,
				this.paletteCache!.globalMaterials
			);
			mergedMesh.name = `${meshPrefix}-${category}-${blocks.length}b`;
			this.configureMeshForCategory(mergedMesh, category as keyof ChunkMeshes);
			mergedMesh.userData.materialRegistry = true;

			// Record detailed mesh creation metrics
			performanceMonitor.recordBlockProcessing({
				blockType: category,
				processingTime: geometryMergeTime,
				position: [0, 0, 0], // Category-level, not position-specific
				chunkId: meshPrefix,
				memoryUsed: memoryDelta,
				geometryVertices: finalGeometry.attributes.position.count
			});

			performanceMonitor.endOperation(`createCategoryMesh-${category}`);
			return mergedMesh;
		} catch (error) {
			console.error(
				`Failed to create final mesh for ${meshPrefix}-${category}:`,
				error
			);
			finalGeometry?.dispose();
			performanceMonitor.endOperation(`createCategoryMesh-${category}`);
			return null;
		}
	}

	// Helper methods (same as original)
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
		// if (
		// 	blockName.includes("redstone") ||
		// 	blockName.includes("repeater") ||
		// 	blockName.includes("comparator") ||
		// 	blockName.includes("observer") ||
		// 	blockName.includes("piston")
		// )
		// 	return "redstone";
		if (
			blockName.includes("glass") ||
			blockName.includes("leaves") ||
			blockName.includes("ice") ||
			blockName === "minecraft:barrier"
		)
			return "transparent";
		// if (
		// 	blockName.includes("torch") ||
		// 	blockName.includes("lantern") ||
		// 	blockName.includes("glowstone") ||
		// 	blockName.includes("sea_lantern") ||
		// 	blockName.includes("shroomlight")
		// )
		// 	return "emissive";
		return "solid";
	}

private createQuantizedGeometry(
    positions: Float32Array,
    normals?: Float32Array,
    uvs?: Float32Array,
    indices?: Uint32Array | Uint16Array
): THREE.BufferGeometry {
    const vertexCount = positions.length / 3;
    
    // Quantize positions to 4-bit per component, packed in Uint16
    const quantizedPositions = new Uint16Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
        const x = Math.floor(positions[i * 3] * 16) & 0xF;
        const y = Math.floor(positions[i * 3 + 1] * 16) & 0xF;
        const z = Math.floor(positions[i * 3 + 2] * 16) & 0xF;
        quantizedPositions[i] = (x << 12) | (y << 8) | (z << 4);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('aQuantizedPosition', new THREE.BufferAttribute(quantizedPositions, 1));
    
    // Keep normals/UVs as-is for now
    if (normals) {
        const encodedNormals = this.createQuantizedNormals(normals);
        geometry.setAttribute('aEncodedNormal', new THREE.BufferAttribute(encodedNormals, 1));
    }
    if (uvs) {
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }
    if (indices) {
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    }
    
    return geometry;
}

private createQuantizedNormals(normals: Float32Array): Uint16Array {
    const vertexCount = normals.length / 3;
    const encoded = new Uint16Array(vertexCount);
    
    for (let i = 0; i < vertexCount; i++) {
        encoded[i] = this.encodeNormal(
            normals[i * 3],
            normals[i * 3 + 1], 
            normals[i * 3 + 2]
        );
    }
    
    return encoded;
}

private encodeNormal(nx: number, ny: number, nz: number): number {
    // Normalize to unit vector
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx /= length;
    ny /= length; 
    nz /= length;
    
    // Project to octahedron
    const sum = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
    let ox = nx / sum;
    let oy = ny / sum;
    
    // Wrap negative hemisphere
    if (nz < 0) {
        const tmpX = ox;
        ox = (1 - Math.abs(oy)) * Math.sign(ox);
        oy = (1 - Math.abs(tmpX)) * Math.sign(oy);
    }
    
    // Quantize to 8-bit
    const x = Math.floor((ox * 0.5 + 0.5) * 255);
    const y = Math.floor((oy * 0.5 + 0.5) * 255);
    return (x << 8) | y;
}

private mergeGeometries(
    geometries: THREE.BufferGeometry[]
): THREE.BufferGeometry {
    if (geometries.length === 0) return new THREE.BufferGeometry();
    
    // Filter out invalid geometries before processing
    const validGeometries = geometries.filter((geo) => {
        return geo && geo.attributes && geo.attributes.position && geo.attributes.position.count > 0;
    });
    
    if (validGeometries.length === 0) return new THREE.BufferGeometry();
    if (validGeometries.length === 1) return validGeometries[0];

    // Pre-calculate everything in one pass
    let totalPositions = 0;
    let totalIndices = 0;

		if (++bufferAnalysisCounter % BUFFER_ANALYSIS_LOG_INTERVAL === 0) {
			console.log(`Buffer analysis after ${BUFFER_ANALYSIS_LOG_INTERVAL} operations:`);
			console.log(`  Max vertices used: ${maxVerticesUsed}`);
		}
		maxVerticesUsed = Math.max(maxVerticesUsed, totalPositions);
		let hasNormals = false;
		let hasUVs = false;

		// First pass: calculate sizes and validate attributes
		const geometryInfo = validGeometries.map((geo) => {
			const posCount = geo.attributes.position.count;
			const hasNorm = !!geo.attributes.normal;
			const hasUV = !!geo.attributes.uv;
			const indexCount = geo.index ? geo.index.count : posCount;

			totalPositions += posCount;
			totalIndices += indexCount;
			hasNormals = hasNormals || hasNorm;
			hasUVs = hasUVs || hasUV;

			return {
				geometry: geo,
				positionCount: posCount,
				indexCount: indexCount,
				hasNormals: hasNorm,
				hasUVs: hasUV,
				materialIndex: (geo as any).__materialIndex || 0,
			};
		});

		const positions = GeometryBufferPool.getPositionBuffer(totalPositions * 3);

		if (positions.length < totalPositions * 3) {
			console.warn(`Position buffer resized: ${positions.length / 3} vertices available, ${totalPositions} needed`);
		}

		const normals = hasNormals
			? GeometryBufferPool.getPositionBuffer(totalPositions * 3)
			: null;
		const uvs = hasUVs
			? GeometryBufferPool.getPositionBuffer(totalPositions * 2)
			: null;
		// Use 16-bit indices when possible for 50% memory savings
		const use16BitIndices = totalPositions <= 65535;
		const indices = use16BitIndices
			? new Uint16Array(totalIndices)
			: GeometryBufferPool.getIndexBuffer(totalIndices);

		let positionOffset = 0;
		let indexOffset = 0;
		let vertexOffset = 0;

		const groups: { start: number; count: number; materialIndex: number }[] =
			[];
		let currentGroup: {
			start: number;
			count: number;
			materialIndex: number;
		} | null = null;

		for (const info of geometryInfo) {
			const { geometry, positionCount, indexCount, materialIndex } = info;

			const posAttr = geometry.attributes.position.array as Float32Array;
			positions.set(posAttr, positionOffset);

			if (normals && geometry.attributes.normal) {
				const normAttr = geometry.attributes.normal.array as Float32Array;
				normals.set(normAttr, positionOffset);
			}

			// Copy UV data if present
			if (uvs && geometry.attributes.uv) {
				const uvAttr = geometry.attributes.uv.array as Float32Array;
				uvs.set(uvAttr, (positionOffset / 3) * 2);
			}

			if (geometry.index) {
				const geoIndices = geometry.index.array;
				if (vertexOffset === 0) {
					indices.set(geoIndices, indexOffset);
				} else {
					for (let i = 0; i < indexCount; i++) {
						indices[indexOffset + i] = geoIndices[i] + vertexOffset;
					}
				}
			} else {
				// Generate indices
				for (let i = 0; i < positionCount; i++) {
					indices[indexOffset + i] = vertexOffset + i;
				}
			}

			// Update groups
			if (!currentGroup || currentGroup.materialIndex !== materialIndex) {
				if (currentGroup) groups.push(currentGroup);
				currentGroup = { start: indexOffset, count: indexCount, materialIndex };
			} else {
				currentGroup.count += indexCount;
			}

			positionOffset += posAttr.length;
			indexOffset += indexCount;
			vertexOffset += positionCount;
		}

		if (currentGroup) groups.push(currentGroup);

		// Create final geometry
		const mergedGeometry = new THREE.BufferGeometry();
		mergedGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(positions, 3)
		);

		if (normals) {
			mergedGeometry.setAttribute(
				"normal",
				new THREE.BufferAttribute(normals, 3)
			);
		}

		if (uvs) {
			mergedGeometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
		}

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

    private mergeGeometryAtPositions(
        baseGeometry: THREE.BufferGeometry,
        positions: THREE.Vector3[]
    ): THREE.BufferGeometry {
        if (positions.length === 0) return new THREE.BufferGeometry();

        if (positions.length === 1) {
            const cloned = baseGeometry.clone();
            const matrix = new THREE.Matrix4().setPosition(positions[0]);
            cloned.applyMatrix4(matrix);
            return cloned;
        }

		const basePositions = baseGeometry.attributes.position;
		const baseNormals = baseGeometry.attributes.normal;
		const baseUVs = baseGeometry.attributes.uv;
		const baseIndex = baseGeometry.index;

		const vertexCount = basePositions.count;
		const positionCount = positions.length;
		const totalVertices = vertexCount * positionCount;

		const mergedPositions = GeometryBufferPool.getPositionBuffer(
			totalVertices * 3
		);
		const mergedNormals = baseNormals
			? GeometryBufferPool.getPositionBuffer(totalVertices * 3)
			: null;
		const mergedUVs = baseUVs
			? GeometryBufferPool.getPositionBuffer(totalVertices * 2)
			: null;
		const mergedIndices = baseIndex
			? GeometryBufferPool.getIndexBuffer(baseIndex.count * positionCount)
			: null;

		const basePositionArray = basePositions.array as Float32Array;
		const baseNormalArray = baseNormals?.array as Float32Array;
		const baseUVArray = baseUVs?.array as Float32Array;
		const baseIndexArray = baseIndex?.array;

		const vertexSize3 = vertexCount * 3;
		const vertexSize2 = vertexCount * 2;
		const indexSize = baseIndex?.count || 0;

		this.mergePositionsVectorized(
			mergedPositions,
			basePositionArray,
			positions,
			vertexCount,
			vertexSize3
		);

		if (baseNormalArray && mergedNormals) {
			this.bulkCopyAttribute(
				mergedNormals,
				baseNormalArray,
				positionCount,
				vertexSize3
			);
		}

		if (baseUVArray && mergedUVs) {
			this.bulkCopyAttribute(
				mergedUVs,
				baseUVArray,
				positionCount,
				vertexSize2
			);
		}

		if (baseIndexArray && mergedIndices) {
			this.mergeIndices(
				mergedIndices,
				baseIndexArray,
				positionCount,
				vertexCount,
				indexSize
			);
		}

        // Choose between quantized or standard geometry creation
        if (this.useQuantization) {
            return this.createQuantizedGeometry(
                mergedPositions,
                mergedNormals || undefined,
                mergedUVs || undefined,
                mergedIndices || undefined
            );
        } else {
            // Create standard geometry with pooled buffers
            const mergedGeometry = new THREE.BufferGeometry();
            mergedGeometry.setAttribute(
                "position",
                new THREE.BufferAttribute(mergedPositions, 3)
            );

            if (mergedNormals) {
                mergedGeometry.setAttribute(
                    "normal",
                    new THREE.BufferAttribute(mergedNormals, 3)
                );
            }

            if (mergedUVs) {
                mergedGeometry.setAttribute(
                    "uv",
                    new THREE.BufferAttribute(mergedUVs, 2)
                );
            }

            if (mergedIndices) {
                mergedGeometry.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
            }

            return mergedGeometry;
        }
	}

	private mergeIndices(
		mergedIndices: Uint32Array,
		baseIndexArray: ArrayLike<number>,
		instanceCount: number,
		vertexCount: number,
		indexSize: number
	): void {
		if (indexSize > 0) {
			if (baseIndexArray instanceof Uint32Array) {
				mergedIndices.set(baseIndexArray, 0);
			} else {
				for (let i = 0; i < indexSize; i++) {
					mergedIndices[i] = baseIndexArray[i];
				}
			}
		}

		for (let instance = 1; instance < instanceCount; instance++) {
			const vertexOffset = instance * vertexCount;
			const indexOffset = instance * indexSize;

			const UNROLL_SIZE = 8;
			const unrolledEnd = indexSize - (indexSize % UNROLL_SIZE);

			let i = 0;
			for (; i < unrolledEnd; i += UNROLL_SIZE) {
				const destIdx = indexOffset + i;
				mergedIndices[destIdx] = baseIndexArray[i] + vertexOffset;
				mergedIndices[destIdx + 1] = baseIndexArray[i + 1] + vertexOffset;
				mergedIndices[destIdx + 2] = baseIndexArray[i + 2] + vertexOffset;
				mergedIndices[destIdx + 3] = baseIndexArray[i + 3] + vertexOffset;
				mergedIndices[destIdx + 4] = baseIndexArray[i + 4] + vertexOffset;
				mergedIndices[destIdx + 5] = baseIndexArray[i + 5] + vertexOffset;
				mergedIndices[destIdx + 6] = baseIndexArray[i + 6] + vertexOffset;
				mergedIndices[destIdx + 7] = baseIndexArray[i + 7] + vertexOffset;
			}

			// Handle remaining indices
			for (; i < indexSize; i++) {
				mergedIndices[indexOffset + i] = baseIndexArray[i] + vertexOffset;
			}
		}
	}

	private mergePositionsVectorized(
		mergedPositions: Float32Array,
		basePositionArray: Float32Array,
		positions: THREE.Vector3[],
		// @ts-ignore
		vertexCount: number,
		vertexSize3: number
	): void {
		const BATCH_SIZE = 1024; // Process 1024 vertices at a time

		for (let instance = 0; instance < positions.length; instance++) {
			const pos = positions[instance];
			const offset = instance * vertexSize3;

			mergedPositions.set(basePositionArray, offset);

			const posX = pos.x;
			const posY = pos.y;
			const posZ = pos.z;

			for (
				let batchStart = 0;
				batchStart < vertexSize3;
				batchStart += BATCH_SIZE * 3
			) {
				const batchEnd = Math.min(batchStart + BATCH_SIZE * 3, vertexSize3);

				for (let i = batchStart; i < batchEnd; i += 3) {
					const idx = offset + i;
					mergedPositions[idx] += posX;
					mergedPositions[idx + 1] += posY;
					mergedPositions[idx + 2] += posZ;
				}
			}
		}
	}

	private bulkCopyAttribute(
		merged: Float32Array,
		base: Float32Array,
		instanceCount: number,
		stride: number
	): void {
		for (let instance = 0; instance < instanceCount; instance++) {
			merged.set(base, instance * stride);
		}
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


    public enableInstancedRendering(group: THREE.Group, merged: boolean = false): void {
        this.useInstancedRendering = true;
        this.instancedRenderer = new InstancedBlockRenderer(group, this.paletteCache);
        
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
		schematicObject: SchematicObject,
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

			// Apply rendering bounds if enabled
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

		// Render all blocks using instanced rendering
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
			// Dispose all precomputed geometries
			this.paletteCache.blockData.forEach((blockData) => {
				blockData.materialGroups.forEach((group) => {
					if (group.baseGeometry) {
						group.baseGeometry.dispose();
					}
				});
			});
			this.paletteCache = null;
		}
		console.log("[OptWMB] Disposed palette cache.");
    }

}
