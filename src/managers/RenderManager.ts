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

// WebGPU imports (conditional - loaded dynamically)
let WebGPURenderer: any = null;
// @ts-expect-error Reserved for future WebGPU post-processing support
let _PostProcessing: any = null;
let Inspector: any = null;

// Type for renderer that can be either WebGL or WebGPU
type AnyRenderer = THREE.WebGLRenderer | any; // WebGPURenderer type

export class RenderManager {
	private schematicRenderer: SchematicRenderer;
	public renderer!: AnyRenderer;
	private composer!: EffectComposer | null;
	// @ts-expect-error Reserved for future WebGPU post-processing support
	private _postProcessing: any = null;
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

	// WebGPU state
	private _isWebGPU: boolean = false;
	// @ts-expect-error Reserved for future use
	private _webgpuInitialized: boolean = false;
	private inspector: any = null;

	// HDRI backup for camera switching
	private originalBackground: THREE.Texture | THREE.Color | null = null;
	private isometricBackground: THREE.Color;

	// SSAO presets for different camera modes
	private ssaoPresets = {
		perspective: {
			aoRadius: 1.0,
			distanceFalloff: 0.4,
			intensity: 5.0,
		},
		isometric: {
			aoRadius: 0.3,
			distanceFalloff: 0.1,
			intensity: 0.8,
		},
	};

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.eventEmitter = this.schematicRenderer.eventEmitter;

		// Create a pleasant background color for isometric view
		this.isometricBackground = new THREE.Color(0x87ceeb); // Sky blue

		// Apply custom SSAO presets from options if provided
		const customSSAOPresets = schematicRenderer.options?.postProcessingOptions?.ssaoPresets;
		if (customSSAOPresets) {
			if (customSSAOPresets.perspective) {
				this.ssaoPresets.perspective = {
					...this.ssaoPresets.perspective,
					...customSSAOPresets.perspective,
				};
			}
			if (customSSAOPresets.isometric) {
				this.ssaoPresets.isometric = {
					...this.ssaoPresets.isometric,
					...customSSAOPresets.isometric,
				};
			}
		}

		this.setInitialSize();
	}

	/**
	 * Async initialization - must be called after constructor
	 */
	public async initialize(): Promise<void> {
		const webgpuOptions = this.schematicRenderer.options.webgpuOptions;
		const preferWebGPU = webgpuOptions?.preferWebGPU ?? false;
		const forceWebGPU = webgpuOptions?.forceWebGPU ?? false;

		if (preferWebGPU || forceWebGPU) {
			const webgpuAvailable = await this.checkWebGPUSupport();

			if (webgpuAvailable || forceWebGPU) {
				try {
					await this.initWebGPURenderer();
					this._isWebGPU = true;
					console.log('%c[RenderManager] WebGPU Renderer initialized', 'color: #4caf50; font-weight: bold');
				} catch (error) {
					console.warn('[RenderManager] WebGPU initialization failed, falling back to WebGL:', error);
					this.initWebGLRenderer();
				}
			} else {
				console.log('[RenderManager] WebGPU not available, using WebGL');
				this.initWebGLRenderer();
			}
		} else {
			this.initWebGLRenderer();
		}

		this.setupEventListeners();
		this.updateCanvasSize();

		// HDRI loading uses ShaderMaterials internally (PMREMGenerator, WebGLCubeRenderTarget)
		// which are not compatible with WebGPU's node-based material system.
		// Skip HDRI in WebGPU mode and use a solid color background.
		if (
			this.schematicRenderer.options?.hdri !== undefined &&
			this.schematicRenderer.options.hdri !== ""
		) {
			if (this._isWebGPU) {
				console.warn('[RenderManager] HDRI backgrounds are not yet supported in WebGPU mode. Using solid color with enhanced lighting.');
				// Set a nice sky color
				this.schematicRenderer.sceneManager.scene.background = new THREE.Color(0x87ceeb);

				// Create a simple procedural environment for PBR materials
				// This provides basic ambient lighting for MeshStandardMaterial
				this.setupWebGPUEnvironment();
			} else {
				this.setupHDRIBackground(this.schematicRenderer.options.hdri);
			}
		}

		// Listen for camera changes to handle HDRI switching
		this.schematicRenderer.cameraManager.on("cameraChanged", (event) => {
			this.handleCameraChange(event.newCamera);
		});
	}

	/**
	 * Check if WebGPU is supported in the current browser
	 */
	private async checkWebGPUSupport(): Promise<boolean> {
		if (!navigator.gpu) {
			return false;
		}

		try {
			const adapter = await navigator.gpu.requestAdapter();
			if (!adapter) {
				return false;
			}

			// Try to get a device to verify full support
			const device = await adapter.requestDevice();
			device.destroy();

			return true;
		} catch (error) {
			console.warn('[RenderManager] WebGPU check failed:', error);
			return false;
		}
	}

	/**
	 * Check if currently using WebGPU renderer
	 */
	public get isWebGPU(): boolean {
		return this._isWebGPU;
	}

	/**
	 * Get the Three.js Inspector (WebGPU only)
	 */
	public getInspector(): any {
		return this.inspector;
	}

	/**
	 * Setup simple environment lighting for WebGPU mode
	 * Since HDRI/PMREMGenerator isn't compatible with WebGPU, we enhance
	 * the scene lighting to compensate for the lack of environment maps.
	 */
	private setupWebGPUEnvironment(): void {
		const scene = this.schematicRenderer.sceneManager.scene;
		const sceneManager = this.schematicRenderer.sceneManager;

		// Boost existing lights to compensate for no environment map
		// SceneManager stores lights in a Map, access via getLight if available
		if ((sceneManager as any).lights) {
			const lights = (sceneManager as any).lights as Map<string, THREE.Light>;
			const ambientLight = lights.get('ambientLight') as THREE.AmbientLight;
			if (ambientLight) {
				ambientLight.intensity = 3.5; // Boost ambient significantly
			}
			const directionalLight = lights.get('directionalLight') as THREE.DirectionalLight;
			if (directionalLight) {
				directionalLight.intensity = 1.5; // Boost directional
			}
		}

		// Add a hemisphere light for better sky/ground lighting
		const hemiLight = new THREE.HemisphereLight(
			0x87ceeb, // Sky color (light blue)
			0x666666, // Ground color (medium gray for better contrast)
			2.0       // Higher intensity
		);
		hemiLight.name = 'webgpuHemiLight';
		scene.add(hemiLight);

		// Add a fill light from the opposite direction for better shading
		const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
		fillLight.position.set(-15, 15, 15);
		fillLight.name = 'webgpuFillLight';
		scene.add(fillLight);

		// Add a back light for rim lighting effect
		const backLight = new THREE.DirectionalLight(0xffffcc, 0.4);
		backLight.position.set(0, -10, -20);
		backLight.name = 'webgpuBackLight';
		scene.add(backLight);

		console.log('[RenderManager] WebGPU environment lighting configured');
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

	/**
	 * Initialize WebGPU Renderer
	 */
	private async initWebGPURenderer(): Promise<void> {
		// Dynamically import WebGPU modules
		const webgpuModule = await import('three/webgpu');
		WebGPURenderer = webgpuModule.WebGPURenderer;
		_PostProcessing = webgpuModule.PostProcessing;

		// Try to import Inspector (no types available yet)
		try {
			// @ts-expect-error Inspector module doesn't have type definitions yet
			const inspectorModule = await import('three/examples/jsm/inspector/Inspector.js');
			Inspector = inspectorModule.Inspector;
		} catch (e) {
			console.warn('[RenderManager] Three.js Inspector not available:', e);
		}

		this.renderer = new WebGPURenderer({
			canvas: this.schematicRenderer.canvas,
			antialias: true,
			powerPreference: "high-performance",
		});

		// WebGPU requires async initialization
		await this.renderer.init();

		if (this.initialSizeSet) {
			const parent = this.schematicRenderer.canvas.parentElement;
			if (parent) {
				const width = parent.clientWidth;
				const height = parent.clientHeight;
				this.renderer.setSize(width, height, false);
			}
		}

		this.renderer.setPixelRatio(window.devicePixelRatio);

		// Initialize Inspector if available
		if (Inspector && this.schematicRenderer.options.debugOptions?.enableInspector) {
			try {
				this.inspector = new Inspector();
				this.inspector.setRenderer(this.renderer);
				console.log('[RenderManager] Three.js Inspector initialized');
			} catch (e) {
				console.warn('[RenderManager] Failed to initialize Inspector:', e);
			}
		}

		// WebGPU uses different post-processing
		// For now, we'll skip the complex post-processing and use basic rendering
		// The postprocessing library doesn't support WebGPU yet
		this.composer = null;
		this._webgpuInitialized = true;

		this.renderer.resetState();

		// Create PMREMGenerator for HDRI
		this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
	}

	/**
	 * Initialize WebGL Renderer (original code)
	 */
	private initWebGLRenderer(): void {
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

		// this.renderer.resetState();

		this.initComposer();
		this.initDefaultPasses(this.schematicRenderer.options);
	}

	private initComposer(): void {
		if (this._isWebGPU) return; // WebGPU uses different post-processing

		const postOpts = this.schematicRenderer.options.postProcessingOptions;
		// If master switch disabled, don't create composer
		if (postOpts && postOpts.enabled === false) return;

		// If all individual effects disabled, don't create composer
		if (postOpts &&
			postOpts.enableSSAO === false &&
			postOpts.enableSMAA === false &&
			postOpts.enableGamma === false) {
			return;
		}

		this.composer = new EffectComposer(this.renderer);
		const renderPass = new RenderPass(
			this.schematicRenderer.sceneManager.scene,
			this.schematicRenderer.cameraManager.activeCamera.camera
		);
		this.composer.addPass(renderPass);
		this.passes.set("renderPass", renderPass);
	}

	/**
	 * Handle camera type changes to manage HDRI background and SSAO appropriately
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

			// Adjust SSAO for isometric view (orthographic cameras have different depth)
			this.setSSAOParameters(this.ssaoPresets.isometric);

			console.log("Switched to isometric mode (background + SSAO adjusted)");
		} else {
			// Restore HDRI background for perspective cameras
			if (this.originalBackground) {
				scene.background = this.originalBackground;
				console.log("Restored HDRI background");
			}

			// Restore perspective SSAO settings
			this.setSSAOParameters(this.ssaoPresets.perspective);

			console.log("Switched to perspective mode (SSAO restored)");
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

		// Only add context lost handlers for WebGL
		if (!this._isWebGPU) {
			canvas.addEventListener("webglcontextlost", this.handleContextLost, false);
			canvas.addEventListener(
				"webglcontextrestored",
				this.handleContextRestored,
				false
			);
		}
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

			this.initWebGLRenderer();
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
		if (this._isWebGPU || !this.composer) return;

		const postOpts = this.schematicRenderer.options.postProcessingOptions;
		const effects = [];

		if (postOpts?.enableGamma !== false) {
			const gammaCorrectionEffect = new GammaCorrectionEffect(
				options.gamma ?? 0.5
			);
			this.passes.set("gammaCorrection", gammaCorrectionEffect);
			effects.push(gammaCorrectionEffect);
		}

		if (postOpts?.enableSMAA !== false) {
			const smaaEffect = new SMAAEffect();
			this.passes.set("smaa", smaaEffect);
			effects.push(smaaEffect);
		}

		if (postOpts?.enableSSAO !== false) {
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
		}

		if (effects.length > 0) {
			const effectPass = new EffectPass(
				this.schematicRenderer.cameraManager.activeCamera.camera,
				...effects
			);
			effectPass.renderToScreen = true;
			this.composer.addPass(effectPass);
			this.passes.set("effectPass", effectPass);
		} else if (this.composer.passes.length > 1) {
			// If we have other passes (like SSAO) but no effect pass, make sure the last pass renders to screen
			// N8AO pass usually renders to screen if it's the last one? 
			// N8AO might need renderToScreen set manually if it's the final pass
			const lastPass = this.composer.passes[this.composer.passes.length - 1];
			if (lastPass) {
				lastPass.renderToScreen = true;
			}
		} else {
			// If we have composer but no effects added (edge case), better to just disable composer
			this.composer = null;
		}
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

			if (this.composer) {
				this.composer.setSize(width, height);
			}

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

	/**
	 * Customize SSAO presets for different camera modes
	 * @param mode - Camera mode ('perspective' or 'isometric')
	 * @param params - SSAO parameters to apply for this mode
	 */
	public setSSAOPreset(
		mode: "perspective" | "isometric",
		params: {
			aoRadius?: number;
			distanceFalloff?: number;
			intensity?: number;
		}
	): void {
		this.ssaoPresets[mode] = {
			...this.ssaoPresets[mode],
			...params,
		};

		// If we're currently in this mode, apply the changes immediately
		const currentCameraType = this.isOrthographicCamera() ? "isometric" : "perspective";
		if (currentCameraType === mode) {
			this.setSSAOParameters(this.ssaoPresets[mode]);
		}

		console.log(`SSAO preset updated for ${mode} mode:`, this.ssaoPresets[mode]);
	}

	/**
	 * Get current SSAO presets
	 */
	public getSSAOPresets(): {
		perspective: { aoRadius: number; distanceFalloff: number; intensity: number };
		isometric: { aoRadius: number; distanceFalloff: number; intensity: number };
	} {
		return {
			perspective: { ...this.ssaoPresets.perspective },
			isometric: { ...this.ssaoPresets.isometric },
		};
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

		// Skip context check for WebGPU
		if (!this._isWebGPU) {
			const gl = renderer.getContext();
			if (!gl || gl.isContextLost()) {
				console.warn(
					"[RenderManager] Attempted to render with lost WebGL context for stats."
				);
				this.contextLost = true;
				return { renderTimeMs: 0, rendererInfo: renderer.info };
			}
		}

		const renderStartTime = performance.now();
		try {
			this.isRendering = true;

			if (this._isWebGPU) {
				// WebGPU direct rendering
				this.renderer.render(scene, camera);
			} else if (this.composer) {
				this.composer.render();
			} else {
				this.renderer.render(scene, camera);
			}
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

			// Skip context check for WebGPU
			if (!this._isWebGPU) {
				const gl = this.renderer.getContext();
				if (!gl || gl.isContextLost()) {
					console.warn("Attempted to render with lost WebGL context");
					this.contextLost = true;
					return;
				}
			}

			if (this._isWebGPU) {
				// WebGPU rendering
				const scene = this.schematicRenderer.sceneManager.scene;
				const camera = this.schematicRenderer.cameraManager.activeCamera.camera;
				this.renderer.render(scene, camera);

				// Resolve timestamp queries to prevent overflow (for Inspector)
				if (this.renderer.resolveTimestampsAsync) {
					this.renderer.resolveTimestampsAsync('render').catch(() => {
						// Silently ignore - timestamps are optional for profiling
					});
				}
			} else if (this.composer) {
				this.composer.render();
			} else {
				// Fallback for WebGL without composer (post-processing disabled)
				this.renderer.render(
					this.schematicRenderer.sceneManager.scene,
					this.schematicRenderer.cameraManager.activeCamera.camera
				);
			}

			// if (!this._isWebGPU) {
			// 	this.renderer.resetState();
			// }
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

		if (this.composer) {
			this.composer.setSize(width, height);
		}

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

	public getRenderer(): AnyRenderer {
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

		if (this.inspector) {
			// Inspector cleanup if needed
			this.inspector = null;
		}

		this.renderer.dispose();
	}
}
