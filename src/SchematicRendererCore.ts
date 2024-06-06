import * as THREE from "three";
import { loadSchematic } from "@enginehub/schematicjs";
import { Renderer } from "./renderer";
import { ResourceLoader } from "./resource_loader";
import { WorldMeshBuilder } from "./world_mesh_builder";
import { parseNbtFromBase64 } from "./utils";
import { TagMap } from "@enginehub/nbt-ts";

export class SchematicRendererCore {
	constructor(
		private renderer: Renderer,
		private resourceLoader: ResourceLoader,
		private worldMeshBuilder: WorldMeshBuilder
	) {}

	async render(loadedSchematic: any) {
		const cameraDistance = Math.max(
			loadedSchematic.width,
			loadedSchematic.height,
			loadedSchematic.length
		);
		this.renderer.camera.position.set(
			cameraDistance * 1.1,
			cameraDistance * 1.1,
			cameraDistance * 1.1
		);
		const center = new THREE.Vector3(
			loadedSchematic.width / 2,
			loadedSchematic.height / 2,
			loadedSchematic.length / 2
		);
		this.renderer.camera.lookAt(center);
		this.resourceLoader.setSchematic(loadedSchematic);
		this.worldMeshBuilder.setSchematic(loadedSchematic);
		this.renderer.animate();
		const startPerformance = performance.now();
		await this.worldMeshBuilder.getSchematicMeshes();
		console.log(
			"Schematic rendered in",
			performance.now() - startPerformance,
			"ms"
		);
	}

	async updateSchematic(schematicData: string) {
		let parsedSchematic: TagMap;
		parsedSchematic = parseNbtFromBase64(schematicData);
		const newSchemMesh = loadSchematic(parsedSchematic);
		await this.clearSchematic();
		await this.render(newSchemMesh);
	}

	async clearSchematic() {
		const schematicMeshes = this.renderer.scene.children.filter(
			(child) => child instanceof THREE.Mesh
		);
		this.renderer.scene.remove(...schematicMeshes);
		const gridHelper = this.renderer.scene.getObjectByName("GridHelper");
		if (gridHelper) {
			this.renderer.scene.remove(gridHelper);
		}
		const ambientLight = this.renderer.scene.getObjectByName("AmbientLight");
		if (ambientLight) {
			this.renderer.scene.remove(ambientLight);
		}
	}
}
