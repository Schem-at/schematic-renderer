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

	schematicRendererGUI: SchematicRendererGUI;
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
		this.schematicRendererGUI = new SchematicRendererGUI(this);
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

		await this.resourceLoader.initialize();

		await this.schematicRendererCore.render(this.loadedSchematic);
	}

	async updateSchematic(schematicData: string) {
		this.schematicData = schematicData;
		await this.schematicRendererCore.updateSchematic(schematicData);
	}

	async takeScreenshot(resolutionX: number, resolutionY: number) {
		return this.schematicMediaCapture.takeScreenshot(resolutionX, resolutionY);
	}

	async takeRotationGif(
		resolutionX: number,
		resolutionY: number,
		frameRate: number,
		duration: number,
		angle: number = 360
	) {
		return this.schematicMediaCapture.takeRotationGif(
			resolutionX,
			resolutionY,
			this.loadedSchematic,
			frameRate,
			duration,
			angle
		);
	}

	async takeRotationWebM(
		resolutionX: number,
		resolutionY: number,
		frameRate: number,
		duration: number,
		angle: number = 360
	) {
		return this.schematicMediaCapture.takeRotationWebM(
			resolutionX,
			resolutionY,
			this.loadedSchematic,
			frameRate,
			duration,
			angle
		);
	}
	async exportUsdz() {
		return this.schematicExporter.exportUsdz();
	}

	updateZoom(value: number) {
		this.renderer.updateZoom(value);
	}
}
