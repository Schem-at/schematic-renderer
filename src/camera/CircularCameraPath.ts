// camera/CircularCameraPath.ts

import * as THREE from 'three';
import { CameraPath } from './CameraPath';

interface CircularPathParams {
  height: number;
  radius: number;
  target: THREE.Vector3 | number[];
}

export class CircularCameraPath extends CameraPath {
  private params: CircularPathParams;

  constructor(params: CircularPathParams) {
    super();
    this.params = params;
    this.updatePathFunction();
  }

  private updatePathFunction() {
    let { height, radius, target } = this.params;
  
    if (Array.isArray(target)) {
      target = new THREE.Vector3(...target);
    }
  
    this.pathFunction = (t: number) => {
      const angle = t * 2 * Math.PI;
      const position = new THREE.Vector3(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      );
  
      // Create a temporary Object3D to calculate rotation
      const object = new THREE.Object3D();
      object.position.copy(position);
      object.up.set(0, 1, 0); // Ensure the up vector is pointing up
      object.lookAt(target);
  
      const rotation = object.rotation.clone();
  
      return { position, rotation, target };
    };
  }

  public updateParameters(params: Partial<CircularPathParams>): void {
    Object.assign(this.params, params);
    this.updatePathFunction();
  }
}
