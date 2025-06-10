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

// Define constants for minimums to avoid magic numbers and allow easier tuning
const ABSOLUTE_MIN_ORTHO_VISIBLE_HEIGHT = 5; // Minimum world units for orthographic camera's visible height
const ABSOLUTE_MIN_PERSPECTIVE_DISTANCE = 5; // Minimum world units for perspective camera's distance from target

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

		this.activeCameraKey = "perspective"; // Default active camera key
		// Set default active control key based on default camera preset if available
		const defaultPresetName = options.defaultCameraPreset || "perspective";
		const defaultPreset =
			CameraManager.CAMERA_PRESETS[
				defaultPresetName as keyof typeof CameraManager.CAMERA_PRESETS
			] || CameraManager.CAMERA_PRESETS.perspective;
		this.activeControlKey = `${defaultPresetName}-${defaultPreset.controlType}`;

		if (options.defaultCameraPreset) {
			console.log(
				`Switching to default camera preset: ${options.defaultCameraPreset}`
			);
			this.activeCameraKey = options.defaultCameraPreset; // Set active camera before switch
			this.switchCameraPreset(options.defaultCameraPreset);
		}
		// Initialize cameras with presets
		Object.entries(CameraManager.CAMERA_PRESETS).forEach(([name, preset]) => {
			const cameraParams: any = {
				position: options.position || preset.position,
				size: preset.type === "orthographic" ? 20 : undefined, // Default ortho size
				fov: preset.fov, // Pass FOV if defined
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

		// Ensure the initial active camera and controls are correctly set up
		if (!this.cameras.has(this.activeCameraKey)) {
			this.activeCameraKey = "perspective"; // Fallback if default was invalid
		}
		const initialPreset =
			CameraManager.CAMERA_PRESETS[
				this.activeCameraKey as keyof typeof CameraManager.CAMERA_PRESETS
			];
		this.activeControlKey = `${this.activeCameraKey}-${initialPreset.controlType}`;

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

				// Update camera path - This might be redundant if handleSchematicLoaded already does it
				// const defaultPath = this.cameraPathManager.getFirstPath();
				// if (defaultPath) {
				// 	this.cameraPathManager.fitCircularPathToSchematics(defaultPath.name);
				// }
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
				// When aspect ratio changes, orthographic cameras need their frustum recalculated
				// to maintain proper framing if focusOnSchematics was called.
				// For now, just update using a fixed frustum size, but ideally, it should re-focus.
				const frustumHeight =
					cameraWrapper.camera.top - cameraWrapper.camera.bottom; // Preserve current height
				cameraWrapper.camera.left = (-frustumHeight * aspect) / 2;
				cameraWrapper.camera.right = (frustumHeight * aspect) / 2;
				// cameraWrapper.camera.top = frustumHeight / 2; // Already set
				// cameraWrapper.camera.bottom = -frustumHeight / 2; // Already set
				cameraWrapper.camera.updateProjectionMatrix();
			}
		});
		// Re-focus if schematics are present to adjust for new aspect ratio
		if (
			this.schematicRenderer.schematicManager &&
			!this.schematicRenderer.schematicManager.isEmpty()
		) {
			this.focusOnSchematics({ animationDuration: 0 });
		}
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
			skipPathFitting = false,
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
		// @ts-ignore

		const { center, size } = bounds; // size is a Vector3 with x, y, z dimensions

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

		if (this.activeCamera.camera.type === "OrthographicCamera") {
			// Check camera type directly
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
			const requiredFrustumHeight = this.calculateOrthographicSize(
				size,
				aspect,
				padding
			);

			orthoCamera.left = (-requiredFrustumHeight * aspect) / 2;
			orthoCamera.right = (requiredFrustumHeight * aspect) / 2;
			orthoCamera.top = requiredFrustumHeight / 2;
			orthoCamera.bottom = -requiredFrustumHeight / 2;
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
			} else {
				// For perspective, ensure it looks at the center
				this.activeCamera.lookAt(center);
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
			const maxSchematicDim = Math.max(size.x, size.y, size.z);
			this.cameraPathManager.fitCircularPathToSchematics("circularPath", {
				padding,
				minRadius: maxSchematicDim * 0.8,
				maxRadius: maxSchematicDim * 2.5,
			});
		}

		// Handle auto-orbit restart
		const wasAutoOrbitActive = this.autoOrbitEnabled;
		if (wasAutoOrbitActive) {
			this.stopAutoOrbit();
		}
		// Start orbit only if it was active OR if autoOrbitAfterZoom is specifically enabled for this scenario
		if (
			wasAutoOrbitActive ||
			(this.cameraOptions.autoOrbitAfterZoom && animationDuration > 0)
		) {
			// If there was an animation, give it a moment before starting orbit
			const orbitDelay = animationDuration > 0 ? 100 : 0;
			setTimeout(() => this.startAutoOrbitFromOptimalPosition(), orbitDelay);
		} else if (
			this.schematicRenderer.options.enableAutoOrbit &&
			animationDuration === 0 &&
			!this.cameraOptions.enableZoomInOnLoad
		) {
			// If it's an initial load without zoom, and auto-orbit is generally enabled
			setTimeout(() => this.startAutoOrbitFromOptimalPosition(), 100);
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
		const paddingFactor = 1 + padding * 2; // e.g., 1.3 for 15% padding on each side

		// Calculate the effective width and height of the object including padding
		const paddedObjectWidth = objectSize.x * paddingFactor;
		const paddedObjectHeight = objectSize.y * paddingFactor;

		// Determine the orthographic camera's required frustum height.
		// This depends on whether the object's padded width (scaled by aspect) or padded height is larger.
		let requiredFrustumHeight;
		if (paddedObjectWidth / aspect > paddedObjectHeight) {
			// Width is the constraining dimension relative to viewport proportions
			requiredFrustumHeight = paddedObjectWidth / aspect;
		} else {
			// Height is the constraining dimension
			requiredFrustumHeight = paddedObjectHeight;
		}

		// Ensure a minimum visible height to prevent extreme zoom on very small objects.
		return Math.max(requiredFrustumHeight, ABSOLUTE_MIN_ORTHO_VISIBLE_HEIGHT);
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
				padding: 0.15, // Default padding for zoom
				skipPathFitting: true, // Path will be fitted before orbit starts
			});

			// Brief pause
			if (orbitDelay > 0) {
				await new Promise((resolve) => setTimeout(resolve, orbitDelay * 1000));
			}
			// Ensure path is fitted before starting smooth orbit
			const defaultPath = this.cameraPathManager.getFirstPath();
			if (defaultPath) {
				this.cameraPathManager.fitCircularPathToSchematics(defaultPath.name);
			}
			this.startAutoOrbitSmooth({
				transitionDuration: orbitTransitionDuration,
				startFromCurrentPosition: true,
				skipPathFitting: true, // Already fitted
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
		const defaultPath = this.cameraPathManager.getFirstPath();

		if (enableZoomIn) {
			// Pre-calculate the final orbit path ONCE at the beginning
			const defaultPath = this.cameraPathManager.getFirstPath();
			if (defaultPath) {
				this.cameraPathManager.fitCircularPathToSchematics(defaultPath.name);
			}

			// Use cinematic zoom that goes directly to the orbit position
			await this.zoomToOrbitPosition({
				// zoomToOrbitPosition handles its own logic
				duration: this.cameraOptions.zoomInDuration || 2.0,
				padding: 0.15,
				startFromCurrentPosition: true, // Typically zoom from current view
				startOrbitAfterZoom: this.cameraOptions.autoOrbitAfterZoom || false,
			});
		} else {
			// Immediate positioning (current behavior)
			await this.focusOnSchematics({
				// This will fit the path
				animationDuration: 0,
				padding: 0.15,
				skipPathFitting: false, // Ensure path is fitted
			});
			// focusOnSchematics now handles starting orbit if it was previously enabled or if options dictate it
		}
	}

	/**
	 * Start auto-orbit from an optimal viewing position
	 */
	private startAutoOrbitFromOptimalPosition(): void {
		if (this.autoOrbitEnabled) {
			// If already orbiting and this is called (e.g. after focus),
			// briefly stop and restart to ensure it uses the latest path parameters.
			this.stopAutoOrbit();
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

		circularPath.setStartAngle(optimalOrbitPoint.angle); // Adjust path start to current view

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
			if (controls.update) controls.update();
		}
		this.startAutoOrbit(); // This will use the (potentially adjusted) path
	}

	/**
	 * Start auto-orbit with smooth transition from current camera position
	 */
	public startAutoOrbitSmooth(
		options: {
			transitionDuration?: number;
			startFromCurrentPosition?: boolean;
			easing?: (t: number) => number;
			skipPathFitting?: boolean;
		} = {}
	): void {
		if (this.autoOrbitEnabled) {
			return;
		}

		const {
			transitionDuration = 1.0,
			startFromCurrentPosition = true,
			easing = (t: number) => t * t * (3.0 - 2.0 * t),
			skipPathFitting = false,
		} = options;

		this.stopAnimation(); // Stop other animations

		// Get the default camera path
		const defaultPath = this.cameraPathManager.getFirstPath();
		if (!defaultPath || !(defaultPath.path instanceof CircularCameraPath)) {
			console.warn(
				"Cannot start auto-orbit: No (circular) camera path available."
			);
			return;
		}

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
			// If no transition, position camera to start of path and orbit
			const startOrbitPoint = circularPath.getPoint(0);
			this.activeCamera.setPosition([
				startOrbitPoint.position.x,
				startOrbitPoint.position.y,
				startOrbitPoint.position.z,
			]);
			this.activeCamera.lookAt(startOrbitPoint.target);
			const controls = this.controls.get(this.activeControlKey);
			if (controls && "target" in controls) {
				controls.target.copy(startOrbitPoint.target);
				if (controls.update) controls.update();
			}
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
			startDistance?: number; // Multiplier for how far out the zoom starts
			startFromCurrentPosition?: boolean;
			skipPathFitting?: boolean;
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

		if (this.schematicRenderer?.schematicManager?.isEmpty()) return;

		console.log("Starting cinematic zoom-in to schematics");

		// Get the optimal target position first (without animation)
		const bounds = this.calculateSchematicBounds();
		if (!bounds) return;

		const { center, size } = bounds;
		const canvas = this.schematicRenderer.canvas;
		const aspect = canvas.width / canvas.height;

		let finalTargetPosition: THREE.Vector3;
		let finalTargetRotation: THREE.Euler | null = null;

		if (this.activeCamera.camera.type === "OrthographicCamera") {
			const result = this.calculateIsometricFraming(
				center,
				size,
				aspect,
				padding
			);
			finalTargetPosition = result.position;
			finalTargetRotation = result.rotation;
			// Also update ortho camera projection for the final state
			const orthoCamera = this.activeCamera.camera as THREE.OrthographicCamera;
			const requiredFrustumHeight = this.calculateOrthographicSize(
				size,
				aspect,
				padding
			);
			orthoCamera.left = (-requiredFrustumHeight * aspect) / 2;
			orthoCamera.right = (requiredFrustumHeight * aspect) / 2;
			orthoCamera.top = requiredFrustumHeight / 2;
			orthoCamera.bottom = -requiredFrustumHeight / 2;
			// Note: We are animating position/rotation. The projection matrix will "snap" at the end.
			// For smooth ortho zoom, one would animate orthoCamera.zoom or its frustum properties.
			// This implementation animates position, which for ortho primarily affects clipping & perspective if any.
			// For a true ortho zoom, the animateToPosition would need to handle ortho frustum interpolation.
			// Current method is simpler: set final ortho projection then animate camera body.
		} else {
			finalTargetPosition = this.calculatePerspectiveFraming(
				center,
				size,
				aspect,
				padding
			);
		}

		let zoomStartPosition: THREE.Vector3;
		const currentCamRotation = this.activeCamera.rotation
			? (this.activeCamera.rotation as THREE.Euler).clone()
			: new THREE.Euler();

		if (startFromCurrentPosition) {
			zoomStartPosition = (this.activeCamera.position as THREE.Vector3).clone();
		} else {
			// Start further away along the vector from center to final position
			const direction = finalTargetPosition.clone().sub(center).normalize();
			if (direction.lengthSq() === 0) {
				// Avoid issues if center and finalTargetPosition are same
				direction.set(0, 0, 1);
			}
			zoomStartPosition = center
				.clone()
				.add(
					direction.multiplyScalar(
						finalTargetPosition.distanceTo(center) * startDistance
					)
				);
		}

		// Animate to the final position
		const controls = this.controls.get(this.activeControlKey);
		if (controls) controls.enabled = false;

		await this.animateToPosition(
			zoomStartPosition,
			currentCamRotation, // Current rotation
			finalTargetPosition,
			finalTargetRotation, // Target rotation (for ortho)
			center, // LookAt target
			duration,
			easing
		);
		// After animation, ensure final projection for ortho is applied if it wasn't interpolated
		if (this.activeCamera.camera.type === "OrthographicCamera") {
			(
				this.activeCamera.camera as THREE.OrthographicCamera
			).updateProjectionMatrix();
		}

		if (controls && "target" in controls) {
			controls.target.copy(center);
			if (controls.update) controls.update();
		}
		if (controls) controls.enabled = true;

		if (!skipPathFitting) {
			const maxSchematicDim = Math.max(size.x, size.y, size.z);
			this.cameraPathManager.fitCircularPathToSchematics("circularPath", {
				padding,
				minRadius: maxSchematicDim * 0.8,
				maxRadius: maxSchematicDim * 2.5,
			});
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
		const startPosition = (this.activeCamera.position as THREE.Vector3).clone();
		const startRotation = (this.activeCamera.rotation as THREE.Euler).clone();
		const orbitTarget = circularPath.getTargetPosition(); // Center of orbit

		const closestPointOnOrbit = this.findClosestOrbitPoint(
			circularPath,
			startPosition
		);
		const targetPositionOnOrbit = closestPointOnOrbit.position;

		circularPath.setStartAngle(closestPointOnOrbit.angle); // Ensure orbit starts from here

		const controls = this.controls.get(this.activeControlKey);
		if (controls) controls.enabled = false; // Disable during transition

		await this.animateToPosition(
			startPosition,
			startRotation, // Current rotation
			targetPositionOnOrbit,
			null, // Rotation will be handled by lookAt for perspective, ortho maintains its rotation
			orbitTarget, // Look at the orbit center
			duration,
			easing
		);
		// Controls re-enabled by startAutoOrbit or if animation is stopped.
		this.startAutoOrbit(); // Start orbit from the new position
	}

	/**
	 * Find the closest point on the circular orbit to the given position
	 */
	private findClosestOrbitPoint(
		circularPath: CircularCameraPath,
		position: THREE.Vector3
	): { position: THREE.Vector3; angle: number } {
		const pathCenter = circularPath.getCenter();
		const radius = circularPath.getRadius();
		const height = circularPath.getHeight(); // Y-offset from pathCenter

		// Project the query position onto the plane of the circular path
		const projectedPosition = new THREE.Vector3(
			position.x,
			pathCenter.y + height,
			position.z
		);

		// Vector from path center to the projected query position
		const dirToProjected = projectedPosition.clone().sub(pathCenter);
		if (dirToProjected.lengthSq() === 0) {
			// Query position is directly above/below path center
			// Default to angle 0 or some predefined start angle for the path
			const angle =
				circularPath.getStartAngle() !== undefined
					? circularPath.getStartAngle()
					: 0;
			return {
				position: new THREE.Vector3(
					pathCenter.x + radius * Math.cos(angle),
					pathCenter.y + height,
					pathCenter.z + radius * Math.sin(angle)
				),
				angle: angle,
			};
		}
		dirToProjected.normalize();

		const angle = Math.atan2(dirToProjected.z, dirToProjected.x);

		const orbitPosition = new THREE.Vector3(
			pathCenter.x + radius * Math.cos(angle),
			pathCenter.y + height,
			pathCenter.z + radius * Math.sin(angle)
		);

		return { position: orbitPosition, angle };
	}

	/**
	 * Animate camera to target position smoothly
	 */
	private async animateToPosition(
		startPos: THREE.Vector3,
		startRotEuler: THREE.Euler,
		targetPos: THREE.Vector3,
		targetRotEuler: THREE.Euler | null, // Target Euler for ortho, null for perspective (uses lookAt)
		lookAtTarget: THREE.Vector3, // Point to look at, primarily for perspective
		duration: number,
		easing: (t: number) => number
	): Promise<void> {
		return new Promise((resolve) => {
			const startTime = performance.now();
			const startRotQuat = new THREE.Quaternion().setFromEuler(startRotEuler);
			let targetRotQuat: THREE.Quaternion | null = null;
			if (targetRotEuler) {
				targetRotQuat = new THREE.Quaternion().setFromEuler(targetRotEuler);
			}

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

				if (
					this.activeCamera.camera.type === "OrthographicCamera" &&
					targetRotQuat
				) {
					// For Ortho, interpolate rotation if a target rotation is provided
					const currentRot = new THREE.Quaternion();
					currentRot.slerpQuaternions(startRotQuat, targetRotQuat, t);
					const eulerRot = new THREE.Euler().setFromQuaternion(
						currentRot,
						this.activeCamera.camera.rotation.order
					);
					this.activeCamera.rotation = [eulerRot.x, eulerRot.y, eulerRot.z];
				} else {
					// For Perspective, or Ortho without targetRot, use lookAt
					this.activeCamera.lookAt(lookAtTarget);
				}

				if (t < 1) {
					requestAnimationFrame(animate);
				} else {
					// Ensure final state is set precisely
					this.activeCamera.setPosition([
						targetPos.x,
						targetPos.y,
						targetPos.z,
					]);
					if (
						this.activeCamera.camera.type === "OrthographicCamera" &&
						targetRotEuler
					) {
						this.activeCamera.rotation = [
							targetRotEuler.x,
							targetRotEuler.y,
							targetRotEuler.z,
						];
					} else {
						this.activeCamera.lookAt(lookAtTarget);
					}
					resolve();
				}
			};
			requestAnimationFrame(animate);
		});
	}

	private calculateSchematicBounds(): {
		center: THREE.Vector3;
		size: THREE.Vector3; // Represents dimensions (width, height, depth)
		boundingBox: THREE.Box3;
	} | null {
		if (
			!this.schematicRenderer.schematicManager ||
			this.schematicRenderer.schematicManager.isEmpty()
		) {
			return null;
		}

		const center =
			this.schematicRenderer.schematicManager.getSchematicsAveragePosition();
		const dimensions = // This should be a Vector3 representing width, height, depth
			this.schematicRenderer.schematicManager.getMaxSchematicDimensions();

		const halfSize = dimensions.clone().multiplyScalar(0.5);
		const boundingBox = new THREE.Box3(
			center.clone().sub(halfSize),
			center.clone().add(halfSize)
		);

		return { center, size: dimensions, boundingBox };
	}

	/**
	 * Calculate optimal position for perspective camera
	 */
	private calculatePerspectiveFraming(
		center: THREE.Vector3,
		objectSize: THREE.Vector3, // Full object dimensions (x, y, z)
		aspect: number,
		padding: number
	): THREE.Vector3 {
		const camera = this.activeCamera.camera as THREE.PerspectiveCamera;
		const fov = THREE.MathUtils.degToRad(camera.fov); // Vertical FoV in radians

		// Add padding to the object's dimensions
		const paddedWidth = objectSize.x * (1 + padding * 2);
		const paddedHeight = objectSize.y * (1 + padding * 2);

		// Calculate distance needed to fit height
		const distanceForHeight = paddedHeight / (2 * Math.tan(fov / 2));
		// Calculate distance needed to fit width (fov is vertical, so account for aspect)
		const distanceForWidth = paddedWidth / (2 * Math.tan(fov / 2) * aspect);

		// The actual distance is the larger of the two, to ensure the whole object fits
		const calculatedDistance = Math.max(distanceForHeight, distanceForWidth);

		// Define a minimum distance floor
		const relevantXYDimension = Math.max(objectSize.x, objectSize.y);
		// Ensure camera is at least 0.75x the largest XY dimension from the center, or an absolute minimum.
		const minDistanceFloor = Math.max(
			ABSOLUTE_MIN_PERSPECTIVE_DISTANCE,
			relevantXYDimension * 0.75
		);

		const finalDistance = Math.max(calculatedDistance, minDistanceFloor);

		// Position camera at a common viewing angle (e.g., 45 degrees offset in XZ, 30 degrees up)
		const offsetAngleXY = Math.PI / 4; // 45 degrees
		const elevationAngle = Math.PI / 6; // 30 degrees

		const camOffset = new THREE.Vector3(
			Math.cos(elevationAngle) * Math.sin(offsetAngleXY), // X component
			Math.sin(elevationAngle), // Y component
			Math.cos(elevationAngle) * Math.cos(offsetAngleXY) // Z component
		);
		camOffset.normalize().multiplyScalar(finalDistance);

		return center.clone().add(camOffset);
	}

	/**
	 * Calculate optimal position and rotation for isometric camera
	 */
	private calculateIsometricFraming(
		center: THREE.Vector3,
		objectSize: THREE.Vector3,
		// @ts-ignore aspect is used by calculateOrthographicSize called from focusOnSchematics
		aspect: number,
		padding: number
	): { position: THREE.Vector3; rotation: THREE.Euler } {
		const presetName = this.activeCameraKey; // Assume current active camera is isometric or similar ortho
		const preset =
			CameraManager.CAMERA_PRESETS[
				presetName as keyof typeof CameraManager.CAMERA_PRESETS
			] || CameraManager.CAMERA_PRESETS.isometric;

		// Use preset rotation if available, otherwise a default isometric-like rotation
		const rotationArray =
			preset.rotation || CameraManager.CAMERA_PRESETS.isometric.rotation;
		const rotation = new THREE.Euler(...rotationArray);

		// Position the camera far enough along its viewing vector.
		// Distance is based on the object's largest dimension to ensure it's outside the object.
		const maxObjectDim = Math.max(objectSize.x, objectSize.y, objectSize.z);
		// Safety factor to ensure camera is well outside the object.
		// Padding is already accounted for in ortho frustum size.
		const distanceFactor =
			maxObjectDim * 1.5 + ABSOLUTE_MIN_ORTHO_VISIBLE_HEIGHT * 2;

		// Create a vector pointing away from the object along the camera's negative Z-axis (local)
		const offsetDirection = new THREE.Vector3(0, 0, 1); // Camera looks along -Z, so position along +Z from target
		offsetDirection.applyEuler(rotation); // Rotate this direction by the camera's rotation
		offsetDirection.multiplyScalar(distanceFactor);

		const position = center.clone().add(offsetDirection);

		return { position, rotation };
	}

	/**
	 * Zoom directly to the final orbit position in one smooth motion
	 */
	public async zoomToOrbitPosition(
		options: {
			duration?: number;
			padding?: number; // Padding for path fitting
			startFromCurrentPosition?: boolean;
			startOrbitAfterZoom?: boolean;
			easing?: (t: number) => number;
		} = {}
	): Promise<void> {
		const {
			duration = 2.0,
			// @ts-ignore
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
			if (startOrbitAfterZoom) this.startAutoOrbitFromOptimalPosition(); // Fallback to just orbit
			return;
		}

		const circularPath = defaultPath.path as CircularCameraPath;

		// Ensure path is fitted using the provided padding
		// This is crucial because the target orbit position depends on the fitted path
		this.cameraPathManager.fitCircularPathToSchematics(defaultPath.name, {
			padding,
		});

		let zoomStartPosition: THREE.Vector3;
		const currentCamRotation = (
			this.activeCamera.rotation as THREE.Euler
		).clone();

		// Determine the target point on the (now fitted) orbit
		// A good target is the point on the orbit closest to the current camera's XZ projection,
		// or a default starting angle (e.g., 0) if not starting from current.
		const idealOrbitPoint = this.findClosestOrbitPoint(
			circularPath,
			startFromCurrentPosition
				? (this.activeCamera.position as THREE.Vector3).clone()
				: circularPath.getPoint(0).position
		);

		if (startFromCurrentPosition) {
			zoomStartPosition = (this.activeCamera.position as THREE.Vector3).clone();
		} else {
			// Start far away, "behind" the idealOrbitPoint along its view direction towards center
			const viewDirection = circularPath
				.getTargetPosition()
				.clone()
				.sub(idealOrbitPoint.position)
				.normalize();
			const farDistance = circularPath.getRadius() * 2; // Example: 2x radius away
			zoomStartPosition = idealOrbitPoint.position
				.clone()
				.add(viewDirection.multiplyScalar(farDistance));
		}

		circularPath.setStartAngle(idealOrbitPoint.angle); // For subsequent orbit

		const controls = this.controls.get(this.activeControlKey);
		if (controls) controls.enabled = false;

		// Animate directly to the orbit position
		await this.animateToPosition(
			zoomStartPosition,
			currentCamRotation,
			idealOrbitPoint.position, // Target position on orbit
			null, // Let lookAt handle rotation for perspective
			circularPath.getTargetPosition(), // Look at orbit center
			duration,
			easing
		);

		// Update controls target
		if (controls && "target" in controls) {
			controls.target.copy(circularPath.getTargetPosition());
			if (controls.update) controls.update();
		}

		// Re-enable controls
		if (controls) controls.enabled = true;

		// Start orbit immediately if requested (no additional transition needed)
		if (startOrbitAfterZoom) {
			// Brief pause, then start orbit from current position (no transition needed)
			setTimeout(() => {
				this.startAutoOrbitFromOptimalPosition(); // This will use the already positioned camera
			}, 100); // Brief pause
		}
	}

	/**
	 * Starts auto-orbiting the camera around the default camera path
	 */
	public startAutoOrbit(): void {
		if (this.autoOrbitEnabled) {
			return;
		}
		this.stopAnimation(); // Ensure no other animations are running

		const defaultPath = this.cameraPathManager.getFirstPath();
		if (!defaultPath || !(defaultPath.path instanceof CircularCameraPath)) {
			console.warn(
				"Cannot start auto-orbit: No circular camera path or path not found."
			);
			return;
		}
		const circularPath = defaultPath.path as CircularCameraPath;
		console.log("🎬 Starting auto-orbit animation.");

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

			// @ts-ignore
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
			// When toggling on, ensure path is fitted and start from optimal pos.
			const defaultPath = this.cameraPathManager.getFirstPath();
			if (
				defaultPath &&
				this.schematicRenderer.schematicManager &&
				!this.schematicRenderer.schematicManager.isEmpty()
			) {
				this.cameraPathManager.fitCircularPathToSchematics(defaultPath.name);
			}
			this.startAutoOrbitFromOptimalPosition();
			return true;
		}
	}

	/**
	 * Sets the auto-orbit duration
	 * @param duration Duration in seconds for a full rotation
	 */
	public setAutoOrbitDuration(duration: number): void {
		this.autoOrbitDuration = Math.max(1, duration); // Ensure duration is positive
		if (this.autoOrbitEnabled) {
			// If orbiting, restart to apply new duration
			this.stopAutoOrbit();
			this.startAutoOrbitFromOptimalPosition();
		}
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
		this.removeAllListeners(); // Clear event listeners from EventEmitter
	}
}
