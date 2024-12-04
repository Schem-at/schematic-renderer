// managers/CameraPathManager.ts
import { CameraPath } from '../camera/CameraPath';
import { CircularCameraPath } from '../camera/CircularCameraPath';
import * as THREE from 'three';
import { SchematicRenderer } from '../SchematicRenderer';

export interface CameraPathManagerOptions {
  showVisualization?: boolean;
}

export class CameraPathManager {
  private paths: Map<string, CameraPath>;
  private displayedPaths: Set<string>;
  private schematicRenderer: SchematicRenderer;
  private showVisualization: boolean;

  constructor(schematicRenderer: SchematicRenderer, options: CameraPathManagerOptions = {}) {
    this.paths = new Map();
    this.displayedPaths = new Set();
    this.schematicRenderer = schematicRenderer;
    this.showVisualization = options.showVisualization || false;
    
    // Create and add initial paths
    const circularPath = new CircularCameraPath({
      height: 10,
      radius: 20,
      target: new THREE.Vector3(0, 0, 0),
    });

    this.addPath("circularPath", circularPath);

    if (this.showVisualization) {
      this.showPathVisualization("circularPath");
    }
  }

  public addPath(name: string, path: CameraPath): void {
    this.paths.set(name, path);
  }

  public getPath(name: string): CameraPath | undefined {
    return this.paths.get(name);
  }

  public removePath(name: string): void {
    this.hidePathVisualization(name);
    this.paths.delete(name);
  }

  public updatePathParameters(name: string, params: any): void {
    const path = this.paths.get(name);
    if (path) {
      path.updateParameters(params);
      if (this.displayedPaths.has(name)) {
        // Update visualization
        this.schematicRenderer.sceneManager.removePathVisualization(`${name}Visualization`);
        const visualizationGroup = path.getVisualizationGroup();
        this.schematicRenderer.sceneManager.addPathVisualization(visualizationGroup, `${name}Visualization`);

        // Update target indicator
        const targetPosition = path.getTargetPosition();
        this.schematicRenderer.sceneManager.updateTargetIndicatorPosition(targetPosition, `${name}Target`);
      }
    }
  }

  public showPathVisualization(name: string): void {
    const path = this.paths.get(name);
    if (path) {
      const visualizationGroup = path.getVisualizationGroup();
      this.schematicRenderer.sceneManager.addPathVisualization(visualizationGroup, `${name}Visualization`);

      const targetPosition = path.getTargetPosition();
      this.schematicRenderer.sceneManager.addTargetIndicator(targetPosition, `${name}Target`);

      this.displayedPaths.add(name);
    } else {
      console.warn(`Camera path '${name}' not found.`);
    }
  }

  public hidePathVisualization(name: string): void {
    this.schematicRenderer.sceneManager.removePathVisualization(`${name}Visualization`);
    this.schematicRenderer.sceneManager.removeTargetIndicator(`${name}Target`);
    this.displayedPaths.delete(name);
  }

  public hideAllPathVisualizations(): void {
    this.displayedPaths.forEach(name => {
      this.hidePathVisualization(name);
    });
  }

  public getPaths(): Map<string, CameraPath> {
    return this.paths;
  }

  public isPathVisible(name: string): boolean {
    return this.displayedPaths.has(name);
  }

  public dispose(): void {
    // Hide all visualizations
    this.hideAllPathVisualizations();
    
    // Clear all paths
    this.paths.clear();
    this.displayedPaths.clear();
  }

  public getAllPathNames(): string[] {
    return Array.from(this.paths.keys());
  }

  public getDefaultPath(): CameraPath | undefined {
    const pathNames = this.getAllPathNames();
    if (pathNames.length > 0) {
      return this.getPath(pathNames[0]);
    }
    return undefined;
  }

  public getFirstPath(): { path: CameraPath, name: string } | null {
    const paths = Array.from(this.paths.entries());
    if (paths.length > 0) {
      return { path: paths[0][1], name: paths[0][0] };
    }
    return null;
  }
}