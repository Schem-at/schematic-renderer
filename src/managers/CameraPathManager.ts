// managers/CameraPathManager.ts
import { CameraPath } from "../camera/CameraPath";
import { CircularCameraPath } from "../camera/CircularCameraPath";
import * as THREE from "three";
import { SchematicRenderer } from "../SchematicRenderer";

export interface CameraPathManagerOptions {
	showVisualization?: boolean;
}

export class CameraPathManager {
	private paths: Map<string, CameraPath>;
	private displayedPaths: Set<string>;
	private schematicRenderer: SchematicRenderer;
	private showVisualization: boolean;

	constructor(
		schematicRenderer: SchematicRenderer,
		options: CameraPathManagerOptions = {}
	) {
		this.paths = new Map();
		this.displayedPaths = new Set();
		this.schematicRenderer = schematicRenderer;
		this.showVisualization = options.showVisualization || false;

		// Create and add initial paths
		const circularPath = new CircularCameraPath(this.schematicRenderer, {
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

	/**
	 * Enhanced fitCircularPathToSchematics with optimal framing
	 */
	public fitCircularPathToSchematics(
		name: string,
		options: {
			padding?: number;
			minRadius?: number;
			maxRadius?: number;
			heightFactor?: number;
			samples?: number; // Number of positions to test for optimal framing
		} = {}
	): void {
		const path = this.paths.get(name);
		if (!(path instanceof CircularCameraPath)) {
			console.warn(`Path '${name}' is not a CircularCameraPath`);
			return;
		}

		const {
			padding = 0.1, // 10% padding by default
			minRadius = 5,
			maxRadius = 100,
			heightFactor = 0.6, // Height relative to radius
			samples = 8, // Test 8 positions around the circle
		} = options;

		// Get schematic bounds
		const bounds = this.calculateSchematicBounds();
		if (!bounds) {
			console.warn("No valid schematic bounds found for fitting camera path");
			return;
		}

		const { center, size, boundingBox } = bounds;

		// Calculate optimal radius and height
		const optimalParams = this.calculateOptimalCircularPath(
			center,
			size,
			boundingBox,
			padding,
			minRadius,
			maxRadius,
			heightFactor,
			samples
		);

		// Update the path with optimal parameters
		path.updateParameters({
			center: optimalParams.center,
			radius: optimalParams.radius,
			height: optimalParams.height,
			target: optimalParams.target,
		});

		// Update visualization if currently displayed
		if (this.displayedPaths.has(name)) {
			this.schematicRenderer.sceneManager.removePathVisualization(
				`${name}Visualization`
			);
			const visualizationGroup = path.getVisualizationGroup();
			this.schematicRenderer.sceneManager.addPathVisualization(
				visualizationGroup,
				`${name}Visualization`
			);

			// Update target indicator
			const targetPosition = path.getTargetPosition();
			this.schematicRenderer.sceneManager.updateTargetIndicatorPosition(
				targetPosition,
				`${name}Target`
			);
		}

		console.log(
			`Fitted circular path '${name}' with radius: ${optimalParams.radius.toFixed(
				2
			)}, height: ${optimalParams.height.toFixed(2)}`
		);

		// log the parent calling the method
		console.log(`Called from: ${new Error().stack?.split("\n")[2].trim()}`);
	}
	private calculateSchematicBounds(): {
		center: THREE.Vector3;
		size: THREE.Vector3;
		boundingBox: THREE.Box3;
	} | null {
		if (
			!this.schematicRenderer.schematicManager ||
			this.schematicRenderer.schematicManager.isEmpty()
		) {
			return null;
		}

		// Use existing SchematicManager methods to get bounds
		const center =
			this.schematicRenderer.schematicManager.getSchematicsAveragePosition();
		const maxDimensions =
			this.schematicRenderer.schematicManager.getMaxSchematicDimensions();

		// Create bounding box from center and dimensions
		const halfSize = new THREE.Vector3(
			maxDimensions.x / 2,
			maxDimensions.y / 2,
			maxDimensions.z / 2
		);

		const boundingBox = new THREE.Box3(
			center.clone().sub(halfSize),
			center.clone().add(halfSize)
		);

		return {
			center,
			size: maxDimensions,
			boundingBox,
		};
	}

	/**
	 * Calculate optimal circular path parameters using multiple sample points
	 */
	private calculateOptimalCircularPath(
		center: THREE.Vector3,
		// @ts-ignore
		size: THREE.Vector3,
		boundingBox: THREE.Box3,
		padding: number,
		minRadius: number,
		maxRadius: number,
		heightFactor: number,
		samples: number
	): {
		center: THREE.Vector3;
		radius: number;
		height: number;
		target: THREE.Vector3;
	} {
		// Get camera for FOV calculations (assume perspective camera for path fitting)
		const activeCamera =
			this.schematicRenderer.cameraManager.activeCamera.camera;
		let fov = 75; // Default FOV

		if (activeCamera instanceof THREE.PerspectiveCamera) {
			fov = activeCamera.fov;
		}

		const fovRad = THREE.MathUtils.degToRad(fov);

		// Calculate bounding sphere for more accurate fitting
		const boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
		const sphereRadius = boundingSphere.radius;

		// Start with an initial radius estimate
		let optimalRadius = Math.max(sphereRadius * 2, minRadius);

		// Test different heights to find the best framing
		const testHeights = [
			sphereRadius * 0.3, // Low angle
			sphereRadius * 0.6, // Medium angle
			sphereRadius * 1.0, // High angle
			sphereRadius * 1.5, // Very high angle
		];

		let bestRadius = optimalRadius;
		let bestHeight = sphereRadius * heightFactor;
		let smallestRequiredRadius = maxRadius;

		// Test each height to find the optimal viewing angle
		for (const testHeight of testHeights) {
			const requiredRadius = this.calculateMinimumRadius(
				center,
				boundingBox,
				testHeight,
				fovRad,
				padding,
				samples
			);

			if (
				requiredRadius <= maxRadius &&
				requiredRadius < smallestRequiredRadius
			) {
				smallestRequiredRadius = requiredRadius;
				bestRadius = Math.max(requiredRadius, minRadius);
				bestHeight = testHeight;
			}
		}

		// If we couldn't fit within maxRadius, use maxRadius and adjust height
		if (smallestRequiredRadius > maxRadius) {
			bestRadius = maxRadius;
			// Calculate the height needed for this radius
			bestHeight = this.calculateOptimalHeight(
				center,
				boundingBox,
				bestRadius,
				fovRad,
				padding
			);
		}

		// Ensure the target is the center of the bounding box
		const target = center.clone();

		// The path center might be offset if the bounding box is not centered at origin
		const pathCenter = new THREE.Vector3(center.x, center.y, center.z);

		return {
			center: pathCenter,
			radius: bestRadius,
			height: bestHeight,
			target: target,
		};
	}

	/**
	 * Calculate minimum radius needed to frame all schematics from a given height
	 */
	private calculateMinimumRadius(
		center: THREE.Vector3,
		boundingBox: THREE.Box3,
		height: number,
		fovRad: number,
		padding: number,
		samples: number
	): number {
		let maxRequiredRadius = 0;

		// Test camera positions around the circle at different angles
		for (let i = 0; i < samples; i++) {
			const angle = (i / samples) * Math.PI * 2;

			// For each angle, calculate the minimum radius needed
			const requiredRadius = this.calculateRadiusForAngle(
				center,
				boundingBox,
				height,
				angle,
				fovRad,
				padding
			);

			maxRequiredRadius = Math.max(maxRequiredRadius, requiredRadius);
		}

		return maxRequiredRadius;
	}

	/**
	 * Calculate required radius for a specific viewing angle
	 */
	private calculateRadiusForAngle(
		center: THREE.Vector3,
		boundingBox: THREE.Box3,
		height: number,
		angle: number,
		fovRad: number,
		padding: number
	): number {
		// Get the canvas aspect ratio
		const canvas = this.schematicRenderer.canvas;
		const aspect = canvas.width / canvas.height;

		// Calculate camera direction
		const cameraDir = new THREE.Vector3(
			Math.cos(angle),
			0,
			Math.sin(angle)
		).normalize();

		// Project the bounding box onto the camera's view plane
		const corners = [
			new THREE.Vector3(
				boundingBox.min.x,
				boundingBox.min.y,
				boundingBox.min.z
			),
			new THREE.Vector3(
				boundingBox.min.x,
				boundingBox.min.y,
				boundingBox.max.z
			),
			new THREE.Vector3(
				boundingBox.min.x,
				boundingBox.max.y,
				boundingBox.min.z
			),
			new THREE.Vector3(
				boundingBox.min.x,
				boundingBox.max.y,
				boundingBox.max.z
			),
			new THREE.Vector3(
				boundingBox.max.x,
				boundingBox.min.y,
				boundingBox.min.z
			),
			new THREE.Vector3(
				boundingBox.max.x,
				boundingBox.min.y,
				boundingBox.max.z
			),
			new THREE.Vector3(
				boundingBox.max.x,
				boundingBox.max.y,
				boundingBox.min.z
			),
			new THREE.Vector3(
				boundingBox.max.x,
				boundingBox.max.y,
				boundingBox.max.z
			),
		];

		// Find the maximum extent when viewed from this angle
		let maxWidth = 0;
		let maxHeight = 0;

		// Create a temporary camera position to test visibility
		const testRadius = 50; // Arbitrary test radius
		const cameraPos = center
			.clone()
			.add(
				new THREE.Vector3(
					cameraDir.x * testRadius,
					height,
					cameraDir.z * testRadius
				)
			);

		// Calculate the view direction and up vector
		const viewDir = center.clone().sub(cameraPos).normalize();
		const up = new THREE.Vector3(0, 1, 0);
		const right = viewDir.clone().cross(up).normalize();
		const actualUp = right.clone().cross(viewDir).normalize();

		// Project each corner onto the view plane
		for (const corner of corners) {
			const toCorner = corner.clone().sub(cameraPos);
			const rightComponent = toCorner.dot(right);
			const upComponent = toCorner.dot(actualUp);
			const depthComponent = toCorner.dot(viewDir);

			if (depthComponent > 0) {
				// Only consider points in front of camera
				maxWidth = Math.max(maxWidth, Math.abs(rightComponent));
				maxHeight = Math.max(maxHeight, Math.abs(upComponent));
			}
		}

		// Add padding
		maxWidth *= 1 + padding;
		maxHeight *= 1 + padding;

		// Calculate the distance needed based on FOV
		const widthDistance = maxWidth / aspect / Math.tan(fovRad / 2);
		const heightDistance = maxHeight / Math.tan(fovRad / 2);

		// Use the larger distance requirement
		const requiredDistance = Math.max(widthDistance, heightDistance);

		// Calculate the required radius using the distance and height
		const horizontalDistance = Math.sqrt(
			Math.max(0, requiredDistance * requiredDistance - height * height)
		);

		return horizontalDistance;
	}

	/**
	 * Calculate optimal height for a given radius
	 */
	private calculateOptimalHeight(
		// @ts-ignore
		center: THREE.Vector3,
		boundingBox: THREE.Box3,
		radius: number,
		// @ts-ignore
		fovRad: number,
		// @ts-ignore
		padding: number
	): number {
		const size = boundingBox.getSize(new THREE.Vector3());

		// Calculate height that provides good viewing angle
		// Generally, a height that's 30-60% of the radius works well
		const minHeight = radius * 0.3;
		const maxHeight = radius * 0.8;

		// Also consider the object's height
		const objectHeight = size.y;
		const suggestedHeight = Math.max(objectHeight * 0.5, radius * 0.5);

		// Clamp to reasonable bounds
		return Math.max(minHeight, Math.min(maxHeight, suggestedHeight));
	}

	/**
	 * Create a camera path that provides cinematic views of the schematics
	 */
	public createCinematicPath(
		name: string,
		options: {
			duration?: number;
			keyFrames?: number;
			heightVariation?: boolean;
			spiralEffect?: boolean;
		} = {}
	): void {
		const {
			duration = 30, // 30 seconds
			keyFrames = 12,
			// @ts-ignore
			heightVariation = true,
			// @ts-ignore

			spiralEffect = false,
		} = options;

		const bounds = this.calculateSchematicBounds();
		if (!bounds) {
			console.warn("No schematic bounds available for cinematic path");
			return;
		}

		// This would create a more complex camera path with multiple key frames
		// and smooth transitions between different viewing angles and heights
		// Implementation would depend on having a more advanced CameraPath class
		console.log(
			`Creating cinematic path '${name}' with ${keyFrames} key frames over ${duration} seconds`
		);
	}

	public updatePathParameters(name: string, params: any): void {
		const path = this.paths.get(name);
		if (path) {
			path.updateParameters(params);
			if (this.displayedPaths.has(name)) {
				// Update visualization
				this.schematicRenderer.sceneManager.removePathVisualization(
					`${name}Visualization`
				);
				const visualizationGroup = path.getVisualizationGroup();
				this.schematicRenderer.sceneManager.addPathVisualization(
					visualizationGroup,
					`${name}Visualization`
				);

				// Update target indicator
				const targetPosition = path.getTargetPosition();
				this.schematicRenderer.sceneManager.updateTargetIndicatorPosition(
					targetPosition,
					`${name}Target`
				);
			}
		}
	}

	public showPathVisualization(name: string): void {
		const path = this.paths.get(name);
		if (path) {
			const visualizationGroup = path.getVisualizationGroup();
			this.schematicRenderer.sceneManager.addPathVisualization(
				visualizationGroup,
				`${name}Visualization`
			);

			const targetPosition = path.getTargetPosition();
			this.schematicRenderer.sceneManager.addTargetIndicator(
				targetPosition,
				`${name}Target`
			);

			this.displayedPaths.add(name);
		} else {
			console.warn(`Camera path '${name}' not found.`);
		}
	}

	public hidePathVisualization(name: string): void {
		this.schematicRenderer.sceneManager.removePathVisualization(
			`${name}Visualization`
		);
		this.schematicRenderer.sceneManager.removeTargetIndicator(`${name}Target`);
		this.displayedPaths.delete(name);
	}

	public hideAllPathVisualizations(): void {
		this.displayedPaths.forEach((name) => {
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

	public getFirstPath(): { path: CameraPath; name: string } | null {
		const paths = Array.from(this.paths.entries());
		if (paths.length > 0) {
			return { path: paths[0][1], name: paths[0][0] };
		}
		return null;
	}
}
