import * as THREE from "three";
import { Renderer } from "./renderer";

export class SchematicMediaCapture {
	constructor(private renderer: Renderer) {}

	async takeScreenshot(resolutionX: number, resolutionY: number) {
		console.log("takeScreenshot");
		const screenshot = this.renderer.takeScreenshot(resolutionX, resolutionY);
		return screenshot;
	}

	private calculateCameraParameters(schematic: any) {
		const centerPosition = new THREE.Vector3(
			schematic.width / 2,
			schematic.height / 2,
			schematic.length / 2
		);
		const distance = this.renderer.camera.position.distanceTo(centerPosition);
		const elevation = Math.asin(
			(this.renderer.camera.position.y - centerPosition.y) / distance
		);
		console.log("centerPosition", centerPosition);
		return { centerPosition, distance, elevation };
	}

	async takeRotationGif(
		resolutionX: number,
		resolutionY: number,
		schematic: any,
		frameRate: number,
		duration: number,
		angle: number = 360
	) {
		const { centerPosition, distance, elevation } =
			this.calculateCameraParameters(schematic);
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
		schematic: any,
		frameRate: number,
		duration: number,
		angle: number = 360
	) {
		const { centerPosition, distance, elevation } =
			this.calculateCameraParameters(schematic);
		const webm = this.renderer.takeRotationWebM(
			resolutionX,
			resolutionY,
			centerPosition,
			distance,
			elevation,
			frameRate,
			duration,
			angle
		);
		return webm;
	}

	async downloadScreenshot(resolutionX: number, resolutionY: number) {
		const screenshot = await this.takeScreenshot(resolutionX, resolutionY);
		const a = document.createElement("a");
		a.href = screenshot;
		a.download = "schematic-screenshot.png";
		a.click();
		URL.revokeObjectURL(a.href);
	}

	async downloadRotationGif(
		resolutionX: number,
		resolutionY: number,
		frameRate: number,
		duration: number,
		angle: number = 360
	) {
		const gif = await this.takeRotationGif(
			resolutionX,
			resolutionY,
			this.renderer.schematic,
			frameRate,
			duration,
			angle
		);
		const a = document.createElement("a");
		a.href = URL.createObjectURL(gif as Blob);
		a.download = "schematic-rotation.gif";
		a.click();
		URL.revokeObjectURL(a.href);
	}

	async downloadRotationWebM(
		resolutionX: number,
		resolutionY: number,
		frameRate: number,
		duration: number,
		angle: number = 360
	) {
		const webm = await this.takeRotationWebM(
			resolutionX,
			resolutionY,
			frameRate,
			duration,
			angle
		);
		const a = document.createElement("a");
		a.href = URL.createObjectURL(webm as Blob);
		a.download = "schematic-rotation.webm";
		a.click();
		URL.revokeObjectURL(a.href);
	}
}
