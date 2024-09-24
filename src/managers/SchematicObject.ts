// managers/SchematicObject.ts
import * as THREE from "three";
import { SchematicWrapper } from "../wasm/minecraft_schematic_utils";
import { WorldMeshBuilder, ChunkDimensions } from "../WorldMeshBuilder";
import { EventEmitter } from "events";
import { SceneManager } from "./SceneManager";

export class SchematicObject {
	public name: string;
	private schematicWrapper: SchematicWrapper;
	private meshes: THREE.Mesh[] = [];
	private worldMeshBuilder: WorldMeshBuilder;
	private eventEmitter: EventEmitter;
	private sceneManager: SceneManager; // Add sceneManager reference
	private chunkMeshes: Map<string, THREE.Mesh[]> = new Map();
	private chunkDimensions: ChunkDimensions = {
		chunkWidth: 16,
		chunkHeight: 16,
		chunkLength: 16,
	};

	// Private properties with initial values
	private _position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
	private _rotation: THREE.Euler = new THREE.Euler(0, 0, 0);
	private _scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1);
	private _opacity: number = 1.0;
	private _visible: boolean = true;

	private meshesReady: Promise<void>;

	constructor(
		name: string,
		schematicWrapper: SchematicWrapper,
		worldMeshBuilder: WorldMeshBuilder,
		eventEmitter: EventEmitter,
		sceneManager: SceneManager, // Receive sceneManager
		properties?: Partial<{
			position: THREE.Vector3;
			rotation: THREE.Euler;
			scale: THREE.Vector3;
			opacity: number;
			visible: boolean;
		}>
	) {
		this.name = name;
		this.schematicWrapper = schematicWrapper;
		this.worldMeshBuilder = worldMeshBuilder;
		this.eventEmitter = eventEmitter;
		this.sceneManager = sceneManager;

		// Set initial properties if provided
		if (properties?.position) this._position.copy(properties.position);
		if (properties?.rotation) this._rotation.copy(properties.rotation);
		if (properties?.scale) this._scale.copy(properties.scale);
		if (properties?.opacity !== undefined) this._opacity = properties.opacity;
		if (properties?.visible !== undefined) this._visible = properties.visible;
		this.meshesReady = this.buildMeshes();
	}

	private async buildMeshes(): Promise<void> {
		// Use the worldMeshBuilder to generate meshes for the schematic
		const { meshes, chunkMap } =
			await this.worldMeshBuilder.buildSchematicMeshes(
				this.schematicWrapper,
				this.chunkDimensions
			);
		// Store the chunk meshes
		this.chunkMeshes = chunkMap;

		// Apply properties to the meshes
		meshes.forEach((mesh) => {
			mesh.position.copy(this._position);
			mesh.rotation.copy(this._rotation);
			mesh.scale.copy(this._scale);
			mesh.material.opacity = this._opacity;
			mesh.material.transparent = this._opacity < 1.0;
			mesh.visible = this._visible;
		});

		this.meshes = meshes;
	}

	public async getMeshes(): Promise<THREE.Mesh[]> {
		await this.meshesReady;
		return this.meshes;
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
	// Reactive property: position
	get position(): THREE.Vector3 {
		return this._position;
	}

	set position(value: THREE.Vector3 | Array<number>) {
		if (Array.isArray(value)) {
			this._position.set(value[0], value[1], value[2]);
		} else {
			this._position.copy(value);
		}
		this.updateMeshTransforms("position");
	}

	// Reactive property: rotation
	get rotation(): THREE.Euler {
		return this._rotation;
	}

	set rotation(value: THREE.Euler) {
		this._rotation.copy(value);
		this.updateMeshTransforms("rotation");
	}

	// Reactive property: scale
	get scale(): THREE.Vector3 {
		return this._scale;
	}

	set scale(value: THREE.Vector3) {
		this._scale.copy(value);
		this.updateMeshTransforms("scale");
	}

	// Reactive property: opacity
	get opacity(): number {
		return this._opacity;
	}

	set opacity(value: number) {
		this._opacity = value;
		this.updateMeshMaterials("opacity");
	}

	// Reactive property: visible
	get visible(): boolean {
		return this._visible;
	}

	set visible(value: boolean) {
		this._visible = value;
		this.updateMeshVisibility();
	}

	private updateMeshTransforms(property: "position" | "rotation" | "scale") {
		this.meshes.forEach((mesh) => {
			switch (property) {
				case "position":
					mesh.position.copy(this._position);
					break;
				case "rotation":
					mesh.rotation.copy(this._rotation);
					break;
				case "scale":
					mesh.scale.copy(this._scale);
					break;
			}
		});
		// If necessary, notify others of the change
		this.eventEmitter.emit("schematicTransformUpdated", {
			schematic: this,
			property,
		});
	}

	private updateMeshMaterials(property: "opacity") {
		this.meshes.forEach((mesh) => {
			if (property === "opacity") {
				mesh.material.opacity = this._opacity;
				mesh.material.transparent = this._opacity < 1.0;
			}
		});
		// If necessary, notify others of the change
		this.eventEmitter.emit("schematicMaterialUpdated", {
			schematic: this,
			property,
		});
	}

	private updateMeshVisibility() {
		this.meshes.forEach((mesh) => {
			mesh.visible = this._visible;
		});
		// If necessary, emit an event
		this.eventEmitter.emit("schematicVisibilityUpdated", this);
	}

	public async updateMesh() {
		// Remove old meshes from the scene
		this.meshes.forEach((mesh) => {
			this.sceneManager.removeFromScene(mesh);
			mesh.geometry.dispose();
			mesh.material.dispose();
		});

		// Clear chunk meshes
		this.chunkMeshes.clear();

		// Rebuild meshes
		await this.buildMeshes();
	}

	public getSchematicWrapper(): SchematicWrapper {
		return this.schematicWrapper;
	}

	public async setBlock(position: THREE.Vector3, blockType: string) {
		// Update the block in the schematic data
		this.schematicWrapper.set_block(
			position.x,
			position.y,
			position.z,
			blockType
		);

		// Determine which chunk contains the block
		const chunkCoords = this.getChunkCoordinates(position);

		// Rebuild the affected chunk
		await this.rebuildChunk(chunkCoords.x, chunkCoords.y, chunkCoords.z);
	}

	public rebuildChunkAtPosition(position: THREE.Vector3) {
		const chunkCoords = this.getChunkCoordinates(position);
		this.rebuildChunk(chunkCoords.x, chunkCoords.y, chunkCoords.z);
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
			chunkOffset,
			this.schematicWrapper
		);

		// Apply properties to the new meshes
		this.applyPropertiesToMeshes(newChunkMeshes);

		// Add new chunk meshes to the scene
		newChunkMeshes.forEach((mesh) => {
			this.sceneManager.addToScene(mesh);
		});

		// Update the chunk mesh reference in chunkMeshes map
		this.setChunkMeshAt(chunkX, chunkY, chunkZ, newChunkMeshes);
	}

	private removeChunkMeshes(chunkX: number, chunkY: number, chunkZ: number) {
		const oldChunkMeshes = this.getChunkMeshAt(chunkX, chunkY, chunkZ);
		if (oldChunkMeshes) {
			oldChunkMeshes.forEach((mesh) => {
				this.sceneManager.removeFromScene(mesh);
				mesh.geometry.dispose();
				mesh.material.dispose();
			});
			// Remove from chunkMeshes map
			this.chunkMeshes.delete(`${chunkX},${chunkY},${chunkZ}`);
		}
	}

	private applyPropertiesToMeshes(meshes: THREE.Mesh[]) {
		meshes.forEach((mesh) => {
			mesh.position.copy(this._position);
			mesh.rotation.copy(this._rotation);
			mesh.scale.copy(this._scale);
			mesh.material.opacity = this._opacity;
			mesh.material.transparent = this._opacity < 1.0;
			mesh.visible = this._visible;
		});
	}

	public containsPosition(position: THREE.Vector3): boolean {
		// Calculate the bounds of the schematic
		const dimensions = this.schematicWrapper.get_dimensions();
		const min = this._position.clone();
		const max = min
			.clone()
			.add(
				new THREE.Vector3(dimensions.x, dimensions.y, dimensions.z).multiply(
					this._scale
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
}
