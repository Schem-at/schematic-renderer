// SchematicRenderer.ts
import * as THREE from "three";
import { CameraManager } from "./managers/CameraManager";
import { SceneManager } from "./managers/SceneManager";
import { RenderManager } from "./managers/RenderManager";
import {
    DragAndDropManager,
    DragAndDropManagerOptions,
} from "./managers/DragAndDropManager";
import {
    InteractionManager,
    InteractionManagerOptions,
} from "./managers/InteractionManager";
import { HighlightManager } from "./managers/HighlightManager";
import { SchematicManager } from "./managers/SchematicManager";
import { WorldMeshBuilder } from "./WorldMeshBuilder";
import { ResourceLoader } from "./ResourceLoader";
import { EventEmitter } from "events";
import {
    ResourcePackManager,
    DefaultPackCallback,
} from "./managers/ResourcePackManager";
// @ts-ignore
import init from "./wasm/minecraft_schematic_utils";
import { GizmoManager } from "./managers/GizmoManager";
import { SchematicRendererOptions, DEFAULT_OPTIONS } from "./SchematicRendererOptions";
import { merge } from "lodash";
import { UIManager } from "./managers/UIManager";
// @ts-ignore
import { CreativeControls } from "three-creative-controls"


export class SchematicRenderer {
    public canvas: HTMLCanvasElement;
    public clock: THREE.Clock;
    public options: SchematicRendererOptions;
    public eventEmitter: EventEmitter;
    public cameraManager: CameraManager;
    public sceneManager: SceneManager;
    public uiManager: UIManager | undefined;
    public renderManager: RenderManager | undefined;
    public interactionManager: InteractionManager | undefined;
    public dragAndDropManager?: DragAndDropManager;
    public highlightManager: HighlightManager | undefined;
    public schematicManager: SchematicManager | undefined;
    public worldMeshBuilder: WorldMeshBuilder | undefined;
    public gizmoManager: GizmoManager | undefined;
    public resourceLoader: ResourceLoader | undefined;
    public materialMap: Map<string, THREE.Material>;
    public timings: Map<string, number> = new Map();
    private resourcePackManager: ResourcePackManager;
    // @ts-ignore
    private wasmModule: any;
    public state: {
        cameraPosition: THREE.Vector3;
    };

    constructor(
        canvas: HTMLCanvasElement,
        schematicData: { [key: string]: () => Promise<ArrayBuffer> } = {},
        defaultResourcePacks: Record<string, DefaultPackCallback> = {},
        options: SchematicRendererOptions = {}
    ) {
        this.canvas = canvas;
        this.options = merge({}, DEFAULT_OPTIONS, options);
        this.clock = new THREE.Clock();
        this.materialMap = new Map();
        this.eventEmitter = new EventEmitter();

        // Attach this instance to the canvas for external access
        (this.canvas as any).schematicRenderer = this;

        // Initialize managers that don't depend on initialization process
        this.sceneManager = new SceneManager(this);
        
        this.uiManager = new UIManager(this);

        // Initialize camera manager
        this.cameraManager = new CameraManager(this, {
            position: options.cameraOptions?.position || [5, 5, 5],
            showCameraPathVisualization: this.options.showCameraPathVisualization,
        });


        this.sceneManager.updateHelpers();
        this.eventEmitter.emit("sceneReady");

        // Initialize ResourcePackManager
        this.resourcePackManager = new ResourcePackManager();

        this.state = {
            cameraPosition: new THREE.Vector3(),
        };

        // Start the initialization process
        this.initialize(schematicData, defaultResourcePacks);
    }

    public updateCameraPosition(): void {
        this.state.cameraPosition.copy(this.cameraManager.activeCamera.position as THREE.Vector3);
    }

    private async initialize(
        schematicData: { [key: string]: () => Promise<ArrayBuffer> },
        defaultResourcePacks: Record<string, DefaultPackCallback>
    ): Promise<void> {
        try {
            await this.initWasm();
            await this.initializeResourcePacks(defaultResourcePacks);

            // Initialize core components
            this.resourceLoader = new ResourceLoader(
                this.options.resourcePackBlobs,
                this
            );
            await this.resourceLoader.initialize();

            this.worldMeshBuilder = new WorldMeshBuilder(this);
            this.schematicManager = new SchematicManager(this, {
                singleSchematicMode: this.options.singleSchematicMode,
            });
            this.renderManager = new RenderManager(this);
            this.highlightManager = new HighlightManager(this);

            // Initialize optional components
            if (this.options.enableGizmos) {
                this.gizmoManager = new GizmoManager(
                    this
                );
            }

            // Load schematics and adjust camera
            await this.schematicManager.loadSchematics(schematicData);
            this.adjustCameraToSchematics();

            // Initialize interaction components
            this.initializeInteractionComponents();

            // Start rendering
            this.animate();

            // Trigger callbacks and events
            this.options.callbacks?.onRendererInitialized?.();
            this.canvas.dispatchEvent(new CustomEvent("rendererInitialized"));

        } catch (error) {
            console.error("Failed to initialize SchematicRenderer:", error);
            //pribnt error line
            console.error(error)
        }
    }

    private adjustCameraToSchematics(): void {
        if (!this.schematicManager ) {
            return;
        }

        if (this.schematicManager.isEmpty()) {
            this.uiManager?.showEmptyState();
            return;
        }
        const averagePosition = this.schematicManager.getSchematicsAveragePosition();
        const maxDimensions = this.schematicManager.getMaxSchematicDimensions();

        this.cameraManager.activeCamera.lookAt(averagePosition);
        (this.cameraManager.activeCamera.position as THREE.Vector3).set(
            averagePosition.x + maxDimensions.x,
            averagePosition.y + maxDimensions.y,
            averagePosition.z + maxDimensions.z
        );
        this.cameraManager.update();
    }
    

    private initializeInteractionComponents(): void {
        if (this.options.enableInteraction) {
            const interactionOptions: InteractionManagerOptions = {
                enableSelection: this.options.interactionOptions?.enableSelection || false,
                enableMovingSchematics: this.options.interactionOptions?.enableMovingSchematics || false,
            };
            this.interactionManager = new InteractionManager(this, interactionOptions);
        }
    
        if (this.options.enableDragAndDrop) {
            const dragAndDropOptions: DragAndDropManagerOptions = {
                acceptedFileTypes: this.options.dragAndDropOptions?.acceptedFileTypes || [],
                callbacks: {
                    // Schematic callbacks
                    onSchematicLoaded: this.options.callbacks?.onSchematicLoaded,
                    onSchematicDropped: this.options.callbacks?.onSchematicDropped,
                    onSchematicDropSuccess: this.options.callbacks?.onSchematicDropSuccess,
                    onSchematicDropFailed: this.options.callbacks?.onSchematicDropFailed,
                    
                    // Resource pack callbacks
                    onResourcePackLoaded: this.options.callbacks?.onResourcePackLoaded,
                    onResourcePackDropped: this.options.callbacks?.onResourcePackDropped,
                    onResourcePackDropSuccess: this.options.callbacks?.onResourcePackDropSuccess,
                    onResourcePackDropFailed: this.options.callbacks?.onResourcePackDropFailed,
                    
                    // General callbacks
                    onInvalidFileType: this.options.callbacks?.onInvalidFileType,
                    onLoadingProgress: this.options.callbacks?.onLoadingProgress,
                },
            };
            this.dragAndDropManager = new DragAndDropManager(this, dragAndDropOptions);
        }
    }

    private async initWasm(): Promise<void> {
        try {
            this.wasmModule = await init();
        } catch (error) {
            console.error("Failed to initialize WASM module:", error);
        }
    }

    private async initializeResourcePacks(
        defaultResourcePacks?: Record<string, DefaultPackCallback>
    ): Promise<void> {
        await this.resourcePackManager.initPromise;
        this.options.resourcePackBlobs = await this.resourcePackManager.getResourcePackBlobs(
            defaultResourcePacks || {}
        );
    }

    private animate(): void {
        requestAnimationFrame(() => this.animate());
        const deltaTime = this.clock.getDelta();
    
        // Update creative controls if active
        const activeControlKey = this.cameraManager.activeControlKey;
        if (activeControlKey?.includes('creative')) {
            const controls = this.cameraManager.controls.get(activeControlKey);
            const speed = new THREE.Vector3(200, 200, 200);
            if (controls) {
                CreativeControls.update(controls, speed);
            }
        }
    
        // Rest of your existing updates
        if (!this.highlightManager) return;
        if (!this.renderManager) return;
        
        this.highlightManager.update(deltaTime);
        this.gizmoManager?.update();
        this.renderManager.render();
        this.interactionManager?.update();
    }

    // Resource pack management methods
    public async getResourcePacks(): Promise<Array<{ name: string; enabled: boolean; order: number }>> {
        await this.resourcePackManager.initPromise;
        return await this.resourcePackManager.listPacks();
    }

    public async addResourcePack(file: File): Promise<void> {
        await this.resourcePackManager.uploadPack(file);
        await this.reloadResources();
    }

    public async toggleResourcePackEnabled(name: string, enabled: boolean): Promise<void> {
        await this.resourcePackManager.togglePackEnabled(name, enabled);
        await this.reloadResources();
    }

    public async removeResourcePack(name: string): Promise<void> {
        await this.resourcePackManager.removePack(name);
        await this.reloadResources();
    }

    private async reloadResources(): Promise<void> {
        await this.initializeResourcePacks();
        
        this.resourceLoader = new ResourceLoader(this.options.resourcePackBlobs, this);
        await this.resourceLoader.initialize();
        
        this.materialMap.clear();
    }

    public dispose(): void {
        if (!this.renderManager) {
            return;
        }
        if (!this.highlightManager) {
            return;
        }
        if (!this.uiManager) {
            return;
        }
        this.highlightManager.dispose();
        this.renderManager.renderer.dispose();

        this.dragAndDropManager?.dispose();
        this.uiManager.dispose();
        this.cameraManager.dispose();
        // Cleanup event listeners
        this.eventEmitter.removeAllListeners();
    }
}