import * as THREE from "three";
import { SchematicObject } from "./SchematicObject";
import { SchematicWrapper } from "../wasm/minecraft_schematic_utils"; // Adjust the import path
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
			name,
			schematicWrapper,
			this.worldMeshBuilder,
			this.eventEmitter,
			this.sceneManager,
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
		this.sceneManager.schematicRenderer.cameraManager.focusOnSchematics();

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
				console.log("sfd");
				const arrayBuffer = await schematicDataMap[key]();
				const properties = propertiesMap ? propertiesMap[key] : undefined;
				await this.loadSchematic(key, arrayBuffer, properties);
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
			// File reading stage
			const arrayBuffer = await this.readFileWithProgress(file, (progress) => {
				options?.onProgress?.({
					stage: "file_reading",
					progress,
					message: "Reading file...",
				});
			});

			// Load the schematic with progress tracking
			const id = file.name;
			await this.loadSchematic(id, arrayBuffer, undefined, {
				onProgress: (progress) => options?.onProgress?.(progress),
			});

			// Emit completion event
			this.eventEmitter.emit("schematicLoaded", { id });
		} catch (error) {
			this.eventEmitter.emit("schematicLoadError", { error });
			throw error;
		}
	}

	// In SchematicManager
	public async removeSchematic(name: string) {
		const schematicObject = this.schematics.get(name);
		if (schematicObject) {
			try {
				// Get and dispose all meshes
				const meshes = await schematicObject.getMeshes();
				meshes.forEach((mesh) => {
					// Remove from scene first
					this.sceneManager.scene.remove(mesh);

					// Then dispose resources
					if (mesh.geometry) mesh.geometry.dispose();
					if (Array.isArray(mesh.material)) {
						mesh.material.forEach((m) => m.dispose());
					} else {
						mesh.material.dispose();
					}
				});

				// Remove the group itself
				this.sceneManager.scene.remove(schematicObject.group);

				// Only delete from map after cleanup
				this.schematics.delete(name);
				this.eventEmitter.emit("schematicRemoved", { id: name });
			} catch (error) {
				console.error("Error removing schematic:", error);
			}
		}
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
			name,
			schematicWrapper,
			this.worldMeshBuilder,
			this.eventEmitter,
			this.sceneManager
		);
		this.addSchematic(schematicObject);
		this.sceneManager.schematicRenderer.cameraManager.focusOnSchematics();

		// Emit an event to notify that a schematic has been loaded
		this.eventEmitter.emit("schematicLoaded", { id: name });

		return schematicObject;
	}
}
