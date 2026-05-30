import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import models from "./models.json";

export class EntityRenderer {
	private debug: boolean = false;
	private loader: GLTFLoader;
	private modelCache: Map<string, THREE.Object3D> = new Map();

	constructor() {
		this.loader = new GLTFLoader();
	}

	/**
	 * Create a THREE.js mesh for the given entity
	 */
	public async createEntityMesh(entityName: string): Promise<THREE.Object3D | null> {
		// Check cache first
		if (this.modelCache.has(entityName)) {
			if (this.debug) console.log(`Using cached model for ${entityName}`);
			return this.modelCache.get(entityName)!.clone();
		}

		// Check if the model exists
		if (!(models as Record<string, string>)[entityName]) {
			console.warn(`Model for entity "${entityName}" not found`);
			return null;
		}

		try {
			// Get the base64 model data
			const base64Data = (models as Record<string, string>)[entityName];

			// Convert base64 to binary data
			const binaryString = atob(base64Data);
			const bytes = new Uint8Array(binaryString.length);

			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}

			// Load the model using GLTFLoader
			return new Promise((resolve, reject) => {
				this.loader.parse(
					bytes.buffer,
					"",
					(gltf: { scene: THREE.Object3D }) => {
						const model = gltf.scene;

						// Traverse and fix material encoding
						model.traverse((child) => {
							if (child instanceof THREE.Mesh && child.material) {
								const material = child.material as THREE.MeshStandardMaterial;

								// Ensure textures are in linear color space for consistent gamma correction
								if (material.map) {
									material.map.colorSpace = THREE.LinearSRGBColorSpace;
								}
								if (material.emissiveMap) {
									material.emissiveMap.colorSpace = THREE.LinearSRGBColorSpace;
								}
								// Handle other texture maps as needed

								material.needsUpdate = true;
							}
						});

						const group = new THREE.Group();
						model.position.set(0, -0.5, 0);
						group.add(model);

						this.modelCache.set(entityName, group);
						resolve(group.clone());
					},
					(error: any) => {
						console.error(`Error loading entity model ${entityName}:`, error);
						reject(error);
					}
				);
			});
		} catch (error) {
			console.error(`Failed to create mesh for entity ${entityName}:`, error);
			return null;
		}
	}

	/**
	 * Preload specific models for better performance
	 */
	public async preloadModels(entityNames: string[]): Promise<void> {
		const promises = entityNames.map((name) => this.createEntityMesh(name));
		await Promise.all(promises);
		if (this.debug) console.log(`Preloaded ${entityNames.length} models`);
	}

	/**
	 * Set debug mode
	 */
	public setDebug(debug: boolean): void {
		this.debug = debug;
	}
}
