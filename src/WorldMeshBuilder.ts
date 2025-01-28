import * as THREE from "three";
import { BlockMeshBuilder } from "./BlockMeshBuilder";
import {
    INVISIBLE_BLOCKS,
    facingvectorToFace,
    getDegreeRotationMatrix,
    occludedFacesIntToList,
    rotateVectorMatrix,
} from "./utils";

import { Vector } from "./types";
import { SchematicWrapper } from "./wasm/minecraft_schematic_utils";
import { SchematicRenderer } from "./SchematicRenderer";
import { SchematicObject } from "./managers/SchematicObject";


export class WorldMeshBuilder {
    private schematicRenderer: SchematicRenderer;
    private blockMeshBuilder: BlockMeshBuilder;
    private blockCache: Map<string, any>;
    private metaCache: Map<string, any>;

    constructor(schematicRenderer: SchematicRenderer) {
        this.schematicRenderer = schematicRenderer;
        this.blockMeshBuilder = new BlockMeshBuilder(this.schematicRenderer);
        this.blockCache = new Map();
        this.metaCache = new Map();
    }

    private async getBlockMeta(name: string, properties: Record<string, string>) {
        const cacheKey = `${name}-${JSON.stringify(properties)}`;
        if (!this.metaCache.has(cacheKey)) {
            const meta = await this.schematicRenderer.resourceLoader?.getBlockMeta({
                name,
                properties,
            });
            this.metaCache.set(cacheKey, meta);
            return meta;
        }
        return this.metaCache.get(cacheKey);
    }


private rotationMatrixCache: Map<string, number[][]> = new Map();
    
    // Get rotation matrix with caching
    private getRotationMatrix(x: number, y: number, z: number): number[][] {
        const key = `${x},${y},${z}`;
        if (!this.rotationMatrixCache.has(key)) {
            this.rotationMatrixCache.set(key, getDegreeRotationMatrix(-x, -y, -z));
        }
        return this.rotationMatrixCache.get(key)!;
    }

    // Pre-calculate block meta and cache it
    private async prepareBlockMeta(name: string, properties: Record<string, string>) {


        if (name === "minecraft:redstone_wire" && Object.keys(properties).length === 0) {
			properties = {
				power: "0",
				north: "none",
				south: "none",  
				east: "none",
				west: "none"
            };
		}
        const meta = await this.getBlockMeta(name, properties);
        const holder = meta.modelOptions.holders[0];
        return {
            meta,
            rotationMatrix: this.getRotationMatrix(
                holder?.x ?? 0,
                holder?.y ?? 0,
                holder?.z ?? 0
            )
        };
    }

    private metrics = {
        timings: new Map<string, number>(),
        memory: new Map<string, number[]>(),
        startTime: 0
    };

    private trackTiming(key: string, time: number) {
        const current = this.metrics.timings.get(key) ?? 0;
        this.metrics.timings.set(key, current + time);
    }

    private trackMemory() {
        if (window.performance && (performance as any).memory) {
            const memory = (performance as any).memory;
            this.metrics.memory.get('heap') ?? this.metrics.memory.set('heap', []);
            this.metrics.memory.get('heap')?.push(memory.usedJSHeapSize / 1024 / 1024);
        }
    }

    // @ts-ignore
    private logMetrics() {
        console.group('Build Performance Metrics');
        
        // Total time
        const totalTime = performance.now() - this.metrics.startTime;
        console.log(`Total build time: ${totalTime.toFixed(2)}ms`);
        
        // Detailed timings
        console.group('Timing Breakdown');
        for (const [key, value] of this.metrics.timings) {
            const percentage = ((value / totalTime) * 100).toFixed(1);
            console.log(`${key}: ${value.toFixed(2)}ms (${percentage}% of total)`);
        }
        console.groupEnd();

        // Memory metrics
        if (this.metrics.memory.has('heap')) {
            const heapSamples = this.metrics.memory.get('heap')!;
            console.group('Memory Usage');
            console.log(`Peak heap: ${Math.max(...heapSamples).toFixed(2)}MB`);
            console.log(`Average heap: ${(heapSamples.reduce((a, b) => a + b) / heapSamples.length).toFixed(2)}MB`);
            console.log(`Samples taken: ${heapSamples.length}`);
            console.groupEnd();
        }

        console.groupEnd();
    }

    private getPropertiesKey(properties: Record<string, string>): string {
        const keys = Object.keys(properties).sort();
        return keys.map(k => `${k}=${properties[k]}`).join(',');
    }

    private async prepareBlockMetaCache(chunk: any[]): Promise<Map<string, any>> {
        const blockMetaCache = new Map<string, any>();
    
        // Collect unique block keys with proper property parsing
        const uniqueKeys = new Set<string>();
        for (const blockData of chunk) {
            const { name, properties } = blockData;
            const key = `${name}-${this.propertiesToString(properties)}`;
            uniqueKeys.add(key);
        }
    
        // Parallel metadata fetching
        const metaPromises = Array.from(uniqueKeys).map(async (key) => {
            const [name, propertiesStr] = key.split('-');
            const properties = this.stringToProperties(propertiesStr); // Fixed parsing
            const meta = await this.prepareBlockMeta(name, properties);
            return { key, meta };
        });
    
        // Store results
        const metas = await Promise.all(metaPromises);
        for (const { key, meta } of metas) {
            blockMetaCache.set(key, meta);
        }
    
        return blockMetaCache;
    }
    
    // Convert properties object to safe string
    private propertiesToString(properties: Record<string, string>): string {
        return Object.keys(properties)
            .sort()
            .map(k => `${k}=${properties[k]}`)
            .join(',');
    }
    
    // Convert string back to properties object
    private stringToProperties(str: string): Record<string, string> {
        return str.split(',')
            .reduce((acc: Record<string, string>, pair) => {
                const [key, value] = pair.split('=');
                if (key && value) acc[key] = value;
                return acc;
            }, {});
    }


    public async getChunkMesh(
        chunk: any[],
        schematic: SchematicWrapper
    ): Promise<THREE.Mesh[]> {
        const startTime = performance.now();
    
        // Track pre-meta calculation memory
        this.trackMemory();
    
        // Pre-calculate block metas in parallel
        const metaStartTime = performance.now();
        const blockMetaCache = await this.prepareBlockMetaCache(chunk);
        this.trackTiming('meta_calculation', performance.now() - metaStartTime);
    
        // Track post-meta calculation memory
        this.trackMemory();
    
        // Process blocks in parallel
        const processStartTime = performance.now();
        const components = await this.processBlocks(chunk, schematic, blockMetaCache);
        this.trackTiming('block_processing', performance.now() - processStartTime);
    
        // Track pre-mesh creation memory
        this.trackMemory();
    
        // Create meshes timing
        const meshStartTime = performance.now();
        const meshes = await this.schematicRenderer.resourceLoader?.createMeshesFromBlocks(components);
        this.trackTiming('mesh_creation', performance.now() - meshStartTime);
    
        // Track final memory state
        this.trackMemory();
    
        // Track total chunk time
        this.trackTiming('total_chunk_processing', performance.now() - startTime);
    
        return meshes as THREE.Mesh[];
    }

    private async processBlocks(
        chunk: any[], 
        schematic: SchematicWrapper,
        blockMetaCache: Map<string, any>
    ): Promise<Record<string, any[]>> {
        const maxBlocksAllowed = 100000000;
        let count = 0;
        const components: Record<string, any[]> = {};
    
        // Precompute block positions for occlusion checks
        const blockPositions = new Set<string>();
        for (const blockData of chunk) {
            blockPositions.add(`${blockData.x},${blockData.y},${blockData.z}`);
        }
    
        // Process blocks in parallel
        const promises = chunk.map(async (blockData) => {
            if (count > maxBlocksAllowed) return;
    
            const { x, y, z, name, properties } = blockData;
            if (INVISIBLE_BLOCKS.has(name)) return;
    
            // Use a new vector instance for each block
            const position = new THREE.Vector3(x, y, z);
    
            const occludedFaces = occludedFacesIntToList(
                this.blockMeshBuilder.getOccludedFacesForBlock(
                    schematic,
                    blockData,
                    position
                )
            );
    
            const blockComponents = await this.blockMeshBuilder.getBlockMeshFromCache(
                { name, properties },
                { x, y, z }
            );
    
            if (!blockComponents) return;
    
            // Get pre-calculated meta and rotation matrix
            const key = `${name}-${this.getPropertiesKey(properties)}`;
            const { rotationMatrix } = blockMetaCache.get(key);
    
            // Process all components for this block
            for (const key in blockComponents) {
                const blockComponent = blockComponents[key];
                const materialId = blockComponent.materialId;
    
                // Skip rotation if it's an identity matrix
                const normal = [blockComponent.normals[0], blockComponent.normals[1], blockComponent.normals[2]];
                const newNormal = (x === 0 && y === 0 && z === 0) 
                    ? normal 
                    : rotateVectorMatrix(normal, rotationMatrix) as Vector;
                const newFace = facingvectorToFace(newNormal as Vector);
    
                if (occludedFaces[newFace]) continue;
    
                // Initialize component array if needed
                if (!components[materialId]) {
                    components[materialId] = [];
                }
                components[materialId].push([blockComponent, [x, y, z]]);
            }
    
            count++;
        });
    
        await Promise.all(promises);
    
        return components;
    }

    public async buildSchematicMeshes(
        schematicObject: SchematicObject,
        chunkDimensions: any = {
            chunkWidth: 16,
            chunkHeight: 16,
            chunkLength: 16,
        }
    ): Promise<{ meshes: THREE.Mesh[]; chunkMap: Map<string, THREE.Mesh[]> }> {
        const schematic = schematicObject.schematicWrapper;
        // Reset metrics for new build
        this.metrics.timings.clear();
        this.metrics.memory.clear();
        this.metrics.startTime = performance.now();
    
        const chunks = schematic.chunks(
            chunkDimensions.chunkWidth,
            chunkDimensions.chunkHeight,
            chunkDimensions.chunkLength
        );
    
        const schematicMeshes: THREE.Mesh[] = [];
        const chunkMap: Map<string, THREE.Mesh[]> = new Map();
        const maxChunks = -1;
    
        console.log(`Processing ${chunks.length} chunks...`);
        let index = 0;
    
        // Track initial memory state
        this.trackMemory();
    
        for (const chunkData of chunks) {
            index++;
            if (index > maxChunks && maxChunks > 0) {
                console.warn(`Exceeded max chunks (${maxChunks})`);
                break;
            }
    
            const { chunk_x, chunk_y, chunk_z, blocks } = chunkData;
    
            try {
                // Track chunk processing
                const chunkStartTime = performance.now();
    
                // Track pre-processing memory
                this.trackMemory();
    
                const chunkMeshes = await this.getChunkMesh(
                    blocks as any[],
                    schematic
                );
    
                // Track post-processing memory
                this.trackMemory();
    
                const chunkTime = performance.now() - chunkStartTime;
                this.trackTiming(`chunk_${index}`, chunkTime);
    
                if (chunkMeshes && chunkMeshes.length > 0) {
                    console.log(`${index}/${chunks.length} Processed chunk at ${chunk_x},${chunk_y},${chunk_z} (${chunkTime.toFixed(2)}ms)`);
                    const chunkKey = `${chunk_x},${chunk_y},${chunk_z}`;
                    chunkMap.set(chunkKey, chunkMeshes);
                    schematicMeshes.push(...chunkMeshes);
    
                    // Track memory after adding meshes
                    this.trackMemory();
                }
    
                // Log progress metrics every 5 chunks
                if (index % 5 === 0) {
                    const progress = (index / chunks.length) * 100;
                    console.log(`Progress: ${progress.toFixed(1)}%`);
                    this.trackMemory();
                }
    
            } catch (error) {
                console.error(`Error processing chunk at ${chunk_x},${chunk_y},${chunk_z}:`, error);
                this.trackTiming('errors', 0);  // Track error occurrences
                continue;
            }
        }
    
        // Log final metrics
        // this.logMetrics();
    
        return { meshes: schematicMeshes, chunkMap };
    }

    // Cleanup method
public dispose(): void {
    this.blockCache.clear();
    this.metaCache.clear();
    this.rotationMatrixCache.clear();
}
}