import * as THREE from "three";
import { TagMap } from "@enginehub/nbt-ts";
import { Renderer } from "./renderer";
import { ResourceLoader } from "./resource_loader";
import { WorldMeshBuilder } from "./world_mesh_builder";
import { parseNbtFromBase64 } from "./utils";
import { loadSchematic } from "@enginehub/schematicjs";
import { SchematicRendererGUI } from "./SchematicRendererGUI";
import { SchematicRendererCore } from "./SchematicRendererCore";
import { SchematicMediaCapture } from "./SchematicMediaCapture";
import { SchematicExporter } from "./SchematicExporter";
export class SchematicRenderer {
	canvas: HTMLCanvasElement;
	options: any;
	renderer: Renderer;
	schematicData: string;
	loadedSchematic: any;
	resourceLoader: any;
	materialMap: Map<string, THREE.Material> = new Map();
	worldMeshBuilder: WorldMeshBuilder | undefined;
	jarUrl: string | string[] | undefined;

	schematicRendererGUI: SchematicRendererGUI | null = null;
	schematicRendererCore: SchematicRendererCore;
	schematicMediaCapture: SchematicMediaCapture;
	schematicExporter: SchematicExporter;

	constructor(canvas: HTMLCanvasElement, schematicData: string, options: any) {
		this.canvas = canvas;
		this.schematicData = schematicData;
		this.options = options;
		this.renderer = new Renderer(canvas, options);
		this.resourceLoader = new ResourceLoader(
			this.options?.resourcePackBlobs,
			this.materialMap
		);
		this.worldMeshBuilder = new WorldMeshBuilder(
			this.resourceLoader,
			this.materialMap,
			this.renderer
		);
		this.schematicRendererCore = new SchematicRendererCore(
			this.renderer,
			this.resourceLoader,
			this.worldMeshBuilder
		);
		this.schematicMediaCapture = new SchematicMediaCapture(this.renderer);
		this.schematicExporter = new SchematicExporter(this.renderer);

		this.initialize();
	}

	async initialize() {
		let parsedNbt: TagMap;
		parsedNbt = parseNbtFromBase64(this.schematicData);

		this.loadedSchematic = loadSchematic(parsedNbt);
		this.materialMap = new Map();
		this.renderer.schematic = this.loadedSchematic;

		await this.resourceLoader.initialize();

		await this.schematicRendererCore.render(this.loadedSchematic);
		console.log(this.options);
		if (this.options?.debugGUI) {
			this.schematicRendererGUI = new SchematicRendererGUI(this);
		}
	}

	async updateSchematic(schematicData: string) {
		this.schematicData = schematicData;
		await this.schematicRendererCore.updateSchematic(schematicData);
	}

	async exportUsdz() {
		return this.schematicExporter.exportUsdz();
	}

	async downloadScreenshot(resolutionX: number, resolutionY: number) {
		return this.schematicMediaCapture.downloadScreenshot(
			resolutionX,
			resolutionY
		);
	}

	async getScreenshot(resolutionX: number, resolutionY: number) {
		return this.schematicMediaCapture.getScreenshot(resolutionX, resolutionY);
	}

	async getRotationWebM(
		resolutionX: number,
		resolutionY: number,
		frameRate: number,
		duration: number,
		angle: number = 360
	) {
		return this.schematicMediaCapture.getRotationWebM(
			resolutionX,
			resolutionY,
			frameRate,
			duration,
			angle
		);
	}

	updateZoom(value: number) {
		this.renderer.updateZoom(value);
	}

	updateGammaCorrection(value: number) {
		this.renderer.updateGammaCorrection(value);
	}

	addLight(
		type: "ambient" | "directional" | "point" | "spot",
		options: any
	): string {
		return this.renderer.addLight(type, options);
	}

	removeLight(id: string) {
		this.renderer.removeLight(id);
	}

	updateLight(id: string, options: any) {
		this.renderer.updateLight(id, options);
	}

	getLights() {
		return this.renderer.getLights();
	}
}
