import * as THREE from "three";
import { TagMap } from "@enginehub/nbt-ts";
import { Renderer } from "./renderer";
import { ResourceLoader } from "./resource_loader";
import { WorldMeshBuilder } from "./world_mesh_builder";
import { parseNbtFromBase64 } from "./utils";
import { loadSchematic, Schematic } from "@enginehub/schematicjs";
import { SchematicRendererGUI } from "./SchematicRendererGUI";
import { SchematicRendererCore } from "./SchematicRendererCore";
import { SchematicMediaCapture } from "./SchematicMediaCapture";
import { SchematicExporter } from "./SchematicExporter";
import {
  ResourcePackManager,
  DefaultPackCallback,
} from "./ResourcePackManager";

interface SchematicRendererOptions {
  debugGUI?: boolean;
  // Add other option properties here
}

interface SchematicData {
  [key: string]: string;
}

function relayMethods(target: any, sourceKey: string) {
  const source = target[sourceKey];
  Object.getOwnPropertyNames(Object.getPrototypeOf(source)).forEach(
    (method) => {
      if (method !== "constructor" && typeof source[method] === "function") {
        target[method] = function (...args: any[]) {
          return source[method].apply(source, args);
        };
      }
    }
  );
}

export class SchematicRenderer {
  canvas: HTMLCanvasElement;
  options: SchematicRendererOptions;

  renderer: Renderer;
  resourceLoader: ResourceLoader;
  materialMap: Map<string, THREE.Material | THREE.Material[]> = new Map();
  worldMeshBuilder: WorldMeshBuilder | undefined;

  schematicRendererGUI: SchematicRendererGUI | null = null;

  private schematicRendererCore: SchematicRendererCore;
  private schematicMediaCapture: SchematicMediaCapture;
  private schematicExporter: SchematicExporter;
  private resourcePackManager: ResourcePackManager;

  constructor(
    canvas: HTMLCanvasElement,
    schematicData: SchematicData,
    options: SchematicRendererOptions,
    defaultResourcePacks?: Record<string, DefaultPackCallback>
  ) {
    this.canvas = canvas;
    this.options = options;
    this.renderer = new Renderer(canvas, options);
    this.resourcePackManager = new ResourcePackManager();

    (async () => {
      await this.initializeResourcePacks(defaultResourcePacks);
      this.setupRelayedMethods();
      await this.initialize(schematicData);
    })().catch(error => console.error("Initialization error:", error));
  }

  private setupRelayedMethods() {
    relayMethods(this, "renderer");
    relayMethods(this, "schematicMediaCapture");
    relayMethods(this, "schematicExporter");
  }

  private async initializeResourcePacks(
    defaultResourcePacks?: Record<string, DefaultPackCallback>
  ) {
    this.options.resourcePackBlobs = await this.resourcePackManager.getResourcePackBlobs(
      defaultResourcePacks || {}
    );
    this.initializeComponents();
  }

  private initializeComponents() {
    this.resourceLoader = new ResourceLoader(
      this.options.resourcePackBlobs,
      this.materialMap
    );
    this.worldMeshBuilder = new WorldMeshBuilder(
      this.resourceLoader,
      this.materialMap,
      this.renderer
    );
    this.schematicRendererCore = new SchematicRendererCore(
      this.renderer,
      this.worldMeshBuilder
    );
    this.schematicMediaCapture = new SchematicMediaCapture(this.renderer);
    this.schematicExporter = new SchematicExporter(this.renderer);
  }

  private async initialize(schematicData: SchematicData) {
    let parsedNbt: TagMap;
    const loadedSchematics = {} as { [key: string]: Schematic };

    for (const key in schematicData) {
      if (schematicData.hasOwnProperty(key)) {
        const value = schematicData[key];
        parsedNbt = parseNbtFromBase64(value);
        loadedSchematics[key] = loadSchematic(parsedNbt);
      }
    }

    this.materialMap = new Map();
    this.renderer.schematics = loadedSchematics;

    await this.resourceLoader.initialize();
    await this.schematicRendererCore.render();

    if (this.options?.debugGUI) {
      this.schematicRendererGUI = new SchematicRendererGUI(this);
    }
  }

  async updateSchematic(key: string, schematicData: string) {
    this.renderer.schematics[key] = loadSchematic(
      parseNbtFromBase64(schematicData)
    );
    await this.schematicRendererCore.renderSchematic(key);
  }

  async manageResourcePack(action: 'upload' | 'clear' | 'toggle' | 'reorder', params?: any) {
    switch (action) {
      case 'upload':
        await this.resourcePackManager.uploadPack(params as File);
        break;
      case 'clear':
        await this.resourcePackManager.clearPacks();
        break;
      case 'toggle':
        await this.resourcePackManager.togglePackEnabled(params.name, params.enabled);
        break;
      case 'reorder':
        await this.resourcePackManager.reorderPack(params.name, params.newOrder);
        break;
    }
    await this.reloadResourcePacks();
  }

  async listResourcePacks(): Promise<{ name: string; enabled: boolean; order: number }[]> {
    return this.resourcePackManager.listPacks();
  }

  private async reloadResourcePacks() {
    await this.initializeResourcePacks();
    await this.resourceLoader.initialize();
    await this.schematicRendererCore.render();
  }
}