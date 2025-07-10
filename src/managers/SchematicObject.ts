// managers/SchematicObject.ts
import * as THREE from "three";
import { SchematicWrapper } from "nucleation";
import { WorldMeshBuilder } from "../WorldMeshBuilder";
import { EventEmitter } from "events";
import { SceneManager } from "./SceneManager";
import { createReactiveProxy, PropertyConfig } from "../utils/ReactiveProperty"; // Adjust the import path as needed
import { castToEuler, castToVector3 } from "../utils/Casts";
import { resetPerformanceMetrics } from "../monitoring";
import { SchematicRenderer } from "../SchematicRenderer";
import type { BlockData } from "../types";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// Define chunk data interface to fix TypeScript errors

export class SchematicObject extends EventEmitter {
	public name: string;
	public schematicWrapper: SchematicWrapper;
	private schematicRenderer: SchematicRenderer;
	private meshes: THREE.Mesh[] = [];

	private worldMeshBuilder: WorldMeshBuilder;
	private eventEmitter: EventEmitter;
	private sceneManager: SceneManager;
	private chunkMeshes: Map<string, THREE.Object3D[]> = new Map();
	private chunkDimensions: any = {
		chunkWidth: 64,
		chunkHeight: 64,
		chunkLength: 64,
	};

	public id: string;
	public group: THREE.Group;

	// Public properties without underscores
	public position: THREE.Vector3;
	public rotation: THREE.Euler;
	public scale: THREE.Vector3;
	public opacity: number;
	public visible: boolean;

	public meshBoundingBox: [number[], number[]];
	public renderingBounds: {
		min: THREE.Vector3;
		max: THREE.Vector3;
		helper?: THREE.Box3Helper;
		enabled?: boolean;
	};

	// Reactive bounds for direct manipulation
	public bounds: {
		minX: number;
		minY: number;
		minZ: number;
		maxX: number;
		maxY: number;
		maxZ: number;
	};

	private meshesReady: Promise<void>;

	// Cache for dimensions to avoid repeated calls
	private _cachedDimensions: [number, number, number] | null = null;

	constructor(
		schematicRenderer: SchematicRenderer,
		name: string,
		schematicWrapper: SchematicWrapper,
		properties?: Partial<{
			position: THREE.Vector3 | number[];
			rotation: THREE.Euler | number[];
			scale: THREE.Vector3 | number[] | number;
			opacity: number;
			visible: boolean;
			meshBoundingBox?: [number[], number[]];
			renderingBounds?: {
				min: THREE.Vector3 | number[];
				max: THREE.Vector3 | number[];
			};
		}>
	) {
		super();

		this.id = name;
		this.name = name;
		this.schematicWrapper = schematicWrapper;

		this.schematicRenderer = schematicRenderer;
		if (!this.schematicRenderer) {
			throw new Error("SchematicRenderer is required.");
		}
		if (!this.schematicRenderer.worldMeshBuilder) {
			throw new Error("WorldMeshBuilder is required.");
		}
		this.worldMeshBuilder =
			schematicRenderer.worldMeshBuilder as WorldMeshBuilder;
		this.eventEmitter = schematicRenderer.eventEmitter;
		this.sceneManager = schematicRenderer.sceneManager;

		// Initialize properties with default values
		this.position = new THREE.Vector3();
		this.rotation = new THREE.Euler();
		this.scale = new THREE.Vector3(1, 1, 1);
		this.opacity = 1.0;
		this.visible = properties?.visible ?? true;

		// Set initial properties if provided
		Object.assign(this, properties);

		const schematicDimensions = this.getDimensions();
		console.log("Schematic dimensions:", schematicDimensions);
		this.position = new THREE.Vector3(
			-schematicDimensions[0] / 2 + 0.5, // Center the schematic
			0,
			-schematicDimensions[2] / 2 + 0.5 // Center the schematic
		);

		if (properties?.meshBoundingBox) {
			this.meshBoundingBox = properties.meshBoundingBox;
		} else {
			this.meshBoundingBox = [
				this.position.toArray(),
				this.position
					.clone()
					.add(
						new THREE.Vector3(
							schematicDimensions[0],
							schematicDimensions[1],
							schematicDimensions[2]
						)
					)
					.toArray(),
			];
		}

		// Initialize rendering bounds to the full schematic dimensions
		// But they are disabled by default (they won't be used for culling unless explicitly enabled)
		this.renderingBounds = {
			min: new THREE.Vector3(0, 0, 0),
			max: new THREE.Vector3(
				schematicDimensions[0],
				schematicDimensions[1],
				schematicDimensions[2]
			),
			enabled: false, // Disabled by default
		};

		// Apply custom rendering bounds if provided
		if (properties?.renderingBounds) {
			if (Array.isArray(properties.renderingBounds.min)) {
				this.renderingBounds.min = new THREE.Vector3(
					properties.renderingBounds.min[0],
					properties.renderingBounds.min[1],
					properties.renderingBounds.min[2]
				);
			} else if (properties.renderingBounds.min instanceof THREE.Vector3) {
				this.renderingBounds.min = properties.renderingBounds.min.clone();
			}

			if (Array.isArray(properties.renderingBounds.max)) {
				this.renderingBounds.max = new THREE.Vector3(
					properties.renderingBounds.max[0],
					properties.renderingBounds.max[1],
					properties.renderingBounds.max[2]
				);
			} else if (properties.renderingBounds.max instanceof THREE.Vector3) {
				this.renderingBounds.max = properties.renderingBounds.max.clone();
			}
		}

		// Initialize the reactive bounds property
		const self = this;
		this.bounds = new Proxy(
			{
				get minX() {
					return self.renderingBounds.min.x;
				},
				set minX(value: number) {
					self.renderingBounds.min.x = value;
					self.setRenderingBounds(
						self.renderingBounds.min,
						self.renderingBounds.max
					);
				},

				get minY() {
					return self.renderingBounds.min.y;
				},
				set minY(value: number) {
					self.renderingBounds.min.y = value;
					self.setRenderingBounds(
						self.renderingBounds.min,
						self.renderingBounds.max
					);
				},

				get minZ() {
					return self.renderingBounds.min.z;
				},
				set minZ(value: number) {
					self.renderingBounds.min.z = value;
					self.setRenderingBounds(
						self.renderingBounds.min,
						self.renderingBounds.max
					);
				},

				get maxX() {
					return self.renderingBounds.max.x;
				},
				set maxX(value: number) {
					self.renderingBounds.max.x = value;
					self.setRenderingBounds(
						self.renderingBounds.min,
						self.renderingBounds.max
					);
				},

				get maxY() {
					return self.renderingBounds.max.y;
				},
				set maxY(value: number) {
					self.renderingBounds.max.y = value;
					self.setRenderingBounds(
						self.renderingBounds.min,
						self.renderingBounds.max
					);
				},

				get maxZ() {
					return self.renderingBounds.max.z;
				},
				set maxZ(value: number) {
					self.renderingBounds.max.z = value;
					self.setRenderingBounds(
						self.renderingBounds.min,
						self.renderingBounds.max
					);
				},

				// Reset to full dimensions
				reset() {
					const dimensions = self.getDimensions();
					self.setRenderingBounds(
						new THREE.Vector3(0, 0, 0),
						new THREE.Vector3(dimensions[0], dimensions[1], dimensions[2])
					);
					return "Reset to full dimensions";
				},

				// Toggle helper visibility
				showHelper(visible = true) {
					self.showRenderingBoundsHelper(visible);
					return `Helper ${visible ? "shown" : "hidden"}`;
				},
			},
			{
				get(target, prop) {
					// @ts-ignore
					return target[prop];
				},
				set(target, prop, value) {
					// @ts-ignore
					target[prop] = value;
					return true;
				},
			}
		) as any;

		this.group = new THREE.Group();
		this.group.name = name;

		// Build meshes and other initialization
		if (this.visible) {
			this.meshesReady = this.buildMeshes();
			this.updateTransform();
			this.sceneManager.add(this.group);
		} else {
			this.meshesReady = Promise.resolve();
		}

		// Define property configurations
		const propertyConfigs: Partial<
			Record<keyof SchematicObject, PropertyConfig<any>>
		> = {
			position: {
				cast: castToVector3,
				afterSet: () => {
					this.updateTransform();
					this.emitPropertyChanged("position", this.position);
				},
			},
			rotation: {
				cast: castToEuler,
				afterSet: () => {
					this.updateTransform();
					this.emitPropertyChanged("rotation", this.rotation);
				},
			},
			scale: {
				cast: castToVector3,
				afterSet: () => {
					this.updateTransform();
					this.emitPropertyChanged("scale", this.scale);
				},
			},
			opacity: {
				afterSet: () => {
					this.updateMeshMaterials("opacity");
					this.emitPropertyChanged("opacity", this.opacity);
				},
			},
			visible: {
				afterSet: () => {
					this.updateMeshVisibility();
					this.emitPropertyChanged("visible", this.visible);
				},
			},
			renderingBounds: {
				afterSet: () => {
					// Don't call updateRenderingBounds() here to avoid infinite loops
					// The specific setRenderingBounds method should be used instead
					this.emitPropertyChanged("renderingBounds", this.renderingBounds);
				},
			},
		};

		// Create the reactive proxy
		return createReactiveProxy(this as SchematicObject, propertyConfigs);
	}

	// Helper method to get cached dimensions
	private getDimensions(): [number, number, number] {
		if (!this._cachedDimensions) {
			let dimensions = this.schematicWrapper.get_dimensions();
			this._cachedDimensions = [dimensions[0], dimensions[1], dimensions[2]];
		}
		return this._cachedDimensions;
	}

	private emitPropertyChanged(property: string, value: any) {
		this.eventEmitter.emit("schematicPropertyChanged", {
			schematic: this,
			property,
			value,
		});
	}

	private updateTransform(): void {
		this.group.position.copy(this.position);
		this.group.rotation.copy(this.rotation);
		this.group.scale.copy(this.scale);
	}

	public syncTransformFromGroup() {
		this.position.copy(this.group.position);
		this.rotation.copy(this.group.rotation);
		this.scale.copy(this.group.scale);

		// Emit event
		this.emitPropertyChanged("transform", {
			position: this.position,
			rotation: this.rotation,
			scale: this.scale,
		});
	}

	private applyPropertiesToObjects(objects: THREE.Object3D[]) {
		// Determine if the SCHEMATIC ITSELF needs to be faded
		const schematicWantsFade = this.opacity < 1.0;

		objects.forEach((obj) => {
			obj.visible = this.visible;

			if (this.visible) {
				obj.traverse((child) => {
					if (child instanceof THREE.Mesh) {
						child.castShadow = true;
						child.receiveShadow = true;
						child.frustumCulled = true;

						const materials = Array.isArray(child.material)
							? child.material
							: [child.material];

						materials.forEach((mat) => {
							if (mat) {
								// If the schematic is being faded, apply its opacity.
								// Otherwise, let the material keep its original opacity.
								if (schematicWantsFade) {
									mat.opacity = this.opacity;
								}

								// CRITICAL FIX: Only set transparent = true if the schematic
								// is being faded. NEVER set it to false, because that would
								// override materials that are inherently transparent (like glass).
								if (schematicWantsFade) {
									mat.transparent = true;
								}
							}
						});
					}
				});
			}
		});
	}

	/**
	 * Exports the schematic as a GLTF file
	 * @param options Export options
	 * @returns Promise that resolves when export is complete
	 */
	public async exportAsGLTF(
		options: {
			filename?: string;
			binary?: boolean;
			includeCustomExtensions?: boolean;
			maxTextureSize?: number;
			embedImages?: boolean;
			animations?: THREE.AnimationClip[];
		} = {}
	): Promise<void> {
		try {
			// Default options
			const exportOptions = {
				filename: options.filename || `${this.name}_schematic.gltf`,
				binary: options.binary ?? false,
				includeCustomExtensions: options.includeCustomExtensions ?? false,
				maxTextureSize: options.maxTextureSize ?? 1024,
				embedImages: options.embedImages ?? true,
				animations: options.animations || [],
			};

			// Wait for meshes to be ready
			await this.meshesReady;

			// Show progress if available
			if (
				this.schematicRenderer.options.enableProgressBar &&
				this.schematicRenderer.uiManager
			) {
				this.schematicRenderer.uiManager.showProgressBar(
					`Exporting ${this.name}`
				);
				this.schematicRenderer.uiManager.updateProgress(
					0.1,
					"Preparing export..."
				);
			}

			// Create exporter
			const exporter = new GLTFExporter();

			// Clone the group to avoid modifying the original
			const exportGroup = this.group.clone();

			// Update progress
			if (
				this.schematicRenderer.options.enableProgressBar &&
				this.schematicRenderer.uiManager
			) {
				this.schematicRenderer.uiManager.updateProgress(
					0.3,
					"Processing geometry..."
				);
			}

			// Export to GLTF
			const result = await new Promise<ArrayBuffer | object>(
				(resolve, reject) => {
					exporter.parse(
						exportGroup,
						(gltf) => resolve(gltf),
						(error) => reject(error),
						{
							binary: exportOptions.binary,
							includeCustomExtensions: exportOptions.includeCustomExtensions,
							maxTextureSize: exportOptions.maxTextureSize,
							embedImages: exportOptions.embedImages,
							animations: exportOptions.animations,
						}
					);
				}
			);

			// Update progress
			if (
				this.schematicRenderer.options.enableProgressBar &&
				this.schematicRenderer.uiManager
			) {
				this.schematicRenderer.uiManager.updateProgress(
					0.8,
					"Creating download..."
				);
			}

			// Download the file
			await this.downloadGLTF(
				result,
				exportOptions.filename,
				exportOptions.binary
			);

			// Complete progress
			if (
				this.schematicRenderer.options.enableProgressBar &&
				this.schematicRenderer.uiManager
			) {
				this.schematicRenderer.uiManager.updateProgress(
					1.0,
					"Export complete!"
				);
				setTimeout(() => {
					this.schematicRenderer.uiManager?.hideProgressBar();
				}, 1000);
			}

			console.log(
				`Successfully exported schematic "${this.name}" as ${exportOptions.filename}`
			);
		} catch (error) {
			console.error("Error exporting GLTF:", error);

			// Hide progress bar on error
			if (
				this.schematicRenderer.options.enableProgressBar &&
				this.schematicRenderer.uiManager
			) {
				this.schematicRenderer.uiManager.hideProgressBar();
			}

			throw error;
		}
	}

	/**
	 * Downloads the GLTF data as a file
	 */
	private async downloadGLTF(
		gltfData: ArrayBuffer | object,
		filename: string,
		isBinary: boolean
	): Promise<void> {
		let blob: Blob;
		let actualFilename = filename;

		if (isBinary) {
			// Binary GLTF (.glb)
			blob = new Blob([gltfData as ArrayBuffer], {
				type: "application/octet-stream",
			});
			if (!actualFilename.endsWith(".glb")) {
				actualFilename = actualFilename.replace(/\.[^/.]+$/, "") + ".glb";
			}
		} else {
			// Text GLTF (.gltf)
			const jsonString = JSON.stringify(gltfData, null, 2);
			blob = new Blob([jsonString], {
				type: "application/json",
			});
			if (!actualFilename.endsWith(".gltf")) {
				actualFilename = actualFilename.replace(/\.[^/.]+$/, "") + ".gltf";
			}
		}

		// Create download link
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = actualFilename;

		// Trigger download
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		// Clean up
		URL.revokeObjectURL(url);
	}

	private async buildMeshes(): Promise<void> {
		if (!this.visible) {
			return;
		}
		const { meshes, chunkMap } = await this.buildSchematicMeshes(
			this,
			this.chunkDimensions
		);
		this.chunkMeshes = chunkMap;

		// Apply properties to all objects
		this.applyPropertiesToObjects(meshes);

		// Add to group
		meshes.forEach((obj) => {
			this.group.add(obj);
		});

		this.updateTransform(); // This will apply position, rotation, and scale to the group
		this.group.visible = this.visible;
		this.meshes = meshes as THREE.Mesh[]; // Keep for backward compatibility

		this.group.updateMatrixWorld(true);
		this.group.updateWorldMatrix(true, true);

		// Create initial visualizer for rendering bounds
		if (this.sceneManager.schematicRenderer.options.showRenderingBoundsHelper) {
			this.createRenderingBoundsHelper();
		}

		this.sceneManager.schematicRenderer.options.callbacks?.onSchematicRendered?.(
			this.name
		);
	}

	// Track chunk building progress
	private reportBuildProgress(
		message: string,
		progress: number,
		totalChunks?: number,
		completedChunks?: number
	) {
		// Only show progress if enabled and UI manager exists
		if (
			this.schematicRenderer.options.enableProgressBar &&
			this.schematicRenderer.uiManager
		) {
			// Format detailed progress message if chunks are provided
			let progressMessage = message;
			if (totalChunks !== undefined && completedChunks !== undefined) {
				progressMessage = `${message} (${completedChunks}/${totalChunks} chunks)`;
			}

			// Show progress bar if not already visible
			if (!this.schematicRenderer.uiManager.isProgressBarVisible()) {
				this.schematicRenderer.uiManager.showProgressBar("Building Schematic");
			}

			// Update progress
			this.schematicRenderer.uiManager.updateProgress(
				progress,
				progressMessage
			);

			// Hide when complete
			if (progress >= 1) {
				this.schematicRenderer.uiManager.hideProgressBar();
			}
		}
	}

	public async buildSchematicMeshes(
		schematicObject: SchematicObject,
		chunkDimensions: any = {
			chunkWidth: 64,
			chunkHeight: 64,
			chunkLength: 64,
		},
		buildMode: "imediate" | "incremental" | "instanced" = "incremental"
	) {
		switch (buildMode) {
			case "imediate":
				return this.buildSchematicMeshesImediate(
					schematicObject,
					chunkDimensions
				);
			case "incremental":
				return this.buildSchematicMeshesIncremental(
					schematicObject,
					chunkDimensions
				);
			case "instanced":
				return this.buildSchematicMeshesInstanced(
					schematicObject,
				);
			default:
				throw new Error(
					`Invalid build mode: ${buildMode}. Use 'imediate' or 'incremental'.`
				);
		}
	}

	// TRUE lazy loading - minimal memory footprint

	public async buildSchematicMeshesImediate(
		schematicObject: SchematicObject,
		chunkDimensions: any = {
			chunkWidth: 16,
			chunkHeight: 16,
			chunkLength: 16,
		}
	): Promise<{
		meshes: THREE.Object3D[];
		chunkMap: Map<string, THREE.Object3D[]>;
	}> {
		console.log(
			`[SchematicObject:${schematicObject.id}] Starting TRUE lazy immediate build.`
		);
		const overallStartTime = performance.now();
		const schematic = schematicObject.schematicWrapper;

		// STEP 1: Initialize pipeline
		console.log("🚀 Initializing optimized mesh building pipeline...");
		this.reportBuildProgress("Initializing pipeline...", 0.05);

		const palettes = schematic.get_all_palettes();
		await this.worldMeshBuilder.precomputePaletteGeometries(palettes.default);

		// STEP 2: Create iterator
		console.log("📍 Creating optimized chunk iterator...");
		this.reportBuildProgress("Creating chunk iterator...", 0.1);

		const iterator = schematic.create_lazy_chunk_iterator(
			chunkDimensions.chunkWidth,
			chunkDimensions.chunkHeight,
			chunkDimensions.chunkLength,
			"bottom_up",
			0,
			0,
			0
		);

		const totalChunks = iterator.total_chunks();
		if (totalChunks === 0) {
			console.log(
				`[SchematicObject:${schematicObject.id}] No chunks to process.`
			);
			this.reportBuildProgress(
				"Schematic build complete (no chunks)",
				1.0,
				0,
				0
			);
			return { meshes: [], chunkMap: new Map() };
		}

		console.log(
			`[SchematicObject:${schematicObject.id}] Processing ${totalChunks} chunks with TRUE lazy loading.`
		);

		// CRITICAL: No mesh accumulator! Process and add directly to scene
		const chunkMap: Map<string, THREE.Object3D[]> = new Map();
		const renderingBounds = schematicObject.renderingBounds?.enabled
			? schematicObject.renderingBounds
			: undefined;

		let processedChunkCount = 0;
		let totalMeshCount = 0;
		const progressUpdateInterval = Math.max(1, Math.floor(totalChunks / 20));

		this.reportBuildProgress(
			"Processing chunks with minimal memory...",
			0.15,
			totalChunks,
			0
		);

		// STEP 3: TRUE lazy processing - no accumulation
		console.log("🔥 Processing chunks with minimal memory footprint...");
		const chunkProcessingStartTime = performance.now();

		while (iterator.has_next()) {
			const chunkData = iterator.next();
			if (!chunkData) break;

			const { chunk_x, chunk_y, chunk_z, blocks } = chunkData;

			// Bounds culling
			if (renderingBounds) {
				const chunkMinX = chunk_x * chunkDimensions.chunkWidth;
				const chunkMinY = chunk_y * chunkDimensions.chunkHeight;
				const chunkMinZ = chunk_z * chunkDimensions.chunkLength;
				const chunkMaxX = chunkMinX + chunkDimensions.chunkWidth;
				const chunkMaxY = chunkMinY + chunkDimensions.chunkHeight;
				const chunkMaxZ = chunkMinZ + chunkDimensions.chunkLength;

				if (
					chunkMaxX <= renderingBounds.min.x ||
					chunkMinX >= renderingBounds.max.x ||
					chunkMaxY <= renderingBounds.min.y ||
					chunkMinY >= renderingBounds.max.y ||
					chunkMaxZ <= renderingBounds.min.z ||
					chunkMinZ >= renderingBounds.max.z
				) {
					processedChunkCount++;
					if (processedChunkCount % progressUpdateInterval === 0) {
						this.reportBuildProgress(
							"Processing chunks (bounds culled)...",
							0.15 + (processedChunkCount / totalChunks) * 0.8,
							totalChunks,
							processedChunkCount
						);
					}
					continue;
				}
			}

			// Process chunk and immediately add to scene
			const chunkMeshes = await this.worldMeshBuilder.getChunkMesh(
				{
					blocks: blocks,
					chunk_x,
					chunk_y,
					chunk_z,
				},
				schematicObject,
				renderingBounds
			);

			processedChunkCount++;

			if (chunkMeshes && chunkMeshes.length > 0) {
				// Store chunk reference for management
				const chunkKey = `${chunk_x},${chunk_y},${chunk_z}`;
				chunkMap.set(chunkKey, chunkMeshes);

				// IMMEDIATELY apply properties and add to scene
				this.applyPropertiesToObjects(chunkMeshes);
				chunkMeshes.forEach((mesh) => {
					this.group.add(mesh);
				});

				totalMeshCount += chunkMeshes.length;

				// Clear the chunk meshes reference to allow GC
				// (they're now only referenced by the scene graph)
			}

			// Update progress occasionally
			if (processedChunkCount % progressUpdateInterval === 0) {
				this.reportBuildProgress(
					"Processing chunks...",
					0.15 + (processedChunkCount / totalChunks) * 0.8,
					totalChunks,
					processedChunkCount
				);
			}
		}

		const chunkProcessingTime = performance.now() - chunkProcessingStartTime;
		console.log(
			`[SchematicObject:${
				schematicObject.id
			}] TRUE lazy processing completed in ${chunkProcessingTime.toFixed(2)}ms`
		);

		// STEP 4: Final scene updates
		console.log("🎨 Final scene updates...");
		this.reportBuildProgress(
			"Finalizing scene...",
			0.95,
			totalChunks,
			processedChunkCount
		);

		this.group.updateMatrixWorld(true);

		const totalTime = performance.now() - overallStartTime;
		console.log(
			`[SchematicObject:${
				schematicObject.id
			}] TRUE lazy build completed in ${totalTime.toFixed(2)}ms`
		);
		console.log(
			`  - Pipeline init: ~${(
				chunkProcessingStartTime - overallStartTime
			).toFixed(2)}ms`
		);
		console.log(`  - Chunk processing: ${chunkProcessingTime.toFixed(2)}ms`);
		console.log(
			`  - Total chunks processed: ${processedChunkCount}/${totalChunks}`
		);
		console.log(`  - Total meshes created: ${totalMeshCount}`);
		console.log(`  - Peak memory: MINIMAL (no mesh accumulation)`);

		// Return meshes from scene graph (not from accumulator!)
		const finalMeshes = Array.from(this.group.children);

		// Dispatch completion event
		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent("schematicRenderComplete", {
					detail: {
						schematicId: this.id,
						schematicName: this.name,
						totalChunks: totalChunks,
						processedChunks: processedChunkCount,
						buildTimeMs: totalTime,
						meshCount: totalMeshCount,
						optimized: true,
						immediate: true,
						trueLazy: true, // Flag for true lazy loading
					},
				})
			);
		}

		// Log final stats
		const renderer = this.schematicRenderer.renderManager?.renderer;
		if (renderer && renderer.info) {
			console.log(
				`FINAL TRUE LAZY STATS - Draw Calls: ${renderer.info.render.calls}, Tris: ${renderer.info.render.triangles}`
			);
			console.log(
				`Memory - Geometries: ${renderer.info.memory.geometries}, Textures: ${renderer.info.memory.textures}`
			);
		}

		const paletteStats = this.worldMeshBuilder.getPaletteStats();
		console.log(
			`Palette Cache - ${paletteStats.paletteSize} block types, ${(
				paletteStats.memoryEstimate /
				1024 /
				1024
			).toFixed(1)}MB`
		);

		this.reportBuildProgress(
			"TRUE lazy build complete",
			1.0,
			totalChunks,
			processedChunkCount
		);

		setTimeout(() => {
			if (this.schematicRenderer.uiManager) {
				this.schematicRenderer.uiManager.hideProgressBar();
			}
		}, 500);

		return { meshes: finalMeshes, chunkMap };
	}

	// Also fix the incremental version
	public async buildSchematicMeshesIncremental(
		schematicObject: SchematicObject,
		chunkDimensions: any = {
			chunkWidth: 16,
			chunkHeight: 16,
			chunkLength: 16,
		}
	): Promise<{
		meshes: THREE.Object3D[];
		chunkMap: Map<string, THREE.Object3D[]>;
	}> {
		console.log(
			`[SchematicObject:${schematicObject.id}] Starting TRUE lazy incremental build.`
		);
		const overallStartTime = performance.now();
		const renderer = this.schematicRenderer.renderManager?.renderer;
		const schematic = schematicObject.schematicWrapper;

		// Initialize pipeline
		console.log("🚀 Initializing optimized mesh building pipeline...");
		const palettes = schematic.get_all_palettes();
		await this.worldMeshBuilder.precomputePaletteGeometries(palettes.default);

		console.log("📍 Creating optimized chunk iterator...");
		const iterator = schematic.create_lazy_chunk_iterator(
			chunkDimensions.chunkWidth,
			chunkDimensions.chunkHeight,
			chunkDimensions.chunkLength,
			"bottom_up",
			0,
			0,
			0
		);

		const totalChunks = iterator.total_chunks();
		if (totalChunks === 0) {
			console.log(
				`[SchematicObject:${schematicObject.id}] No chunks to process.`
			);
			this.reportBuildProgress(
				"Schematic build complete (no chunks)",
				1.0,
				0,
				0
			);
			return { meshes: [], chunkMap: new Map() };
		}

		console.log(
			`[SchematicObject:${schematicObject.id}] Processing ${totalChunks} chunks with TRUE lazy incremental loading.`
		);

		// CRITICAL: No mesh accumulator here either!
		const chunkMap: Map<string, THREE.Object3D[]> = new Map();
		let totalMeshCount = 0;

		this.reportBuildProgress(
			"Processing optimized chunks...",
			0,
			totalChunks,
			0
		);

		const renderingBounds = schematicObject.renderingBounds?.enabled
			? schematicObject.renderingBounds
			: undefined;

		let processedChunkCount = 0;
		let currentFrameJsBudget = 10;
		const TARGET_FRAME_TIME = 16.66;

		let lastRenderTimeMs = 0;
		let frameCounterForLog = 0;
		const LOG_INTERVAL_FRAMES = 30;

		return new Promise((resolvePromise, rejectPromise) => {
			const processNextFrame = async () => {
				const frameProcessingStartTime = performance.now();
				let meshesAddedThisFrame = 0; // Track count, not objects

				try {
					while (iterator.has_next()) {
						if (
							meshesAddedThisFrame > 0 &&
							performance.now() - frameProcessingStartTime >=
								currentFrameJsBudget
						) {
							break;
						}

						const chunkData = iterator.next();
						if (!chunkData) break;

						const { chunk_x, chunk_y, chunk_z, blocks } = chunkData;

						// Bounds culling
						if (renderingBounds) {
							const chunkMinX = chunk_x * chunkDimensions.chunkWidth;
							const chunkMinY = chunk_y * chunkDimensions.chunkHeight;
							const chunkMinZ = chunk_z * chunkDimensions.chunkLength;
							const chunkMaxX = chunkMinX + chunkDimensions.chunkWidth;
							const chunkMaxY = chunkMinY + chunkDimensions.chunkHeight;
							const chunkMaxZ = chunkMinZ + chunkDimensions.chunkLength;

							if (
								chunkMaxX <= renderingBounds.min.x ||
								chunkMinX >= renderingBounds.max.x ||
								chunkMaxY <= renderingBounds.min.y ||
								chunkMinY >= renderingBounds.max.y ||
								chunkMaxZ <= renderingBounds.min.z ||
								chunkMinZ >= renderingBounds.max.z
							) {
								processedChunkCount++;
								this.reportBuildProgress(
									"Processing optimized chunks (bounds culled)...",
									processedChunkCount / totalChunks,
									totalChunks,
									processedChunkCount
								);
								continue;
							}
						}

						// Process chunk and IMMEDIATELY add to scene
						const chunkMeshes = await this.worldMeshBuilder.getChunkMesh(
							{
								blocks: blocks,
								chunk_x,
								chunk_y,
								chunk_z,
							},
							schematicObject,
							renderingBounds
						);

						processedChunkCount++;

						if (chunkMeshes && chunkMeshes.length > 0) {
							const chunkKey = `${chunk_x},${chunk_y},${chunk_z}`;
							chunkMap.set(chunkKey, chunkMeshes);

							// IMMEDIATELY apply properties and add to scene
							this.applyPropertiesToObjects(chunkMeshes);
							chunkMeshes.forEach((mesh) => {
								this.group.add(mesh);
							});

							meshesAddedThisFrame += chunkMeshes.length;
							totalMeshCount += chunkMeshes.length;

							// chunkMeshes can be GC'd after this point
						}

						this.reportBuildProgress(
							"Processing optimized chunks...",
							processedChunkCount / totalChunks,
							totalChunks,
							processedChunkCount
						);
					}

					// Render frame
					if (this.schematicRenderer.renderManager && renderer) {
						const renderStartTime = performance.now();
						this.schematicRenderer.renderManager.render();
						lastRenderTimeMs = performance.now() - renderStartTime;
					}

					frameCounterForLog++;
					if (
						frameCounterForLog % LOG_INTERVAL_FRAMES === 0 ||
						!iterator.has_next()
					) {
						console.log(
							`--- TRUE Lazy Frame Log (Processed ${processedChunkCount}/${totalChunks} chunks) ---`
						);
						const jsTimeThisFrame =
							performance.now() - frameProcessingStartTime;
						console.log(
							`  JS Work This Frame: ${jsTimeThisFrame.toFixed(
								2
							)}ms (Budget: ${currentFrameJsBudget.toFixed(2)}ms)`
						);
						console.log(`  Meshes Added This Frame: ${meshesAddedThisFrame}`);
						console.log(`  Last Render Time: ${lastRenderTimeMs.toFixed(2)}ms`);
						console.log(`  Total Scene Meshes: ${this.group.children.length}`);
						console.log(`  Memory Usage: MINIMAL (no accumulation)`);

						// Dynamic budget adjustment
						const combinedTime = jsTimeThisFrame + lastRenderTimeMs;
						if (
							combinedTime > TARGET_FRAME_TIME * 1.5 &&
							currentFrameJsBudget > 4
						) {
							currentFrameJsBudget = Math.max(4, currentFrameJsBudget * 0.8);
							console.log(
								`  --> Reducing JS budget to: ${currentFrameJsBudget.toFixed(
									2
								)}ms`
							);
						} else if (
							combinedTime < TARGET_FRAME_TIME * 0.5 &&
							currentFrameJsBudget < 16
						) {
							currentFrameJsBudget = Math.min(16, currentFrameJsBudget * 1.2);
							console.log(
								`  --> Increasing JS budget to: ${currentFrameJsBudget.toFixed(
									2
								)}ms`
							);
						}
					}

					if (iterator.has_next()) {
						requestAnimationFrame(processNextFrame);
					} else {
						// All chunks processed
						console.log(
							`[SchematicObject:${
								schematicObject.id
							}] All ${totalChunks} chunks processed with TRUE lazy incremental. Total time: ${(
								performance.now() - overallStartTime
							).toFixed(2)}ms.`
						);

						this.group.updateMatrixWorld(true);

						// Return meshes from scene graph
						const finalMeshes = Array.from(this.group.children);

						if (typeof window !== "undefined") {
							window.dispatchEvent(
								new CustomEvent("schematicRenderComplete", {
									detail: {
										schematicId: this.id,
										schematicName: this.name,
										totalChunks: totalChunks,
										processedChunks: processedChunkCount,
										buildTimeMs: performance.now() - overallStartTime,
										meshCount: totalMeshCount,
										optimized: true,
										incremental: true,
										trueLazy: true,
									},
								})
							);
						}

						if (renderer && renderer.info) {
							console.log(
								`FINAL TRUE LAZY INCREMENTAL STATS - Draw Calls: ${renderer.info.render.calls}, Tris: ${renderer.info.render.triangles}`
							);
						}

						this.reportBuildProgress(
							"TRUE lazy incremental complete",
							1.0,
							totalChunks,
							processedChunkCount
						);

						setTimeout(() => {
							if (this.schematicRenderer.uiManager) {
								this.schematicRenderer.uiManager.hideProgressBar();
							}
						}, 800);

						resolvePromise({ meshes: finalMeshes, chunkMap });
					}
				} catch (error) {
					console.error(
						`[SchematicObject:${schematicObject.id}] Critical error during TRUE lazy processing:`,
						error
					);
					rejectPromise(error);
				}
			};

			requestAnimationFrame(processNextFrame);
		});
	}

	 public async buildSchematicMeshesInstanced(
        schematicObject: SchematicObject,
    ): Promise<{ meshes: THREE.Object3D[]; chunkMap: Map<string, THREE.Object3D[]> }> {
        console.log(`[SchematicObject:${schematicObject.id}] Starting INSTANCED build.`);
        const overallStartTime = performance.now();

        // Initialize instanced rendering
        await this.worldMeshBuilder.precomputePaletteGeometries(
            this.schematicWrapper.get_all_palettes().default
        );
        
        this.worldMeshBuilder.enableInstancedRendering(this.group, true);

        // Render entire schematic using instanced rendering
        await this.worldMeshBuilder.renderSchematicInstanced(schematicObject);

        const totalTime = performance.now() - overallStartTime;
        console.log(`[SchematicObject:${schematicObject.id}] INSTANCED build completed in ${totalTime.toFixed(2)}ms`);

        // Return instanced meshes from scene graph
        const instancedMeshes = Array.from(this.group.children);
        
        // Dispatch completion event
        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent("schematicRenderComplete", {
                    detail: {
                        schematicId: this.id,
                        schematicName: this.name,
                        buildTimeMs: totalTime,
                        meshCount: instancedMeshes.length,
                        optimized: true,
                        instanced: true, // Flag for instanced rendering
                    },
                })
            );
        }

        return { meshes: instancedMeshes, chunkMap: new Map() };
    }

	/**
	 * Creates or updates the rendering bounds helper visualization
	 */
	private createRenderingBoundsHelper(visible: boolean = true): void {
		// Update the visualizer if it exists
		if (this.renderingBounds.helper) {
			this.group.remove(this.renderingBounds.helper);
		}

		if (visible) {
			// Create a box to represent the rendering bounds
			const box = new THREE.Box3(
				this.renderingBounds.min.clone(),
				this.renderingBounds.max.clone()
			);

			// Create a box helper to visualize the bounds
			const helper = new THREE.Box3Helper(box, new THREE.Color(0x00ff00));
			this.renderingBounds.helper = helper;
			this.group.add(helper);
		} else {
			this.renderingBounds.helper = undefined;
		}
	}

	/**
	 * Sets the rendering bounds for this schematic
	 * @param min Minimum coordinates for rendering
	 * @param max Maximum coordinates for rendering
	 * @param showHelper Whether to show a visual helper for the bounds
	 */
	public setRenderingBounds(
		min: THREE.Vector3 | number[],
		max: THREE.Vector3 | number[],
		showHelper: boolean = true
	): void {
		// Convert arrays to Vector3 if needed
		if (Array.isArray(min)) {
			min = new THREE.Vector3(min[0], min[1], min[2]);
		}
		if (Array.isArray(max)) {
			max = new THREE.Vector3(max[0], max[1], max[2]);
		}

		// Update the rendering bounds
		this.renderingBounds.min = min.clone();
		this.renderingBounds.max = max.clone();

		// Create/update the visualizer if requested
		this.createRenderingBoundsHelper(showHelper);

		// Rebuild mesh to apply the rendering bounds
		this.rebuildMesh();
	}

	/**
	 * Shows or hides the rendering bounds helper
	 * @param visible Whether the helper should be visible
	 */
	public showRenderingBoundsHelper(visible: boolean): void {
		this.createRenderingBoundsHelper(visible);
	}

	/**
	 * Resets the rendering bounds to include the full schematic
	 */
	public resetRenderingBounds(): void {
		const dimensions = this.getDimensions();
		this.setRenderingBounds(
			new THREE.Vector3(0, 0, 0),
			new THREE.Vector3(dimensions[0], dimensions[1], dimensions[2])
		);
	}

	public async getMeshes(): Promise<THREE.Object3D[]> {
		await this.meshesReady;
		return Array.from(this.group.children);
	}

	// Update chunk management methods to handle Object3D
	public getChunkObjectsAt(
		chunkX: number,
		chunkY: number,
		chunkZ: number
	): THREE.Object3D[] | null {
		const key = `${chunkX},${chunkY},${chunkZ}`;
		return this.chunkMeshes.get(key) || null;
	}

	public setChunkObjectsAt(
		chunkX: number,
		chunkY: number,
		chunkZ: number,
		objects: THREE.Object3D[]
	) {
		const key = `${chunkX},${chunkY},${chunkZ}`;
		this.chunkMeshes.set(key, objects);
	}

	// Keep the old method names for backward compatibility
	public getChunkMeshAt(
		chunkX: number,
		chunkY: number,
		chunkZ: number
	): THREE.Mesh[] | null {
		return this.getChunkObjectsAt(chunkX, chunkY, chunkZ) as
			| THREE.Mesh[]
			| null;
	}

	public setChunkMeshAt(
		chunkX: number,
		chunkY: number,
		chunkZ: number,
		meshes: THREE.Mesh[]
	) {
		this.setChunkObjectsAt(chunkX, chunkY, chunkZ, meshes);
	}

	// Optimized material update method
	private updateMeshMaterials(property: "opacity") {
		const needsTransparency = this.opacity < 1.0;

		this.group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				const materials = Array.isArray(child.material)
					? child.material
					: [child.material];

				materials.forEach((mat) => {
					if (mat) {
						mat.opacity = this.opacity;
						mat.transparent = needsTransparency;
					}
				});
			}
		});
		// Emit event if necessary
		this.emitPropertyChanged("material", { property, value: this.opacity });
	}

	private updateMeshVisibility() {
		this.group.visible = this.visible;
		// Emit event if necessary
		this.emitPropertyChanged("visibility", this.visible);
	}

	public async updateMesh() {
		// Remove old meshes from the scene
		this.meshes.forEach((mesh) => {
			this.group.remove(mesh);
			mesh.geometry.dispose();
			if (Array.isArray(mesh.material)) {
				mesh.material.forEach((material) => material.dispose());
			} else {
				mesh.material.dispose();
			}
		});

		// Clear chunk meshes
		this.chunkMeshes.clear();
		if (this.visible) {
			await this.buildMeshes();
		}
	}

	public async rebuildMesh() {
		// Show progress bar if enabled in renderer options
		const renderer = this.sceneManager?.schematicRenderer;
		if (renderer?.options.enableProgressBar && renderer.uiManager) {
			renderer.uiManager.showProgressBar(`Rebuilding ${this.name}`);
			renderer.uiManager.updateProgress(0.1, "Disposing old meshes...");
		}

		// Remove old meshes from the scene
		this.meshes.forEach((mesh) => {
			this.group.remove(mesh as THREE.Object3D);
			mesh.geometry.dispose();
			if (Array.isArray(mesh.material)) {
				mesh.material.forEach((material) => material.dispose());
			} else {
				mesh.material.dispose();
			}
		});

		// Clear chunk meshes and update progress
		this.chunkMeshes.clear();

		if (renderer?.options.enableProgressBar && renderer.uiManager) {
			renderer.uiManager.updateProgress(0.2, "Building new meshes...");
		}

		// Build new meshes if visible
		if (this.visible) {
			await this.buildMeshes();
		}

		// Hide progress bar when complete
		if (renderer?.options.enableProgressBar && renderer.uiManager) {
			renderer.uiManager.hideProgressBar();
		}
	}

	public getSchematicWrapper(): SchematicWrapper {
		return this.schematicWrapper;
	}

	public async setBlockNoRebuild(
		position: THREE.Vector3 | number[],
		blockType: string
	) {
		if (Array.isArray(position)) {
			position = new THREE.Vector3(position[0], position[1], position[2]);
		}

		this.schematicWrapper.set_block(
			position.x,
			position.y,
			position.z,
			blockType
		);
	}

	public async setBlock(position: THREE.Vector3 | number[], blockType: string) {
		if (Array.isArray(position)) {
			position = new THREE.Vector3(position[0], position[1], position[2]);
		}
		await this.setBlockNoRebuild(position, blockType);

		await this.rebuildChunkAtPosition(position);
	}

	// Optimized batch block setting
	public async setBlocks(blocks: [THREE.Vector3 | number[], string][]) {
		const affectedChunks = new Set<string>();
		let startTime = performance.now();
		console.log("Setting blocks");
		resetPerformanceMetrics();

		// Batch all block updates first
		for (let [position, blockType] of blocks) {
			if (Array.isArray(position)) {
				position = new THREE.Vector3(position[0], position[1], position[2]);
			}
			await this.setBlockNoRebuild(position, blockType);
			const chunkCoords = this.getChunkCoordinates(position);
			affectedChunks.add(`${chunkCoords.x},${chunkCoords.y},${chunkCoords.z}`);
		}
		console.log("Blocks set");
		console.log("Time to set blocks:", performance.now() - startTime + "ms");

		startTime = performance.now();
		console.log("Rebuilding chunks");

		// Rebuild all affected chunks in parallel
		const rebuildPromises: Promise<void>[] = [];
		for (let chunk of affectedChunks) {
			const [chunkX, chunkY, chunkZ] = chunk.split(",").map((v) => parseInt(v));
			rebuildPromises.push(this.rebuildChunk(chunkX, chunkY, chunkZ));
		}

		// Wait for all chunks to rebuild
		await Promise.all(rebuildPromises);
		console.log("Chunks rebuilt in", performance.now() - startTime + "ms");
	}

	public async copyRegionFromSchematic(
		sourceSchematicName: string,
		sourceMin?: THREE.Vector3 | number[],
		sourceMax?: THREE.Vector3 | number[],
		targetPosition?: THREE.Vector3 | number[],
		excludeBlocks?: string[],
		rebuild: boolean = false
	) {
		const sourceSchematic =
			this.sceneManager?.schematicRenderer?.schematicManager?.getSchematic(
				sourceSchematicName
			);
		if (!sourceSchematic) {
			throw new Error(`Schematic ${sourceSchematicName} not found`);
		}
		if (Array.isArray(sourceMin)) {
			sourceMin = new THREE.Vector3(sourceMin[0], sourceMin[1], sourceMin[2]);
		}
		if (Array.isArray(sourceMax)) {
			sourceMax = new THREE.Vector3(sourceMax[0], sourceMax[1], sourceMax[2]);
		}
		if (Array.isArray(targetPosition)) {
			targetPosition = new THREE.Vector3(
				targetPosition[0],
				targetPosition[1],
				targetPosition[2]
			);
		}

		const sourceDimensions = sourceSchematic.getDimensions();

		if (!sourceMin) {
			sourceMin = new THREE.Vector3(0, 0, 0);
		}
		if (!sourceMax) {
			sourceMax = new THREE.Vector3(
				sourceDimensions[0] - 1,
				sourceDimensions[1] - 1,
				sourceDimensions[2] - 1
			);
		}

		if (!targetPosition) {
			targetPosition = new THREE.Vector3(0, 0, 0);
		}

		if (!excludeBlocks) {
			excludeBlocks = [];
		}

		await this.schematicWrapper.copy_region(
			sourceSchematic.schematicWrapper,
			sourceMin.x,
			sourceMin.y,
			sourceMin.z,
			sourceMax.x,
			sourceMax.y,
			sourceMax.z,
			targetPosition.x,
			targetPosition.y,
			targetPosition.z,
			excludeBlocks
		);

		if (rebuild) {
			await this.rebuildMesh();
		}
	}

	public getBlock(position: THREE.Vector3 | number[]): string | undefined {
		if (Array.isArray(position)) {
			position = new THREE.Vector3(position[0], position[1], position[2]);
		}
		return this.schematicWrapper.get_block(position.x, position.y, position.z);
	}

	public async replaceBlock(replaceBlock: string, newBlock: string) {
		const blocks: [THREE.Vector3, string][] = [];
		const dimensions = this.getDimensions();
		for (let x = 0; x < dimensions[0]; x++) {
			for (let y = 0; y < dimensions[1]; y++) {
				for (let z = 0; z < dimensions[2]; z++) {
					const block = this.schematicWrapper.get_block(x, y, z);
					if (block === replaceBlock) {
						blocks.push([new THREE.Vector3(x, y, z), newBlock]);
					}
				}
			}
		}
		await this.setBlocks(blocks);
	}

	public async addCube(
		position: THREE.Vector3 | number[],
		size: THREE.Vector3 | number[],
		blockType: string
	): Promise<SchematicObject> {
		if (Array.isArray(position)) {
			position = new THREE.Vector3(position[0], position[1], position[2]);
		}
		if (Array.isArray(size)) {
			size = new THREE.Vector3(size[0], size[1], size[2]);
		}

		const blocks: [THREE.Vector3, string][] = [];
		for (let x = 0; x < size.x; x++) {
			for (let y = 0; y < size.y; y++) {
				for (let z = 0; z < size.z; z++) {
					blocks.push([
						position.clone().add(new THREE.Vector3(x, y, z)),
						blockType,
					]);
				}
			}
		}

		await this.setBlocks(blocks);
		return this;
	}

	public async rebuildChunkAtPosition(position: THREE.Vector3) {
		const chunkCoords = this.getChunkCoordinates(position);
		await this.rebuildChunk(chunkCoords.x, chunkCoords.y, chunkCoords.z);
	}

	private getChunkCoordinates(position: THREE.Vector3): {
		x: number;
		y: number;
		z: number;
	} {
		return {
			x: Math.floor(position.x / this.chunkDimensions.chunkWidth),
			y: Math.floor(position.y / this.chunkDimensions.chunkHeight),
			z: Math.floor(position.z / this.chunkDimensions.chunkLength),
		};
	}

	public async rebuildChunk(chunkX: number, chunkY: number, chunkZ: number) {
		const chunkOffset = {
			x: chunkX * this.chunkDimensions.chunkWidth,
			y: chunkY * this.chunkDimensions.chunkHeight,
			z: chunkZ * this.chunkDimensions.chunkLength,
		};

		// Check if chunk is outside rendering bounds - if so, just remove it
		if (this.renderingBounds) {
			const chunkMaxX = chunkOffset.x + this.chunkDimensions.chunkWidth;
			const chunkMaxY = chunkOffset.y + this.chunkDimensions.chunkHeight;
			const chunkMaxZ = chunkOffset.z + this.chunkDimensions.chunkLength;

			// If the chunk is completely outside rendering bounds, just remove it
			if (
				chunkMaxX <= this.renderingBounds.min.x ||
				chunkOffset.x >= this.renderingBounds.max.x ||
				chunkMaxY <= this.renderingBounds.min.y ||
				chunkOffset.y >= this.renderingBounds.max.y ||
				chunkMaxZ <= this.renderingBounds.min.z ||
				chunkOffset.z >= this.renderingBounds.max.z
			) {
				this.removeChunkObjects(chunkX, chunkY, chunkZ);
				return;
			}
		}

		// Get the blocks in the chunk using the optimized method
		const chunkBlockIndices = this.schematicWrapper.get_chunk_blocks_indices(
			chunkOffset.x,
			chunkOffset.y,
			chunkOffset.z,
			this.chunkDimensions.chunkWidth,
			this.chunkDimensions.chunkHeight,
			this.chunkDimensions.chunkLength
		);

		// Remove old chunk objects from the scene
		this.removeChunkObjects(chunkX, chunkY, chunkZ);

		// Build new chunk objects using the optimized format
		const newChunkObjects = await this.worldMeshBuilder.getChunkMesh(
			{
				blocks: chunkBlockIndices, // This is already in format: [[x,y,z,paletteIndex],...]
				chunk_x: chunkX,
				chunk_y: chunkY,
				chunk_z: chunkZ,
			},
			this,
			this.renderingBounds
		);

		// Apply properties to the new objects
		this.applyPropertiesToObjects(newChunkObjects);

		newChunkObjects.forEach((obj) => {
			this.group.add(obj);
		});

		// Update the chunk object reference in chunkMeshes map
		this.setChunkObjectsAt(chunkX, chunkY, chunkZ, newChunkObjects);
	}

	private removeChunkObjects(chunkX: number, chunkY: number, chunkZ: number) {
		const oldChunkObjects = this.getChunkObjectsAt(chunkX, chunkY, chunkZ);
		if (oldChunkObjects) {
			oldChunkObjects.forEach((obj) => {
				this.group.remove(obj);
				// Dispose of geometries and materials within the object
				obj.traverse((child) => {
					if (child instanceof THREE.Mesh) {
						child.geometry?.dispose();
						if (Array.isArray(child.material)) {
							child.material.forEach((material) => material.dispose());
						} else {
							child.material?.dispose();
						}
					}
				});
			});
			this.chunkMeshes.delete(`${chunkX},${chunkY},${chunkZ}`);
		}
	}

	public containsPosition(position: THREE.Vector3): boolean {
		// Calculate the bounds of the schematic
		const dimensions = this.getDimensions();
		const min = this.position.clone();
		const max = min
			.clone()
			.add(
				new THREE.Vector3(dimensions[0], dimensions[1], dimensions[2]).multiply(
					this.scale
				)
			);

		return (
			position.x >= min.x &&
			position.x <= max.x &&
			position.y >= min.y &&
			position.y <= max.y &&
			position.z >= min.z &&
			position.z <= max.z
		);
	}

	public getSchematicCenter(): THREE.Vector3 {
		const dimensions = this.getDimensions();
		return new THREE.Vector3(
			this.position.x + Math.abs(dimensions[0] / 2),
			this.position.y + Math.abs(dimensions[1] / 2),
			this.position.z + Math.abs(dimensions[2] / 2)
		);
	}

	public centerInScene() {
		const averagePosition = this.getSchematicCenter();
		const newSchematicPosition = new THREE.Vector3(
			this.position.x - averagePosition.x,
			this.position.y - averagePosition.y,
			this.position.z - averagePosition.z
		);
		this.position.copy(newSchematicPosition);
		this.updateTransform();
	}

	public centerInScenePlane() {
		const averagePosition = this.getSchematicCenter();
		const newSchematicPosition = new THREE.Vector3(
			this.position.x - averagePosition.x,
			0,
			this.position.z - averagePosition.z
		);
		this.position.copy(newSchematicPosition);
		this.updateTransform();
	}

	public setPosition(position: THREE.Vector3 | number[]): void {
		if (Array.isArray(position)) {
			this.position = new THREE.Vector3(position[0], position[1], position[2]);
			this.updateTransform();
			return;
		}
		this.position = position;
		this.updateTransform();
	}

	public setRotation(rotation: THREE.Euler | number[]): void {
		if (Array.isArray(rotation)) {
			this.rotation = new THREE.Euler(rotation[0], rotation[1], rotation[2]);
			return;
		}
		this.rotation = rotation;
	}

	public setScale(scale: THREE.Vector3 | number[]): void {
		if (Array.isArray(scale)) {
			this.scale = new THREE.Vector3(scale[0], scale[1], scale[2]);
			return;
		}
		this.scale = scale;
	}

	public getWorldPosition(): THREE.Vector3 {
		return this.group.getWorldPosition(new THREE.Vector3());
	}

	public getBoundingBox(): [number[], number[]] {
		const boundingBox = this.getDimensions();
		const positionArray = this.position.toArray();
		const min = positionArray;
		const max = positionArray.map((v, i) => v + boundingBox[i]);
		return [min, max];
	}

	// Optimized getAllBlocks method with optional filtering
	public getAllBlocks(filter?: (block: BlockData) => boolean): BlockData[] {
		const dimensions = this.getDimensions();
		const blocks: BlockData[] = [];

		for (let x = 0; x < dimensions[0]; x++) {
			for (let y = 0; y < dimensions[1]; y++) {
				for (let z = 0; z < dimensions[2]; z++) {
					const blockName = this.schematicWrapper.get_block(x, y, z);
					if (blockName && blockName !== "minecraft:air") {
						// Get block properties using the correct method name
						let properties = {};
						try {
							const blockWithProps =
								this.schematicWrapper.get_block_with_properties?.(x, y, z);
							if (blockWithProps) {
								// Extract properties from BlockStateWrapper if available
								properties = blockWithProps.properties || {};
							}
						} catch (error) {
							// Fallback to empty properties if method doesn't exist or fails
							properties = {};
						}

						const blockData: BlockData = {
							x,
							y,
							z,
							name: blockName,
							properties: properties,
							chunk_x: Math.floor(x / this.chunkDimensions.chunkWidth),
							chunk_y: Math.floor(y / this.chunkDimensions.chunkHeight),
							chunk_z: Math.floor(z / this.chunkDimensions.chunkLength),
							stateKey: `${blockName}${
								Object.keys(properties).length > 0
									? `[${Object.entries(properties)
											.map(([k, v]) => `${k}=${v}`)
											.join(",")}]`
									: ""
							}`, // Generate stateKey
						};

						// Apply filter if provided
						if (!filter || filter(blockData)) {
							blocks.push(blockData);
						}
					}
				}
			}
		}

		return blocks;
	}

	/**
	 * Creates an object with properties and methods for easily manipulating rendering bounds
	 * Useful for console manipulation and testing
	 * @returns Settings object with properties and methods
	 */
	public createBoundsControls(): any {
		const dimensions = this.getDimensions();
		const [width, height, depth] = dimensions;

		const settings = {
			minX: this.renderingBounds.min.x,
			maxX: this.renderingBounds.max.x,
			minY: this.renderingBounds.min.y,
			maxY: this.renderingBounds.max.y,
			minZ: this.renderingBounds.min.z,
			maxZ: this.renderingBounds.max.z,

			// Apply a specific axis
			applyX: () => {
				const min = this.renderingBounds.min.clone();
				const max = this.renderingBounds.max.clone();
				min.x = settings.minX;
				max.x = settings.maxX;
				this.setRenderingBounds(min, max);
				return `X axis bounds set to [${settings.minX}, ${settings.maxX}]`;
			},

			applyY: () => {
				const min = this.renderingBounds.min.clone();
				const max = this.renderingBounds.max.clone();
				min.y = settings.minY;
				max.y = settings.maxY;
				this.setRenderingBounds(min, max);
				return `Y axis bounds set to [${settings.minY}, ${settings.maxY}]`;
			},

			applyZ: () => {
				const min = this.renderingBounds.min.clone();
				const max = this.renderingBounds.max.clone();
				min.z = settings.minZ;
				max.z = settings.maxZ;
				this.setRenderingBounds(min, max);
				return `Z axis bounds set to [${settings.minZ}, ${settings.maxZ}]`;
			},

			// Apply all axes
			applyAll: () => {
				this.setRenderingBounds(
					[settings.minX, settings.minY, settings.minZ],
					[settings.maxX, settings.maxY, settings.maxZ]
				);
				return `All bounds set to min:[${settings.minX}, ${settings.minY}, ${settings.minZ}], max:[${settings.maxX}, ${settings.maxY}, ${settings.maxZ}]`;
			},

			// Reset to full dimensions
			reset: () => {
				this.resetRenderingBounds();
				// Update local settings to match
				settings.minX = 0;
				settings.maxX = width;
				settings.minY = 0;
				settings.maxY = height;
				settings.minZ = 0;
				settings.maxZ = depth;
				return `Reset rendering bounds to full dimensions: [${width}, ${height}, ${depth}]`;
			},

			// Toggle helper visibility
			toggleHelper: (visible = true) => {
				this.showRenderingBoundsHelper(visible);
				return `Rendering bounds helper ${visible ? "shown" : "hidden"}`;
			},

			// Get current bounds
			getCurrentBounds: () => {
				return {
					min: this.renderingBounds.min.toArray(),
					max: this.renderingBounds.max.toArray(),
				};
			},

			// Sync from current bounds
			syncFromCurrent: () => {
				settings.minX = this.renderingBounds.min.x;
				settings.maxX = this.renderingBounds.max.x;
				settings.minY = this.renderingBounds.min.y;
				settings.maxY = this.renderingBounds.max.y;
				settings.minZ = this.renderingBounds.min.z;
				settings.maxZ = this.renderingBounds.max.z;
				return "Settings synchronized with current bounds";
			},

			// Slice from one side (useful for slider UI)
			sliceX: (value: number) => {
				settings.maxX = value;
				return settings.applyX();
			},

			sliceY: (value: number) => {
				settings.maxY = value;
				return settings.applyY();
			},

			sliceZ: (value: number) => {
				settings.maxZ = value;
				return settings.applyZ();
			},
		};

		return settings;
	}
}
