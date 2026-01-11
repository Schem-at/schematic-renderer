// SchematicExporter.ts - Modular export system for schematics

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import {
	ExportOptions,
	ExportFormat,
	ExportQuality,
	ExportResult,
	ExportProgress,
	ExportError,
	ExportErrorCode,
	QualityPreset,
	ExportEventType,
	ExportEventHandler,
	ExportEventMap,
} from "../types/export";

/**
 * Quality preset configurations
 */
const QUALITY_PRESETS: Record<ExportQuality, QualityPreset> = {
	low: {
		maxTextureSize: 512,
		optimize: true,
		preserveMaterials: false,
	},
	medium: {
		maxTextureSize: 1024,
		optimize: true,
		preserveMaterials: true,
	},
	high: {
		maxTextureSize: 2048,
		optimize: false,
		preserveMaterials: true,
	},
	ultra: {
		maxTextureSize: 4096,
		optimize: false,
		preserveMaterials: true,
	},
};

/**
 * SchematicExporter - Handles exporting schematics to various 3D formats
 * 
 * Features:
 * - Multiple format support (GLTF, GLB, OBJ, STL)
 * - Normal fixing for proper rendering in external viewers
 * - Quality presets
 * - Progress callbacks
 * - Event system
 */
export class SchematicExporter {
	private eventListeners: Map<ExportEventType, Set<ExportEventHandler<any>>> = new Map();
	private currentExport: AbortController | null = null;

	constructor() {
		// Initialize event listener maps
		const eventTypes: ExportEventType[] = [
			"exportStarted",
			"exportProgress",
			"exportComplete",
			"exportError",
			"exportCancelled",
		];
		eventTypes.forEach((type) => this.eventListeners.set(type, new Set()));
	}

	/**
	 * Export a THREE.Object3D to the specified format
	 */
	public async export(
		object: THREE.Object3D,
		options: ExportOptions = {}
	): Promise<ExportResult> {
		const startTime = performance.now();
		this.currentExport = new AbortController();

		// Merge with defaults and quality preset
		const resolvedOptions = this.resolveOptions(options);
		const filename = this.getFilename(resolvedOptions);

		this.emit("exportStarted", { format: resolvedOptions.format!, filename });

		try {
			// Phase 1: Preparing
			this.emitProgress("preparing", 0, "Preparing export...");

			// Clone the object to avoid modifying the original
			const exportGroup = this.prepareExportGroup(object, resolvedOptions);

			// Phase 2: Processing geometry
			this.emitProgress("processing", 0.2, "Processing geometry...");

			// Fix normals/winding if needed
			await this.processNormals(exportGroup, resolvedOptions);

			// Fix materials for proper depth handling in external viewers
			this.emitProgress("processing", 0.3, "Fixing materials...");
			this.fixMaterialsForExport(exportGroup, resolvedOptions.forceOpaque);

			// Apply optimizations if needed
			if (resolvedOptions.optimize) {
				this.emitProgress("processing", 0.4, "Optimizing geometry...");
				this.optimizeGeometry(exportGroup);
			}

			// Phase 3: Converting
			this.emitProgress("converting", 0.5, "Converting to export format...");

			let result: ExportResult;

			switch (resolvedOptions.format) {
				case "gltf":
				case "glb":
					result = await this.exportGLTF(exportGroup, resolvedOptions, filename, startTime);
					break;
				case "obj":
					result = await this.exportOBJ(exportGroup, resolvedOptions, filename, startTime);
					break;
				case "stl":
					result = await this.exportSTL(exportGroup, resolvedOptions, filename, startTime);
					break;
				default:
					throw this.createError("INVALID_FORMAT", `Unknown format: ${resolvedOptions.format}`);
			}

			// Phase 4: Finalizing
			this.emitProgress("finalizing", 0.9, "Finalizing export...");

			// Clean up cloned objects
			this.disposeExportGroup(exportGroup);

			this.emitProgress("finalizing", 1.0, "Export complete!");
			this.emit("exportComplete", result);

			return result;
		} catch (error) {
			const exportError = this.createError(
				"UNKNOWN",
				error instanceof Error ? error.message : "Unknown error",
				error instanceof Error ? error : undefined
			);
			this.emit("exportError", exportError);
			throw exportError;
		} finally {
			this.currentExport = null;
		}
	}

	/**
	 * Cancel the current export
	 */
	public cancel(): void {
		if (this.currentExport) {
			this.currentExport.abort();
			this.emit("exportCancelled", { filename: "" });
		}
	}

	/**
	 * Subscribe to export events
	 */
	public on<T extends ExportEventType>(
		event: T,
		handler: ExportEventHandler<T>
	): () => void {
		const handlers = this.eventListeners.get(event);
		if (handlers) {
			handlers.add(handler);
		}
		// Return unsubscribe function
		return () => this.off(event, handler);
	}

	/**
	 * Unsubscribe from export events
	 */
	public off<T extends ExportEventType>(
		event: T,
		handler: ExportEventHandler<T>
	): void {
		const handlers = this.eventListeners.get(event);
		if (handlers) {
			handlers.delete(handler);
		}
	}

	/**
	 * Emit an event
	 */
	private emit<T extends ExportEventType>(event: T, data: ExportEventMap[T]): void {
		const handlers = this.eventListeners.get(event);
		if (handlers) {
			handlers.forEach((handler) => handler(data));
		}
	}

	/**
	 * Emit progress event
	 */
	private emitProgress(
		phase: ExportProgress["phase"],
		progress: number,
		message: string
	): void {
		this.emit("exportProgress", { phase, progress, message });
	}

	/**
	 * Resolve options with defaults and quality presets
	 */
	private resolveOptions(options: ExportOptions): Required<ExportOptions> {
		const quality = options.quality || "high";
		const preset = QUALITY_PRESETS[quality];

		return {
			filename: options.filename || "schematic_export",
			format: options.format || "glb",
			quality,
			normalMode: options.normalMode || "double-sided", // Default to double-sided for max compatibility
			embedTextures: options.embedTextures ?? true,
			maxTextureSize: options.maxTextureSize ?? preset.maxTextureSize,
			animations: options.animations || [],
			includeCustomExtensions: options.includeCustomExtensions ?? false,
			centerAtOrigin: options.centerAtOrigin ?? false,
			scale: options.scale ?? 1,
			optimize: options.optimize ?? preset.optimize,
			visibleOnly: options.visibleOnly ?? true,
			preserveMaterials: options.preserveMaterials ?? preset.preserveMaterials,
			forceOpaque: options.forceOpaque ?? false,
			onProgress: options.onProgress || (() => {}),
			onComplete: options.onComplete || (() => {}),
			onError: options.onError || (() => {}),
		};
	}

	/**
	 * Get filename with proper extension
	 */
	private getFilename(options: Required<ExportOptions>): string {
		let filename = options.filename;
		const ext = `.${options.format}`;

		// Remove any existing extension
		filename = filename.replace(/\.[^/.]+$/, "");

		return `${filename}${ext}`;
	}

	/**
	 * Prepare export group by cloning and processing the object
	 */
	private prepareExportGroup(
		object: THREE.Object3D,
		options: Required<ExportOptions>
	): THREE.Group {
		const exportGroup = new THREE.Group();
		exportGroup.name = "export_group";

		// Deep clone the object with geometry buffers
		const cloned = this.deepCloneObject(object);

		// Filter to visible only if needed
		if (options.visibleOnly) {
			this.filterVisibleMeshes(cloned);
		}

		// Apply scale
		if (options.scale !== 1) {
			cloned.scale.multiplyScalar(options.scale);
		}

		// Center at origin if needed
		if (options.centerAtOrigin) {
			this.centerAtOrigin(cloned);
		}

		exportGroup.add(cloned);
		return exportGroup;
	}

	/**
	 * Filter to only visible meshes
	 */
	private filterVisibleMeshes(object: THREE.Object3D): void {
		const toRemove: THREE.Object3D[] = [];

		object.traverse((child) => {
			if (!child.visible) {
				toRemove.push(child);
			}
		});

		toRemove.forEach((child) => {
			if (child.parent) {
				child.parent.remove(child);
			}
		});
	}

	/**
	 * Center the object at origin
	 */
	private centerAtOrigin(object: THREE.Object3D): void {
		const box = new THREE.Box3().setFromObject(object);
		const center = box.getCenter(new THREE.Vector3());
		object.position.sub(center);
	}

	/**
	 * Process normals based on the selected mode
	 * This fixes the "inside out" issue in external viewers
	 */
	private async processNormals(
		group: THREE.Group,
		options: Required<ExportOptions>
	): Promise<void> {
		const mode = options.normalMode;

		group.traverse((child) => {
			if (child instanceof THREE.Mesh && child.geometry) {
				const geometry = child.geometry;

				switch (mode) {
					case "flip":
						// For inside-out models: flip face winding to fix backface culling
						// This changes which side of triangles is considered "front"
						this.flipFaceWinding(geometry);
						// Normals should NOT be flipped when winding is flipped,
						// as the normal direction relative to the new front face is now correct
						break;

					case "recompute":
						// Recompute normals from geometry (after potentially flipping winding)
						this.flipFaceWinding(geometry);
						geometry.computeVertexNormals();
						break;

					case "double-sided":
						// Make materials double-sided instead of flipping
						// This is the safest option but may affect performance
						this.setDoubleSided(child);
						break;

					case "default":
					default:
						// Keep geometry as-is
						break;
				}
			}
		});
	}

	/**	 * Deep clone an object, including geometry buffer data
	 * This is necessary because Three.js clone() shares buffer data
	 */
	private deepCloneObject(object: THREE.Object3D): THREE.Object3D {
		const cloned = object.clone(true);

		// Deep clone all geometries to get independent buffer data
		cloned.traverse((child) => {
			if (child instanceof THREE.Mesh && child.geometry) {
				// Clone the geometry with all its attributes
				const originalGeometry = child.geometry;
				const clonedGeometry = new THREE.BufferGeometry();

				// Clone each attribute with new array data
				for (const name of Object.keys(originalGeometry.attributes)) {
					const attr = originalGeometry.getAttribute(name);
					if (attr) {
						const array = attr.array;
						// Create a copy of the typed array
						const ArrayConstructor = array.constructor as new (length: number) => typeof array;
						const newArray = new ArrayConstructor(array.length);
						(newArray as Float32Array).set(array as Float32Array);
						
						const newAttr = new THREE.BufferAttribute(
							newArray,
							attr.itemSize,
							attr.normalized
						);
						clonedGeometry.setAttribute(name, newAttr);
					}
				}

				// Clone index if present
				const index = originalGeometry.getIndex();
				if (index) {
					const indexArray = index.array;
					const IndexConstructor = indexArray.constructor as new (length: number) => typeof indexArray;
					const newIndexArray = new IndexConstructor(indexArray.length);
					(newIndexArray as Uint16Array).set(indexArray as Uint16Array);
					clonedGeometry.setIndex(new THREE.BufferAttribute(newIndexArray, 1));
				}

				// Copy groups
				for (const group of originalGeometry.groups) {
					clonedGeometry.addGroup(group.start, group.count, group.materialIndex);
				}

				// Copy bounding box/sphere if computed
				if (originalGeometry.boundingBox) {
					clonedGeometry.boundingBox = originalGeometry.boundingBox.clone();
				}
				if (originalGeometry.boundingSphere) {
					clonedGeometry.boundingSphere = originalGeometry.boundingSphere.clone();
				}

				child.geometry = clonedGeometry;
			}

			// Also clone materials to avoid modifying originals
			if (child instanceof THREE.Mesh && child.material) {
				if (Array.isArray(child.material)) {
					child.material = child.material.map(m => m.clone());
				} else {
					child.material = child.material.clone();
				}
			}
		});

		return cloned;
	}

	/**
	 * Flip face winding order by reversing triangle indices
	 */
	private flipFaceWinding(geometry: THREE.BufferGeometry): void {
		const indexAttribute = geometry.getIndex();
		if (!indexAttribute) {
			// Non-indexed geometry - reverse vertex order in groups of 3
			const positionAttribute = geometry.getAttribute("position");
			if (positionAttribute) {
				const positions = positionAttribute.array;
				const normals = geometry.getAttribute("normal")?.array;
				const uvs = geometry.getAttribute("uv")?.array;

				// Swap vertices 1 and 2 of each triangle
				for (let i = 0; i < positions.length; i += 9) {
					// Swap positions
					this.swapArrayValues(positions as Float32Array, i + 3, i + 6, 3);
					// Swap normals
					if (normals) {
						this.swapArrayValues(normals as Float32Array, i + 3, i + 6, 3);
					}
					// Swap UVs (2 components per vertex)
					if (uvs) {
						const uvI = (i / 9) * 6;
						this.swapArrayValues(uvs as Float32Array, uvI + 2, uvI + 4, 2);
					}
				}
				positionAttribute.needsUpdate = true;
			}
			return;
		}

		// Indexed geometry - swap indices
		const indices = indexAttribute.array;
		for (let i = 0; i < indices.length; i += 3) {
			// Swap second and third index of each triangle
			const temp = indices[i + 1];
			(indices as Uint16Array | Uint32Array)[i + 1] = indices[i + 2];
			(indices as Uint16Array | Uint32Array)[i + 2] = temp;
		}
		indexAttribute.needsUpdate = true;
	}

	/**
	 * Helper to swap array values
	 */
	private swapArrayValues(
		array: Float32Array,
		index1: number,
		index2: number,
		count: number
	): void {
		for (let i = 0; i < count; i++) {
			const temp = array[index1 + i];
			array[index1 + i] = array[index2 + i];
			array[index2 + i] = temp;
		}
	}

	/**
	 * Set materials to double-sided and fix depth settings
	 */
	private setDoubleSided(mesh: THREE.Mesh): void {
		const materials = Array.isArray(mesh.material)
			? mesh.material
			: [mesh.material];

		materials.forEach((mat) => {
			if (mat) {
				mat.side = THREE.DoubleSide;
			}
		});
	}

	/**
	 * Fix all materials for proper export
	 * Ensures depth write/test are properly set to avoid transparency sorting issues
	 * Forces nearest neighbor filtering for pixel art textures
	 */
	private fixMaterialsForExport(group: THREE.Group, forceOpaque: boolean = false): void {
		group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				const materials = Array.isArray(child.material)
					? child.material
					: [child.material];

				materials.forEach((mat) => {
					if (mat) {
						// Ensure depth testing is enabled
						mat.depthTest = true;
						mat.depthWrite = true;
						
						// Force nearest neighbor filtering on all textures (pixel art style)
						this.setNearestFilterOnMaterial(mat);
						
						if (forceOpaque) {
							// Force all materials to be fully opaque
							mat.transparent = false;
							mat.opacity = 1;
							mat.alphaTest = 0;
						} else if (mat.transparent) {
							// Use alpha test for transparent materials to avoid sorting issues
							// This creates hard-edged cutouts instead of smooth blending
							if (mat.alphaTest === 0) {
								mat.alphaTest = 0.5;
							}
						}
					}
				});
			}
		});
	}

	/**
	 * Set nearest neighbor filtering on all textures in a material
	 * This preserves the crisp pixel art look of Minecraft textures
	 */
	private setNearestFilterOnMaterial(material: THREE.Material): void {
		const textureProps = [
			'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap',
			'emissiveMap', 'envMap', 'lightMap', 'metalnessMap',
			'normalMap', 'roughnessMap', 'specularMap'
		];

		textureProps.forEach((prop) => {
			const texture = (material as unknown as Record<string, unknown>)[prop] as THREE.Texture | undefined;
			if (texture && texture.isTexture) {
				texture.magFilter = THREE.NearestFilter;
				texture.minFilter = THREE.NearestFilter;
				texture.needsUpdate = true;
			}
		});
	}

	/**
	 * Optimize geometry for export
	 */
	private optimizeGeometry(group: THREE.Group): void {
		group.traverse((child) => {
			if (child instanceof THREE.Mesh && child.geometry) {
				// Remove unused attributes
				const geometry = child.geometry;

				// Ensure index is present for efficient rendering
				if (!geometry.getIndex()) {
					// Could add index generation here if needed
				}

				// Compute bounding box/sphere for efficient culling in viewers
				geometry.computeBoundingBox();
				geometry.computeBoundingSphere();
			}
		});
	}

	/**
	 * Export to GLTF/GLB format
	 */
	private async exportGLTF(
		group: THREE.Group,
		options: Required<ExportOptions>,
		filename: string,
		startTime: number
	): Promise<ExportResult> {
		const exporter = new GLTFExporter();
		const isBinary = options.format === "glb";

		const gltfResult = await new Promise<ArrayBuffer | object>((resolve, reject) => {
			exporter.parse(
				group,
				(result) => resolve(result),
				(error) => reject(error),
				{
					binary: isBinary,
					includeCustomExtensions: options.includeCustomExtensions,
					maxTextureSize: options.maxTextureSize,
					embedImages: options.embedTextures,
					animations: options.animations,
				}
			);
		});

		let blob: Blob;
		let actualFilename = filename;

		if (isBinary) {
			blob = new Blob([gltfResult as ArrayBuffer], {
				type: "application/octet-stream",
			});
			if (!actualFilename.endsWith(".glb")) {
				actualFilename = actualFilename.replace(/\.[^/.]+$/, "") + ".glb";
			}
		} else {
			const jsonString = JSON.stringify(gltfResult, null, 2);
			blob = new Blob([jsonString], {
				type: "application/json",
			});
			if (!actualFilename.endsWith(".gltf")) {
				actualFilename = actualFilename.replace(/\.[^/.]+$/, "") + ".gltf";
			}
		}

		const duration = performance.now() - startTime;

		return {
			success: true,
			filename: actualFilename,
			format: options.format,
			size: blob.size,
			duration,
			data: blob,
			downloadUrl: URL.createObjectURL(blob),
		};
	}

	/**
	 * Export to OBJ format (basic implementation)
	 */
	private async exportOBJ(
		group: THREE.Group,
		_options: Required<ExportOptions>,
		filename: string,
		startTime: number
	): Promise<ExportResult> {
		// Dynamic import for OBJ exporter
		const { OBJExporter } = await import("three/examples/jsm/exporters/OBJExporter.js");
		const exporter = new OBJExporter();

		const result = exporter.parse(group);
		const blob = new Blob([result], { type: "text/plain" });

		const actualFilename = filename.endsWith(".obj")
			? filename
			: filename.replace(/\.[^/.]+$/, "") + ".obj";

		const duration = performance.now() - startTime;

		return {
			success: true,
			filename: actualFilename,
			format: "obj",
			size: blob.size,
			duration,
			data: blob,
			downloadUrl: URL.createObjectURL(blob),
		};
	}

	/**
	 * Export to STL format (basic implementation)
	 */
	private async exportSTL(
		group: THREE.Group,
		_options: Required<ExportOptions>,
		filename: string,
		startTime: number
	): Promise<ExportResult> {
		// Dynamic import for STL exporter
		const { STLExporter } = await import("three/examples/jsm/exporters/STLExporter.js");
		const exporter = new STLExporter();

		// STL is binary by default for smaller file size
		const result = exporter.parse(group, { binary: true });
		// Convert DataView to ArrayBuffer if needed
		const blobData = result instanceof DataView ? result.buffer : result;
		const blob = new Blob([blobData as BlobPart], { type: "application/octet-stream" });

		const actualFilename = filename.endsWith(".stl")
			? filename
			: filename.replace(/\.[^/.]+$/, "") + ".stl";

		const duration = performance.now() - startTime;

		return {
			success: true,
			filename: actualFilename,
			format: "stl",
			size: blob.size,
			duration,
			data: blob,
			downloadUrl: URL.createObjectURL(blob),
		};
	}

	/**
	 * Clean up cloned export group
	 */
	private disposeExportGroup(group: THREE.Group): void {
		group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				if (child.geometry) {
					child.geometry.dispose();
				}
				const materials = Array.isArray(child.material)
					? child.material
					: [child.material];
				materials.forEach((mat) => {
					if (mat && mat.dispose) {
						mat.dispose();
					}
				});
			}
		});
	}

	/**
	 * Create an export error
	 */
	private createError(
		code: ExportErrorCode,
		message: string,
		originalError?: Error
	): ExportError {
		return {
			message,
			code,
			originalError,
		};
	}

	/**
	 * Download the export result
	 */
	public download(result: ExportResult): void {
		if (!result.downloadUrl) {
			result.downloadUrl = URL.createObjectURL(result.data as Blob);
		}

		const link = document.createElement("a");
		link.href = result.downloadUrl;
		link.download = result.filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	/**
	 * Revoke download URL to free memory
	 */
	public revokeUrl(result: ExportResult): void {
		if (result.downloadUrl) {
			URL.revokeObjectURL(result.downloadUrl);
			result.downloadUrl = undefined;
		}
	}

	/**
	 * Get available export formats
	 */
	public static getAvailableFormats(): ExportFormat[] {
		return ["gltf", "glb", "obj", "stl"];
	}

	/**
	 * Get format description
	 */
	public static getFormatDescription(format: ExportFormat): string {
		const descriptions: Record<ExportFormat, string> = {
			gltf: "GL Transmission Format (JSON) - Best compatibility",
			glb: "GL Transmission Format (Binary) - Compact single file",
			obj: "Wavefront OBJ - Universal but no materials",
			stl: "Stereolithography - 3D printing ready",
		};
		return descriptions[format];
	}

	/**
	 * Get format file extension
	 */
	public static getFormatExtension(format: ExportFormat): string {
		return `.${format}`;
	}

	/**
	 * Get quality preset configuration
	 */
	public static getQualityPreset(quality: ExportQuality): QualityPreset {
		return { ...QUALITY_PRESETS[quality] };
	}
}
