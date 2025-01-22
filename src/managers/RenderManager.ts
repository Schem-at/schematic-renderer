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

    constructor(schematicRenderer: SchematicRenderer) {
        this.schematicRenderer = schematicRenderer;
        this.eventEmitter = this.schematicRenderer.eventEmitter;

        // Ensure we have proper initial size before initialization
        this.setInitialSize();
        
        this.initRenderer();
        this.initComposer();
        this.initDefaultPasses(this.schematicRenderer.options);
        this.setupEventListeners();

        // Set the size again after everything is initialized
        this.updateCanvasSize();

        if (this.schematicRenderer.options?.hdri !== undefined && 
            this.schematicRenderer.options.hdri !== "") {
            this.setupHDRIBackground(this.schematicRenderer.options.hdri);
        }
    }

    private setInitialSize(): void {
        const canvas = this.schematicRenderer.canvas;
        const parent = canvas.parentElement;
        
        if (!parent) {
            console.warn('Canvas parent element not found');
            return;
        }

        // Get the parent's dimensions
        const rect = parent.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        // Set canvas style dimensions
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        // Set canvas buffer dimensions
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
            preserveDrawingBuffer: true
        });

        // Only set size if we have initial dimensions
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
        this.renderer.setClearColor(0x000000);
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

    public setupHDRIBackground(hdriPath: string, backgroundOnly: boolean = true): void {
        this.hdriPath = hdriPath;
        this.hdriBackgroundOnly = backgroundOnly;
        
        this.loadHDRI(hdriPath, backgroundOnly);
        
        const canvas = this.renderer.domElement;
        canvas.removeEventListener('webglcontextlost', this.handleContextLost);
        canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
        canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
        canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
    }

    private isPMREMGeneratorDisposed(): boolean {
        return !this.pmremGenerator || 
               (this.pmremGenerator as any)._blurMaterial === null;
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
                    const backgroundTexture = new THREE.WebGLCubeRenderTarget(1024)
                        .fromEquirectangularTexture(this.renderer, texture);
                    this.schematicRenderer.sceneManager.scene.background = backgroundTexture.texture;
                } else {
                    this.schematicRenderer.sceneManager.scene.environment = envMap;
                    this.schematicRenderer.sceneManager.scene.background = envMap;
                }

                this.pmremGenerator.dispose();
                
                this.eventEmitter.emit('hdriLoaded', { path: hdriPath });
            },
            (progress) => {
                this.eventEmitter.emit('hdriProgress', { 
                    loaded: progress.loaded,
                    total: progress.total 
                });
            },
            (error) => {
                console.error("HDRI loading failed:", error);
                this.eventEmitter.emit('hdriError', { error });
            }
        );
    }

    private handleContextLost = (event: Event): void => {
        event.preventDefault();
        this.contextLost = true;
        this.isRendering = false;
        console.log("WebGL context lost. Suspending render operations...");
        this.eventEmitter.emit('webglContextLost');
    }

    private handleContextRestored = async (): Promise<void> => {
        console.log("WebGL context restored. Reinitializing renderer...");
        
        try {
            // Wait a bit before reinitializing
            await new Promise(resolve => setTimeout(resolve, 300));
            
            this.contextLost = false;

            // Reinitialize renderer
            this.initRenderer();
            this.initComposer();
            this.initDefaultPasses(this.schematicRenderer.options);
            
            // Update sizes
            this.updateCanvasSize();
            
            // Reload HDRI if it was previously set
            if (this.hdriPath) {
                await new Promise(resolve => setTimeout(resolve, 100));
                this.loadHDRI(this.hdriPath, this.hdriBackgroundOnly);
            }

            this.eventEmitter.emit('webglContextRestored');

            // Force a new render after everything is reinitialized
            requestAnimationFrame(() => {
                if (!this.contextLost) {
                    this.render();
                }
            });
        } catch (error) {
            console.error("Error during context restoration:", error);
            this.eventEmitter.emit('webglContextError', { error });
        }
    }

    private initDefaultPasses(options: any): void {
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

        // Create an EffectPass with all effects
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
        
        // Only update renderer and composer if context isn't lost
        if (!this.contextLost) {
            this.renderer.setSize(width, height, false);
            this.composer.setSize(width, height);

            const camera = this.schematicRenderer.cameraManager.activeCamera.camera as THREE.PerspectiveCamera;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
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

    public setSSAOParameters(params: any): void {
        const ssaoEffect = this.passes.get("ssao");
        if (ssaoEffect) {
            Object.assign(ssaoEffect, params);
        }
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
            this.eventEmitter.emit('renderError', { error });
        } finally {
            this.isRendering = false;
        }
    }

    public resize(width: number, height: number): void {
        if (this.contextLost) return;
        
        this.renderer.setSize(width, height, false);
        this.composer.setSize(width, height);
        
        const camera = this.schematicRenderer.cameraManager.activeCamera.camera as THREE.PerspectiveCamera;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
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

    public dispose(): void {
        this.disposed = true;
        this.contextLost = true;

        // Clear resize timeout if it exists
        if (this.resizeTimeout !== null) {
            window.cancelAnimationFrame(this.resizeTimeout);
            this.resizeTimeout = null;
        }

        window.removeEventListener("resize", this.updateCanvasSize);
        const canvas = this.renderer.domElement;
        canvas.removeEventListener('webglcontextlost', this.handleContextLost);
        canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

        this.passes.forEach(pass => {
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