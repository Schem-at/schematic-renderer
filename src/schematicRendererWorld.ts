import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FlyControls } from "three/examples/jsm/controls/FlyControls.js";
// @ts-ignore
import GIF from "gif.js.optimized";
// @ts-ignore
import WebMWriter from "webm-writer";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import * as POSTPROCESSING from "postprocessing";
import { GammaCorrectionEffect } from "./effects/GammaCorrectionEffect";

// @ts-ignore
import { SSAOEffect } from "realism-effects";

import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { SchematicWrapper } from "./wasm/minecraft_schematic_utils";
import { HighlightManager } from "./managers/HighlightManager";
import { SceneManager } from "./managers/SceneManager";
import { CameraManager } from "./managers/CameraManager";
import { InteractionManager } from "./managers/InteractionManager";

interface Light {
	id: string;
	type: "ambient" | "directional" | "point" | "spot";
	light: THREE.Light;
}

export class SchematicRendererWorld {
	private schematicRenderer: SchematicRenderer;
	private clock: THREE.Clock;
	annotations: { [key: string]: { mesh: THREE.Mesh; label: THREE.Sprite } } =
		{};

	hoverHighlight: THREE.Mesh | null = null;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.canvas = this.schematicRenderer.canvas;
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
		const deltaTime = this.clock.getDelta();
		this.controls.update();
		this.highlightManager.update(deltaTime);
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
		elevationAngle: number,
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
						centerPosition.y + distance * Math.sin(elevationAngle),
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
