import * as THREE from "three";
import { TagMap } from "@enginehub/nbt-ts";
import { Renderer } from "./renderer";
import { ResourceLoader } from "./resource_loader";
import { WorldMeshBuilder } from "./world_mesh_builder";
import { parseNbtFromBase64 } from "./utils";
import { loadSchematic, Schematic } from "@enginehub/schematicjs";
import { SchematicRendererGUI } from "./SchematicRendererGUI";
import { SchematicRendererCore } from "./SchematicRendererCore";
import { SchematicMediaCapture } from "./SchematicMediaCapture";
import { SchematicExporter } from "./SchematicExporter";
export class SchematicRenderer {
	canvas: HTMLCanvasElement;
	options: any;
	renderer: Renderer;
	resourceLoader: any;
	materialMap: Map<string, THREE.Material> = new Map();
	worldMeshBuilder: WorldMeshBuilder | undefined;
	jarUrl: string | string[] | undefined;

	schematicRendererGUI: SchematicRendererGUI | null = null;
	schematicRendererCore: SchematicRendererCore;
	schematicMediaCapture: SchematicMediaCapture;
	schematicExporter: SchematicExporter;

	constructor(
		canvas: HTMLCanvasElement,
		schematicData: { [key: string]: string },
		options: any
	) {
		this.canvas = canvas;
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
			this.worldMeshBuilder
		);
		this.schematicMediaCapture = new SchematicMediaCapture(this.renderer);
		this.schematicExporter = new SchematicExporter(this.renderer);

		this.initialize(schematicData);
	}

	async initialize(schematicData: { [key: string]: string }) {
		let parsedNbt: TagMap;
		const loadedSchematics = {} as { [key: string]: Schematic };

		// Iterate over the object's keys
		for (const key in schematicData) {
			if (schematicData.hasOwnProperty(key)) {
				const value = schematicData[key];
				parsedNbt = parseNbtFromBase64(value);
				loadedSchematics[key] = loadSchematic(parsedNbt);
			}
		}

		this.materialMap = new Map();
		this.renderer.schematics = loadedSchematics;

		await this.resourceLoader.initialize();

		await this.schematicRendererCore.render();

		if (this.options?.debugGUI) {
			this.schematicRendererGUI = new SchematicRendererGUI(this);
		}
	}

	async updateSchematic(key: string, schematicData: string) {
		this.renderer.schematics[key] = loadSchematic(
			parseNbtFromBase64(schematicData)
		);
		await this.schematicRendererCore.renderSchematic(key);
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
