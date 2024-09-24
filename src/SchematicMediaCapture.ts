import * as THREE from "three";
import { Renderer } from "./schematicRendererWorld";

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
			const schematic_dimensions = schematic.get_dimensions();
			const schematicCenter = new THREE.Vector3(
				schematic_dimensions[0] / 2,
				schematic_dimensions[1] / 2,
				schematic_dimensions[2] / 2
			);

			// centerPosition.add(schematicCenter);
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

		// centerPosition.divideScalar(count);
		elevation = this.renderer.camera.position.y;
		const cameraDistanceToCenter =
			this.renderer.camera.position.distanceTo(centerPosition);
		const elevationAngle = Math.asin(
			this.renderer.camera.position.y / cameraDistanceToCenter
		);
		distance = cameraDistanceToCenter;
		centerPosition.y = elevation;
		return { centerPosition, distance, elevationAngle };
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
		const { centerPosition, distance, elevationAngle } =
			this.calculateCameraParameters(this.renderer.schematics);
		console.log(
			"centerPosition",
			centerPosition,
			"distance",
			distance,
			"elevationAngle",
			elevationAngle
		);
		const webmBlob = await this.renderer.takeRotationWebM(
			resolutionX,
			resolutionY,
			centerPosition,
			distance,
			elevationAngle,
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
