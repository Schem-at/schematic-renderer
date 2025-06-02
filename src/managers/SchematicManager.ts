import * as THREE from "three";
import { SchematicObject } from "./SchematicObject";
import { SchematicWrapper } from "nucleation"; // Adjust the import path
import { WorldMeshBuilder } from "../WorldMeshBuilder"; // Adjust the import path
import { EventEmitter } from "events";
import { SceneManager } from "./SceneManager"; // Adjust the import path
import { SchematicRenderer } from "../SchematicRenderer";
interface LoadingProgress {
	stage: "file_reading" | "parsing" | "mesh_building" | "scene_setup";
	progress: number; // 0-100
	message: string;
}
export class SchematicManager {
	public schematics: Map<string, SchematicObject> = new Map();
	public schematicRenderer: SchematicRenderer;
	public eventEmitter: EventEmitter;
	//@ts-ignore
	private worldMeshBuilder: WorldMeshBuilder;
	private sceneManager: SceneManager;
	private singleSchematicMode: boolean;

	constructor(
		schematicRenderer: SchematicRenderer,
		options: { singleSchematicMode?: boolean } = {}
	) {
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
		this.singleSchematicMode = options.singleSchematicMode || false;
	}

	private readFileWithProgress(
		file: File,
		onProgress?: (progress: number) => void
	): Promise<ArrayBuffer> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();

			reader.onprogress = (event) => {
				if (event.lengthComputable) {
					const progress = (event.loaded / event.total) * 100;
					onProgress?.(progress);
				}
			};

			reader.onload = () => resolve(reader.result as ArrayBuffer);
			reader.onerror = () => reject(reader.error);

			reader.readAsArrayBuffer(file);
		});
	}

	public async loadSchematic(
		name: string,
		schematicData: ArrayBuffer,
		properties?: Partial<{
			position: THREE.Vector3 | number[];
			rotation: THREE.Euler | number[];
			scale: THREE.Vector3 | number[] | number;
			opacity: number;
			visible: boolean;
			focused: boolean;
		}>,
		options?: {
			onProgress?: (progress: LoadingProgress) => void;
		}
	): Promise<void> {
		if (this.singleSchematicMode) {
			await this.removeAllSchematics();
		}

		// Parsing stage - 20% of total progress
		options?.onProgress?.({
			stage: "parsing",
			progress: 0,
			message: "Parsing schematic data...",
		});

		const schematicWrapper = new SchematicWrapper();
		schematicWrapper.from_data(new Uint8Array(schematicData));

		options?.onProgress?.({
			stage: "parsing",
			progress: 20,
			message: "Schematic parsed",
		});

		// Mesh building stage - 40% of total progress
		options?.onProgress?.({
			stage: "mesh_building",
			progress: 20,
			message: "Building meshes...",
		});

		const schematicObject = new SchematicObject(
			this.schematicRenderer,
			name,
			schematicWrapper,
			properties
		);

		options?.onProgress?.({
			stage: "mesh_building",
			progress: 60,
			message: "Meshes built",
		});

		// Scene setup stage - final 40%
		options?.onProgress?.({
			stage: "scene_setup",
			progress: 60,
			message: "Setting up scene...",
		});

		if (this.schematicRenderer && this.schematicRenderer.uiManager) {
			this.schematicRenderer.uiManager.hideEmptyState();
		}
		this.addSchematic(schematicObject);
		this.eventEmitter.emit("schematicAdded", { schematic: schematicObject });
		if (
			properties?.focused ||
			!properties ||
			properties.focused === undefined
		) {
			this.sceneManager.schematicRenderer.cameraManager.focusOnSchematics();
		}

		options?.onProgress?.({
			stage: "scene_setup",
			progress: 100,
			message: "Complete",
		});
	}

	public async removeAllSchematics() {
		const promises = Array.from(this.schematics.keys()).map((name) =>
			this.removeSchematic(name)
		);
		await Promise.all(promises);
	}

	public async loadSchematics(
		schematicDataMap: { [key: string]: () => Promise<ArrayBuffer> },
		propertiesMap?: {
			[key: string]: Partial<{
				position: THREE.Vector3 | number[];
				rotation: THREE.Euler | number[];
				scale: THREE.Vector3 | number[] | number;
				opacity: number;
				visible: boolean;
			}>;
		}
	): Promise<void> {
		for (const key in schematicDataMap) {
			if (schematicDataMap.hasOwnProperty(key)) {
				console.log("Loading schematic", key);
				console.log(schematicDataMap);
				const arrayBuffer = await schematicDataMap[key]();
				const properties = propertiesMap ? propertiesMap[key] : undefined;
				await this.loadSchematic(key, arrayBuffer, properties).then(() => {
					this.sceneManager.schematicRenderer.options?.callbacks?.onSchematicLoaded?.(
						key
					);
				});
			}
		}
	}

	public async loadSchematicFromFile(
		file: File,
		options?: {
			onProgress?: (progress: LoadingProgress) => void;
		}
	): Promise<void> {
		try {
			// Start showing progress in UI if enabled
			if (
				this.schematicRenderer.options.enableProgressBar &&
				this.schematicRenderer.uiManager
			) {
				this.schematicRenderer.uiManager.showProgressBar(
					`Loading ${file.name}`
				);
			}

			// File reading stage
			const arrayBuffer = await this.readFileWithProgress(file, (progress) => {
				// Update progress callback if provided
				options?.onProgress?.({
					stage: "file_reading",
					progress,
					message: "Reading file...",
				});

				// Update UI progress bar
				if (
					this.schematicRenderer.options.enableProgressBar &&
					this.schematicRenderer.uiManager
				) {
					this.schematicRenderer.uiManager.updateProgress(
						progress / 100, // Convert to 0-1 range
						`Reading ${file.name}...`
					);
				}
			});

			// Load the schematic with progress tracking
			const id = file.name;
			await this.loadSchematic(id, arrayBuffer, undefined, {
				onProgress: (progress) => {
					// Update progress callback if provided
					options?.onProgress?.(progress);

					// Update UI progress bar
					if (
						this.schematicRenderer.options.enableProgressBar &&
						this.schematicRenderer.uiManager
					) {
						// Calculate overall progress (file reading is 20%, schematic loading is 80%)
						const overallProgress = 0.2 + (progress.progress / 100) * 0.8;

						this.schematicRenderer.uiManager.updateProgress(
							overallProgress,
							progress.message
						);
					}
				},
			});

			// Hide progress bar when complete
			if (
				this.schematicRenderer.options.enableProgressBar &&
				this.schematicRenderer.uiManager
			) {
				this.schematicRenderer.uiManager.hideProgressBar();
			}

			// Emit completion event
			this.eventEmitter.emit("schematicLoaded", { id });
		} catch (error) {
			// Hide progress bar on error
			if (
				this.schematicRenderer.options.enableProgressBar &&
				this.schematicRenderer.uiManager
			) {
				this.schematicRenderer.uiManager.hideProgressBar();
			}

			this.eventEmitter.emit("schematicLoadError", { error });
			throw error;
		}
	}

	public async loadSchematicFromURL(
		url: string,
		name?: string,
		properties?: Partial<{
			position: THREE.Vector3 | number[];
			rotation: THREE.Euler | number[];
			scale: THREE.Vector3 | number[] | number;
			opacity: number;
			visible: boolean;
			focused: boolean;
		}>,
		options?: {
			onProgress?: (progress: LoadingProgress) => void;
		}
	): Promise<void> {
		try {
			// Generate a name for display
			const displayName =
				name || new URL(url).pathname.split("/").pop() || "schematic";

			// Start showing progress in UI if enabled
			if (
				this.schematicRenderer.options.enableProgressBar &&
				this.schematicRenderer.uiManager
			) {
				this.schematicRenderer.uiManager.showProgressBar(
					`Loading ${displayName}`
				);
				this.schematicRenderer.uiManager.updateProgress(
					0,
					"Fetching schematic from URL..."
				);
			}

			// File reading stage
			options?.onProgress?.({
				stage: "file_reading",
				progress: 0,
				message: "Fetching schematic from URL...",
			});

			// Fetch the schematic
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			// Update progress to 20% after fetch completes
			if (
				this.schematicRenderer.options.enableProgressBar &&
				this.schematicRenderer.uiManager
			) {
				this.schematicRenderer.uiManager.updateProgress(
					0.2,
					"Download complete, processing schematic..."
				);
			}

			options?.onProgress?.({
				stage: "file_reading",
				progress: 100,
				message: "Download complete, processing schematic...",
			});

			const arrayBuffer = await response.arrayBuffer();

			// Generate a name if none provided
			const schematicName =
				name || new URL(url).pathname.split("/").pop() || "schematic_from_url";

			// Load the schematic with progress tracking
			await this.loadSchematic(schematicName, arrayBuffer, properties, {
				onProgress: (progress) => {
					// Update progress callback if provided
					options?.onProgress?.(progress);

					// Update UI progress bar
					if (
						this.schematicRenderer.options.enableProgressBar &&
						this.schematicRenderer.uiManager
					) {
						// Calculate overall progress (file reading is 20%, schematic loading is 80%)
						const overallProgress = 0.2 + (progress.progress / 100) * 0.8;

						this.schematicRenderer.uiManager.updateProgress(
							overallProgress,
							progress.message
						);
					}
				},
			});

			// Hide progress bar when complete
			if (
				this.schematicRenderer.options.enableProgressBar &&
				this.schematicRenderer.uiManager
			) {
				this.schematicRenderer.uiManager.hideProgressBar();
			}

			// Emit completion event
			this.eventEmitter.emit("schematicLoaded", { id: schematicName });
		} catch (error) {
			// Hide progress bar on error
			if (
				this.schematicRenderer.options.enableProgressBar &&
				this.schematicRenderer.uiManager
			) {
				this.schematicRenderer.uiManager.hideProgressBar();
			}

			this.eventEmitter.emit("schematicLoadError", { error });
			throw error;
		}
	}

	public async removeSchematic(name: string) {
		const schematicObject = this.schematics.get(name);
		if (!schematicObject) return;

		try {
			// Remove from map first to prevent any new operations on this schematic
			this.schematics.delete(name);

			// Get meshes - if this fails, at least the schematic is removed from the map
			const meshes = await schematicObject.getMeshes();
			console.log(
				"Before removal - scene children:",
				this.sceneManager.scene.children.length
			);
			console.log("Meshes to remove:", meshes.length);
			// Use traverse to ensure we catch all nested objects
			schematicObject.group.traverse((object) => {
				if (object instanceof THREE.Mesh) {
					this.sceneManager.scene.remove(object);
					if (object.geometry) object.geometry.dispose();
					if (Array.isArray(object.material)) {
						object.material.forEach((m) => m.dispose());
					} else if (object.material) {
						object.material.dispose();
					}
				}
			});

			schematicObject.group.clear(); // Clear the group to remove all children

			// Remove the group last
			this.sceneManager.scene.remove(schematicObject.group);

			this.eventEmitter.emit("schematicRemoved", { id: name });
		} catch (error) {
			console.error("Error removing schematic:", error);
			// Consider re-adding to map if failed
			this.schematics.set(name, schematicObject);
		}

		console.log(
			"After removal - scene children:",
			this.sceneManager.scene.children.length
		);

		if (this.isEmpty() && this.schematicRenderer.uiManager) {
			this.schematicRenderer.uiManager.showEmptyState();
		}
	}

	addSchematic(schematic: SchematicObject): void {
		this.schematics.set(schematic.id, schematic);
	}

	getSchematic(id: string): SchematicObject | undefined {
		return this.schematics.get(id);
	}

	getAllSchematics(): SchematicObject[] {
		return Array.from(this.schematics.values());
	}

	getFirstSchematic(): SchematicObject | undefined {
		return this.getAllSchematics()[0];
	}

	public getSchematicAtPosition(
		position: THREE.Vector3
	): SchematicObject | null {
		for (const schematic of this.schematics.values()) {
			if (schematic.containsPosition(position)) {
				return schematic;
			}
		}
		return null;
	}

	public isEmpty(): boolean {
		return this.schematics.size === 0;
	}

	public schematicExists(id: string): boolean {
		return this.schematics.has(id);
	}

	public getSchematicsAveragePosition(): THREE.Vector3 {
		if (this.isEmpty()) return new THREE.Vector3();
		const averagePosition = new THREE.Vector3();
		const schematics = this.getAllSchematics();
		if (schematics.length === 0) return averagePosition;
		for (const schematic of schematics) {
			averagePosition.add(schematic.getSchematicCenter());
		}
		averagePosition.divideScalar(schematics.length);
		return averagePosition;
	}

	public getMaxSchematicDimensions(): THREE.Vector3 {
		if (this.isEmpty()) return new THREE.Vector3();
		const maxDimensions = new THREE.Vector3();
		const schematics = this.getAllSchematics();
		for (const schematic of schematics) {
			const dimensions = schematic.schematicWrapper.get_dimensions();
			maxDimensions.max(
				new THREE.Vector3(dimensions[0], dimensions[1], dimensions[2])
			);
		}
		return maxDimensions;
	}

	public getGlobalBoundingBox(): [number[], number[]] {
		const min = [0, 0, 0];
		const max = [0, 0, 0];

		for (const schematic of this.schematics.values()) {
			console.log("getBoundingBox", schematic.getBoundingBox());
			const [schematicMin, schematicMax] = schematic.getBoundingBox();
			for (let i = 0; i < 3; i++) {
				min[i] = Math.min(min[i], schematicMin[i]);
				max[i] = Math.max(max[i], schematicMax[i]);
			}
		}

		return [min, max];
	}

	public getSelectableObjects(): THREE.Object3D[] {
		return Array.from(this.schematics.values()).map(
			(schematic) => schematic.group
		);
	}

	public createEmptySchematic(name: string): SchematicObject {
		const schematicWrapper = new SchematicWrapper();
		const schematicObject = new SchematicObject(
			this.schematicRenderer,
			name,
			schematicWrapper
		);
		this.addSchematic(schematicObject);
		this.sceneManager.schematicRenderer.cameraManager.focusOnSchematics();

		// Emit an event to notify that a schematic has been loaded
		this.eventEmitter.emit("schematicLoaded", { id: name });

		return schematicObject;
	}
}
