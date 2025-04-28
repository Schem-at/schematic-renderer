// WorldMeshBuilder.ts
import * as THREE from "three";
import { SchematicRenderer } from "./SchematicRenderer";
import { INVISIBLE_BLOCKS } from "./utils";
import { SchematicObject } from "./managers/SchematicObject";
import { hashTextureKey } from "./meshing/chunkMesher";
// Import necessary types
import type { ChunkMeshRequest, BakedBlockDef, BlockData } from "./types";

export class WorldMeshBuilder {
	private schematicRenderer: SchematicRenderer;
	private materialCache: Map<number, THREE.Material> = new Map();
	private textureKeyMap: Map<number, string> = new Map(); // Maps material IDs to texture keys

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
	}

	/**
	 * Maps a texture key to its hashed material ID and stores the mapping
	 * This allows for retrieving the original texture key when creating materials
	 */
	private registerTextureKey(textureKey: string): number {
		const materialId = hashTextureKey(textureKey);
		this.textureKeyMap.set(materialId, textureKey);
		return materialId;
	}

	/**
	 * Generates meshes for a set of blocks belonging to a schematic.
	 * @param blocks Array of block data objects for this chunk/area.
	 * @param schematic The SchematicObject containing block definitions.
	 * @param renderingBounds Optional bounds to limit meshing.
	 * @returns A promise resolving to an array of THREE.Mesh objects.
	 */
	/**
	 * Modifies stateKeys in block data to match the numeric palette indices
	 * This ensures the mesh worker can find the correct block definitions
	 */
	private mapBlocksToDefinitions(
		blocks: BlockData[],
		blockPalette: any[]
	): BlockData[] {
		// First, let's understand what's in the blocks data

		// Count blocks with undefined stateKey
		const undefinedCount = blocks.filter(
			(b) => b.stateKey === undefined
		).length;

		// Map of block IDs to their numeric index in the palette
		const paletteMap = new Map<string, number>();

		if (Array.isArray(blockPalette)) {
			blockPalette.forEach((id, index) => {
				// Map both the full ID and the numeric index
				if (typeof id === "string") {
					paletteMap.set(id, index);
				}
				paletteMap.set(index.toString(), index);
			});
		}

		// Map of block names to their palette index (for fallback)
		const nameToIndex = new Map<string, number>();
		if (Array.isArray(blockPalette)) {
			blockPalette.forEach((id, index) => {
				if (typeof id === "string") {
					// Extract the base name without properties
					const baseName = id.replace(/minecraft:/, "").split("[")[0];
					nameToIndex.set(baseName, index);
				}
			});
		}

		// Copy blocks and adjust stateKeys to match definitions
		return blocks.map((block) => {
			const adjusted = { ...block };

			// Handle undefined stateKey
			if (block.stateKey === undefined) {
				// Try to use the block name to find a matching palette entry
				if (block.name) {
					const baseName = block.name.replace(/minecraft:/, "").split("[")[0];
					if (nameToIndex.has(baseName)) {
						adjusted.stateKey = nameToIndex.get(baseName)!.toString();
						// Uncomment if there are many warnings
						// console.log(`Fixed undefined stateKey for block ${block.name} -> ${adjusted.stateKey}`);
					} else {
						// Can't find a match, use '0' as a last resort (likely air)
						adjusted.stateKey = "0";
						console.warn(
							`No palette match for block name ${block.name}, using '0'`
						);
					}
				} else {
					// No name or stateKey, assume it's air (index 0)
					adjusted.stateKey = "0";
					console.warn("Block has no name or stateKey, assuming air (0)");
				}
			} else if (paletteMap.has(block.stateKey)) {
				// Use the numeric index as stateKey
				adjusted.stateKey = paletteMap.get(block.stateKey)!.toString();
			} else if (/^\d+$/.test(block.stateKey)) {
				// If stateKey is already a number string, leave it as is
			} else {
				// Try to match by block name as fallback
				if (block.name) {
					const baseName = block.name.replace(/minecraft:/, "").split("[")[0];
					if (nameToIndex.has(baseName)) {
						adjusted.stateKey = nameToIndex.get(baseName)!.toString();
						console.log(
							`Matched block ${block.name} to palette index ${adjusted.stateKey}`
						);
					} else {
						console.warn(`Block has stateKey "${block.stateKey}" not found in palette, 
						  and name "${block.name}" couldn't be matched`);
					}
				} else {
					console.warn(
						`Block has stateKey "${block.stateKey}" not found in palette`
					);
				}
			}

			return adjusted;
		});
	}

	public async getChunkMesh(
		blocks: BlockData[],
		schematic: SchematicObject,
		renderingBounds?: { min: THREE.Vector3; max: THREE.Vector3 }
	): Promise<THREE.Mesh[]> {
		// Filter invisible blocks
		const visibleBlocks = blocks.filter(
			(block) => !INVISIBLE_BLOCKS.has(block.name)
		);

		// If no visible blocks, return early to avoid errors
		if (visibleBlocks.length === 0) {
			return [];
		}

		// Convert renderingBounds to transferable array format
		const transferBounds = renderingBounds
			? {
					min: [
						renderingBounds.min.x,
						renderingBounds.min.y,
						renderingBounds.min.z,
					] as [number, number, number],
					max: [
						renderingBounds.max.x,
						renderingBounds.max.y,
						renderingBounds.max.z,
					] as [number, number, number],
			  }
			: undefined;

		// Get block definitions from the schematic using the get_block_palette method
		const blockPalette = schematic.schematicWrapper?.get_block_palette();
		if (!blockPalette) {
			console.warn("No block palette found in schematic");
			return [];
		}

		// Process the block palette to create block definitions
		const blockDefs = this.processBlockPalette(blockPalette, schematic);
		if (!blockDefs || blockDefs.length === 0) {
			console.warn("No block definitions could be generated from palette");
			return [];
		}

		// Map block stateKeys to match our generated definitions
		const adjustedBlocks = this.mapBlocksToDefinitions(
			visibleBlocks,
			blockPalette
		);

		// Use the mesh worker manager to generate geometry
		const meshWorkerRequest: ChunkMeshRequest = {
			chunkX: visibleBlocks[0]?.chunk_x ?? 0,
			chunkY: visibleBlocks[0]?.chunk_y ?? 0,
			chunkZ: visibleBlocks[0]?.chunk_z ?? 0,
			schematicId: schematic.name || "unknown",
			width: 16,
			height: 16,
			depth: 16,
			blocks: adjustedBlocks, // Use the adjusted blocks with corrected stateKeys
			renderingBounds: transferBounds,
			defs: blockDefs,
		};

		try {
			// Get geometry from worker (or main thread fallback)
			const geometry =
				await this.schematicRenderer.meshWorkerManager.generateChunkMesh(
					meshWorkerRequest
				);

			// Check if geometry generation resulted in valid data
			if (!geometry || !geometry.getAttribute("position")) {
				console.warn(
					"Mesh generation resulted in empty or invalid geometry for chunk",
					meshWorkerRequest.chunkX,
					meshWorkerRequest.chunkY,
					meshWorkerRequest.chunkZ
				);
				return [];
			}

			// Get the material indices attribute from the geometry
			const materialIndices = geometry.getAttribute("materialIndex");

			if (!materialIndices) {
				console.log(
					"No material indices attribute found in geometry, using default material"
				);
				// If no material indices are provided, use a default material
				return [this.createDefaultMesh(geometry, meshWorkerRequest)];
			}

			// Group the geometry by material IDs for optimal rendering
			const meshes = this.createMaterialGroupedMeshes(
				geometry,
				meshWorkerRequest
			);

			// Debug information

			// Set up mesh properties for rendering
			meshes.forEach((mesh) => {
				// Make sure mesh is visible
				mesh.visible = true;
				mesh.frustumCulled = true; // Enable frustum culling for performance

				// Enable shadows
				mesh.castShadow = true;
				mesh.receiveShadow = true;
			});

			return meshes;
		} catch (error) {
			console.error(
				`Error processing chunk mesh at ${meshWorkerRequest.chunkX},${meshWorkerRequest.chunkY},${meshWorkerRequest.chunkZ}:`,
				error
			);
			return []; // Return empty array on error
		}
	}

	/**
	 * Creates a default mesh with a single material when material indices are not available.
	 */
	private createDefaultMesh(
		geometry: THREE.BufferGeometry,
		request: ChunkMeshRequest
	): THREE.Mesh {
		const defaultMaterial = new THREE.MeshStandardMaterial({
			color: 0xcccccc,
			roughness: 0.7,
			metalness: 0.2,
		});

		const mesh = new THREE.Mesh(geometry, defaultMaterial);

		// Ensure mesh is properly configured for rendering
		mesh.visible = true;
		mesh.frustumCulled = true;
		mesh.castShadow = true;
		mesh.receiveShadow = true;

		// Compute bounding information for performance
		if (!geometry.boundingSphere) {
			geometry.computeBoundingSphere();
		}

		mesh.userData = {
			chunkX: request.chunkX,
			chunkY: request.chunkY,
			chunkZ: request.chunkZ,
			isDefaultMesh: true,
		};

		console.log(
			"Created default mesh with bounding sphere radius:",
			geometry.boundingSphere?.radius
		);

		return mesh;
	}

	/**
	 * Creates separate meshes for different materials to optimize rendering.
	 * This approach groups faces by material ID to minimize material switches during rendering.
	 */
	private createMaterialGroupedMeshes(
		geometry: THREE.BufferGeometry,
		request: ChunkMeshRequest
	): THREE.Mesh[] {
		// Get the material indices from the geometry
		const materialIndices = geometry.getAttribute("materialIndex");
		const indices = geometry.getIndex();

		if (!indices) {
			console.warn("Geometry missing indices, using default mesh");
			return [this.createDefaultMesh(geometry, request)];
		}

		// Find all unique material IDs
		const uniqueMaterialIds = new Set<number>();
		for (let i = 0; i < materialIndices.count; i++) {
			uniqueMaterialIds.add(materialIndices.getX(i));
		}

		// If only one material ID is used, we can use the geometry as is
		if (uniqueMaterialIds.size === 1) {
			const materialId = uniqueMaterialIds.values().next().value;
			const material = this.getMaterial(materialId);

			const mesh = new THREE.Mesh(geometry, material);
			mesh.userData = {
				chunkX: request.chunkX,
				chunkY: request.chunkY,
				chunkZ: request.chunkZ,
				materialId,
			};

			return [mesh];
		}

		// Group faces by material ID
		const meshes: THREE.Mesh[] = [];

		// Each unique material ID will get its own mesh
		uniqueMaterialIds.forEach((materialId) => {
			// Create a new index buffer for this material
			const faceIndices: number[] = [];

			// Go through all the indices to find faces using this material
			for (let i = 0; i < indices.count; i += 3) {
				// Get the first vertex of this triangle
				const v1 = indices.getX(i);

				// Get the material ID for this vertex
				const mat = materialIndices.getX(v1);

				// If this face uses our current material, add all three indices
				if (mat === materialId) {
					faceIndices.push(
						indices.getX(i),
						indices.getX(i + 1),
						indices.getX(i + 2)
					);
				}
			}

			// If no faces use this material, skip creating a mesh
			if (faceIndices.length === 0) return;

			// Create a new geometry for this material group
			const materialGeometry = new THREE.BufferGeometry();

			// Instead of cloning all attributes, let's create a new geometry with only the vertices we need
			// This resolves the "vertex buffer not big enough" WebGL errors

			// Get the positions, normals, and UVs attributes
			const positions = geometry.getAttribute("position");
			const normals = geometry.getAttribute("normal");
			const uvs = geometry.getAttribute("uv");

			// Create maps to track which vertices we're using
			const vertexMap = new Map<number, number>();
			const newPositions: number[] = [];
			const newNormals: number[] = [];
			const newUvs: number[] = [];
			const newIndices: number[] = [];

			// Process each face (triangle)
			for (let i = 0; i < faceIndices.length; i += 3) {
				// Get the original indices for this triangle
				const idx1 = faceIndices[i];
				const idx2 = faceIndices[i + 1];
				const idx3 = faceIndices[i + 2];

				// Safety check: make sure indices are valid
				if (
					idx1 >= positions.count ||
					idx2 >= positions.count ||
					idx3 >= positions.count
				) {
					console.warn(
						`Invalid index detected: ${idx1}, ${idx2}, ${idx3} (limit: ${positions.count}). Skipping triangle.`
					);
					continue;
				}

				// Map original vertices to new indices
				for (const idx of [idx1, idx2, idx3]) {
					if (!vertexMap.has(idx)) {
						// Add this vertex to our new geometry
						const newIdx = newPositions.length / 3;
						vertexMap.set(idx, newIdx);

						// Copy position
						newPositions.push(
							positions.getX(idx),
							positions.getY(idx),
							positions.getZ(idx)
						);

						// Copy normal
						newNormals.push(
							normals.getX(idx),
							normals.getY(idx),
							normals.getZ(idx)
						);

						// Copy UV
						newUvs.push(uvs.getX(idx), uvs.getY(idx));
					}

					// Add index to new triangle
					newIndices.push(vertexMap.get(idx)!);
				}
			}

			// Create new attribute buffers
			materialGeometry.setAttribute(
				"position",
				new THREE.Float32BufferAttribute(newPositions, 3)
			);
			materialGeometry.setAttribute(
				"normal",
				new THREE.Float32BufferAttribute(newNormals, 3)
			);
			materialGeometry.setAttribute(
				"uv",
				new THREE.Float32BufferAttribute(newUvs, 2)
			);

			// Set the index buffer
			materialGeometry.setIndex(newIndices);

			// console.log(
			// 	`Created geometry for material ${materialId} with ${
			// 		newIndices.length / 3
			// 	} triangles, ${newPositions.length / 3} vertices`
			// );

			// Get or create the material for this ID
			const material = this.getMaterial(materialId);

			// Create the mesh with this geometry and material
			const mesh = new THREE.Mesh(materialGeometry, material);
			mesh.userData = {
				chunkX: request.chunkX,
				chunkY: request.chunkY,
				chunkZ: request.chunkZ,
				materialId,
			};

			// Optimize the mesh for rendering
			materialGeometry.computeBoundingSphere();

			meshes.push(mesh);
		});

		return meshes;
	}

	/**
	 * Gets or creates a material for the given material ID.
	 * This method attempts to use the asset worker to load textures when possible,
	 * and falls back to a unique color for debugging when textures aren't available.
	 */
	private getMaterial(materialId: number): THREE.Material {
		// Check if this material is already cached
		if (this.materialCache.has(materialId)) {
			return this.materialCache.get(materialId)!;
		}

		// In a full implementation, this would get the actual texture name from a mapping
		const textureName = this.textureKeyMap.get(materialId);

		// Generate a unique color based on the material ID for visualization
		const hue = (materialId % 360) / 360;
		const saturation = 0.7;
		const lightness = 0.6;

		// For transparent blocks (if we know about them)
		const isTransparent =
			textureName?.includes("glass") ||
			textureName?.includes("water") ||
			textureName?.includes("leaves") ||
			textureName?.includes("ice");

		// Create a new material with a color derived from the material ID
		const material = new THREE.MeshStandardMaterial({
			color: new THREE.Color().setHSL(hue, saturation, lightness),
			roughness: 0.8,
			metalness: 0.1,
			transparent: isTransparent || false,
			side: isTransparent ? THREE.DoubleSide : THREE.FrontSide,
			// Slightly move transparent materials forward to avoid z-fighting
			polygonOffset: isTransparent,
			polygonOffsetFactor: isTransparent ? -1 : 0,
		});

		// Cache the material for reuse
		this.materialCache.set(materialId, material);

		// Asynchronously try to load a texture for this material ID
		this.loadTextureForMaterial(materialId, material);

		return material;
	}

	/**
	 * Attempts to asynchronously load a texture for the given material ID.
	 * This method updates the material once the texture is loaded.
	 */
	private async loadTextureForMaterial(
		materialId: number,
		material: THREE.MeshStandardMaterial
	): Promise<void> {
		try {
			// Get the original texture key from our mapping
			const textureKey = this.textureKeyMap.get(materialId);
			if (!textureKey) {
				console.debug(
					`No texture key mapping found for materialId: ${materialId}`
				);
				return;
			}

			// Log the texture key we would load - in a production implementation, this would
			// actually load the texture from the asset worker

			// Example of how the texture would be loaded in production:
			// if (this.schematicRenderer.assetWorkerManager) {
			//     try {
			//         // Get the texture path - in Minecraft format it would be like "block/stone"
			//         // but the asset worker might need "textures/block/stone.png"
			//         const texturePath = `textures/${textureKey}.png`;
			//
			//         // Request the texture from the asset worker
			//         const texture = await this.schematicRenderer.assetWorkerManager.getTexture(texturePath);
			//
			//         // Apply the texture to the material
			//         material.map = texture;
			//         material.needsUpdate = true;
			//
			//         // Request a render update
			//         this.schematicRenderer.renderManager.requestRender();
			//     } catch (workerError) {
			//         console.warn(`Asset worker failed to load texture: ${textureKey}`, workerError);
			//     }
			// }

			// When the renderer eventually implements a texture atlas system:
			// 1. Instead of loading individual textures, we would use UV coordinates
			//    mapped to positions in a texture atlas
			// 2. The materialId would map to UV rect coordinates within the atlas
			// 3. A shared atlas material would be used with custom UVs per mesh
		} catch (error) {
			console.warn(
				`Failed to load texture for materialId: ${materialId}`,
				error
			);
		}
	}

	/**
	 * Processes the block palette from the schematic to create block definitions
	 * This converts the raw palette data into the format expected by the mesh worker
	 */
	private processBlockPalette(
		blockPalette: any,
		schematic: SchematicObject
	): [string, BakedBlockDef][] {
		const blockDefs: [string, BakedBlockDef][] = [];

		try {
			// Check if the block palette is empty
			if (!blockPalette) {
				console.warn("Empty block palette");
				return [];
			}

			// Get the block definitions from the schematic's existing data if available
			if (
				schematic.blockDefinitionMap &&
				schematic.blockDefinitionMap.size > 0
			) {
				// Convert Map to array of [key, value] pairs
				return Array.from(schematic.blockDefinitionMap.entries());
			}

			// If blockPalette is an array of strings (the expected format from get_block_palette),
			// process each block string
			if (Array.isArray(blockPalette)) {
				for (let i = 0; i < blockPalette.length; i++) {
					const blockId = blockPalette[i];

					// Use both the index and the full block ID as stateKeys
					// This way we'll match regardless of how the block data is referencing the palette
					const stateKey = i.toString();

					// Block IDs typically look like 'minecraft:stone' or 'minecraft:redstone_wire[power=0,...]'
					// Extract the base name for the texture
					let textureName = "block/stone"; // Default texture

					if (typeof blockId === "string") {
						// Remove the minecraft: prefix and any state properties in brackets
						const blockNameWithoutPrefix = blockId.replace("minecraft:", "");
						const baseName = blockNameWithoutPrefix.split("[")[0];

						// Use this base name for the texture key
						textureName = `block/${baseName}`;
					}

					// Create a block definition with all 6 faces
					const simpleCubeDef: BakedBlockDef = {
						faces: [
							this.createSimpleFace("north", textureName, [0, 0, -1]),
							this.createSimpleFace("south", textureName, [0, 0, 1]),
							this.createSimpleFace("east", textureName, [1, 0, 0]),
							this.createSimpleFace("west", textureName, [-1, 0, 0]),
							this.createSimpleFace("up", textureName, [0, 1, 0]),
							this.createSimpleFace("down", textureName, [0, -1, 0]),
						],
						bbox: [0, 0, 0, 16, 16, 16], // Full block bounding box
					};

					blockDefs.push([stateKey, simpleCubeDef]);
				}
			}
			// If it's an object mapping indices to block names
			else if (
				typeof blockPalette === "object" &&
				!Array.isArray(blockPalette)
			) {
				for (const [index, blockId] of Object.entries(blockPalette)) {
					// Use the index as stateKey
					const stateKey = index;

					// Extract base name from the block ID
					let textureName = "block/stone"; // Default

					if (typeof blockId === "string") {
						// Remove minecraft: prefix and any state properties
						const blockNameWithoutPrefix = blockId.replace("minecraft:", "");
						const baseName = blockNameWithoutPrefix.split("[")[0];

						textureName = `block/${baseName}`;
						console.log(
							`Block at index ${index} is ${blockId}, using texture: ${textureName}`
						);
					}

					// Create a block definition with all 6 faces
					const simpleCubeDef: BakedBlockDef = {
						faces: [
							this.createSimpleFace("north", textureName, [0, 0, -1]),
							this.createSimpleFace("south", textureName, [0, 0, 1]),
							this.createSimpleFace("east", textureName, [1, 0, 0]),
							this.createSimpleFace("west", textureName, [-1, 0, 0]),
							this.createSimpleFace("up", textureName, [0, 1, 0]),
							this.createSimpleFace("down", textureName, [0, -1, 0]),
						],
						bbox: [0, 0, 0, 16, 16, 16], // Full block bounding box
					};

					blockDefs.push([stateKey, simpleCubeDef]);
				}
			} else {
				console.warn("Unexpected block palette format:", typeof blockPalette);
				return [];
			}

			return blockDefs;
		} catch (error) {
			console.error("Error processing block palette:", error);
			return [];
		}
	}

	/**
	 * Creates a simplified face definition for placeholder blocks
	 */
	private createSimpleFace(
		direction: string,
		texKey: string,
		normal: [number, number, number]
	): any {
		// Calculate vertices based on direction
		let pos: number[];
		const uvs = [0, 0, 1, 0, 0, 1, 1, 1]; // Default UVs

		// The order of vertices is important to ensure correct face orientation
		// We need to ensure the vertices are ordered counter-clockwise when viewed from outside
		switch (direction) {
			case "north": // -Z face
				// For north face, use counter-clockwise winding when viewed from outside (-Z)
				pos = [16, 0, 0, 0, 0, 0, 16, 16, 0, 0, 16, 0];
				break;
			case "south": // +Z face
				// For south face, use counter-clockwise winding when viewed from outside (+Z)
				pos = [0, 0, 16, 16, 0, 16, 0, 16, 16, 16, 16, 16];
				break;
			case "east": // +X face
				// For east face, use counter-clockwise winding when viewed from outside (+X)
				pos = [16, 0, 16, 16, 0, 0, 16, 16, 16, 16, 16, 0];
				break;
			case "west": // -X face
				// For west face, use counter-clockwise winding when viewed from outside (-X)
				pos = [0, 0, 0, 0, 0, 16, 0, 16, 0, 0, 16, 16];
				break;
			case "up": // +Y face (top)
				// For top face, use counter-clockwise winding when viewed from above
				pos = [0, 16, 16, 16, 16, 16, 0, 16, 0, 16, 16, 0];
				break;
			case "down": // -Y face (bottom)
				// For bottom face, use counter-clockwise winding when viewed from below
				pos = [0, 0, 0, 16, 0, 0, 0, 0, 16, 16, 0, 16];
				break;
			default:
				pos = [0, 0, 0, 16, 0, 0, 0, 16, 0, 16, 16, 0];
		}

		// Register this texture key in our lookup map
		this.registerTextureKey(texKey);

		return {
			pos,
			uv: uvs,
			normal: normal, // Using the normal passed in
			texKey,
		};
	}

	/**
	 * Cleans up resources used by the mesh builder.
	 */
	public dispose(): void {
		// Dispose all cached materials
		this.materialCache.forEach((material) => {
			if (material instanceof THREE.Material) {
				material.dispose();
			}
		});

		// Clear the caches
		this.materialCache.clear();
		this.textureKeyMap.clear();

		console.log("WorldMeshBuilder disposed.");
	}
}
