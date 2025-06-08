// managers/RenderManager.ts
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass } from "postprocessing";
import { SMAAEffect } from "postprocessing";
// @ts-ignore
import { N8AOPostPass } from "n8ao";
import { GammaCorrectionEffect } from "../effects/GammaCorrectionEffect";
import { EventEmitter } from "events";
import { SchematicRenderer } from "../SchematicRenderer";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

export class RenderManager {
	private schematicRenderer: SchematicRenderer;
	public renderer!: THREE.WebGLRenderer;
	private composer!: EffectComposer;
	private passes: Map<string, any> = new Map();
	private eventEmitter: EventEmitter;
	private pmremGenerator!: THREE.PMREMGenerator;
	private isRendering: boolean = false;
	private hdriPath: string | null = null;
	private hdriBackgroundOnly: boolean = true;
	private currentEnvMap: THREE.Texture | null = null;
	private disposed: boolean = false;
	private contextLost: boolean = false;
	private initialSizeSet: boolean = false;
	private resizeTimeout: number | null = null;
	private renderRequested: boolean = false;

	// HDRI backup for camera switching
	private originalBackground: THREE.Texture | THREE.Color | null = null;
	private isometricBackground: THREE.Color;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.eventEmitter = this.schematicRenderer.eventEmitter;

		// Create a pleasant background color for isometric view
		this.isometricBackground = new THREE.Color(0x87ceeb); // Sky blue

		this.setInitialSize();
		this.initRenderer();
		this.initComposer();
		this.initDefaultPasses(this.schematicRenderer.options);
		this.setupEventListeners();
		this.updateCanvasSize();

		if (
			this.schematicRenderer.options?.hdri !== undefined &&
			this.schematicRenderer.options.hdri !== ""
		) {
			this.setupHDRIBackground(this.schematicRenderer.options.hdri);
		}

		// Listen for camera changes to handle HDRI switching
		this.schematicRenderer.cameraManager.on("cameraChanged", (event) => {
			this.handleCameraChange(event.newCamera);
		});
	}

	private setInitialSize(): void {
		const canvas = this.schematicRenderer.canvas;
		const parent = canvas.parentElement;

		if (!parent) {
			console.warn("Canvas parent element not found");
			return;
		}

		const rect = parent.getBoundingClientRect();
		const width = rect.width;
		const height = rect.height;

		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		canvas.width = width * window.devicePixelRatio;
		canvas.height = height * window.devicePixelRatio;

		this.initialSizeSet = true;
	}

	private initRenderer(): void {
		this.renderer = new THREE.WebGLRenderer({
			canvas: this.schematicRenderer.canvas,
			alpha: true,
			antialias: true,
			powerPreference: "high-performance",
			preserveDrawingBuffer: true,
		});

		if (this.initialSizeSet) {
			const parent = this.schematicRenderer.canvas.parentElement;
			if (parent) {
				const width = parent.clientWidth;
				const height = parent.clientHeight;
				this.renderer.setSize(width, height, false);
			}
		}

		this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
		this.renderer.setPixelRatio(window.devicePixelRatio);
	}

	private initComposer(): void {
		this.composer = new EffectComposer(this.renderer);
		const renderPass = new RenderPass(
			this.schematicRenderer.sceneManager.scene,
			this.schematicRenderer.cameraManager.activeCamera.camera
		);
		this.composer.addPass(renderPass);
		this.passes.set("renderPass", renderPass);
	}

	/**
	 * Handle camera type changes to manage HDRI background appropriately
	 */
	private handleCameraChange(cameraType: string): void {
		const scene = this.schematicRenderer.sceneManager.scene;

		if (cameraType === "isometric") {
			// Store the current background if it's HDRI
			if (scene.background && scene.background instanceof THREE.Texture) {
				this.originalBackground = scene.background;
			}
			// Switch to solid color background for isometric view
			scene.background = this.isometricBackground;

			console.log("Switched to isometric background");
		} else {
			// Restore HDRI background for perspective cameras
			if (this.originalBackground) {
				scene.background = this.originalBackground;
				console.log("Restored HDRI background");
			}
		}
	}

	/**
	 * Check if current camera is orthographic (isometric)
	 */
	private isOrthographicCamera(): boolean {
		const activeCamera =
			this.schematicRenderer.cameraManager.activeCamera.camera;
		return activeCamera instanceof THREE.OrthographicCamera;
	}

	public setupHDRIBackground(
		hdriPath: string,
		backgroundOnly: boolean = true
	): void {
		this.hdriPath = hdriPath;
		this.hdriBackgroundOnly = backgroundOnly;

		this.loadHDRI(hdriPath, backgroundOnly);

		const canvas = this.renderer.domElement;
		canvas.removeEventListener("webglcontextlost", this.handleContextLost);
		canvas.removeEventListener(
			"webglcontextrestored",
			this.handleContextRestored
		);
		canvas.addEventListener("webglcontextlost", this.handleContextLost, false);
		canvas.addEventListener(
			"webglcontextrestored",
			this.handleContextRestored,
			false
		);
	}

	private isPMREMGeneratorDisposed(): boolean {
		return (
			!this.pmremGenerator ||
			(this.pmremGenerator as any)._blurMaterial === null
		);
	}

	private loadHDRI(hdriPath: string, backgroundOnly: boolean): void {
		const hdriLoader = new RGBELoader();

		hdriLoader.load(
			hdriPath,
			(texture) => {
				if (this.disposed) {
					texture.dispose();
					return;
				}

				if (this.isPMREMGeneratorDisposed()) {
					this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
				}

				const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
				this.currentEnvMap = envMap;
				texture.dispose();

				if (backgroundOnly) {
					const backgroundTexture = new THREE.WebGLCubeRenderTarget(
						1024
					).fromEquirectangularTexture(this.renderer, texture);

					// Only set HDRI background if not in isometric mode
					if (!this.isOrthographicCamera()) {
						this.schematicRenderer.sceneManager.scene.background =
							backgroundTexture.texture;
						// Store as original background for camera switching
						this.originalBackground = backgroundTexture.texture;
					} else {
						// Store for later use when switching back to perspective
						this.originalBackground = backgroundTexture.texture;
						// Keep isometric background
						this.schematicRenderer.sceneManager.scene.background =
							this.isometricBackground;
					}
				} else {
					this.schematicRenderer.sceneManager.scene.environment = envMap;
					if (!this.isOrthographicCamera()) {
						this.schematicRenderer.sceneManager.scene.background = envMap;
						this.originalBackground = envMap;
					} else {
						this.originalBackground = envMap;
						this.schematicRenderer.sceneManager.scene.background =
							this.isometricBackground;
					}
				}

				this.pmremGenerator.dispose();
				this.eventEmitter.emit("hdriLoaded", { path: hdriPath });
			},
			(progress) => {
				this.eventEmitter.emit("hdriProgress", {
					loaded: progress.loaded,
					total: progress.total,
				});
			},
			(error) => {
				console.error("HDRI loading failed:", error);
				this.eventEmitter.emit("hdriError", { error });
			}
		);
	}

	/**
	 * Set the background color for isometric view
	 */
	public setIsometricBackgroundColor(color: THREE.ColorRepresentation): void {
		this.isometricBackground.set(color);

		// If currently in isometric mode, update the scene background immediately
		if (this.isOrthographicCamera()) {
			this.schematicRenderer.sceneManager.scene.background =
				this.isometricBackground;
		}
	}

	/**
	 * Get the current isometric background color
	 */
	public getIsometricBackgroundColor(): THREE.Color {
		return this.isometricBackground.clone();
	}

	private handleContextLost = (event: Event): void => {
		event.preventDefault();
		this.contextLost = true;
		this.isRendering = false;
		console.log("WebGL context lost. Suspending render operations...");
		this.eventEmitter.emit("webglContextLost");
	};

	private handleContextRestored = async (): Promise<void> => {
		console.log("WebGL context restored. Reinitializing renderer...");

		try {
			await new Promise((resolve) => setTimeout(resolve, 300));

			this.contextLost = false;

			this.initRenderer();
			this.initComposer();
			this.initDefaultPasses(this.schematicRenderer.options);
			this.updateCanvasSize();

			if (this.hdriPath) {
				await new Promise((resolve) => setTimeout(resolve, 100));
				this.loadHDRI(this.hdriPath, this.hdriBackgroundOnly);
			}

			this.eventEmitter.emit("webglContextRestored");

			requestAnimationFrame(() => {
				if (!this.contextLost) {
					this.render();
				}
			});
		} catch (error) {
			console.error("Error during context restoration:", error);
			this.eventEmitter.emit("webglContextError", { error });
		}
	};

	private initDefaultPasses(options: any): void {
		const gammaCorrectionEffect = new GammaCorrectionEffect(
			options.gamma ?? 0.5
		);
		this.passes.set("gammaCorrection", gammaCorrectionEffect);

		const smaaEffect = new SMAAEffect();
		this.passes.set("smaa", smaaEffect);

		try {
			const parent = this.schematicRenderer.canvas.parentElement;
			const width = parent ? parent.clientWidth : window.innerWidth;
			const height = parent ? parent.clientHeight : window.innerHeight;

			const n8aoPass = new N8AOPostPass(
				this.schematicRenderer.sceneManager.scene,
				this.schematicRenderer.cameraManager.activeCamera.camera,
				width,
				height
			) as any;

			n8aoPass.configuration.aoRadius = 1.0;
			n8aoPass.configuration.distanceFalloff = 0.4;
			n8aoPass.configuration.intensity = 5.0;
			n8aoPass.configuration.gammaCorrection = false;
			n8aoPass.setQualityMode("Medium");

			this.passes.set("ssao", n8aoPass);
			this.composer.addPass(n8aoPass);

			console.log("N8AO SSAO enabled successfully");
		} catch (error) {
			console.warn("Failed to initialize N8AO SSAO:", error);
		}

		const effectPass = new EffectPass(
			this.schematicRenderer.cameraManager.activeCamera.camera,
			gammaCorrectionEffect,
			smaaEffect
		);
		effectPass.renderToScreen = true;
		this.composer.addPass(effectPass);
		this.passes.set("effectPass", effectPass);
	}

	private setupEventListeners(): void {
		window.addEventListener("resize", () => {
			if (this.resizeTimeout) {
				window.cancelAnimationFrame(this.resizeTimeout);
			}
			this.resizeTimeout = window.requestAnimationFrame(() => {
				this.updateCanvasSize();
				this.resizeTimeout = null;
			});
		});
	}

	public updateCanvasSize(): void {
		const canvas = this.schematicRenderer.canvas;
		const parent = canvas.parentElement;
		if (!parent) return;

		const width = parent.clientWidth;
		const height = parent.clientHeight;

		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;

		if (!this.contextLost) {
			this.renderer.setSize(width, height, false);
			this.composer.setSize(width, height);

			const camera = this.schematicRenderer.cameraManager.activeCamera
				.camera as THREE.PerspectiveCamera;
			camera.aspect = width / height;
			camera.updateProjectionMatrix();

			const ssaoPass = this.passes.get("ssao");
			if (ssaoPass && ssaoPass.setSize) {
				const dpr = this.renderer.getPixelRatio();
				ssaoPass.setSize(width * dpr, height * dpr);
			}
		}
	}

	public enableEffect(effectName: string): void {
		const effect = this.passes.get(effectName);
		if (effect) {
			effect.enabled = true;
		}
	}

	public disableEffect(effectName: string): void {
		const effect = this.passes.get(effectName);
		if (effect) {
			effect.enabled = false;
		}
	}

	public setGamma(value: number): void {
		const gammaEffect = this.passes.get("gammaCorrection");
		if (gammaEffect) {
			gammaEffect.setGamma(value);
		}
	}

	public setSSAOParameters(params: {
		aoRadius?: number;
		distanceFalloff?: number;
		intensity?: number;
		qualityMode?: "Performance" | "Low" | "Medium" | "High" | "Ultra";
	}): void {
		const ssaoEffect = this.passes.get("ssao");
		if (ssaoEffect && ssaoEffect.configuration) {
			if (params.aoRadius !== undefined) {
				ssaoEffect.configuration.aoRadius = params.aoRadius;
			}
			if (params.distanceFalloff !== undefined) {
				ssaoEffect.configuration.distanceFalloff = params.distanceFalloff;
			}
			if (params.intensity !== undefined) {
				ssaoEffect.configuration.intensity = params.intensity;
			}
			if (params.qualityMode !== undefined) {
				ssaoEffect.setQualityMode(params.qualityMode);
			}
		}
	}

	public renderSingleFrameAndGetStats(): {
		renderTimeMs: number;
		rendererInfo: THREE.WebGLInfo | null;
	} {
		if (this.isRendering || this.contextLost || this.disposed) {
			console.warn(
				"[RenderManager] Attempted renderSingleFrameAndGetStats while busy, context lost, or disposed."
			);
			return { renderTimeMs: 0, rendererInfo: null };
		}

		const scene = this.schematicRenderer.sceneManager.scene;
		const camera = this.schematicRenderer.cameraManager.activeCamera.camera;
		const renderer = this.renderer;

		if (!renderer || !scene || !camera) {
			console.error(
				"[RenderManager] Renderer, scene, or camera not available for renderSingleFrameAndGetStats."
			);
			return { renderTimeMs: 0, rendererInfo: renderer ? renderer.info : null };
		}

		const gl = renderer.getContext();
		if (!gl || gl.isContextLost()) {
			console.warn(
				"[RenderManager] Attempted to render with lost WebGL context for stats."
			);
			this.contextLost = true;
			return { renderTimeMs: 0, rendererInfo: renderer.info };
		}

		const renderStartTime = performance.now();
		try {
			this.isRendering = true;
			this.composer.render();
		} catch (error) {
			console.error(
				"[RenderManager] Error during renderSingleFrameAndGetStats:",
				error
			);
			this.eventEmitter.emit("renderError", { error });
			return {
				renderTimeMs: performance.now() - renderStartTime,
				rendererInfo: renderer.info,
			};
		} finally {
			this.isRendering = false;
		}
		const renderTimeMs = performance.now() - renderStartTime;

		return { renderTimeMs, rendererInfo: renderer.info };
	}

	public render(): void {
		if (this.isRendering || this.contextLost || this.disposed) return;

		try {
			this.isRendering = true;

			const gl = this.renderer.getContext();
			if (!gl || gl.isContextLost()) {
				console.warn("Attempted to render with lost WebGL context");
				this.contextLost = true;
				return;
			}

			this.composer.render();
		} catch (error) {
			console.error("Render error:", error);
			this.eventEmitter.emit("renderError", { error });
		} finally {
			this.isRendering = false;
		}
	}

	public requestRender(): void {
		if (!this.renderRequested && !this.contextLost && !this.disposed) {
			this.renderRequested = true;
			requestAnimationFrame(() => {
				if (!this.contextLost && !this.disposed) {
					this.render();
				}
				this.renderRequested = false;
			});
		}
	}

	public resize(width: number, height: number): void {
		if (this.contextLost) return;

		this.renderer.setSize(width, height, false);
		this.composer.setSize(width, height);

		const camera = this.schematicRenderer.cameraManager.activeCamera
			.camera as THREE.PerspectiveCamera;
		camera.aspect = width / height;
		camera.updateProjectionMatrix();

		const ssaoPass = this.passes.get("ssao");
		if (ssaoPass && ssaoPass.setSize) {
			ssaoPass.setSize(width, height);
		}
	}

	public updateCamera(camera: THREE.Camera): void {
		const renderPass = this.passes.get("renderPass");
		if (renderPass) {
			renderPass.camera = camera;
		}

		const effectPass = this.passes.get("effectPass");
		if (effectPass) {
			effectPass.camera = camera;
		}

		const ssaoEffect = this.passes.get("ssao");
		if (ssaoEffect && ssaoEffect.camera) {
			ssaoEffect.camera = camera;
		}
	}

	public getRenderer(): THREE.WebGLRenderer {
		return this.renderer;
	}

	public getEffect(effectName: string): any {
		return this.passes.get(effectName);
	}

	public dispose(): void {
		this.disposed = true;
		this.contextLost = true;

		if (this.resizeTimeout !== null) {
			window.cancelAnimationFrame(this.resizeTimeout);
			this.resizeTimeout = null;
		}

		window.removeEventListener("resize", this.updateCanvasSize);
		const canvas = this.renderer.domElement;
		canvas.removeEventListener("webglcontextlost", this.handleContextLost);
		canvas.removeEventListener(
			"webglcontextrestored",
			this.handleContextRestored
		);

		this.passes.forEach((pass) => {
			if (pass.dispose) pass.dispose();
		});
		this.passes.clear();

		if (this.composer) {
			this.composer.dispose();
		}

		if (this.pmremGenerator && !this.isPMREMGeneratorDisposed()) {
			this.pmremGenerator.dispose();
		}

		if (this.currentEnvMap) {
			this.currentEnvMap.dispose();
		}

		this.renderer.dispose();
	}
}
