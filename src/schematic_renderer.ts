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
	URL_1_20_4 =
		"https://piston-data.mojang.com/v1/objects/fd19469fed4a4b4c15b2d5133985f0e3e7816a8a/client.jar";
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
		console.log("options", options);
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
		this.ressourceLoader = new RessourceLoader(
			this.jarUrl,
			this.options?.progressController
		);
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
		//set the camera to the correct position
		//this.renderer.camera.position.set(
		//	this.loadedSchematic.width * 2,
		//	this.loadedSchematic.height * 2,
		//	this.loadedSchematic.length * 2
		//);
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
		console.log("render");
		this.ressourceLoader.setSchematic(this.loadedSchematic);
		console.log("setSchematicasdasd");

		this.schematicMeshes = await this.ressourceLoader.getSchematicMeshes();
		this.options.progressController?.setProgressMessage("Rendering Schematic");
		if (this.schematicMeshes && this.schematicMeshes.length > 0) {
			console.log("rendering");
			this.renderer.scene.add(...this.schematicMeshes);
			console.log("rendering done");
			this.renderer.animate();
			console.log("animate done");
		} else {
			console.log("no schematic meshes");
		}

		// add a usdz download button
		//const usdzButton = document.createElement("button");
		//usdzButton.innerText = "Download USDZ";
		//usdzButton.onclick = async () => {
		//	const usdz = await this.exportUsdz();
		//	const link = document.createElement("a");
		//	//link.href = usdz; Type 'Uint8Array' is not assignable to type 'string'
		//	link.href = URL.createObjectURL(new Blob([usdz], { type: "model/usdz" }));
		//	link.download = "schematic.usdz";
		//	link.click();
		//};
		//document.body.appendChild(usdzButton);

		// add a ar view button
		//<div>
		//	<a rel="ar" href="/assets/models/my-model.usdz">
		//		<img src="/assets/models/my-model-thumbnail.jpg">
		//	</a>
		//</div>

		const arDiv = document.createElement("div");
		const arLink = document.createElement("a");
		arLink.rel = "ar";
		const usdz = await this.exportUsdz();
		arLink.href = URL.createObjectURL(new Blob([usdz], { type: "model/usdz" }));
		const arImg = document.createElement("img");
		arLink.download = "schematic.usdz";
		arImg.src = "https://www.gstatic.com/webp/gallery/1.jpg";
		arLink.appendChild(arImg);
		arDiv.appendChild(arLink);
		document.body.appendChild(arDiv);

		this.options.progressController?.hideProgress();
	}

	public clearSchematic() {
		if (this.schematicMeshes) {
			this.renderer.scene.remove(...this.schematicMeshes);
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
