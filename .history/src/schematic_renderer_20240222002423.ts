import * as THREE from "three";
import { loadSchematic } from "@enginehub/schematicjs";
import { Renderer } from "./renderer";
import { RessourceLoader } from "./ressource_loader";
import {
	faceToFacingVector,
	INVISIBLE_BLOCKS,
	NON_OCCLUDING_BLOCKS,
	TRANSPARENT_BLOCKS,
	parseNbt,
} from "./utils";

import { World } from "./world_mesh_builder";
export class SchematicRenderer {
	CASSETTE_DECK_URL = `https://services.enginehub.org/cassette-deck/minecraft-versions/find?dataVersion=`;
	URL_1_13 =
		"https://launcher.mojang.com/v1/objects/c0b970952cdd279912da384cdbfc0c26e6c6090b/client.jar";

	canvas: HTMLCanvasElement;
	options: any;
	renderer: Renderer;
	schematicData: any;
	loadedSchematic: any;
	ressourceLoader: any;
	jarUrl: string | string[];
	schematicMeshes: THREE.Mesh[];

	constructor(canvas: HTMLCanvasElement, schematicData: any, options: any) {
		this.canvas = canvas;
		this.schematicData = schematicData;
		this.options = options;
		this.renderer = new Renderer(canvas, options);
		this.initialize();
	}

	async initialize() {
		this.loadedSchematic = loadSchematic(parseNbt(this.schematicData));
		this.jarUrl = [
			await this.options.getClientJarUrl({
				dataVersion: this.loadedSchematic.dataVersion,
				corsBypassUrl: "",
			}),
		];
		this.ressourceLoader = new RessourceLoader(this.jarUrl);
		await this.ressourceLoader.initialize();
		await this.render();
	}

	public async getClientJarUrlDefault({
		dataVersion,
		corsBypassUrl,
	}: any): Promise<string> {
		const versionManifestFile = dataVersion
			? await (
					await fetch(`${corsBypassUrl}${this.CASSETTE_DECK_URL}${dataVersion}`)
			  ).json()
			: undefined;

		return `${corsBypassUrl}${
			versionManifestFile?.[0]?.clientJarUrl ?? this.URL_1_13
		}`;
	}

	async render() {
		console.log("render");
		this.ressourceLoader.setSchematic(this.loadedSchematic);
		console.log("setSchematic");

		this.schematicMeshes = await this.ressourceLoader.getSchematicMeshes();
		console.log("getSchematicMeshes");
		if (this.schematicMeshes.length > 0) {
			console.log("rendering");
			this.renderer.scene.add(...this.schematicMeshes);
			console.log("rendering done");
			this.renderer.animate();
			console.log("animate done");
		} else {
			console.log("no schematic meshes");
		}
	}

	public clearSchematic() {
		this.renderer.scene.remove(...this.schematicMeshes);
	}

	async updateSchematic(schematicData: string) {
		console.log("updateSchematic");
		this.schematicData = schematicData;
		this.clearSchematic();

		const newSchemMesh = loadSchematic(parseNbt(this.schematicData));
		this.loadedSchematic = newSchemMesh;
		await this.render();
	}
}
