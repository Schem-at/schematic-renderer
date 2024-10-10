// managers/CameraPathManager.ts

import { CameraPath } from '../camera/CameraPath';
import { CircularCameraPath } from '../camera/CircularCameraPath';

export class CameraPathManager {
  private paths: Map<string, CameraPath> = new Map();

  constructor() {}

  // Add a new camera path
  public addPath(name: string, path: CameraPath): void {
    this.paths.set(name, path);
  }

  // Get a camera path by name
  public getPath(name: string): CameraPath | undefined {
    return this.paths.get(name);
  }

  
  // Remove a camera path
  public removePath(name: string): void {
    this.paths.delete(name);
  }

  // Update parameters of a camera path
  public updatePathParameters(
    name: string,
    params: any
  ): void {
    const path = this.paths.get(name);
    if (path && path.updateParameters) {
      path.updateParameters(params);
    }
  }

  // Get all paths
  public getAllPaths(): CameraPath[] {
    return Array.from(this.paths.values());
  }
}
