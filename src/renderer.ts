import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// import { FlyControls } from "three/examples/jsm/controls/FlyControls.js";
// @ts-ignore
import GIF from "gif.js.optimized";
// @ts-ignore
import WebMWriter from "webm-writer";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import * as POSTPROCESSING from "postprocessing";
// @ts-ignore
import { SSAOEffect } from "realism-effects";

export class Renderer {
	canvas: HTMLCanvasElement;
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
	controls: OrbitControls;
	composer: POSTPROCESSING.EffectComposer;
	schematic: any;

	constructor(canvas: HTMLCanvasElement, options: any) {
		this.canvas = canvas;
		this.renderer = new THREE.WebGLRenderer({
			depth: false,
			canvas: this.canvas,
			alpha: true,
		});
		this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
		this.scene = new THREE.Scene();
		this.camera = this.createCamera();
		this.controls = new OrbitControls(this.camera, this.canvas);
		// this.controls = new FlyControls(this.camera, this.canvas);

		this.composer = new POSTPROCESSING.EffectComposer(this.renderer);
		this.composer.addPass(
			new POSTPROCESSING.RenderPass(this.scene, this.camera)
		);
		this.setupScene(options);

		this.setBackgroundColor("#000000", 1);
		// const axesHelper = new THREE.AxesHelper(50);
		// this.scene.add(axesHelper);
	}

	addDebugCuboide(position: THREE.Vector3, size: THREE.Vector3, color: number) {
		const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
		const material = new THREE.MeshBasicMaterial({ color: color });
		const cube = new THREE.Mesh(geometry, material);
		cube.position.copy(position);
		this.scene.add(cube);
	}

	addDebugBoundingBox(
		position: THREE.Vector3,
		size: THREE.Vector3,
		color: number
	) {
		const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
		const edges = new THREE.EdgesGeometry(geometry);
		const line = new THREE.LineSegments(
			edges,
			new THREE.LineBasicMaterial({ color: color })
		);
		line.position.copy(position);
		this.scene.add(line);
	}

	addDebugText(
		text: string,
		position: THREE.Vector3,
		color: number = 0x000000,
		backgroundColor: number = 0xffffff
	) {
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (context) {
			context.font = "Bold 40px Arial";
			context.fillStyle = "rgba(" + backgroundColor + ", 1)";
			context.fillRect(0, 0, context.measureText(text).width, 50);
			context.fillStyle = "rgba(" + color + ", 1)";
			context.fillText(text, 0, 40);
		}
		const texture = new THREE.CanvasTexture(canvas);
		const material = new THREE.SpriteMaterial({
			map: texture,
			transparent: true,
		});
		const sprite = new THREE.Sprite(material);
		sprite.position.copy(position);
		sprite.scale.set(5, 2, 1);
		this.scene.add(sprite);
	}

	getPerspectiveCamera() {
		const d = 20;
		const fov = 75;
		const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
		const near = 0.1;
		const far = 1000;
		const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
		camera.position.set(d, 3 * d, d);
		camera.lookAt(0, 0, 0);
		return camera;
	}

	getIsometricCamera() {
		const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
		const d = 20;
		const camera = new THREE.OrthographicCamera(
			-d * aspect,
			d * aspect,
			d,
			-d,
			1,
			1000
		);
		camera.position.set(d, d, d);
		return camera;
	}

	setBackgroundColor(color: string, alpha: number = 1) {
		this.renderer.setClearColor(color, alpha);
	}

	createCamera() {
		return this.getPerspectiveCamera();
		// return this.getIsometricCamera();
	}

	getGridHelper() {
		const size = 100;
		const divisions = size;
		const gridHelper = new THREE.GridHelper(size, divisions);
		gridHelper.name = "GridHelper";
		return gridHelper;
	}

	addGrid() {
		const gridHelper = this.getGridHelper();
		this.scene.add(gridHelper);
	}

	removeGrid() {
		const gridHelper = this.scene.getObjectByName("GridHelper");
		if (gridHelper) {
			this.scene.remove(gridHelper);
		}
	}

	toggleGrid() {
		if (this.scene.getObjectByName("GridHelper")) {
			this.removeGrid();
		} else {
			this.addGrid();
		}
	}

	setupScene(_options: any) {
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.createLights();

		// const hbaoEffect = new HBAOEffect(this.composer, this.camera, this.scene);
		const ssaoEffect = new SSAOEffect(this.composer, this.camera, this.scene);
		const smaaEffect = new POSTPROCESSING.SMAAEffect();
		const effectPass = new POSTPROCESSING.EffectPass(
			this.camera,
			ssaoEffect,
			smaaEffect
		);

		this.composer.addPass(effectPass);
	}

	createLights() {
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
		ambientLight.intensity = 0.9;
		this.scene.add(ambientLight);

		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
		directionalLight.position.set(20, 20, -20);
		directionalLight.intensity = 1;
		directionalLight.castShadow = true;
		directionalLight.shadow.bias = -0.01;
		this.scene.add(directionalLight);
	}

	render() {
		this.composer.render();
	}

	animate() {
		requestAnimationFrame(() => this.animate());
		this.controls.update();
		this.render();
	}

	takeScreenshot(resolutionX: number, resolutionY: number) {
		const oldCanvasWidth = this.canvas.clientWidth;
		const oldCanvasHeight = this.canvas.clientHeight;
		const tempCamera = this.camera.clone();
		// if the camera is orthographic we need to set the aspect ratio manually
		if (tempCamera instanceof THREE.OrthographicCamera) {
			const aspect = resolutionX / resolutionY;
			tempCamera.left = -aspect;
			tempCamera.right = aspect;
			tempCamera.top = 1;
			tempCamera.bottom = -1;
		} else {
			tempCamera.aspect = resolutionX / resolutionY;
		}
		tempCamera.updateProjectionMatrix();
		this.renderer.setSize(resolutionX, resolutionY);
		this.composer.render();
		const screenshot = this.renderer.domElement.toDataURL();
		this.renderer.setSize(oldCanvasWidth, oldCanvasHeight);
		this.composer.render();
		return screenshot;
	}

	takeRotationWebM(
		resolutionX: number,
		resolutionY: number,
		centerPosition: THREE.Vector3,
		distance: number,
		elevation: number,
		frameRate: number,
		duration: number,
		angle: number = 360
	): Promise<Blob> {
		const angleRad = (angle * Math.PI) / 180;
		// compute the start angle based on the camera position
		const startAngle = Math.atan2(
			this.camera.position.z - centerPosition.z,
			this.camera.position.x - centerPosition.x
		);
		const oldCanvasWidth = this.canvas.clientWidth;
		const oldCanvasHeight = this.canvas.clientHeight;

		this.renderer.setSize(resolutionX, resolutionY);
		const frames = Math.floor(frameRate * duration);
		const step = angleRad / frames;
		const videoWriter = new WebMWriter({
			frameRate: frameRate,
			quality: 1,
			transparent: true,
		});

		return new Promise((resolve, reject) => {
			const renderStep = (i: number) => {
				requestAnimationFrame(() => {
					const currentAngle = step * i;
					this.camera.position.set(
						centerPosition.x + distance * Math.cos(currentAngle + startAngle),
						centerPosition.y + distance * Math.sin(elevation),
						centerPosition.z + distance * Math.sin(currentAngle + startAngle)
					);
					this.camera.lookAt(centerPosition);
					this.composer.render();
					const tempContext = this.canvas.getContext("2d");
					tempContext?.clearRect(0, 0, resolutionX, resolutionY);
					tempContext?.drawImage(this.renderer.domElement, 0, 0);
					videoWriter.addFrame(this.canvas);
					if (i < frames) {
						renderStep(i + 1);
					} else {
						this.renderer.setSize(oldCanvasWidth, oldCanvasHeight);
						this.composer.render();
						videoWriter
							.complete()
							.then((blob: Blob) => {
								resolve(blob); // Resolve with the Blob directly
							})
							.catch(reject);
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

	updateZoom(value: number) {
		this.camera.zoom = value;
		this.camera.updateProjectionMatrix();
	}
}
