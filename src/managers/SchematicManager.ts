import * as THREE from "three";
import { SchematicObject } from "./SchematicObject";
import { SchematicWrapper } from "../wasm/minecraft_schematic_utils"; // Adjust the import path
import { WorldMeshBuilder } from "../WorldMeshBuilder"; // Adjust the import path
import { EventEmitter } from "events";
import { SceneManager } from "./SceneManager"; // Adjust the import path
import { SchematicRenderer } from "../SchematicRenderer";

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
		this.worldMeshBuilder = schematicRenderer.worldMeshBuilder as WorldMeshBuilder;
		this.eventEmitter = schematicRenderer.eventEmitter;
		this.sceneManager = schematicRenderer.sceneManager;
		this.singleSchematicMode = options.singleSchematicMode || false;
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
		}>
	): Promise<void> {
		if (this.singleSchematicMode) {
			// Remove existing schematics
			this.removeAllSchematics();
		  }
		// Create a SchematicWrapper from the data
		const schematicWrapper = new SchematicWrapper();
		schematicWrapper.from_data(new Uint8Array(schematicData));

		// Create a SchematicObject
		const schematicObject = new SchematicObject(
			name,
			schematicWrapper,
			this.worldMeshBuilder,
			this.eventEmitter,
			this.sceneManager,
			properties
		);

		this.addSchematic(schematicObject);

		// Emit an event to notify that a schematic has been added
		this.eventEmitter.emit("schematicAdded", { schematic: schematicObject });
	}

	public removeAllSchematics() {
		for (const name of this.schematics.keys()) {
		  this.removeSchematic(name);
		}
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
				const arrayBuffer = await schematicDataMap[key]();
				const properties = propertiesMap ? propertiesMap[key] : undefined;
				await this.loadSchematic(key, arrayBuffer, properties);
			}
		}
	}

	public async loadSchematicFromFile(file: File): Promise<void> {
		const arrayBuffer = await file.arrayBuffer();
		const id = file.name;
		await this.loadSchematic(id, arrayBuffer);
	  
		// Adjust the camera to focus on schematics, if desired
		this.sceneManager.schematicRenderer.cameraManager.focusOnSchematics();
	  
		// Emit an event to notify that a schematic has been loaded
		this.eventEmitter.emit('schematicLoaded', { id });
	  }

	public removeSchematic(name: string) {
		const schematicObject = this.schematics.get(name);
		if (schematicObject) {
			// Dispose meshes and other resources if necessary
			 schematicObject.getMeshes().then((meshes) => {
				meshes.forEach((mesh) => {
				mesh.geometry.dispose();
				if (Array.isArray(mesh.material)) {
					mesh.material.forEach((material) => material.dispose());
				} else {
					mesh.material.dispose();
				}
				this.sceneManager.scene.remove(mesh);
				}
				);
			 }
			);
			this.schematics.delete(name);

			// Emit an event to notify that a schematic has been removed
			this.eventEmitter.emit("schematicRemoved", { id: name });
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


	public createEmptySchematic(
		name: string
	): SchematicObject {
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
		this.eventEmitter.emit('schematicLoaded', { id: name });

		return schematicObject;
	}
	
}
