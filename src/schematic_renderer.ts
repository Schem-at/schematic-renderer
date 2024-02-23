import * as THREE from "three";
import { loadSchematic } from "@enginehub/schematicjs";
import { Renderer } from "./renderer";
import { RessourceLoader } from "./ressource_loader";
import { parseNbtFromBase64 } from "./utils";
import type { TagMap } from "nbt-ts";

import { World } from "./world_mesh_builder";
export class SchematicRenderer {
	CASSETTE_DECK_URL = `https://services.enginehub.org/cassette-deck/minecraft-versions/find?dataVersion=`;
	URL_1_13 =
		"https://launcher.mojang.com/v1/objects/c0b970952cdd279912da384cdbfc0c26e6c6090b/client.jar";

	canvas: HTMLCanvasElement;
	options: any;
	renderer: Renderer;
	schematicData: string;
	loadedSchematic: any;
	ressourceLoader: any;
	jarUrl: string | string[] | undefined;
	schematicMeshes: THREE.Mesh[] | undefined;

	constructor(canvas: HTMLCanvasElement, schematicData: string, options: any) {
		this.canvas = canvas;
		this.schematicData = schematicData;
		this.options = options;
		this.renderer = new Renderer(canvas, options);
		this.initialize();
	}

	async initialize() {
		let parsedNbt: TagMap;
		parsedNbt = parseNbtFromBase64(this.schematicData);

		this.loadedSchematic = loadSchematic(parsedNbt);
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
		if (this.schematicMeshes && this.schematicMeshes.length > 0) {
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
		if (this.schematicMeshes) {
			this.renderer.scene.remove(...this.schematicMeshes);
		}
	}

	async updateSchematic(schematicData: string) {
		console.log("updateSchematic");
		this.schematicData = schematicData;
		this.clearSchematic();
		let parsedSchematic: TagMap;
		parsedSchematic = parseNbtFromBase64(this.schematicData);
		const newSchemMesh = loadSchematic(parsedSchematic);
		this.loadedSchematic = newSchemMesh;
		await this.render();
	}
}
