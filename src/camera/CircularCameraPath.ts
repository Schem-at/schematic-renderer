import * as THREE from 'three';
import { CameraPath } from './CameraPath';

interface CircularPathParams {
  height: number;
  radius: number;
  target: THREE.Vector3 | number[];
  centerOffset?: THREE.Vector3 | number[];
  startAngle?: number;
  endAngle?: number;
}

export class CircularCameraPath extends CameraPath {
  private params: CircularPathParams;
  private targetVec: THREE.Vector3;
  private centerOffsetVec: THREE.Vector3;
  private startAngle: number;
  private endAngle: number;

  constructor(params: CircularPathParams) {
    super();
    this.params = {
      ...params,
      centerOffset: params.centerOffset || [0, 0, 0]
    };
    this.targetVec = this.vectorFromInput(params.target);
    this.centerOffsetVec = this.vectorFromInput(params.centerOffset || [0, 0, 0]);
    this.startAngle = params.startAngle || 0;
    this.endAngle = params.endAngle || Math.PI * 2;
    this.updatePathFunction();
  }

  private vectorFromInput(input: THREE.Vector3 | number[]): THREE.Vector3 {
    if (Array.isArray(input)) {
      return new THREE.Vector3(...input);
    }
    return input.clone();
  }

  private updatePathFunction() {
    const { height, radius } = this.params;
    
    this.pathFunction = (t: number) => {
      // Calculate the current angle
      const angle = this.startAngle + (this.endAngle - this.startAngle) * t;

      // Calculate position on circle
      const position = new THREE.Vector3(
        this.centerOffsetVec.x + radius * Math.cos(angle),
        this.centerOffsetVec.y + height,
        this.centerOffsetVec.z + radius * Math.sin(angle)
      );

      // Calculate rotation to look at target
      const lookAtMatrix = new THREE.Matrix4();
      const up = new THREE.Vector3(0, 1, 0);
      lookAtMatrix.lookAt(position, this.targetVec, up);
      const rotation = new THREE.Euler().setFromRotationMatrix(lookAtMatrix);

      return {
        position: position,
        rotation: rotation,
        target: this.targetVec.clone()
      };
    };
  }

  public updateParameters(params: Partial<CircularPathParams>): void {
    if (params.target) {
      this.targetVec = this.vectorFromInput(params.target);
    }
    if (params.centerOffset) {
      this.centerOffsetVec = this.vectorFromInput(params.centerOffset);
    }
    if (params.startAngle !== undefined) {
      this.startAngle = params.startAngle;
    }
    if (params.endAngle !== undefined) {
      this.endAngle = params.endAngle;
    }
    
    Object.assign(this.params, params);
    this.updatePathFunction();
  }

  // Override getVisualizationGroup to add center and target indicators
  public getVisualizationGroup(segments: number = 100): THREE.Group {
    const group = super.getVisualizationGroup(segments);

    // Add center point indicator
    const centerGeometry = new THREE.SphereGeometry(0.2);
    const centerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const centerPoint = new THREE.Mesh(centerGeometry, centerMaterial);
    centerPoint.position.copy(this.centerOffsetVec);
    group.add(centerPoint);

    // Add target point indicator
    const targetGeometry = new THREE.SphereGeometry(0.2);
    const targetMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const targetPoint = new THREE.Mesh(targetGeometry, targetMaterial);
    targetPoint.position.copy(this.targetVec);
    group.add(targetPoint);

    return group;
  }
}