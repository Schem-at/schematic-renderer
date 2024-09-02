import * as THREE from "three";
import { TagMap } from "@enginehub/nbt-ts";
import { Renderer } from "./renderer";
import { ResourceLoader } from "./resource_loader";
import { WorldMeshBuilder } from "./world_mesh_builder";
import { parseNbtFromArrayBuffer, parseNbtFromBase64 } from "./utils";
import { SchematicRendererGUI } from "./SchematicRendererGUI";
import { SchematicRendererCore } from "./SchematicRendererCore";
import { SchematicMediaCapture } from "./SchematicMediaCapture";
import { SchematicExporter } from "./SchematicExporter";
import {
	ResourcePackManager,
	DefaultPackCallback,
} from "./ResourcePackManager";

// Import the WASM module
import init, { SchematicWrapper } from "@wasm/minecraft_schematic_utils";

function relayMethods(target: any, sourceKey: string) {
	const source = target[sourceKey];
	Object.getOwnPropertyNames(Object.getPrototypeOf(source)).forEach(
		(method) => {
			if (method !== "constructor" && typeof source[method] === "function") {
				target[method] = function (...args: any[]) {
					return source[method].apply(source, args);
				};
			}
		}
	);
}

export class SchematicRenderer {
	[x: string]: any;
	canvas: HTMLCanvasElement;
	options: any;

	renderer: Renderer;
	resourceLoader: any;
	materialMap: Map<string, THREE.Material> = new Map();
	worldMeshBuilder: WorldMeshBuilder | undefined;
	jarUrl: string | string[] | undefined;

	schematicRendererGUI: SchematicRendererGUI | null = null;

	schematicRendererCore: SchematicRendererCore | undefined;
	schematicMediaCapture: SchematicMediaCapture | undefined;
	schematicExporter: SchematicExporter | undefined;
	resourcePackManager: ResourcePackManager;

	// Add WASM-related properties
	private wasmModule: Awaited<ReturnType<typeof init>> | null = null;
	// private schematicWrapper: SchematicWrapper | null = null;

	constructor(
		canvas: HTMLCanvasElement,
		schematicData: { [key: string]: () => Promise<ArrayBuffer> },
		defaultResourcePacks: Record<string, DefaultPackCallback> = {},
		options: any = {}
	) {
		this.canvas = canvas;
		this.options = options;
		this.renderer = new Renderer(canvas, options);
		this.resourcePackManager = new ResourcePackManager();
		this.initWasm().then(() => {
			this.initializeResourcePacks(defaultResourcePacks).then(() => {
				this.resourceLoader = new ResourceLoader(
					this.options.resourcePackBlobs,
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

				this.setupRelayedMethods();
				this.initialize(schematicData);
			});
		});
	}

	private async initWasm() {
		try {
			this.wasmModule = await init();
		} catch (error) {
			console.error("Failed to initialize WASM module:", error);
		}
	}

	private setupRelayedMethods() {
		relayMethods(this, "renderer");
		relayMethods(this, "schematicMediaCapture");
		relayMethods(this, "schematicExporter");
		relayMethods(this, "schematicRendererCore");
	}

	private async initializeResourcePacks(
		defaultResourcePacks?: Record<string, DefaultPackCallback>
	) {
		this.options.resourcePackBlobs =
			await this.resourcePackManager.getResourcePackBlobs(
				defaultResourcePacks || {}
			);
		this.resourceLoader = new ResourceLoader(
			this.options.resourcePackBlobs,
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
	}

	async initialize(schematicData: {
		[key: string]: () => Promise<ArrayBuffer>;
	}) {
		const loadedSchematics = {} as { [key: string]: SchematicWrapper };

		for (const key in schematicData) {
			if (schematicData.hasOwnProperty(key)) {
				const arrayBuffer = await schematicData[key]();
				const schematicWrapper = new SchematicWrapper();
				schematicWrapper?.from_schematic(new Uint8Array(arrayBuffer));
				loadedSchematics[key] = schematicWrapper;
			}
		}

		this.materialMap = new Map();
		this.renderer.schematics = loadedSchematics;

		await this.resourceLoader.initialize();

		if (this.schematicRendererCore) {
			await this.schematicRendererCore.render();
		}
		if (this.options?.debugGUI) {
			this.schematicRendererGUI = new SchematicRendererGUI(this);
		}
	}

	async updateSchematic(
		key: string,
		schematicDataCallback: () => Promise<ArrayBuffer>
	) {
		const arrayBuffer = await schematicDataCallback();
		const schematicWrapper = new SchematicWrapper();
		schematicWrapper?.from_schematic(new Uint8Array(arrayBuffer));
		this.renderer.schematics[key] = schematicWrapper;
		await this.renderSchematic(key);
	}

	async exportUsdz(): Promise<any> {
		return this.exportUsdz();
	}

	async downloadScreenshot(
		resolutionX: number,
		resolutionY: number
	): Promise<any> {
		return this.downloadScreenshot(resolutionX, resolutionY);
	}

	async getScreenshot(resolutionX: number, resolutionY: number): Promise<any> {
		return this.getScreenshot(resolutionX, resolutionY);
	}

	async getRotationWebM(
		resolutionX: number,
		resolutionY: number,
		frameRate: number,
		duration: number,
		angle: number = 360
	): Promise<any> {
		return this.getRotationWebM(
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

	async uploadResourcePack(file: File) {
		await this.resourcePackManager.uploadPack(file);
		await this.reloadResourcePacks();
	}

	async clearResourcePacks() {
		await this.resourcePackManager.clearPacks();
		await this.reloadResourcePacks();
	}

	async listResourcePacks(): Promise<{ name: string; enabled: boolean }[]> {
		return this.resourcePackManager.listPacks();
	}

	async toggleResourcePack(name: string, enabled: boolean) {
		await this.resourcePackManager.togglePackEnabled(name, enabled);
		await this.reloadResourcePacks();
	}

	async reorderResourcePack(name: string, newOrder: number) {
		await this.resourcePackManager.reorderPack(name, newOrder);
		await this.reloadResourcePacks();
	}

	async getResourcePackInfo(): Promise<
		{ name: string; enabled: boolean; order: number }[]
	> {
		return this.resourcePackManager.listPacks();
	}

	private async reloadResourcePacks() {
		await this.initializeResourcePacks();
		await this.resourceLoader.initialize();
		if (this.schematicRendererCore) {
			await this.schematicRendererCore.render();
		}
	}
}
