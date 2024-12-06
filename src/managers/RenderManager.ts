// managers/RenderManager.ts
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass } from "postprocessing";
import { SMAAEffect } from "postprocessing";
// @ts-ignore
import { SSAOEffect } from "realism-effects";
import { GammaCorrectionEffect } from "../effects/GammaCorrectionEffect";
import { EventEmitter } from "events";
import { SchematicRenderer } from "../SchematicRenderer";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

export class RenderManager {
	private schematicRenderer: SchematicRenderer;
	public renderer: THREE.WebGLRenderer;
	private composer: EffectComposer;
	private passes: Map<string, any> = new Map();
	// @ts-ignore
	private eventEmitter: EventEmitter;

	private pmremGenerator: THREE.PMREMGenerator;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.eventEmitter = this.schematicRenderer.eventEmitter;

		this.renderer = new THREE.WebGLRenderer({
			canvas: this.schematicRenderer.canvas,
			alpha: true,
			antialias: true,
		});
		this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
		this.renderer.setSize(
			this.schematicRenderer.canvas.clientWidth,
			this.schematicRenderer.canvas.clientHeight
		);
		this.renderer.setPixelRatio(window.devicePixelRatio);

		this.composer = new EffectComposer(this.renderer);

		// Add the initial RenderPass
		const renderPass = new RenderPass(
			this.schematicRenderer.sceneManager.scene,
			this.schematicRenderer.cameraManager.activeCamera.camera
		);
		this.composer.addPass(renderPass);
		this.passes.set("renderPass", renderPass);

		//set the background color to black
		this.renderer.setClearColor(0x000000);

		// Initialize default post-processing passes
		this.initDefaultPasses(this.schematicRenderer.options);
			
		// Listen for camera changes
		this.setupEventListeners();
		if (this.schematicRenderer.options?.hdri !== undefined && this.schematicRenderer.options.hdri !== "") {
			this.setupHDRIBackground(this.schematicRenderer.options.hdri);
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
					this.schematicRenderer.sceneManager.scene.background = backgroundTexture.texture;
				} else {
					// Use HDRI for both background and environment lighting
					this.schematicRenderer.sceneManager.scene.environment = envMap;
					this.schematicRenderer.sceneManager.scene.background = envMap;
				}

				this.pmremGenerator.dispose();
			},
			undefined,
			(error) => {
				console.error("An error occurred while loading the HDRI:", error);
			}
		);
	}

	private initDefaultPasses(options: any) {
		// Gamma Correction Effect
		const gammaCorrectionEffect = new GammaCorrectionEffect(
			options.gamma ?? 0.5
		);
		this.passes.set("gammaCorrection", gammaCorrectionEffect);

		// SMAA Effect
		const smaaEffect = new SMAAEffect();
		this.passes.set("smaa", smaaEffect);

		// SSAO Effect
		const ssaoEffect = new SSAOEffect(
			this.composer,
			this.schematicRenderer.cameraManager.activeCamera.camera,
			this.schematicRenderer.sceneManager.scene
		);
		this.passes.set("ssao", ssaoEffect);

		// Create an EffectPass with the added effects
		const effectPass = new EffectPass(
			this.schematicRenderer.cameraManager.activeCamera.camera,
			gammaCorrectionEffect,
			smaaEffect,
			ssaoEffect
		);
		effectPass.renderToScreen = true;
		this.composer.addPass(effectPass);
		this.passes.set("effectPass", effectPass);
	}

	private setupEventListeners() {
		window.addEventListener("resize", () => {
			const canvas = this.schematicRenderer.canvas;
			const parent = canvas.parentElement;
			
			if (parent) {
				// Only resize if we're not currently recording
				if (!this.schematicRenderer.cameraManager.recordingManager.isRecording) {
					const width = parent.clientWidth;
					const height = parent.clientHeight;
	
					canvas.style.width = width + "px";
					canvas.style.height = height + "px";
					this.renderer.setSize(width, height, false);
					this.composer.setSize(width, height);
	
					// Update the camera aspect ratio
					const camera = this.schematicRenderer.cameraManager.activeCamera.camera as THREE.PerspectiveCamera;
					camera.aspect = width / height;
					camera.updateProjectionMatrix();
				}
			}
		});
	}

	public enableEffect(effectName: string) {
		const effect = this.passes.get(effectName);
		if (effect) {
			effect.enabled = true;
		}
	}

	public disableEffect(effectName: string) {
		const effect = this.passes.get(effectName);
		if (effect) {
			effect.enabled = false;
		}
	}

	public setGamma(value: number) {
		const gammaEffect = this.passes.get("gammaCorrection");
		if (gammaEffect) {
			gammaEffect.setGamma(value);
		}
	}

	public setSSAOParameters(params: any) {
		const ssaoEffect = this.passes.get("ssao");
		if (ssaoEffect) {
			Object.assign(ssaoEffect, params);
		}
	}

	private isRendering: boolean = false;

public render(): void {
    if (this.isRendering) return;
    
    try {
        this.isRendering = true;
        this.composer.render();
    } finally {
        this.isRendering = false;
    }
}

	public resize(width: number, height: number) {
		this.renderer.setSize(width, height);
		this.composer.setSize(width, height);
	}

	public updateCamera(camera: THREE.Camera) {
		// Update the camera in the RenderPass
		const renderPass = this.passes.get("renderPass");
		if (renderPass) {
			renderPass.camera = camera;
		}

		// Update the camera in the EffectPass
		const effectPass = this.passes.get("effectPass");
		if (effectPass) {
			effectPass.camera = camera;
		}

		// Update camera in SSAOEffect
		const ssaoEffect = this.passes.get("ssao");
		if (ssaoEffect && ssaoEffect.setCamera) {
			ssaoEffect.setCamera(camera);
		}
	}

	public getRenderer(): THREE.WebGLRenderer {
		return this.renderer;
	}

	public getEffect(effectName: string): any {
		return this.passes.get(effectName);
	}
}
