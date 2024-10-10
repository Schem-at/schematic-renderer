// camera/CameraPath.ts

import * as THREE from 'three';

export abstract class CameraPath {
  protected pathFunction: (t: number) => { position: THREE.Vector3; rotation: THREE.Euler, target: THREE.Vector3 };

  constructor() {}

  public getPoint(t: number): { position: THREE.Vector3; rotation: THREE.Euler, target: THREE.Vector3 } {
    return this.pathFunction(t);
  }

    public getTargetPosition(): THREE.Vector3 {
      // Assuming the target is constant for the path
      return this.getPoint(0).target.clone();
    }

  
  public getVisualizationGroup(segments: number = 100): THREE.Group {
    const group = new THREE.Group();

    // Generate path curve
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const { position } = this.getPoint(t);
      points.push(position);
    }
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const pathMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const pathLine = new THREE.Line(pathGeometry, pathMaterial);
    group.add(pathLine);

    // Generate arrows
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const { position, target } = this.getPoint(t);

      const direction = target.clone().sub(position).normalize();
      const arrow = new THREE.ArrowHelper(direction, position, 1, 0xff0000, 0.2, 0.1);
      group.add(arrow);
    }

    return group;
  }

  // Abstract method to update parameters
  public abstract updateParameters(params: any): void;
}
