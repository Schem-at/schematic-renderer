// managers/SchematicObject.ts
import * as THREE from "three";
import { SchematicWrapper } from "../wasm/minecraft_schematic_utils";
import { WorldMeshBuilder } from "../WorldMeshBuilder";
import { EventEmitter } from "events";
import { SceneManager } from "./SceneManager";
import { createReactiveProxy, PropertyConfig } from "../utils/ReactiveProperty"; // Adjust the import path as needed
import { castToEuler, castToVector3 } from "../utils/Casts";
import {
	resetPerformanceMetrics,
} from "../monitoring";

export class SchematicObject extends EventEmitter {
	public name: string;
	public schematicWrapper: SchematicWrapper;
	private meshes: THREE.Mesh[] = [];
	private worldMeshBuilder: WorldMeshBuilder;
	private eventEmitter: EventEmitter;
	private sceneManager: SceneManager;
	private chunkMeshes: Map<string, THREE.Mesh[]> = new Map();
	private chunkDimensions: any = {
		chunkWidth: 16,
		chunkHeight: 16,
		chunkLength: 16,
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

	private meshesReady: Promise<void>;
	constructor(
		name: string,
		schematicWrapper: SchematicWrapper,
		worldMeshBuilder: WorldMeshBuilder,
		eventEmitter: EventEmitter,
		sceneManager: SceneManager,
		properties?: Partial<{
			position: THREE.Vector3 | number[];
			rotation: THREE.Euler | number[];
			scale: THREE.Vector3 | number[] | number;
			opacity: number;
			visible: boolean;
			meshBoundingBox?: [number[], number[]];
		}>
	) {
		super();

		this.id = name;
		this.name = name;
		this.schematicWrapper = schematicWrapper;
		this.worldMeshBuilder = worldMeshBuilder;
		this.eventEmitter = eventEmitter;
		this.sceneManager = sceneManager;

		// Initialize properties with default values
		this.position = new THREE.Vector3();
		this.rotation = new THREE.Euler();
		this.scale = new THREE.Vector3(1, 1, 1);
		this.opacity = 1.0;
		this.visible = properties?.visible ?? true;
		

		// Set initial properties if provided
		Object.assign(this, properties);

		const schematicDimensions = this.schematicWrapper.get_dimensions();
		console.log("Schematic dimensions:", schematicDimensions);
		this.position = new THREE.Vector3(
			-schematicDimensions[0] / 2,
			0,
			-schematicDimensions[2] / 2
		);

		if (properties?.meshBoundingBox) {
			this.meshBoundingBox = properties.meshBoundingBox;
		} else { 
			this.meshBoundingBox = [
				this.position.toArray(),
				this.position
					.clone()
					.add(new THREE.Vector3(schematicDimensions[0], schematicDimensions[1], schematicDimensions[2]))
					.toArray(),
			];
		}


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
		const propertyConfigs: Partial<Record<keyof SchematicObject, PropertyConfig<any>>> = {
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
		};

		// Create the reactive proxy
		return createReactiveProxy(this as SchematicObject, propertyConfigs);
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

	private async buildMeshes(): Promise<void> {
		if (!this.visible) {
			return;
		}
		const { meshes, chunkMap } =
			await this.worldMeshBuilder.buildSchematicMeshes(
				this,
				this.chunkDimensions
			);
		this.chunkMeshes = chunkMap;

		meshes.forEach((mesh) => {
			// Adjust the mesh position relative to the group
			// mesh.position.sub(this.position);

			const material = mesh.material as THREE.Material;
			material.opacity = this.opacity;
			material.transparent = this.opacity < 1.0;
			mesh.visible = this.visible;

			// Compute the bounding box for the geometry
			mesh.geometry.computeBoundingBox();

			this.group.add(mesh);
		});

		this.updateTransform(); // This will apply position, rotation, and scale to the group
		this.group.visible = this.visible;
		this.meshes = meshes;

		this.group.updateMatrixWorld(true);
		this.group.updateWorldMatrix(true, true);

		// const box = new THREE.Box3().setFromObject(this.group);
		// console.log("Updated bounding box min:", box.min);
		// console.log("Updated bounding box max:", box.max);
		// console.log("Updated bounding box size:", box.getSize(new THREE.Vector3()));
        this.sceneManager.schematicRenderer.options.callbacks?.onSchematicRendered?.(this.name);

	}

	public async getMeshes(): Promise<THREE.Mesh[]> {
		await this.meshesReady;
		return Array.from(this.group.children) as THREE.Mesh[];
	}

	// Methods to manage chunk meshes
	public getChunkMeshAt(
		chunkX: number,
		chunkY: number,
		chunkZ: number
	): THREE.Mesh[] | null {
		const key = `${chunkX},${chunkY},${chunkZ}`;
		return this.chunkMeshes.get(key) || null;
	}

	public setChunkMeshAt(
		chunkX: number,
		chunkY: number,
		chunkZ: number,
		meshes: THREE.Mesh[]
	) {
		const key = `${chunkX},${chunkY},${chunkZ}`;
		this.chunkMeshes.set(key, meshes);
	}

	private updateMeshMaterials(property: "opacity") {
		this.group.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				const material = child.material as THREE.Material;
				material.opacity = this.opacity;
				material.transparent = this.opacity < 1.0;
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
		// Remove old meshes from the scene
		this.meshes.forEach((mesh) => {
			this.group.remove(mesh as THREE.Object3D);
			mesh.geometry.dispose();
			if (Array.isArray(mesh.material)) {
				mesh.material.forEach((material) => material.dispose());
			} else {
				mesh.material.dispose();
			}
		}
		);

	// Clear chunk meshes
		this.chunkMeshes.clear();
		if (this.visible) {
			await this.buildMeshes();
		}
	}

	public getSchematicWrapper(): SchematicWrapper {
		return this.schematicWrapper;
	}

	public async setBlockNoRebuild(position: THREE.Vector3 | number[], blockType: string,) {
		if (Array.isArray(position)) {
			position = new THREE.Vector3(position[0], position[1], position[2]);
		}

		this.schematicWrapper.set_block_from_string(
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

	//takes an array of block positions and block types pairs
	public async setBlocks(blocks: [THREE.Vector3 | number[], string][]) {
		const affectedChunks = new Set<string>();
		let startTime = performance.now();
		console.log("Setting blocks");
		resetPerformanceMetrics();
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

		for (let chunk of affectedChunks) {
			const [chunkX, chunkY, chunkZ] = chunk.split(",").map((v) => parseInt(v));
			await this.rebuildChunk(chunkX, chunkY, chunkZ);
		}
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
		const sourceSchematic = this.sceneManager?.schematicRenderer?.schematicManager?.getSchematic(
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
			targetPosition = new THREE.Vector3(targetPosition[0], targetPosition[1], targetPosition[2]);
		}


		const sourceDimensions = sourceSchematic.schematicWrapper.get_dimensions();

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
		return this.schematicWrapper.get_block(
			position.x,
			position.y,
			position.z
		);
	}


	public async replaceBlock(replaceBlock: string, newBlock: string) {
		const blocks: [THREE.Vector3, string][] = [];
		const dimensions = this.schematicWrapper.get_dimensions();
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

		// Get the blocks in the chunk
		const chunkBlocks = this.schematicWrapper.get_chunk_blocks(
			chunkOffset.x,
			chunkOffset.y,
			chunkOffset.z,
			this.chunkDimensions.chunkWidth,
			this.chunkDimensions.chunkHeight,
			this.chunkDimensions.chunkLength
		);

		// Remove old chunk meshes from the scene
		this.removeChunkMeshes(chunkX, chunkY, chunkZ);

		// Build new chunk meshes
		const newChunkMeshes = await this.worldMeshBuilder.getChunkMesh(
			chunkBlocks,
			this.schematicWrapper
		);

		// Apply properties to the new meshes
		this.applyPropertiesToMeshes(newChunkMeshes);

		newChunkMeshes.forEach((mesh) => {
			this.group.add(mesh);
		});

		// Update the chunk mesh reference in chunkMeshes map
		this.setChunkMeshAt(chunkX, chunkY, chunkZ, newChunkMeshes);
	}

	private removeChunkMeshes(chunkX: number, chunkY: number, chunkZ: number) {
		const oldChunkMeshes = this.getChunkMeshAt(chunkX, chunkY, chunkZ);
		if (oldChunkMeshes) {
			oldChunkMeshes.forEach((mesh) => {
				this.group.remove(mesh);
				mesh.geometry.dispose();
				if (Array.isArray(mesh.material)) {
					mesh.material.forEach((material) => material.dispose());
				} else {
					mesh.material.dispose();
				}
			});
			this.chunkMeshes.delete(`${chunkX},${chunkY},${chunkZ}`);
		}
	}

	private applyPropertiesToMeshes(meshes: THREE.Mesh[]) {
		meshes.forEach((mesh) => {
			// The position is relative to the group
			mesh.rotation.copy(this.rotation);
			mesh.scale.copy(this.scale);
			const material = mesh.material as THREE.Material;
			material.opacity = this.opacity;
			material.transparent = this.opacity < 1.0;
			mesh.visible = this.visible;
		});
	}

	public containsPosition(position: THREE.Vector3): boolean {
		// Calculate the bounds of the schematic
		const dimensions = this.schematicWrapper.get_dimensions();
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
		const dimensions = this.schematicWrapper.get_dimensions();
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
		const boundingBox = this.schematicWrapper.get_dimensions();
		const positionArray = this.position.toArray();
		const min = positionArray;
		const max = positionArray.map((v, i) => v + boundingBox[i]);
		return [min, max];
	}
}
