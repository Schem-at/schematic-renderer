// CameraManager.ts
import * as THREE from "three";
import { EventEmitter } from "events";
import { SchematicRenderer } from "../SchematicRenderer";
import { CameraWrapper } from "./CameraWrapper";
import { CameraPath } from "../camera/CameraPath";
import { CircularCameraPath } from "../camera/CircularCameraPath";
import { CameraPathManager } from "./CameraPathManager";
import { EasingFunctions } from "../utils/EasingFunctions";
import { RecordingManager, RecordingOptions } from "./RecordingManager";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// @ts-ignore
import { CreativeControls } from "three-creative-controls";
export interface CameraManagerOptions {
	position?: [number, number, number]; // Initial camera position
	defaultCameraPreset?: "perspective" | "isometric" | "perspective_fpv"; // Default camera preset to use
	showCameraPathVisualization?: boolean; // Whether to show camera path visualization
	enableZoomInOnLoad?: boolean; // Whether to zoom in when schematics load
	zoomInDuration?: number; // Duration of zoom-in animation
	autoOrbitAfterZoom?: boolean; // Whether to start auto-orbit after zoom-in
}

export interface CameraFrame {
	position: THREE.Vector3;
	rotation: THREE.Euler;
	target: THREE.Vector3;
	progress: number;
}

export interface CameraPreset {
	type: "perspective" | "orthographic";
	position: THREE.Vector3Tuple;
	rotation?: THREE.Vector3Tuple;
	fov?: number;
	controlType: ControlType;
	controlSettings?: {
		enableDamping?: boolean;
		dampingFactor?: number;
		minDistance?: number;
		maxDistance?: number;
		enableZoom?: boolean;
		enableRotate?: boolean;
		enablePan?: boolean;
		minPolarAngle?: number;
		maxPolarAngle?: number;
	};
}

export interface CameraAnimationWithRecordingOptions {
	pathName?: string;
	totalFrames?: number;
	targetFps?: number; // e.g. 60
	easing?: (t: number) => number;
	lookAtTarget?: boolean;
	updateControls?: boolean;
	onStart?: () => void;
	onUpdate?: (progress: number) => void;
	onComplete?: () => void;
	recording?: {
		enabled: boolean;
		options?: RecordingOptions;
	};
}

type CameraType = "perspective" | "orthographic";
type ControlType = "orbit" | "creative" | "none";

export class CameraManager extends EventEmitter {
	private schematicRenderer: SchematicRenderer;
	private cameras: Map<string, CameraWrapper> = new Map();
	public cameraOptions: CameraManagerOptions;
	private activeCameraKey: string;
	public controls: Map<string, any> = new Map();
	public activeControlKey: string;
	private rendererDomElement: HTMLCanvasElement;
	private animationRequestId: number | null = null;
	private isAnimating: boolean = false;
	private animationStartPosition: THREE.Vector3 = new THREE.Vector3();
	private animationStartRotation: THREE.Euler = new THREE.Euler();
	public recordingManager: RecordingManager;

	// Auto-orbit properties
	private autoOrbitEnabled: boolean = false;
	private autoOrbitAnimationId: number | null = null;
	private autoOrbitStartTime: number = 0;
	private autoOrbitDuration: number = 30; // seconds for full 360° rotation

	public cameraPathManager: CameraPathManager;

	public static readonly CAMERA_PRESETS = {
		isometric: {
			type: "orthographic" as const,
			position: [0, 0, 20] as const, // Initial position
			rotation: [(-36 * Math.PI) / 180, (135 * Math.PI) / 180, 0] as const, // Their default angles: 36° slant, 135° rotation
			controlType: "orbit" as const,
			controlSettings: {
				enableDamping: false,
				minDistance: 10,
				maxDistance: 100,
				enableZoom: true,
				enableRotate: true,
				enablePan: true,
				minPolarAngle: Math.PI / 4, // 45 degrees
				maxPolarAngle: Math.PI * 0.4, // ~72 degrees
			},
		},
		perspective: {
			type: "perspective" as const,
			position: [0, 20, 20] as const,
			controlType: "orbit" as const,
			controlSettings: {
				enableDamping: false,
				enableZoom: true,
				enableRotate: true,
				enablePan: true,
			},
		},
		perspective_fpv: {
			type: "perspective" as const,
			position: [0, 2, 0] as const,
			fov: 90,
			controlType: "creative" as const,
			controlSettings: {
				movementSpeed: new THREE.Vector3(200, 200, 200),
			},
		},
	} as const;

	constructor(
		schematicRenderer: SchematicRenderer,
		options: CameraManagerOptions = {}
	) {
		super();
		this.schematicRenderer = schematicRenderer;
		this.rendererDomElement = this.schematicRenderer.canvas;

		this.cameraOptions = {
			enableZoomInOnLoad: options.enableZoomInOnLoad || false,
			zoomInDuration: options.zoomInDuration || 2.0,
			autoOrbitAfterZoom: options.autoOrbitAfterZoom || false,
			...options,
		};

		// Initialize RecordingManager
		this.recordingManager = new RecordingManager(schematicRenderer);

		this.activeCameraKey = "perspective";
		this.activeControlKey = "perspective-orbit";
		if (options.defaultCameraPreset) {
			console.log(
				`Switching to default camera preset: ${options.defaultCameraPreset}`
			);
			this.switchCameraPreset(options.defaultCameraPreset);
		}
		// Initialize cameras with presets
		Object.entries(CameraManager.CAMERA_PRESETS).forEach(([name, preset]) => {
			const cameraParams: any = {
				position: options.position || preset.position,
				size: preset.type === "orthographic" ? 20 : undefined,
			};

			// Only add rotation if it exists in the preset
			if ("rotation" in preset) {
				cameraParams.rotation = preset.rotation;
			}

			const camera = this.createCamera(preset.type, cameraParams);
			this.cameras.set(name, camera);

			// Create and setup controls for each camera
			const controlKey = `${name}-${preset.controlType}`;
			const controls = this.createControls(preset.controlType, camera);

			if (controls && preset.controlSettings) {
				Object.assign(controls, preset.controlSettings);

				if (name === "isometric") {
					this.setupIsometricControls(controls);
				}
			}

			if (controls) {
				this.controls.set(controlKey, controls);
				this.setupControlEvents(controls);
			}
		});

		this.controls.forEach((control, key) => {
			control.enabled = key === this.activeControlKey;
		});

		this.cameraPathManager = new CameraPathManager(this.schematicRenderer, {
			showVisualization: options.showCameraPathVisualization || false,
		});

		// Set auto-orbit duration if provided in the options
		if (this.schematicRenderer.options.autoOrbitDuration) {
			this.autoOrbitDuration = this.schematicRenderer.options.autoOrbitDuration;
		}

		if (this.schematicRenderer.eventEmitter) {
			this.schematicRenderer.eventEmitter.on("schematicAdded", async () => {
				// Handle schematic loading with optional zoom
				await this.handleSchematicLoaded(this.cameraOptions.enableZoomInOnLoad);

				// Update camera path
				const defaultPath = this.cameraPathManager.getFirstPath();
				if (defaultPath) {
					this.cameraPathManager.fitCircularPathToSchematics(defaultPath.name);
				}
			});
		}

		// Don't auto-start orbit here if we're going to zoom first
		if (
			this.schematicRenderer.options.enableAutoOrbit &&
			!this.cameraOptions.enableZoomInOnLoad
		) {
			this.startAutoOrbit();
		}
	}

	private createCamera(type: CameraType, params: any): CameraWrapper {
		let camera: CameraWrapper;
		if (type === "perspective") {
			camera = new CameraWrapper(
				"perspective",
				this.rendererDomElement,
				this.schematicRenderer,
				params
			);
		} else {
			camera = new CameraWrapper(
				"orthographic",
				this.rendererDomElement,
				this.schematicRenderer,
				params
			);
		}
		return camera;
	}

	private getDefaultCameraPath(): { path: CameraPath; name: string } | null {
		const paths = Array.from(this.cameraPathManager["paths"].entries());
		if (paths.length > 0) {
			return { path: paths[0][1], name: paths[0][0] };
		}
		return null;
	}

	public async animateCameraAlongPath(
		pathOrOptions?: CameraPath | CameraAnimationWithRecordingOptions
	): Promise<void> {
		let cameraPath: CameraPath | undefined;
		let options: CameraAnimationWithRecordingOptions = {};

		if (pathOrOptions instanceof CameraPath) {
			cameraPath = pathOrOptions;
		} else if (typeof pathOrOptions === "object") {
			options = pathOrOptions;
			if (options.pathName) {
				cameraPath = this.cameraPathManager.getPath(options.pathName);
			}
		}

		if (!cameraPath) {
			const defaultPath = this.getDefaultCameraPath();
			if (!defaultPath) {
				return Promise.reject(new Error("No camera path available"));
			}
			cameraPath = defaultPath.path;
			console.log(`Using default camera path: ${defaultPath.name}`);
		}

		const {
			totalFrames = 300,
			targetFps = 60,
			easing = EasingFunctions.linear,
			lookAtTarget = true,
			updateControls = true,
			onStart,
			onUpdate,
			onComplete,
		} = options;

		const targetFrameMs = 1000 / targetFps;
		this.stopAnimation();

		try {
			return new Promise((resolve, _) => {
				this.isAnimating = true;
				let frame = 0;
				let lastFrameTime = performance.now();

				this.animationStartPosition.copy(
					this.activeCamera.position as THREE.Vector3
				);
				this.animationStartRotation.copy(
					this.activeCamera.rotation as THREE.Euler
				);

				if (updateControls) {
					const controls = this.controls.get(this.activeControlKey);
					if (controls && controls.enabled) {
						controls.enabled = false;
					}
				}

				//set the camera to the start of the path
				const {
					position: startPosition,
					rotation: startRotation,
					target,
				} = cameraPath!.getPoint(0);
				(this.activeCamera.position as THREE.Vector3).copy(startPosition);
				(this.activeCamera.rotation as THREE.Euler).copy(startRotation);
				if (lookAtTarget) {
					this.activeCamera.lookAt(target);
				}

				const animate = async () => {
					let t = frame / totalFrames;
					t = easing(t);

					const { position, rotation, target } = cameraPath!.getPoint(t);
					(this.activeCamera.position as THREE.Vector3).copy(position);

					if (lookAtTarget) {
						this.activeCamera.lookAt(target);
					} else {
						(this.activeCamera.rotation as THREE.Euler).copy(rotation);
					}

					this.emit("cameraMove", {
						position: (this.activeCamera.position as THREE.Vector3).clone(),
						rotation: (this.activeCamera.rotation as THREE.Euler).clone(),
						progress: t,
					});

					if (onUpdate) {
						await onUpdate(t);
					}

					frame++;

					if (frame <= totalFrames) {
						const currentTime = performance.now();
						const frameTime = currentTime - lastFrameTime;
						const delay = Math.max(0, targetFrameMs - frameTime);

						lastFrameTime = currentTime;
						setTimeout(() => {
							this.animationRequestId = requestAnimationFrame(animate);
						}, delay);
					} else {
						this.isAnimating = false;

						if (updateControls) {
							const controls = this.controls.get(this.activeControlKey);
							if (controls) {
								controls.enabled = true;
							}
						}

						if (onComplete) {
							onComplete();
						}

						resolve();
					}
				};
				onStart && onStart();
				this.animationRequestId = requestAnimationFrame(animate);
			});
		} catch (error) {
			this.stopAnimation();
			throw error;
		}
	}

	public isCurrentlyAnimating(): boolean {
		return this.isAnimating;
	}

	public stopAnimation(): void {
		if (this.animationRequestId !== null) {
			cancelAnimationFrame(this.animationRequestId);
			this.animationRequestId = null;
			this.isAnimating = false;

			// Re-enable controls if they exist
			const controls = this.controls.get(this.activeControlKey);
			if (controls) {
				controls.enabled = true;
			}
		}
	}

	public switchCameraPreset(presetName: string): void {
		const preset =
			CameraManager.CAMERA_PRESETS[
				presetName as keyof typeof CameraManager.CAMERA_PRESETS
			];
		if (!preset) {
			console.warn(`Preset ${presetName} not found`);
			return;
		}

		// Store previous camera state
		const previousCameraKey = this.activeCameraKey;

		// Hide any existing FPV overlay
		this.schematicRenderer.uiManager?.hideFPVOverlay();

		// Switch to new camera
		this.activeCameraKey = presetName;

		// Handle controls
		const controlKey = `${presetName}-${preset.controlType}`;

		// Update control states
		this.controls.forEach((control, key) => {
			control.enabled = key === controlKey;
		});

		this.activeControlKey = controlKey;

		// Update the active control
		const activeControl = this.controls.get(this.activeControlKey);
		if (activeControl) {
			// Update the control's camera reference
			activeControl.object = this.activeCamera.camera;

			// Only call update on orbit controls
			if (preset.controlType === "orbit" && activeControl.update) {
				activeControl.update();
			}
		}

		// Show FPV overlay if switching to creative mode
		if (preset.controlType === "creative") {
			this.schematicRenderer.uiManager?.showFPVOverlay();
		}

		// Update renderer camera if RenderManager exists
		if (this.schematicRenderer.renderManager) {
			this.schematicRenderer.renderManager.updateCamera(
				this.activeCamera.camera
			);
		}

		// Emit change event
		this.emit("cameraChanged", {
			previousCamera: previousCameraKey,
			newCamera: presetName,
			controlType: preset.controlType,
		});

		// Focus on schematics if they exist
		if (
			this.schematicRenderer.schematicManager &&
			!this.schematicRenderer.schematicManager.isEmpty()
		) {
			this.focusOnSchematics();
		}
	}

	// Methods to interact with CameraPathManager
	public updatePathParameters(name: string, params: any): void {
		this.cameraPathManager.updatePathParameters(name, params);
	}

	public showPathVisualization(name: string): void {
		this.cameraPathManager.showPathVisualization(name);
	}

	public hidePathVisualization(name: string): void {
		this.cameraPathManager.hidePathVisualization(name);
	}

	public getCameraPath(name: string): CameraPath | undefined {
		return this.cameraPathManager.getPath(name);
	}

	// Control Management
	private createControls(type: ControlType, camera: CameraWrapper): any {
		return camera.createControls(type);
	}

	switchControls(type: ControlType) {
		// Dispose of current controls
		const currentControls = this.controls.get(this.activeControlKey);
		if (currentControls && currentControls.dispose) {
			currentControls.dispose();
		}

		// Create new controls
		const camera = this.activeCamera;
		const newControls = this.createControls(type, camera);
		this.controls.set(type, newControls);
		this.activeControlKey = type;

		// Listen to control events
		if (newControls) {
			this.setupControlEvents(newControls);
		}
	}

	private setupControlEvents(controls: any) {
		controls.addEventListener("change", () => {
			this.emit("propertyChanged", {
				property: "position",
				value: (this.activeCamera.position as THREE.Vector3).clone(),
			});

			this.emit("propertyChanged", {
				property: "rotation",
				value: (this.activeCamera.rotation as THREE.Euler).clone(),
			});
		});
	}

	private setupIsometricControls(controls: OrbitControls): void {
		// Configure orbit controls specifically for isometric view
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.minDistance = 10;
		controls.maxDistance = 100;
		controls.enableZoom = true;
		controls.enableRotate = true;
		controls.enablePan = true;

		// Restrict vertical rotation to maintain isometric feel
		controls.minPolarAngle = Math.PI / 4; // 45 degrees
		controls.maxPolarAngle = Math.PI / 2.5; // ~72 degrees
	}

	public update(deltaTime: number = 0) {
		const controls = this.controls.get(this.activeControlKey);
		if (!controls) return;

		if (this.activeControlKey.includes("creative")) {
			const speed =
				CameraManager.CAMERA_PRESETS.perspective_fpv.controlSettings
					?.movementSpeed;
			if (speed) {
				CreativeControls.update(controls, speed);
			}
		} else if (controls.update) {
			controls.update(deltaTime);
		}
	}

	// Camera properties
	get activeCamera(): CameraWrapper {
		return this.cameras.get(this.activeCameraKey)!;
	}

	updateAspectRatio(aspect: number) {
		this.cameras.forEach((cameraWrapper) => {
			if (cameraWrapper.camera instanceof THREE.PerspectiveCamera) {
				cameraWrapper.camera.aspect = aspect;
				cameraWrapper.camera.updateProjectionMatrix();
			} else if (cameraWrapper.camera instanceof THREE.OrthographicCamera) {
				const frustumSize = 50; // Increased from 10
				cameraWrapper.camera.left = (frustumSize * aspect) / -2;
				cameraWrapper.camera.right = (frustumSize * aspect) / 2;
				cameraWrapper.camera.top = frustumSize / 2;
				cameraWrapper.camera.bottom = frustumSize / -2;
				cameraWrapper.camera.updateProjectionMatrix();
			}
		});
	}

	// Look at a target
	public lookAt(target: THREE.Vector3 | THREE.Vector3Tuple) {
		if (Array.isArray(target)) {
			this.activeCamera.lookAt(new THREE.Vector3(...target));
		} else {
			this.activeCamera.lookAt(target);
		}
	}

	public lookAtSchematicsCenter() {
		if (!this.schematicRenderer.schematicManager) {
			return;
		}
		const averagePosition =
			this.schematicRenderer.schematicManager.getSchematicsAveragePosition();
		this.activeCamera.lookAt(averagePosition);
	}

	/**
	 * Enhanced focusOnSchematics method with proper framing calculations
	 */
	public async focusOnSchematics(
		options: {
			padding?: number; // Percentage of padding (0.1 = 10% padding)
			animationDuration?: number; // Duration in seconds for smooth transition
			easing?: (t: number) => number;
			skipPathFitting?: boolean; // New option
		} = {}
	): Promise<void> {
		console.log("Focusing on schematics with improved framing");

		if (!this.schematicRenderer?.schematicManager) {
			return;
		}
		if (this.schematicRenderer.schematicManager.isEmpty()) {
			return;
		}

		const {
			padding = 0.15, // 15% padding by default
			animationDuration = 0,
			easing = (t: number) => t * t * (3.0 - 2.0 * t), // smooth step
			skipPathFitting = false, // New option
		} = options;

		// Temporarily disable controls
		const controls = this.controls.get(this.activeControlKey);
		if (controls) {
			controls.enabled = false;
		}

		// Get comprehensive schematic bounds
		const bounds = this.calculateSchematicBounds();
		if (!bounds) {
			console.warn("No valid schematic bounds found");
			if (controls) controls.enabled = true;
			return;
		}

		const { center, size, boundingBox } = bounds;
		const maxDimension = Math.max(size.x, size.y, size.z);

		// Get viewport dimensions
		const canvas = this.schematicRenderer.canvas;
		const aspect = canvas.width / canvas.height;

		// Store current camera state for animation
		const startPosition = new THREE.Vector3().copy(
			this.activeCamera.position as THREE.Vector3
		);
		const startRotation = new THREE.Euler().copy(
			this.activeCamera.rotation as THREE.Euler
		);

		let targetPosition: THREE.Vector3;
		let targetRotation: THREE.Euler | null = null;

		if (this.activeCameraKey === "isometric") {
			// Enhanced isometric framing
			const result = this.calculateIsometricFraming(
				center,
				size,
				aspect,
				padding
			);
			targetPosition = result.position;
			targetRotation = result.rotation;

			// Update orthographic camera size for optimal framing
			const orthoCamera = this.activeCamera.camera as THREE.OrthographicCamera;
			const requiredSize = this.calculateOrthographicSize(
				size,
				aspect,
				padding
			);

			orthoCamera.left = (-requiredSize * aspect) / 2;
			orthoCamera.right = (requiredSize * aspect) / 2;
			orthoCamera.top = requiredSize / 2;
			orthoCamera.bottom = -requiredSize / 2;
			orthoCamera.updateProjectionMatrix();
		} else {
			// Enhanced perspective framing
			targetPosition = this.calculatePerspectiveFraming(
				center,
				size,
				aspect,
				padding
			);
		}

		// Animate to target position if duration > 0
		if (animationDuration > 0) {
			await this.animateToPosition(
				startPosition,
				startRotation,
				targetPosition,
				targetRotation,
				center,
				animationDuration,
				easing
			);
		} else {
			// Immediate positioning
			this.activeCamera.setPosition([
				targetPosition.x,
				targetPosition.y,
				targetPosition.z,
			]);
			if (targetRotation) {
				this.activeCamera.rotation = [
					targetRotation.x,
					targetRotation.y,
					targetRotation.z,
				];
			}
		}

		// Update controls target
		if (controls && "target" in controls) {
			controls.target.copy(center);
			controls.update();
		}

		// Re-enable controls
		if (controls) {
			controls.enabled = true;
		}

		// Only update the circular camera path if not skipping
		if (!skipPathFitting) {
			this.cameraPathManager.fitCircularPathToSchematics("circularPath", {
				padding,
				minRadius: maxDimension * 0.8,
				maxRadius: maxDimension * 2.5,
			});
		}

		// Handle auto-orbit restart
		const wasAutoOrbitActive = this.autoOrbitEnabled;
		if (wasAutoOrbitActive) {
			this.stopAutoOrbit();
			this.startAutoOrbit();
		}
	}

	/**
	 * Calculate optimal orthographic camera size
	 */
	private calculateOrthographicSize(
		objectSize: THREE.Vector3,
		aspect: number,
		padding: number
	): number {
		// For orthographic cameras, we need to set the frustum size
		// to properly frame the object

		const paddingFactor = 1 + padding * 2;

		// Calculate size needed for both width and height
		const requiredWidth = objectSize.x * paddingFactor;
		const requiredHeight = objectSize.y * paddingFactor;

		// Use the larger requirement considering aspect ratio
		const effectiveWidth = requiredWidth / aspect;
		const size = Math.max(effectiveWidth, requiredHeight);

		// Ensure minimum size for very small objects
		const minSize = Math.max(objectSize.x, objectSize.y, objectSize.z) * 2;

		return Math.max(size, minSize);
	}

	/**
	 * Start auto-orbit with an optional zoom-in first
	 */
	public async startAutoOrbitWithZoomIn(
		options: {
			zoomIn?: boolean;
			zoomDuration?: number;
			orbitDelay?: number; // Delay before starting orbit after zoom
			orbitTransitionDuration?: number; // Duration for smooth transition to orbit
		} = {}
	): Promise<void> {
		const {
			zoomIn = true,
			zoomDuration = 2.0,
			orbitDelay = 0.5,
			orbitTransitionDuration = 1.0,
		} = options;

		if (zoomIn && !this.schematicRenderer?.schematicManager?.isEmpty()) {
			console.log("Starting cinematic zoom-in followed by auto-orbit");

			// First, zoom in cinematically
			await this.zoomInToSchematics({
				duration: zoomDuration,
				padding: 0.15,
			});

			// Brief pause
			if (orbitDelay > 0) {
				await new Promise((resolve) => setTimeout(resolve, orbitDelay * 1000));
			}

			// Then start auto-orbit with smooth transition
			this.startAutoOrbitSmooth({
				transitionDuration: orbitTransitionDuration,
				startFromCurrentPosition: true,
			});
		} else {
			// Just start auto-orbit with smooth transition
			this.startAutoOrbitSmooth({
				transitionDuration: orbitTransitionDuration,
				startFromCurrentPosition: true,
			});
		}
	}

	/**
	 * Enable or disable zoom-in on schematic load
	 */
	public setZoomInOnLoad(enabled: boolean, duration: number = 2.0): void {
		this.cameraOptions.enableZoomInOnLoad = enabled;
		this.cameraOptions.zoomInDuration = duration;
	}

	/**
	 * Enable or disable auto-orbit after zoom
	 */
	public setAutoOrbitAfterZoom(enabled: boolean): void {
		this.cameraOptions.autoOrbitAfterZoom = enabled;
	}

	/**
	 * Get current zoom-in and orbit settings
	 */
	public getCameraSettings(): {
		enableZoomInOnLoad: boolean;
		zoomInDuration: number;
		autoOrbitAfterZoom: boolean;
		autoOrbitEnabled: boolean;
	} {
		return {
			enableZoomInOnLoad: this.cameraOptions.enableZoomInOnLoad || false,
			zoomInDuration: this.cameraOptions.zoomInDuration || 2.0,
			autoOrbitAfterZoom: this.cameraOptions.autoOrbitAfterZoom || false,
			autoOrbitEnabled: this.autoOrbitEnabled,
		};
	}

	/**
	 * Enhanced schematic loading that supports the zoom effect
	 */
	public async handleSchematicLoaded(
		enableZoomIn: boolean = false
	): Promise<void> {
		if (enableZoomIn) {
			// Pre-calculate the final orbit path ONCE at the beginning
			const defaultPath = this.cameraPathManager.getFirstPath();
			if (defaultPath) {
				this.cameraPathManager.fitCircularPathToSchematics(defaultPath.name);
			}

			// Use cinematic zoom that goes directly to the orbit position
			await this.zoomToOrbitPosition({
				duration: this.cameraOptions.zoomInDuration || 2.0,
				padding: 0.15,
				startFromCurrentPosition: true,
				startOrbitAfterZoom: this.cameraOptions.autoOrbitAfterZoom || false,
			});
		} else {
			// Immediate positioning (current behavior)
			await this.focusOnSchematics({
				animationDuration: 0, // No animation
				padding: 0.15,
			});

			// Update camera path after immediate positioning
			const defaultPath = this.cameraPathManager.getFirstPath();
			if (defaultPath) {
				this.cameraPathManager.fitCircularPathToSchematics(defaultPath.name);
			}

			// ✅ FIXED: Now start auto-orbit AFTER positioning and path fitting
			if (this.schematicRenderer.options.enableAutoOrbit) {
				setTimeout(() => {
					console.log("🔄 Starting auto-orbit from optimal position");
					this.startAutoOrbitFromOptimalPosition();
				}, 100);
			}
		}
	}

	/**
	 * Start auto-orbit from an optimal viewing position
	 */
	private startAutoOrbitFromOptimalPosition(): void {
		if (this.autoOrbitEnabled) {
			return; // Already running
		}

		// Get the fitted camera path
		const defaultPath = this.cameraPathManager.getFirstPath();
		if (!defaultPath || !(defaultPath.path instanceof CircularCameraPath)) {
			console.warn(
				"Cannot start auto-orbit: No circular camera path available"
			);
			return;
		}

		const circularPath = defaultPath.path as CircularCameraPath;

		// Find a good starting point on the orbit (current camera position projected onto orbit)
		const currentPosition = new THREE.Vector3().copy(
			this.activeCamera.position as THREE.Vector3
		);
		const optimalOrbitPoint = this.findClosestOrbitPoint(
			circularPath,
			currentPosition
		);

		// Set the orbit to start from this point
		circularPath.setStartAngle(optimalOrbitPoint.angle);

		// Position camera at the optimal orbit start point
		this.activeCamera.setPosition([
			optimalOrbitPoint.position.x,
			optimalOrbitPoint.position.y,
			optimalOrbitPoint.position.z,
		]);

		// Look at the target
		this.activeCamera.lookAt(circularPath.getTargetPosition());

		// Update controls target
		const controls = this.controls.get(this.activeControlKey);
		if (controls && "target" in controls) {
			controls.target.copy(circularPath.getTargetPosition());
			controls.update();
		}

		// Now start the orbit (camera is already in perfect position)
		this.startAutoOrbit();
	}

	/**
	 * Start auto-orbit with smooth transition from current camera position
	 */
	public startAutoOrbitSmooth(
		options: {
			transitionDuration?: number;
			startFromCurrentPosition?: boolean;
			easing?: (t: number) => number;
			skipPathFitting?: boolean; // New option to skip redundant path fitting
		} = {}
	): void {
		if (this.autoOrbitEnabled) {
			return; // Already running
		}

		const {
			transitionDuration = 1.0,
			startFromCurrentPosition = true,
			easing = (t: number) => t * t * (3.0 - 2.0 * t),
			skipPathFitting = false,
		} = options;

		// Stop any current animations
		this.stopAnimation();

		// Get the default camera path
		const defaultPath = this.cameraPathManager.getFirstPath();
		if (!defaultPath) {
			console.warn("Cannot start auto-orbit: No camera path available");
			return;
		}

		if (!(defaultPath.path instanceof CircularCameraPath)) {
			console.warn("Auto-orbit only supports CircularCameraPath");
			return;
		}

		// Only fit path if not already done
		if (
			!skipPathFitting &&
			this.schematicRenderer?.schematicManager &&
			!this.schematicRenderer.schematicManager.isEmpty()
		) {
			this.cameraPathManager.fitCircularPathToSchematics(defaultPath.name);
		}

		const circularPath = defaultPath.path as CircularCameraPath;

		if (startFromCurrentPosition && transitionDuration > 0) {
			// Smoothly transition to orbit
			this.transitionToOrbit(circularPath, transitionDuration, easing);
		} else {
			// Start orbit immediately
			this.startAutoOrbit();
		}
	}

	/**
	 * Zoom into schematics with a cinematic reveal effect
	 */
	public async zoomInToSchematics(
		options: {
			padding?: number;
			duration?: number;
			easing?: (t: number) => number;
			startDistance?: number;
			startFromCurrentPosition?: boolean;
			skipPathFitting?: boolean; // New option
		} = {}
	): Promise<void> {
		const {
			padding = 0.15,
			duration = 2.0,
			easing = (t: number) => t * t * (3.0 - 2.0 * t),
			startDistance = 3.0,
			startFromCurrentPosition = false,
			skipPathFitting = false, // Don't update path during zoom sequence
		} = options;

		if (!this.schematicRenderer?.schematicManager?.isEmpty()) {
			console.log("Starting cinematic zoom-in to schematics");

			// Get the optimal target position first (without animation)
			const bounds = this.calculateSchematicBounds();
			if (!bounds) return;

			const { center, size } = bounds;
			const canvas = this.schematicRenderer.canvas;
			const aspect = canvas.width / canvas.height;

			// Calculate the final target position
			let finalPosition: THREE.Vector3;
			let finalRotation: THREE.Euler | null = null;

			if (this.activeCameraKey === "isometric") {
				const result = this.calculateIsometricFraming(
					center,
					size,
					aspect,
					padding
				);
				finalPosition = result.position;
				finalRotation = result.rotation;
			} else {
				finalPosition = this.calculatePerspectiveFraming(
					center,
					size,
					aspect,
					padding
				);
			}

			// Calculate starting position
			let startPosition: THREE.Vector3;
			if (startFromCurrentPosition) {
				startPosition = new THREE.Vector3().copy(
					this.activeCamera.position as THREE.Vector3
				);
			} else {
				const direction = finalPosition.clone().sub(center).normalize();
				startPosition = center
					.clone()
					.add(
						direction.multiplyScalar(
							finalPosition.distanceTo(center) * startDistance
						)
					);
			}

			// Animate to the final position
			const controls = this.controls.get(this.activeControlKey);
			if (controls) controls.enabled = false;

			await this.animateToPosition(
				startPosition,
				this.activeCamera.rotation as THREE.Euler,
				finalPosition,
				finalRotation,
				center,
				duration,
				easing
			);

			// Update controls
			if (controls && "target" in controls) {
				controls.target.copy(center);
				controls.update();
			}
			if (controls) controls.enabled = true;

			// Only update camera path if not skipping
			if (!skipPathFitting) {
				this.cameraPathManager.fitCircularPathToSchematics("circularPath", {
					padding,
				});
			}
		}
	}

	/**
	 * Smoothly transition from current camera position to auto-orbit
	 */
	private async transitionToOrbit(
		circularPath: CircularCameraPath,
		duration: number,
		easing: (t: number) => number
	): Promise<void> {
		// Get current camera state
		const startPosition = new THREE.Vector3().copy(
			this.activeCamera.position as THREE.Vector3
		);
		const currentTarget = circularPath.getTargetPosition();

		// Find the closest point on the orbit path to current camera position
		const closestPoint = this.findClosestOrbitPoint(
			circularPath,
			startPosition
		);
		const targetPosition = closestPoint.position;

		// Update the circular path to start from this closest point
		circularPath.setStartAngle(closestPoint.angle);

		// Disable controls during transition
		const controls = this.controls.get(this.activeControlKey);
		if (controls) {
			controls.enabled = false;
		}

		// Animate from current position to orbit start position
		await this.animateToPosition(
			startPosition,
			this.activeCamera.rotation as THREE.Euler,
			targetPosition,
			null, // Let it look at target naturally
			currentTarget,
			duration,
			easing
		);

		// Now start the auto-orbit from this position
		this.startAutoOrbit();
	}

	/**
	 * Find the closest point on the circular orbit to the given position
	 */
	private findClosestOrbitPoint(
		circularPath: CircularCameraPath,
		position: THREE.Vector3
	): { position: THREE.Vector3; angle: number } {
		const center = circularPath.getCenter();
		const radius = circularPath.getRadius();
		const height = circularPath.getHeight();

		// Project the current position onto the XZ plane at orbit height
		const projectedPosition = new THREE.Vector3(
			position.x,
			center.y + height,
			position.z
		);

		// Calculate the angle from center to this projected position
		const deltaX = projectedPosition.x - center.x;
		const deltaZ = projectedPosition.z - center.z;
		const angle = Math.atan2(deltaZ, deltaX);

		// Calculate the actual orbit position at this angle
		const orbitPosition = new THREE.Vector3(
			center.x + radius * Math.cos(angle),
			center.y + height,
			center.z + radius * Math.sin(angle)
		);

		return {
			position: orbitPosition,
			angle: angle,
		};
	}

	/**
	 * Animate camera to target position smoothly
	 */
	private async animateToPosition(
		startPos: THREE.Vector3,
		startRot: THREE.Euler,
		targetPos: THREE.Vector3,
		targetRot: THREE.Euler | null,
		lookAtTarget: THREE.Vector3,
		duration: number,
		easing: (t: number) => number
	): Promise<void> {
		return new Promise((resolve) => {
			const startTime = performance.now();
			const animate = () => {
				const elapsed = (performance.now() - startTime) / 1000;
				let t = Math.min(elapsed / duration, 1);
				t = easing(t);

				// Interpolate position
				const currentPos = startPos.clone().lerp(targetPos, t);
				this.activeCamera.setPosition([
					currentPos.x,
					currentPos.y,
					currentPos.z,
				]);

				// Handle rotation or look-at
				if (targetRot) {
					// Interpolate rotation for isometric
					const currentRot = startRot.clone();
					currentRot.x = THREE.MathUtils.lerp(startRot.x, targetRot.x, t);
					currentRot.y = THREE.MathUtils.lerp(startRot.y, targetRot.y, t);
					currentRot.z = THREE.MathUtils.lerp(startRot.z, targetRot.z, t);
					this.activeCamera.rotation = [
						currentRot.x,
						currentRot.y,
						currentRot.z,
					];
				} else {
					// Look at target for perspective cameras
					this.activeCamera.lookAt(lookAtTarget);
				}

				if (t < 1) {
					requestAnimationFrame(animate);
				} else {
					resolve();
				}
			};
			requestAnimationFrame(animate);
		});
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
	 * Calculate optimal position for perspective camera
	 */
	private calculatePerspectiveFraming(
		center: THREE.Vector3,
		size: THREE.Vector3,
		aspect: number,
		padding: number
	): THREE.Vector3 {
		const camera = this.activeCamera.camera as THREE.PerspectiveCamera;
		const fov = THREE.MathUtils.degToRad(camera.fov);

		// Calculate the distance needed to fit the object
		const maxDimension = Math.max(size.x, size.y, size.z);

		// Account for aspect ratio - use the larger dimension relative to viewport
		const effectiveSize =
			aspect < 1
				? Math.max(size.x / aspect, size.y) // Portrait viewport
				: Math.max(size.x, size.y * aspect); // Landscape viewport

		// Calculate distance using field of view
		// Add padding by increasing the effective size
		const paddedSize = effectiveSize * (1 + padding * 2);
		const distance = paddedSize / 2 / Math.tan(fov / 2);

		// Ensure minimum distance for very small objects
		const minDistance = maxDimension * 2;
		const finalDistance = Math.max(distance, minDistance);

		// Position camera at an optimal viewing angle (slightly elevated and offset)
		const offset = new THREE.Vector3(
			finalDistance * 0.7071, // 45-degree angle
			finalDistance * 0.5, // Slightly elevated
			finalDistance * 0.7071
		);

		return center.clone().add(offset);
	}

	/**
	 * Calculate optimal position and rotation for isometric camera
	 */
	private calculateIsometricFraming(
		center: THREE.Vector3,
		size: THREE.Vector3,
		aspect: number,
		padding: number
	): { position: THREE.Vector3; rotation: THREE.Euler } {
		const preset = CameraManager.CAMERA_PRESETS.isometric;

		// Use preset rotation
		const rotation = new THREE.Euler(...preset.rotation!);

		// Calculate distance based on the largest dimension and padding
		const maxDimension = Math.max(size.x, size.y, size.z);
		const paddedDimension = maxDimension * (1 + padding * 2);

		// Distance factor for isometric view (adjusted for optimal viewing)
		const distanceFactor = paddedDimension * 1.2;

		// Apply isometric positioning offset
		const offset = new THREE.Vector3(
			distanceFactor * 0.7071, // X offset for isometric angle
			distanceFactor * 0.7071, // Y offset for elevation
			distanceFactor * 0.7071 // Z offset for depth
		);

		const position = center.clone().add(offset);

		return { position, rotation };
	}

	/**
	 * Zoom directly to the final orbit position in one smooth motion
	 */
	public async zoomToOrbitPosition(
		options: {
			duration?: number;
			padding?: number;
			startFromCurrentPosition?: boolean;
			startOrbitAfterZoom?: boolean;
			easing?: (t: number) => number;
		} = {}
	): Promise<void> {
		const {
			duration = 2.0,
			padding = 0.15,
			startFromCurrentPosition = true,
			startOrbitAfterZoom = false,
			easing = (t: number) => t * t * (3.0 - 2.0 * t),
		} = options;

		if (this.schematicRenderer?.schematicManager?.isEmpty()) {
			return;
		}

		console.log("Starting zoom directly to orbit position");

		// Get the orbit path (should already be fitted)
		const defaultPath = this.cameraPathManager.getFirstPath();
		if (!defaultPath || !(defaultPath.path instanceof CircularCameraPath)) {
			console.warn("No circular camera path available for zoom to orbit");
			return;
		}

		const circularPath = defaultPath.path as CircularCameraPath;
		const bounds = this.calculateSchematicBounds();
		if (!bounds) return;

		// Calculate starting position
		let startPosition: THREE.Vector3;
		if (startFromCurrentPosition) {
			startPosition = new THREE.Vector3().copy(
				this.activeCamera.position as THREE.Vector3
			);
		} else {
			// Calculate a dramatic starting position (much further away)
			const { center } = bounds;
			const orbitCenter = circularPath.getCenter();
			const orbitRadius = circularPath.getRadius();
			const direction = orbitCenter.clone().sub(center).normalize();
			startPosition = center
				.clone()
				.add(direction.multiplyScalar(orbitRadius * 3));
		}

		// Find the optimal point on the orbit to zoom to
		const targetOrbitPoint = this.findClosestOrbitPoint(
			circularPath,
			startPosition
		);

		// Update the circular path to start from this point (for later orbit)
		circularPath.setStartAngle(targetOrbitPoint.angle);

		// Disable controls during animation
		const controls = this.controls.get(this.activeControlKey);
		if (controls) controls.enabled = false;

		// Animate directly to the orbit position
		await this.animateToPosition(
			startPosition,
			this.activeCamera.rotation as THREE.Euler,
			targetOrbitPoint.position,
			null,
			circularPath.getTargetPosition(),
			duration,
			easing
		);

		// Update controls target
		if (controls && "target" in controls) {
			controls.target.copy(circularPath.getTargetPosition());
			controls.update();
		}

		// Re-enable controls
		if (controls) controls.enabled = true;

		// Start orbit immediately if requested (no additional transition needed)
		if (startOrbitAfterZoom) {
			// Brief pause, then start orbit from current position (no transition needed)
			setTimeout(() => {
				this.startAutoOrbit(); // Camera is already in position
			}, 500);
		}
	}

	/**
	 * Starts auto-orbiting the camera around the default camera path
	 */
	public startAutoOrbit(): void {
		if (this.autoOrbitEnabled) {
			return; // Already running
		}

		// Stop any current animations
		this.stopAnimation();

		// Get the default camera path
		const defaultPath = this.cameraPathManager.getFirstPath();
		if (!defaultPath) {
			console.warn("Cannot start auto-orbit: No camera path available");
			return;
		}

		// Make sure we have a circular path
		if (!(defaultPath.path instanceof CircularCameraPath)) {
			console.warn("Auto-orbit only supports CircularCameraPath");
			return;
		}

		console.log("🎬 Starting auto-orbit animation from current position");

		// Disable controls during auto-orbit
		const controls = this.controls.get(this.activeControlKey);
		if (controls) {
			controls.enabled = false;
		}

		this.autoOrbitEnabled = true;
		this.autoOrbitStartTime = performance.now();

		// Start animation loop (same as before)
		const animateOrbit = () => {
			if (!this.autoOrbitEnabled) return;

			const elapsedTime = (performance.now() - this.autoOrbitStartTime) / 1000;
			const t = (elapsedTime % this.autoOrbitDuration) / this.autoOrbitDuration;

			const { position, rotation, target } = defaultPath.path.getPoint(t);

			(this.activeCamera.position as THREE.Vector3).copy(position);
			this.activeCamera.lookAt(target);

			this.emit("cameraMove", {
				position: (this.activeCamera.position as THREE.Vector3).clone(),
				rotation: (this.activeCamera.rotation as THREE.Euler).clone(),
				progress: t,
			});

			this.autoOrbitAnimationId = requestAnimationFrame(animateOrbit);
		};

		this.autoOrbitAnimationId = requestAnimationFrame(animateOrbit);
	}

	/**
	 * Stops the auto-orbit animation
	 */
	public stopAutoOrbit(): void {
		if (!this.autoOrbitEnabled) {
			return; // Not running
		}

		this.autoOrbitEnabled = false;

		// Cancel animation
		if (this.autoOrbitAnimationId !== null) {
			cancelAnimationFrame(this.autoOrbitAnimationId);
			this.autoOrbitAnimationId = null;
		}

		// Re-enable controls
		const controls = this.controls.get(this.activeControlKey);
		if (controls) {
			controls.enabled = true;
		}
	}

	/**
	 * Toggles the auto-orbit feature
	 * @returns The new state of auto-orbit (true = enabled, false = disabled)
	 */
	public toggleAutoOrbit(): boolean {
		if (this.autoOrbitEnabled) {
			this.stopAutoOrbit();
			return false;
		} else {
			this.startAutoOrbit();
			return true;
		}
	}

	/**
	 * Sets the auto-orbit duration
	 * @param duration Duration in seconds for a full rotation
	 */
	public setAutoOrbitDuration(duration: number): void {
		this.autoOrbitDuration = duration;
	}

	/**
	 * Gets the current state of auto-orbit
	 * @returns True if auto-orbit is enabled
	 */
	public isAutoOrbitEnabled(): boolean {
		return this.autoOrbitEnabled;
	}

	public dispose(): void {
		this.recordingManager.dispose();
		this.stopAnimation();
		this.stopAutoOrbit();

		// Dispose of all controls
		this.controls.forEach((control) => {
			if (control.dispose) {
				control.dispose();
			}
		});

		// Clear all maps
		this.controls.clear();
		this.cameras.clear();
	}
}
