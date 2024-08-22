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

import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

class GammaCorrectionEffect extends POSTPROCESSING.Effect {
	constructor(gamma = 0.6) {
		super(
			"GammaCorrectionEffect",
			`
            uniform float gamma;

            void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
				if (gamma == 0.0) {
					outputColor = inputColor;
					return;
				}
                vec3 color = pow(inputColor.rgb, vec3(1.0 / gamma));
                outputColor = vec4(color, inputColor.a);
            }
        `,
			{
				blendFunction: POSTPROCESSING.BlendFunction.NORMAL,
				uniforms: new Map([["gamma", new THREE.Uniform(gamma)]]),
			}
		);
	}

	setGamma(value: number) {
		this.uniforms.get("gamma")!.value = value;
	}
}

interface Light {
	id: string;
	type: "ambient" | "directional" | "point" | "spot";
	light: THREE.Light;
}

export class Renderer {
	canvas: HTMLCanvasElement;
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
	controls: OrbitControls;
	composer: POSTPROCESSING.EffectComposer;
	schematics: { [key: string]: any } = {};
	gammaCorrectionEffect: GammaCorrectionEffect;
	lights: Light[] = [];
	pmremGenerator: THREE.PMREMGenerator;

	constructor(canvas: HTMLCanvasElement, options: any) {
		this.canvas = canvas;
		this.renderer = new THREE.WebGLRenderer({
			// antialias: true,
			depth: false,
			canvas: this.canvas,
			alpha: true,
		});
		this.gammaCorrectionEffect = new GammaCorrectionEffect(0.6);
		this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
		this.scene = new THREE.Scene();
		this.camera = this.createCamera();
		this.controls = new OrbitControls(this.camera, this.canvas);
		// this.controls = new FlyControls(this.camera, this.canvas);

		this.composer = new POSTPROCESSING.EffectComposer(this.renderer);
		this.composer.addPass(
			new POSTPROCESSING.RenderPass(this.scene, this.camera)
		);
		this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
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

	setupHDRIBackground(hdriPath: string, backgroundOnly: boolean = true) {
		const hdriLoader = new RGBELoader();
		hdriLoader.load(
			hdriPath,
			(texture) => {
				const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
				texture.dispose();

				if (backgroundOnly) {
					// Use HDRI as background only
					const backgroundTexture = new THREE.WebGLCubeRenderTarget(
						1024
					).fromEquirectangularTexture(this.renderer, texture);
					this.scene.background = backgroundTexture.texture;
				} else {
					// Use HDRI for both background and environment lighting
					this.scene.environment = envMap;
					this.scene.background = envMap;
				}

				this.pmremGenerator.dispose();
			},
			undefined,
			(error) => {
				console.error("An error occurred while loading the HDRI:", error);
			}
		);
	}

	setupScene(_options: any) {
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.createLights();

		this.setupHDRIBackground("/hdr/minecraft_day.hdr");

		const ssaoEffect = new SSAOEffect(this.composer, this.camera, this.scene);
		const smaaEffect = new POSTPROCESSING.SMAAEffect();
		const effectPass = new POSTPROCESSING.EffectPass(
			this.camera,
			ssaoEffect,
			smaaEffect,
			this.gammaCorrectionEffect
		);

		this.composer.addPass(effectPass);
	}

	updateGammaCorrection(value: number) {
		this.gammaCorrectionEffect.setGamma(value);
	}

	createLights() {
		// Create default ambient light
		this.addLight("ambient", { color: 0xffffff, intensity: 2 });

		// Create default directional light
		this.addLight("directional", {
			color: 0xffffff,
			intensity: 1,
			position: new THREE.Vector3(20, 20, -20),
			castShadow: true,
		});
	}

	addLight(
		type: "ambient" | "directional" | "point" | "spot",
		options: any
	): string {
		let light: THREE.Light;
		const id = `light_${this.lights.length}`;

		switch (type) {
			case "ambient":
				light = new THREE.AmbientLight(options.color, options.intensity);
				break;
			case "directional":
				light = new THREE.DirectionalLight(options.color, options.intensity);
				if (options.position)
					(light as THREE.DirectionalLight).position.copy(options.position);
				if (options.castShadow)
					(light as THREE.DirectionalLight).castShadow = true;
				break;
			case "point":
				light = new THREE.PointLight(
					options.color,
					options.intensity,
					options.distance,
					options.decay
				);
				if (options.position)
					(light as THREE.PointLight).position.copy(options.position);
				break;
			case "spot":
				light = new THREE.SpotLight(
					options.color,
					options.intensity,
					options.distance,
					options.angle,
					options.penumbra,
					options.decay
				);
				if (options.position)
					(light as THREE.SpotLight).position.copy(options.position);
				break;
		}

		this.scene.add(light);
		this.lights.push({ id, type, light });
		return id;
	}

	removeLight(id: string) {
		const index = this.lights.findIndex((light) => light.id === id);
		if (index !== -1) {
			const { light } = this.lights[index];
			this.scene.remove(light);
			this.lights.splice(index, 1);
		}
	}

	updateLight(id: string, options: any) {
		const light = this.lights.find((light) => light.id === id);
		if (light) {
			if (options.color) light.light.color.set(options.color);
			if (options.intensity !== undefined)
				light.light.intensity = options.intensity;

			if (
				light.type === "directional" ||
				light.type === "point" ||
				light.type === "spot"
			) {
				if (options.position)
					(
						light.light as
							| THREE.DirectionalLight
							| THREE.PointLight
							| THREE.SpotLight
					).position.copy(options.position);
			}

			if (light.type === "point" || light.type === "spot") {
				if (options.distance !== undefined)
					(light.light as THREE.PointLight | THREE.SpotLight).distance =
						options.distance;
				if (options.decay !== undefined)
					(light.light as THREE.PointLight | THREE.SpotLight).decay =
						options.decay;
			}

			if (light.type === "spot") {
				if (options.angle !== undefined)
					(light.light as THREE.SpotLight).angle = options.angle;
				if (options.penumbra !== undefined)
					(light.light as THREE.SpotLight).penumbra = options.penumbra;
			}
		}
	}

	getLights(): Light[] {
		return this.lights;
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
			quality: 0.9,
			// transparent: true,
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
