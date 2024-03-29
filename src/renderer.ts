// Renderer.ts
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import GIF from "gif.js.optimized";
import WebMWriter from "webm-writer";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
// import Stats from "stats.js";
export class Renderer {
	canvas: HTMLCanvasElement;
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;
	// stats: Stats;

	constructor(canvas: HTMLCanvasElement, options: any) {
		this.canvas = canvas;
		this.renderer = new THREE.WebGLRenderer({
			canvas: this.canvas,
			antialias: true,
			alpha: true,
		});
		this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
		this.scene = new THREE.Scene();
		this.camera = this.createCamera();
		this.controls = new OrbitControls(this.camera, this.canvas);
		// this.stats = new Stats();
		// document.body.appendChild(this.stats.dom);

		this.setupScene(options);
	}

	getPerspectiveCamera() {
		const d = 20;
		const fov = 75;
		const aspect = this.canvas.clientWidth / this.canvas.clientHeight; // dynamic based on the canvas size
		const near = 0.1;
		const far = 1000;
		const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
		camera.position.set(d, 3 * d, d); // Default position
		camera.lookAt(0, 0, 0); // Default look at
		return camera;
	}

	getIsometricCamera() {
		const aspect = this.canvas.clientWidth / this.canvas.clientHeight; // dynamic based on the canvas size
		const d = 20;
		const camera = new THREE.OrthographicCamera(
			-d * aspect,
			d * aspect,
			d,
			-d,
			1,
			1000
		);
		camera.position.set(d, d, d); // Default position
		return camera;
	}
	createCamera() {
		return this.getPerspectiveCamera();
		// return this.getIsometricCamera();
	}

	setupScene(options: any) {
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
		ambientLight.intensity = 0.9;
		this.scene.add(ambientLight);

		const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
		directionalLight.position.set(20, 20, -20);
		directionalLight.intensity = 1;
		directionalLight.castShadow = true;
		directionalLight.shadow.bias = -0.01;
		this.scene.add(directionalLight);

		// const directionalLightHelper = new THREE.DirectionalLightHelper(
		// 	directionalLight
		// );
		// this.scene.add(directionalLightHelper);
	}

	createLights() {
		const color = 0xffffff;
		const intensity = 1;
		const light = new THREE.DirectionalLight(color, intensity);
		light.position.set(-1, 2, 4);
		this.scene.add(light);
	}

	render() {
		this.renderer.render(this.scene, this.camera);
	}

	animate() {
		// this.stats.begin();
		requestAnimationFrame(() => this.animate());
		this.controls.update();
		this.render();
		// this.stats.end();
	}

	takeScreenshot(resolutionX: number, resolutionY: number) {
		const oldCanvasWidth = this.canvas.clientWidth;
		const oldCanvasHeight = this.canvas.clientHeight;
		const tempCamera = this.camera.clone();
		tempCamera.aspect = resolutionX / resolutionY;
		tempCamera.updateProjectionMatrix();
		this.renderer.setSize(resolutionX, resolutionY);
		this.renderer.render(this.scene, tempCamera);
		const screenshot = this.renderer.domElement.toDataURL();
		this.renderer.setSize(oldCanvasWidth, oldCanvasHeight);
		this.renderer.render(this.scene, this.camera);
		return screenshot;
	}

	takeRotationGif(
		resolutionX: number,
		resolutionY: number,
		centerPosition: THREE.Vector3,
		distance: number,
		elevation: number,
		frameRate: number,
		duration: number,
		angle: number = 360
	) {
		const angleRad = (angle * Math.PI) / 180;
		const oldCanvasWidth = this.canvas.clientWidth;
		const oldCanvasHeight = this.canvas.clientHeight;
		const tempCamera = this.camera.clone();
		tempCamera.aspect = resolutionX / resolutionY;
		tempCamera.updateProjectionMatrix();
		this.renderer.setSize(resolutionX, resolutionY);
		const gif = new GIF({
			workers: 4,
			quality: 10,
			width: resolutionX,
			height: resolutionY,
			transparent: 0x000000,
		});
		const frames = Math.floor(frameRate * duration);
		const step = angleRad / frames;
		console.log("Rendering gif");
		for (let i = 0; i < frames; i++) {
			console.log((i / frames) * 100 + "%");
			const currentAngle = step * i;
			tempCamera.position.set(
				centerPosition.x + distance * Math.cos(currentAngle),
				centerPosition.y + distance * Math.sin(elevation),
				centerPosition.z + distance * Math.sin(currentAngle)
			);
			tempCamera.lookAt(centerPosition);
			this.renderer.render(this.scene, tempCamera);
			gif.addFrame(this.renderer.domElement, {
				copy: true,
				delay: 1000 / frameRate,
			});
		}
		this.renderer.setSize(oldCanvasWidth, oldCanvasHeight);
		this.renderer.render(this.scene, this.camera);
		console.log("Rendering gif done");
		return new Promise((resolve, reject) => {
			gif.on("finished", function (blob: any) {
				const reader = new FileReader();
				reader.onload = function () {
					resolve(reader.result);
				};
				reader.readAsDataURL(blob);
			});
			gif.render();
		});
	}

	takeRotationWebM(
		resolutionX: number,
		resolutionY: number,
		centerPosition: THREE.Vector3,
		distance: number,
		elevation: number,
		frameRate: number,
		duration: number,
		angle: number = 360,
		progressController: any
	) {
		progressController.setProgress(0);
		progressController.setProgressMessage("Rendering webm");
		progressController.showProgress();
		const angleRad = (angle * Math.PI) / 180;
		const oldCanvasWidth = this.canvas.clientWidth;
		const oldCanvasHeight = this.canvas.clientHeight;
		const tempCamera = this.camera.clone();
		tempCamera.aspect = resolutionX / resolutionY;
		tempCamera.updateProjectionMatrix();
		this.renderer.setSize(resolutionX, resolutionY);
		const frames = Math.floor(frameRate * duration);
		const step = angleRad / frames;
		const videoWriter = new WebMWriter({
			frameRate: frameRate,
			quality: 1,
			transparent: true,
		});
		const tempCanvas = document.createElement("canvas");
		tempCanvas.width = resolutionX;
		tempCanvas.height = resolutionY;
		console.log(distance, elevation);
		return new Promise((resolve, reject) => {
			const renderStep = (i: number) => {
				requestAnimationFrame(() => {
					console.log(distance, elevation);
					progressController.setProgress((i / frames) * 100);
					progressController.setProgressMessage(
						`Rendering webm: ${Math.round((i / frames) * 100)}%`
					);
					const currentAngle = step * i;
					tempCamera.position.set(
						centerPosition.x + distance * Math.cos(currentAngle),
						centerPosition.y + distance * Math.sin(elevation),
						centerPosition.z + distance * Math.sin(currentAngle)
					);
					tempCamera.lookAt(centerPosition);
					this.renderer.render(this.scene, tempCamera);
					const tempContext = tempCanvas.getContext("2d");
					tempContext?.clearRect(0, 0, resolutionX, resolutionY);
					tempContext?.drawImage(this.renderer.domElement, 0, 0);
					videoWriter.addFrame(tempCanvas);
					if (i < frames) {
						renderStep(i + 1);
					} else {
						this.renderer.setSize(oldCanvasWidth, oldCanvasHeight);
						this.renderer.render(this.scene, this.camera);
						videoWriter.complete().then((blob: any) => {
							const reader = new FileReader();
							reader.onload = function () {
								progressController.hideProgress();
								progressController.setProgress(0);
								progressController.setProgressMessage("");
								resolve(reader.result);
							};
							reader.readAsDataURL(blob);
						});
					}
				});
			};

			renderStep(0);
		});
	}

	exportUsdz() {
		const exporter = new USDZExporter();
		const usdz = exporter.parse(this.scene);
		return usdz;
	}
}
