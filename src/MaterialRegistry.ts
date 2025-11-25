import * as THREE from "three";

/**
 * Global material registry to ensure materials are shared across all chunks
 * This significantly reduces GPU state changes and memory usage
 */
export class MaterialRegistry {
	private static instance: MaterialRegistry;
	private materials = new Map<string, THREE.Material>();
	private materialRefCount = new Map<string, number>();

	private constructor() {}

	static getInstance(): MaterialRegistry {
		if (!MaterialRegistry.instance) {
			MaterialRegistry.instance = new MaterialRegistry();
		}
		return MaterialRegistry.instance;
	}

	/**
	 * Get or create a shared material based on the source material
	 * This ensures identical materials are reused across chunks
	 */
	static getMaterial(sourceMaterial: THREE.Material): THREE.Material {
		return MaterialRegistry.getInstance().getOrCreateMaterial(sourceMaterial);
	}

	private getOrCreateMaterial(sourceMaterial: THREE.Material): THREE.Material {
		// Create a unique key based on material properties
		const key = this.createMaterialKey(sourceMaterial);

		if (this.materials.has(key)) {
			// Increment reference count
			this.materialRefCount.set(key, (this.materialRefCount.get(key) || 0) + 1);
			return this.materials.get(key)!;
		}

		// Clone the material to ensure we don't modify the original
		const sharedMaterial = sourceMaterial.clone();
		sharedMaterial.name = `shared_${
			sourceMaterial.name || "material"
		}_${key.substring(0, 8)}`;

		// Enable mipmapping on textures for better performance at distance
		// Uses NearestMipmapLinear for pixel-art style with smooth LOD transitions
		this.enableMipmapping(sharedMaterial);

		this.materials.set(key, sharedMaterial);
		this.materialRefCount.set(key, 1);

		return sharedMaterial;
	}

	/**
	 * Enable mipmapping on material textures to reduce aliasing and improve performance at distance
	 * Uses NearestMipmapLinearFilter to preserve pixel-art look while enabling mipmaps
	 */
	private enableMipmapping(material: THREE.Material): void {
		const texturedMaterial = material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
		
		if (texturedMaterial.map) {
			// NearestMipmapLinearFilter: Nearest for texel sampling, Linear between mip levels
			// This preserves the pixel-art look while reducing aliasing at distance
			texturedMaterial.map.generateMipmaps = true;
			texturedMaterial.map.minFilter = THREE.NearestMipmapLinearFilter;
			// Keep magFilter as Nearest for close-up pixel-art look
			texturedMaterial.map.magFilter = THREE.NearestFilter;
			texturedMaterial.map.needsUpdate = true;
		}
	}

	/**
	 * Create a unique key for a material based on its properties
	 */
	private createMaterialKey(material: THREE.Material): string {
		const keyParts: string[] = [material.type, material.name || "unnamed"];

		// Add common material properties to the key
		if (
			material instanceof THREE.MeshBasicMaterial ||
			material instanceof THREE.MeshLambertMaterial ||
			material instanceof THREE.MeshPhongMaterial ||
			material instanceof THREE.MeshStandardMaterial
		) {
			// Color
			if ("color" in material) {
				keyParts.push(`c:${material.color.getHexString()}`);
			}

			// Map (texture)
			if ("map" in material && material.map) {
				// Use texture UUID or image source as part of the key
				if (material.map.image) {
					if (material.map.image.src) {
						// For textures loaded from URLs
						keyParts.push(`map:${material.map.image.src}`);
					} else if (material.map.uuid) {
						// For generated textures
						keyParts.push(`map:${material.map.uuid}`);
					}
				}
			}

			// Transparency
			if (material.transparent) {
				keyParts.push(`t:1`);
				keyParts.push(`o:${material.opacity}`);
			}

			// Side
			keyParts.push(`s:${material.side}`);

			// Additional properties for standard materials
			if (material instanceof THREE.MeshStandardMaterial) {
				keyParts.push(`m:${material.metalness}`);
				keyParts.push(`r:${material.roughness}`);

				if (material.emissive) {
					keyParts.push(`e:${material.emissive.getHexString()}`);
					keyParts.push(`ei:${material.emissiveIntensity}`);
				}
			}
		}

		return keyParts.join("_");
	}

	/**
	 * Release a material reference (for cleanup)
	 */
	static releaseMaterial(material: THREE.Material): void {
		MaterialRegistry.getInstance().releaseMaterialReference(material);
	}

	private releaseMaterialReference(material: THREE.Material): void {
		// Find the key for this material
		let foundKey: string | null = null;
		for (const [key, mat] of this.materials.entries()) {
			if (mat === material) {
				foundKey = key;
				break;
			}
		}

		if (foundKey) {
			const refCount = this.materialRefCount.get(foundKey) || 0;
			if (refCount <= 1) {
				// Last reference, dispose the material
				const mat = this.materials.get(foundKey);
				if (mat) {
					mat.dispose();
				}
				this.materials.delete(foundKey);
				this.materialRefCount.delete(foundKey);
			} else {
				// Decrement reference count
				this.materialRefCount.set(foundKey, refCount - 1);
			}
		}
	}

	/**
	 * Get statistics about the material registry
	 */
	static getStats(): {
		totalMaterials: number;
		totalReferences: number;
		avgReferencesPerMaterial: number;
	} {
		return MaterialRegistry.getInstance().getStatistics();
	}

	private getStatistics() {
		const totalMaterials = this.materials.size;
		let totalReferences = 0;

		this.materialRefCount.forEach((count) => {
			totalReferences += count;
		});

		return {
			totalMaterials,
			totalReferences,
			avgReferencesPerMaterial:
				totalMaterials > 0 ? totalReferences / totalMaterials : 0,
		};
	}

	/**
	 * Clear all cached materials (use with caution)
	 */
	static clear(): void {
		MaterialRegistry.getInstance().clearAll();
	}

	private clearAll(): void {
		// Dispose all materials
		this.materials.forEach((material) => {
			material.dispose();
		});

		this.materials.clear();
		this.materialRefCount.clear();

		console.log("[MaterialRegistry] All materials cleared");
	}

	/**
	 * Log detailed statistics
	 */
	static logStats(): void {
		const instance = MaterialRegistry.getInstance();
		const stats = instance.getStatistics();

		console.log("[MaterialRegistry] Statistics:");
		console.log(`  Total unique materials: ${stats.totalMaterials}`);
		console.log(`  Total references: ${stats.totalReferences}`);
		console.log(
			`  Average references per material: ${stats.avgReferencesPerMaterial.toFixed(
				2
			)}`
		);

		// Log top 5 most referenced materials
		const sortedMaterials = Array.from(instance.materialRefCount.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);

		if (sortedMaterials.length > 0) {
			console.log("  Top referenced materials:");
			sortedMaterials.forEach(([key, count]) => {
				const material = instance.materials.get(key);
				console.log(
					`    - ${material?.name || key.substring(0, 30)}: ${count} references`
				);
			});
		}
	}
}

// Export a convenience function for getting shared materials
export function getSharedMaterial(
	sourceMaterial: THREE.Material
): THREE.Material {
	return MaterialRegistry.getMaterial(sourceMaterial);
}
