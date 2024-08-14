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

	private calculateCameraParameters(schematics: { [key: string]: any }) {
		// const centerPosition = new THREE.Vector3(
		// 	schematic.width / 2,
		// 	schematic.height / 2,
		// 	schematic.length / 2
		// );
		// const centerPosition = new THREE.Vector3(0, schematic.height / 2, 0);
		// const distance = this.renderer.camera.position.distanceTo(centerPosition);
		// const elevation = Math.asin(
		// 	(this.renderer.camera.position.y - centerPosition.y) / distance
		// );
		// console.log("centerPosition", centerPosition);
		// return { centerPosition, distance, elevation };

		let centerPosition = new THREE.Vector3(0, 0, 0);
		let distance = 0;
		let elevation = 0;
		let count = 0;
		for (const key in schematics) {
			const schematic = schematics[key];
			const schematicCenter = new THREE.Vector3(
				schematic.width / 2,
				schematic.height / 2,
				schematic.length / 2
			);
			centerPosition.add(schematicCenter);
			const schematicDistance =
				this.renderer.camera.position.distanceTo(schematicCenter);
			if (schematicDistance > distance) {
				distance = schematicDistance;
			}
			if (schematicCenter.y > elevation) {
				elevation = schematicCenter.y;
			}
			count++;
		}

		centerPosition.divideScalar(count);
		elevation = this.renderer.camera.position.y - elevation;
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
			this.calculateCameraParameters(this.renderer.schematics);
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
