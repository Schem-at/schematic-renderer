// Renderer.ts
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
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
		const d = 5;
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
		ambientLight.intensity = 1.5;
		this.scene.add(ambientLight);

		const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
		directionalLight.position.set(20, 20, -20);
		directionalLight.intensity = 3;
		directionalLight.castShadow = true;
		directionalLight.shadow.bias = -0.01;
		this.scene.add(directionalLight);

		const directionalLightHelper = new THREE.DirectionalLightHelper(
			directionalLight
		);
		this.scene.add(directionalLightHelper);
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
}
