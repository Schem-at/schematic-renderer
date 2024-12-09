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

// Pre-allocated reusable objects
const REUSABLE_VECTOR = new THREE.Vector3();

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

    private async processBatch(
        batch: any[],
        schematic: SchematicWrapper,
        components: Record<string, any[]>
    ): Promise<void> {
        for (const blockData of batch) {
            const { x, y, z, name, properties } = blockData;

            if (INVISIBLE_BLOCKS.has(name)) continue;

            // Reuse vector for position
            REUSABLE_VECTOR.set(x, y, z);
            
            const occludedFaces = occludedFacesIntToList(
                this.blockMeshBuilder.getOccludedFacesForBlock(
                    schematic,
                    blockData,
                    REUSABLE_VECTOR
                )
            );

            const cacheKey = `${name}-${JSON.stringify(properties)}`;
            let blockComponents = this.blockCache.get(cacheKey);

            if (!blockComponents) {
                blockComponents = await this.blockMeshBuilder.getBlockMeshFromCache(
                    { name, properties },
                    { x, y, z }
                );
                this.blockCache.set(cacheKey, blockComponents);
            }

            for (const key in blockComponents) {
                const component = blockComponents[key];
                if (!component || !component.normals || component.normals.length < 3) {
                    continue;
                }

                const materialId = component.materialId;
                const blockMeta = await this.getBlockMeta(name, properties);
                const holder = blockMeta?.modelOptions?.holders?.[0] || { x: 0, y: 0, z: 0 };

                // Get rotation matrix safely
                const rotationMatrix = getDegreeRotationMatrix(
                    -(holder.x || 0),
                    -(holder.y || 0),
                    -(holder.z || 0)
                );

                // Ensure we have valid normals before rotating
                const normalVector = component.normals.slice(0, 3);
                if (!normalVector || normalVector.length !== 3) {
                    continue;
                }

                const newNormal = rotateVectorMatrix(normalVector, rotationMatrix) as Vector;
                if (!newNormal) {
                    continue;
                }

                const newFace = facingvectorToFace(newNormal);
                if (occludedFaces[newFace]) {
                    continue;
                }

                if (!components[materialId]) {
                    components[materialId] = [];
                }
                components[materialId].push([component, [x, y, z]]);
            }
        }
    }

    public async getChunkMesh(
        chunk: any[],
        schematic: SchematicWrapper
    ): Promise<THREE.Mesh[]> {
        const components: Record<string, any[]> = {};
        const BATCH_SIZE = 100; // Reduced batch size for better stability

        for (let i = 0; i < chunk.length; i += BATCH_SIZE) {
            const batch = chunk.slice(i, i + BATCH_SIZE);
            await this.processBatch(batch, schematic, components);
            // Small delay to prevent blocking
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const meshes = await this.schematicRenderer.resourceLoader?.createMeshesFromBlocks(components);
        return meshes as THREE.Mesh[];
    }

    public async buildSchematicMeshes(
        schematic: SchematicWrapper,
        chunkDimensions: any = {
            chunkWidth: 16,
            chunkHeight: 16,
            chunkLength: 16,
        }
    ): Promise<{ meshes: THREE.Mesh[]; chunkMap: Map<string, THREE.Mesh[]> }> {
        const chunks = schematic.chunks(
            chunkDimensions.chunkWidth,
            chunkDimensions.chunkHeight,
            chunkDimensions.chunkLength
        );

        const schematicMeshes: THREE.Mesh[] = [];
        const chunkMap: Map<string, THREE.Mesh[]> = new Map();
        
        // Process chunks sequentially to prevent memory issues
        for (const chunkData of chunks) {
            const { chunk_x, chunk_y, chunk_z, blocks } = chunkData;
            
            try {
                const chunkMeshes = await this.getChunkMesh(
                    blocks as any[],
                    schematic
                );
                
                if (chunkMeshes && chunkMeshes.length > 0) {
                    const chunkKey = `${chunk_x},${chunk_y},${chunk_z}`;
                    chunkMap.set(chunkKey, chunkMeshes);
                    schematicMeshes.push(...chunkMeshes);
                }
            } catch (error) {
                console.error(`Error processing chunk at ${chunk_x},${chunk_y},${chunk_z}:`, error);
                continue;
            }
        }

        return { meshes: schematicMeshes, chunkMap };
    }

    // Cleanup method
    public dispose(): void {
        this.blockCache.clear();
        this.metaCache.clear();
    }
}