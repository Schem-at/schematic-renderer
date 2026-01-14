import * as THREE from "three";
import { CameraPath } from "./CameraPath";
import { SchematicRenderer } from "../SchematicRenderer";
import { CameraFrame } from "../managers/CameraManager";

interface CircularPathParams {
	center?: THREE.Vector3 | number[];
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
	private schematicRenderer: SchematicRenderer;

	constructor(schematicRenderer: SchematicRenderer, params: CircularPathParams) {
		super();
		this.schematicRenderer = schematicRenderer;
		this.params = {
			...params,
			centerOffset: params.centerOffset || [0, 0, 0],
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
				target: this.targetVec.clone(),
			};
		};
	}

	public animate(options: {
		duration: number;
		onFrame: (frame: CameraFrame) => void;
		onComplete?: () => void;
	}): void {
		const startTime = performance.now();
		let lastT = 0;

		const animate = () => {
			const elapsed = performance.now() - startTime;
			const t = Math.min(elapsed / (options.duration * 1000), 1);

			if (Math.abs(t - lastT) > 0.001) {
				const frame = this.pathFunction(t);
				options.onFrame({ ...frame, progress: t });
				lastT = t;
			}

			if (t < 1) {
				requestAnimationFrame(animate);
			} else if (options.onComplete) {
				options.onComplete();
			}
		};

		animate();
	}

	public fitToSchematics(): void {
		if (!this.schematicRenderer.schematicManager) {
			return;
		}

		const schematicCenters = this.schematicRenderer.schematicManager.getSchematicsAveragePosition();
		const cameraPosition = this.schematicRenderer.cameraManager.activeCamera
			.position as THREE.Vector3;

		// Set target and height
		this.params.target = schematicCenters;
		// this.targetVec = this.vectorFromInput(schematicCenters);
		this.params.height = cameraPosition.y;

		// Calculate radius from horizontal distance
		const distance = cameraPosition.distanceTo(schematicCenters);
		this.params.radius = distance;

		// Calculate current angle in XZ plane relative to center
		const deltaX = cameraPosition.x - schematicCenters.x;
		const deltaZ = cameraPosition.z - schematicCenters.z;
		const currentAngle = Math.atan2(deltaZ, deltaX);

		// Set the startAngle to match current camera position
		this.startAngle = currentAngle;
		this.endAngle = currentAngle + Math.PI * 2; // Full circle from current position

		this.updatePathFunction();
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

	/**
	 * Get the center point of the circular path
	 */
	public getCenter(): THREE.Vector3 {
		return this.centerOffsetVec.clone();
	}

	/**
	 * Get the radius of the circular path
	 */
	public getRadius(): number {
		return this.params.radius;
	}

	/**
	 * Get the height of the circular path
	 */
	public getHeight(): number {
		return this.params.height;
	}

	/**
	 * Set the starting angle for the orbit
	 */
	public setStartAngle(angle: number): void {
		this.startAngle = angle;
		this.endAngle = angle + Math.PI * 2; // Full circle from new start position
		this.updatePathFunction();
	}

	/**
	 * Get the starting angle of the orbit
	 */
	public getStartAngle(): number {
		return this.startAngle;
	}

	/**
	 * Get the current angle at parameter t
	 */
	public getCurrentAngle(t: number): number {
		return this.startAngle + (this.endAngle - this.startAngle) * t;
	}

	/**
	 * Get the target position the path is looking at
	 */
	public getTargetPosition(): THREE.Vector3 {
		return this.targetVec.clone();
	}

	/**
	 * Update the target that the camera looks at during orbit
	 */
	public setTarget(target: THREE.Vector3 | number[]): void {
		this.targetVec = this.vectorFromInput(target);
		this.params.target = target;
		this.updatePathFunction();
	}
}
