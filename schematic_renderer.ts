import * as THREE from "three";
import { loadSchematic } from "@enginehub/schematicjs";
import type { TagMap } from "@enginehub/nbt-ts";
import GUI from "lil-gui";
import { Renderer } from "./renderer";
import { ResourceLoader } from "./resource_loader";
import { WorldMeshBuilder } from "./world_mesh_builder";
import { parseNbtFromBase64 } from "./utils";

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
	schematicMeshes: THREE.Mesh[] | undefined;
	gridHelper: THREE.GridHelper | undefined;
	ambientLight: THREE.AmbientLight | undefined;

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
		this.materialMap = new Map();
		this.resourceLoader = new ResourceLoader(
			this.options?.resourcePackBlobs,
			this.options?.progressController,
			this.materialMap
		);

		await this.resourceLoader.initialize();
		this.worldMeshBuilder = new WorldMeshBuilder(
			this.resourceLoader,
			this.options?.progressController,
			this.materialMap
		);
		await this.render();

		this.createGUI();
	}

	createGUI() {
		const gui = new GUI();

		// Create settings
		const settings = {
			rotationSpeed: 0.01,
			zoom: 1,
			showGrid: true,
			ambientOcclusion: true,
			backgroundColor: "#ffffff",
			exportUSDZ: () => {
				this.exportUsdz();
			},
		};

		// Add settings to the GUI
		gui
			.add(settings, "rotationSpeed", 0, 0.1)
			.step(0.001)
			.name("Rotation Speed");
		gui
			.add(settings, "zoom", 0.1, 2)
			.step(0.1)
			.name("Zoom")
			.onChange((value) => {
				this.updateZoom(value);
			});
		gui
			.add(settings, "showGrid")
			.name("Show Grid")
			.onChange((value) => {
				this.toggleGrid(value);
			});
		gui
			.add(settings, "ambientOcclusion")
			.name("Ambient Occlusion")
			.onChange((value) => {
				this.toggleAmbientOcclusion(value);
			});
		gui
			.addColor(settings, "backgroundColor")
			.name("Background Color")
			.onChange((value) => {
				this.renderer.setBackgroundColor(value);
			});
		gui.add(settings, "exportUSDZ").name("Export USDZ");
	}

	updateZoom(value: number) {
		const cameraDistance =
			Math.max(
				this.loadedSchematic.width,
				this.loadedSchematic.height,
				this.loadedSchematic.length
			) * value;
		this.renderer.camera.position.set(
			cameraDistance * 1.1,
			cameraDistance * 1.1,
			cameraDistance * 1.1
		);
		this.renderer.camera.lookAt(this.renderer.scene.position);
	}

	async render() {
		this.options.progressController?.showProgress();
		this.options.progressController?.setProgressMessage("Loading Schematic");

		const cameraDistance = Math.max(
			this.loadedSchematic.width,
			this.loadedSchematic.height,
			this.loadedSchematic.length
		);
		this.renderer.camera.position.set(
			cameraDistance * 1.1,
			cameraDistance * 1.1,
			cameraDistance * 1.1
		);
		const center = new THREE.Vector3(
			this.loadedSchematic.width / 2,
			this.loadedSchematic.height / 2,
			this.loadedSchematic.length / 2
		);
		this.renderer.camera.lookAt(center);
		this.resourceLoader.setSchematic(this.loadedSchematic);
		this.worldMeshBuilder?.setSchematic(this.loadedSchematic);
		this.schematicMeshes = await this.worldMeshBuilder?.getSchematicMeshes();
		this.options.progressController?.setProgressMessage("Rendering Schematic");
		if (this.schematicMeshes && this.schematicMeshes.length > 0) {
			this.renderer.scene.add(...this.schematicMeshes);
			this.renderer.animate();
		} else {
			console.log("no schematic meshes");
		}

		this.options.progressController?.hideProgress();
	}

	public clearSchematic() {
		if (this.schematicMeshes) {
			this.renderer.scene.remove(...this.schematicMeshes);
		}
		if (this.gridHelper) {
			this.renderer.scene.remove(this.gridHelper);
			this.gridHelper = undefined;
		}
		if (this.ambientLight) {
			this.renderer.scene.remove(this.ambientLight);
			this.ambientLight = undefined;
		}
	}

	async updateSchematic(schematicData: string) {
		this.schematicData = schematicData;
		this.clearSchematic();
		let parsedSchematic: TagMap;
		parsedSchematic = parseNbtFromBase64(this.schematicData);
		const newSchemMesh = loadSchematic(parsedSchematic);
		this.loadedSchematic = newSchemMesh;
		await this.render();
	}

	async takeScreenshot(resolutionX: number, resolutionY: number) {
		const screenshot = this.renderer.takeScreenshot(resolutionX, resolutionY);
		return screenshot;
	}

	async setCameraPosition(x: number, y: number, z: number) {
		this.renderer.camera.position.set(x, y, z);
	}

	async setCameraRotation(x: number, y: number, z: number) {
		this.renderer.camera.rotation.set(x, y, z);
	}

	async setCameraLookAt(x: number, y: number, z: number) {
		this.renderer.camera.lookAt(new THREE.Vector3(x, y, z));
	}

	async takeRotationGif(
		resolutionX: number,
		resolutionY: number,
		frameRate: number,
		duration: number,
		angle: number = 360
	) {
		const centerPosition = new THREE.Vector3(
			this.loadedSchematic.width / 2,
			this.loadedSchematic.height / 2,
			this.loadedSchematic.length / 2
		);
		const distance = this.renderer.camera.position.distanceTo(centerPosition);
		const elevation = Math.asin(
			(this.renderer.camera.position.y - centerPosition.y) / distance
		);
		const gif = this.renderer.takeRotationGif(
			resolutionX,
			resolutionY,
			centerPosition,
			distance,
			elevation,
			frameRate,
			duration,
			angle
		);
		return gif;
	}

	async takeRotationWebM(
		resolutionX: number,
		resolutionY: number,
		frameRate: number,
		duration: number,
		angle: number = 360
	) {
		const centerPosition = new THREE.Vector3(
			this.loadedSchematic.width / 2,
			this.loadedSchematic.height / 2,
			this.loadedSchematic.length / 2
		);
		const distance = this.renderer.camera.position.distanceTo(centerPosition);
		const elevation = Math.asin(
			(this.renderer.camera.position.y - centerPosition.y) / distance
		);
		this.options.progressController?.showProgress();
		const webm = this.renderer.takeRotationWebM(
			resolutionX,
			resolutionY,
			centerPosition,
			distance,
			elevation,
			frameRate,
			duration,
			angle,
			this.options?.progressController
		);
		return webm;
	}

	async exportUsdz() {
		const obj = this.renderer.exportUsdz();
		return obj;
	}
}
