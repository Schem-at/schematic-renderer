import * as THREE from "three";
import { Renderer } from "./renderer";

export class SchematicMediaCapture {
	renderer: Renderer;
	constructor(renderer: Renderer) {
		this.renderer = renderer;
	}

	async getScreenshot(resolutionX: number, resolutionY: number) {
		const screenshot = this.renderer.takeScreenshot(resolutionX, resolutionY);
		return screenshot;
	}

	private calculateCameraParameters(_schematic: any) {
		// const centerPosition = new THREE.Vector3(
		// 	schematic.width / 2,
		// 	schematic.height / 2,
		// 	schematic.length / 2
		// );
		const centerPosition = new THREE.Vector3(0, 0, 0);
		const distance = this.renderer.camera.position.distanceTo(centerPosition);
		const elevation = Math.asin(
			(this.renderer.camera.position.y - centerPosition.y) / distance
		);
		console.log("centerPosition", centerPosition);
		return { centerPosition, distance, elevation };
	}

	async downloadScreenshot(resolutionX: number, resolutionY: number) {
		const screenshot = await this.getScreenshot(resolutionX, resolutionY);
		const a = document.createElement("a");
		a.href = screenshot;
		a.download = "schematic-screenshot.png";
		a.click();
		URL.revokeObjectURL(a.href);
	}

	async getRotationWebM(
		resolutionX: number,
		resolutionY: number,
		frameRate: number,
		duration: number,
		angle: number = 360
	) {
		const { centerPosition, distance, elevation } =
			this.calculateCameraParameters(this.renderer.schematic);
		const webmBlob = await this.renderer.takeRotationWebM(
			resolutionX,
			resolutionY,
			centerPosition,
			distance,
			elevation,
			frameRate,
			duration,
			angle
		);
		return webmBlob;
	}

	async downloadRotationWebM(
		resolutionX: number,
		resolutionY: number,
		frameRate: number,
		duration: number,
		angle: number = 360
	) {
		const webmBlob = await this.getRotationWebM(
			resolutionX,
			resolutionY,
			frameRate,
			duration,
			angle
		);
		const a = document.createElement("a");
		a.href = URL.createObjectURL(webmBlob);
		a.download = "schematic-rotation.webm";
		a.click();
		URL.revokeObjectURL(a.href);
	}
}
