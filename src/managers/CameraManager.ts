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
import { FlyControls, FlyControlsOptions } from "./FlyControls";
export interface CameraManagerOptions {
	position?: [number, number, number]; // Initial camera position
	defaultCameraPreset?: "perspective" | "isometric" | "perspective_fpv"; // Default camera preset to use
	showCameraPathVisualization?: boolean; // Whether to show camera path visualization
	enableZoomInOnLoad?: boolean; // Whether to zoom in when schematics load
	zoomInDuration?: number; // Duration of zoom-in animation
	autoOrbitAfterZoom?: boolean; // Whether to start auto-orbit after zoom-in
	preserveCameraOnUpdate?: boolean; // Whether to preserve camera position when schematics update
	useTightBounds?: boolean; // Whether to use tight bounds (actual block content) for camera framing
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
type ControlType = "orbit" | "creative" | "fly" | "none";

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

	/** First-person fly controls instance */
	public flyControls: FlyControls | null = null;
	private flyControlsEnabled: boolean = false;

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
			// True isometric angles: ~35.264° pitch (Math.atan(1/Math.sqrt(2))), 45° yaw
			// Using slightly adjusted angles for better visualization
			rotation: [
				-Math.atan(1 / Math.sqrt(2)), // ~35.264° pitch for true isometric
				(45 * Math.PI) / 180, // 45° yaw for isometric
				0,
			] as const,
			controlType: "orbit" as const,
			fov: 45, // FOV for orthographic camera
			controlSettings: {
				enableDamping: true,
				dampingFactor: 0.08, // Smoother damping
				minDistance: 5,
				maxDistance: 500,
				enableZoom: true,
				enableRotate: true,
				enablePan: true,
				panSpeed: 1.0,
				rotateSpeed: 0.8,
				zoomSpeed: 1.2,
				minPolarAngle: Math.PI / 8, // 22.5 degrees - allow more vertical freedom
				maxPolarAngle: Math.PI / 2.1, // ~86 degrees
			},
		},
		perspective: {
			type: "perspective" as const,
			position: [0, 20, 20] as const,
			rotation: [(-20 * Math.PI) / 180, 0, 0] as const, // 20° down tilt
			controlType: "orbit" as const,
			fov: 60, // Default FOV for perspective camera
			controlSettings: {
				enableDamping: true, // Enable smooth damping for nice feel
				dampingFactor: 0.08, // Smooth but responsive
				minDistance: 1,
				maxDistance: 1000,
				enableZoom: true,
				enableRotate: true,
				enablePan: true,
				panSpeed: 1.0,
				rotateSpeed: 0.8,
				zoomSpeed: 1.2,
				// No polar angle restrictions for perspective - full freedom
			},
		},
		perspective_fpv: {
			type: "perspective" as const,
			position: [0, 2, 0] as const,
			rotation: [0, 0, 0] as const, // Looking straight ahead
			fov: 90,
			controlType: "creative" as const,
			controlSettings: {
				movementSpeed: new THREE.Vector3(200, 200, 200),
			},
		},
	} as const;

	constructor(schematicRenderer: SchematicRenderer, options: CameraManagerOptions = {}) {
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
			console.log(`Switching to default camera preset: ${options.defaultCameraPreset}`);
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
		if (this.schematicRenderer.options.enableAutoOrbit && !this.cameraOptions.enableZoomInOnLoad) {
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

				this.animationStartPosition.copy(this.activeCamera.position as THREE.Vector3);
				this.animationStartRotation.copy(this.activeCamera.rotation as THREE.Euler);

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
			CameraManager.CAMERA_PRESETS[presetName as keyof typeof CameraManager.CAMERA_PRESETS];
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
			this.schematicRenderer.renderManager.updateCamera(this.activeCamera.camera);
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
		controls.dampingFactor = 0.1; // Smooth but responsive
		controls.minDistance = 10;
		controls.maxDistance = 100;
		controls.enableZoom = true;
		controls.enableRotate = true;
		controls.enablePan = true;

		// Restrict vertical rotation to maintain isometric feel while allowing exploration
		controls.minPolarAngle = Math.PI / 6; // 30 degrees - allow more vertical freedom
		controls.maxPolarAngle = Math.PI / 2.2; // ~82 degrees
	}

	public update(deltaTime: number = 0) {
		// Update fly controls if active
		if (this.flyControlsEnabled && this.flyControls) {
			this.flyControls.update(deltaTime);
			return; // Skip other controls when fly mode is active
		}

		const controls = this.controls.get(this.activeControlKey);
		if (!controls) return;

		if (this.activeControlKey.includes("creative")) {
			const speed = CameraManager.CAMERA_PRESETS.perspective_fpv.controlSettings?.movementSpeed;
			if (speed) {
				CreativeControls.update(controls, speed);
			}
		} else if (controls.update) {
			controls.update(deltaTime);
		}
	}

	// ===== FLY CONTROLS API =====

	/**
	 * Initialize fly controls for first-person navigation
	 * @param options Optional fly controls configuration
	 */
	public initializeFlyControls(options?: FlyControlsOptions): FlyControls {
		// Dispose existing fly controls if present
		if (this.flyControls) {
			this.flyControls.dispose();
		}

		// Create fly controls for the active camera
		this.flyControls = new FlyControls(this.activeCamera.camera, this.rendererDomElement, options);

		// Listen for lock/unlock events
		this.flyControls.on("lock", () => {
			// Hide any FPV overlay when entering fly mode
			this.schematicRenderer.uiManager?.hideFPVOverlay();
			this.emit("flyControlsLocked");
		});

		this.flyControls.on("unlock", () => {
			// Keep FPV overlay hidden while fly controls are enabled
			// This prevents the old Creative Mode overlay from appearing
			if (this.flyControlsEnabled) {
				this.schematicRenderer.uiManager?.hideFPVOverlay();
			}
			this.emit("flyControlsUnlocked");
		});

		this.flyControls.on("change", () => {
			this.emit("cameraMove", {
				position: (this.activeCamera.position as THREE.Vector3).clone(),
				rotation: (this.activeCamera.rotation as THREE.Euler).clone(),
			});
		});

		return this.flyControls;
	}

	/**
	 * Enable fly controls mode (disables orbit controls)
	 */
	public enableFlyControls(): void {
		if (!this.flyControls) {
			this.initializeFlyControls();
		}

		// Disable all other controls
		this.controls.forEach((control) => {
			control.enabled = false;
		});

		// Enable fly controls
		this.flyControlsEnabled = true;
		if (this.flyControls) {
			this.flyControls.enabled = true;
			// Show the fly controls overlay (click to enter message)
			this.flyControls.setOverlayVisible(true);
		}

		// Hide any existing FPV overlay from creative controls
		this.schematicRenderer.uiManager?.hideFPVOverlay();

		this.emit("controlModeChanged", { mode: "fly" });
	}

	/**
	 * Disable fly controls mode (re-enables orbit controls)
	 */
	public disableFlyControls(): void {
		// Unlock fly controls if locked
		if (this.flyControls?.isLocked) {
			this.flyControls.unlock();
		}

		// Disable fly controls and hide overlay
		this.flyControlsEnabled = false;
		if (this.flyControls) {
			this.flyControls.enabled = false;
			this.flyControls.setOverlayVisible(false);
		}

		// Re-enable the appropriate orbit controls
		const controls = this.controls.get(this.activeControlKey);
		if (controls) {
			controls.enabled = true;
		}

		this.emit("controlModeChanged", { mode: "orbit" });
	}

	/**
	 * Toggle fly controls mode
	 * @returns true if fly mode is now active, false if orbit mode
	 */
	public toggleFlyControls(): boolean {
		if (this.flyControlsEnabled) {
			this.disableFlyControls();
			return false;
		} else {
			this.enableFlyControls();
			return true;
		}
	}

	/**
	 * Check if fly controls are currently active
	 */
	public isFlyControlsEnabled(): boolean {
		return this.flyControlsEnabled;
	}

	/**
	 * Check if fly controls are locked (pointer locked)
	 */
	public isFlyControlsLocked(): boolean {
		return this.flyControls?.isLocked ?? false;
	}

	/**
	 * Get fly controls settings
	 */
	public getFlyControlsSettings(): {
		moveSpeed: number;
		sprintMultiplier: number;
		keybinds: any;
	} | null {
		if (!this.flyControls) return null;
		return {
			moveSpeed: this.flyControls.getMoveSpeed(),
			sprintMultiplier: this.flyControls.getSprintMultiplier(),
			keybinds: this.flyControls.getKeybinds(),
		};
	}

	/**
	 * Update fly controls settings
	 */
	public setFlyControlsSettings(settings: {
		moveSpeed?: number;
		sprintMultiplier?: number;
		keybinds?: any;
	}): void {
		if (!this.flyControls) return;

		if (settings.moveSpeed !== undefined) {
			this.flyControls.setMoveSpeed(settings.moveSpeed);
		}
		if (settings.sprintMultiplier !== undefined) {
			this.flyControls.setSprintMultiplier(settings.sprintMultiplier);
		}
		if (settings.keybinds !== undefined) {
			this.flyControls.setKeybinds(settings.keybinds);
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
				const frustumHeight = cameraWrapper.camera.top - cameraWrapper.camera.bottom; // Preserve current height
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
		const averagePosition = this.schematicRenderer.schematicManager.getSchematicsAveragePosition();
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
			skipPathFitting?: boolean; // Skip fitting camera paths
			useTightBounds?: boolean; // Use tight bounds (actual block content) instead of allocated space
			preserveCamera?: boolean; // Override: preserve camera position even if this method is called
		} = {}
	): Promise<void> {
		console.log("Focusing on schematics with improved framing");

		if (!this.schematicRenderer?.schematicManager) {
			return;
		}
		if (this.schematicRenderer.schematicManager.isEmpty()) {
			return;
		}

		// Check if camera preservation is requested (either in options or global camera options)
		const shouldPreserveCamera =
			options.preserveCamera ?? this.cameraOptions.preserveCameraOnUpdate ?? false;
		if (shouldPreserveCamera) {
			console.log("Camera preservation enabled, skipping focus");
			return;
		}

		const {
			padding = 0.05, // 5% padding - tight but with small safety margin
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
		const startPosition = new THREE.Vector3().copy(this.activeCamera.position as THREE.Vector3);
		const startRotation = new THREE.Euler().copy(this.activeCamera.rotation as THREE.Euler);

		let targetPosition: THREE.Vector3;
		let targetRotation: THREE.Euler | null = null;
		let lookAtTarget = center.clone();

		if (this.activeCamera.camera.type === "OrthographicCamera") {
			// Check camera type directly
			const result = this.calculateIsometricFraming(center, size, aspect, padding);
			targetPosition = result.position;
			targetRotation = result.rotation;

			// Update orthographic camera size for optimal framing
			const orthoCamera = this.activeCamera.camera as THREE.OrthographicCamera;
			const requiredFrustumHeight = this.calculateOrthographicSize(size, aspect, padding);

			orthoCamera.left = (-requiredFrustumHeight * aspect) / 2;
			orthoCamera.right = (requiredFrustumHeight * aspect) / 2;
			orthoCamera.top = requiredFrustumHeight / 2;
			orthoCamera.bottom = -requiredFrustumHeight / 2;
			orthoCamera.updateProjectionMatrix();
		} else {
			// Enhanced perspective framing with Pan Compensation
			const framing = this.calculatePerspectiveFraming(center, size, aspect, padding);
			targetPosition = framing.position;
			lookAtTarget = framing.target;
		}

		// Animate to target position if duration > 0
		if (animationDuration > 0) {
			await this.animateToPosition(
				startPosition,
				startRotation,
				targetPosition,
				targetRotation,
				lookAtTarget,
				animationDuration,
				easing
			);
		} else {
			// Immediate positioning
			this.activeCamera.setPosition([targetPosition.x, targetPosition.y, targetPosition.z]);
			if (targetRotation) {
				this.activeCamera.rotation = [targetRotation.x, targetRotation.y, targetRotation.z];
			} else {
				// For perspective, ensure it looks at the center (possibly offset)
				this.activeCamera.lookAt(lookAtTarget);
			}
		}

		// Update controls target
		if (controls && "target" in controls) {
			controls.target.copy(lookAtTarget);
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
		if (wasAutoOrbitActive || (this.cameraOptions.autoOrbitAfterZoom && animationDuration > 0)) {
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
	 * For isometric cameras, this accounts for the 3D object's projection at the viewing angle
	 */
	private calculateOrthographicSize(
		objectSize: THREE.Vector3,
		aspect: number,
		padding: number
	): number {
		const paddingFactor = 1 + padding * 2;

		let projectedWidth: number;
		let projectedHeight: number;

		if (this.activeCamera.camera instanceof THREE.OrthographicCamera) {
			// Use the actual camera's rotation for projection calculation
			const viewMatrix = this.activeCamera.camera.matrixWorldInverse;

			// Create the 8 corners of the WORLD SPACE AABB
			const halfSize = objectSize.clone().multiplyScalar(0.5);
			const center = this.schematicRenderer.schematicManager!.getSchematicsAveragePosition();

			const corners = [
				new THREE.Vector3(center.x - halfSize.x, center.y - halfSize.y, center.z - halfSize.z),
				new THREE.Vector3(center.x + halfSize.x, center.y - halfSize.y, center.z - halfSize.z),
				new THREE.Vector3(center.x - halfSize.x, center.y + halfSize.y, center.z - halfSize.z),
				new THREE.Vector3(center.x + halfSize.x, center.y + halfSize.y, center.z - halfSize.z),
				new THREE.Vector3(center.x - halfSize.x, center.y - halfSize.y, center.z + halfSize.z),
				new THREE.Vector3(center.x + halfSize.x, center.y - halfSize.y, center.z + halfSize.z),
				new THREE.Vector3(center.x - halfSize.x, center.y + halfSize.y, center.z + halfSize.z),
				new THREE.Vector3(center.x + halfSize.x, center.y + halfSize.y, center.z + halfSize.z),
			];

			let minX = Infinity,
				maxX = -Infinity;
			let minY = Infinity,
				maxY = -Infinity;

			for (const corner of corners) {
				const viewSpaceCorner = corner.clone().applyMatrix4(viewMatrix);
				minX = Math.min(minX, viewSpaceCorner.x);
				maxX = Math.max(maxX, viewSpaceCorner.x);
				minY = Math.min(minY, viewSpaceCorner.y);
				maxY = Math.max(maxY, viewSpaceCorner.y);
			}

			projectedWidth = (maxX - minX) * paddingFactor;
			projectedHeight = (maxY - minY) * paddingFactor;
		} else {
			projectedWidth = objectSize.x * paddingFactor;
			projectedHeight = objectSize.y * paddingFactor;
		}

		let requiredFrustumHeight;
		if (projectedWidth / aspect > projectedHeight) {
			requiredFrustumHeight = projectedWidth / aspect;
		} else {
			requiredFrustumHeight = projectedHeight;
		}

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
				padding: 0.08, // Reduced padding for tighter zoom
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
	public async handleSchematicLoaded(enableZoomIn: boolean = false): Promise<void> {
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
				padding: 0.08,
				startFromCurrentPosition: true, // Typically zoom from current view
				startOrbitAfterZoom: this.cameraOptions.autoOrbitAfterZoom || false,
			});
		} else {
			// Immediate positioning (current behavior)
			await this.focusOnSchematics({
				// This will fit the path
				animationDuration: 0,
				padding: 0.08,
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
			console.warn("Cannot start auto-orbit: No circular camera path available");
			return;
		}

		const circularPath = defaultPath.path as CircularCameraPath;

		// Find a good starting point on the orbit (current camera position projected onto orbit)
		const currentPosition = new THREE.Vector3().copy(this.activeCamera.position as THREE.Vector3);
		const optimalOrbitPoint = this.findClosestOrbitPoint(circularPath, currentPosition);

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
			console.warn("Cannot start auto-orbit: No (circular) camera path available.");
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
			padding = 0.08,
			duration = 2.0,
			easing = (t: number) => t * t * (3.0 - 2.0 * t),
			startDistance = 3.0,
			startFromCurrentPosition = false,
			skipPathFitting = false, // Don't update path during zoom sequence
		} = options;

		if (this.schematicRenderer?.schematicManager?.isEmpty()) return;

		console.log("Starting cinematic zoom-in to schematics");

		// Get the optimal target position first (without animation)
		const bounds = this.calculateSchematicBounds(); // Use tight bounds by default
		if (!bounds) return;

		const { center, size } = bounds;
		const canvas = this.schematicRenderer.canvas;
		const aspect = canvas.width / canvas.height;

		let finalTargetPosition: THREE.Vector3;
		let finalTargetRotation: THREE.Euler | null = null;
		let finalLookAtTarget: THREE.Vector3 = center;

		if (this.activeCamera.camera.type === "OrthographicCamera") {
			const result = this.calculateIsometricFraming(center, size, aspect, padding);
			finalTargetPosition = result.position;
			finalTargetRotation = result.rotation;

			// Also update ortho camera projection for the final state
			const orthoCamera = this.activeCamera.camera as THREE.OrthographicCamera;
			const requiredFrustumHeight = this.calculateOrthographicSize(size, aspect, padding);
			orthoCamera.left = (-requiredFrustumHeight * aspect) / 2;
			orthoCamera.right = (requiredFrustumHeight * aspect) / 2;
			orthoCamera.top = requiredFrustumHeight / 2;
			orthoCamera.bottom = -requiredFrustumHeight / 2;
			// Note: We are animating position/rotation. The projection matrix will "snap" at the end.
		} else {
			const framing = this.calculatePerspectiveFraming(center, size, aspect, padding);
			finalTargetPosition = framing.position;
			finalLookAtTarget = framing.target;
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
				.add(direction.multiplyScalar(finalTargetPosition.distanceTo(center) * startDistance));
		}

		// Animate to the final position
		const controls = this.controls.get(this.activeControlKey);
		if (controls) controls.enabled = false;

		await this.animateToPosition(
			zoomStartPosition,
			currentCamRotation, // Current rotation
			finalTargetPosition,
			finalTargetRotation, // Target rotation (for ortho)
			finalLookAtTarget, // LookAt target
			duration,
			easing
		);
		// After animation, ensure final projection for ortho is applied if it wasn't interpolated
		if (this.activeCamera.camera.type === "OrthographicCamera") {
			(this.activeCamera.camera as THREE.OrthographicCamera).updateProjectionMatrix();
		}

		if (controls && "target" in controls) {
			controls.target.copy(finalLookAtTarget);
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

		const closestPointOnOrbit = this.findClosestOrbitPoint(circularPath, startPosition);
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
		const projectedPosition = new THREE.Vector3(position.x, pathCenter.y + height, position.z);

		// Vector from path center to the projected query position
		const dirToProjected = projectedPosition.clone().sub(pathCenter);
		if (dirToProjected.lengthSq() === 0) {
			// Query position is directly above/below path center
			// Default to angle 0 or some predefined start angle for the path
			const angle = circularPath.getStartAngle() !== undefined ? circularPath.getStartAngle() : 0;
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
				this.activeCamera.setPosition([currentPos.x, currentPos.y, currentPos.z]);

				if (this.activeCamera.camera.type === "OrthographicCamera" && targetRotQuat) {
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
					this.activeCamera.setPosition([targetPos.x, targetPos.y, targetPos.z]);
					if (this.activeCamera.camera.type === "OrthographicCamera" && targetRotEuler) {
						this.activeCamera.rotation = [targetRotEuler.x, targetRotEuler.y, targetRotEuler.z];
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
		size: THREE.Vector3; // World-space dimensions of the AABB
		boundingBox: THREE.Box3;
	} | null {
		if (
			!this.schematicRenderer.schematicManager ||
			this.schematicRenderer.schematicManager.isEmpty()
		) {
			return null;
		}

		// Use the new world-space bounding box calculation
		const boundingBox = this.schematicRenderer.schematicManager.getGlobalTightWorldBox();
		if (boundingBox.isEmpty()) return null;

		const center = boundingBox.getCenter(new THREE.Vector3());
		const size = boundingBox.getSize(new THREE.Vector3());

		console.log(
			`[CameraManager] World-space bounds: center=${center.toArray()}, size=${size.toArray()}`
		);

		return { center, size, boundingBox };
	}

	/**
	 * Calculate optimal viewing angles based on bounding box dimensions
	 * AND screen aspect ratio. Maximizes the projected visible area
	 * while best fitting the screen shape.
	 */
	private calculateOptimalViewingAngles(
		objectSize: THREE.Vector3,
		screenAspect: number = 1.0
	): { yaw: number; pitch: number } {
		const { x: width, y: height, z: depth } = objectSize;

		// Calculate optimal pitch based on height vs horizontal extent
		// Flat objects (small height) → higher pitch (more top-down)
		// Tall objects (large height) → lower pitch (more side view)
		const horizontalExtent = Math.max(width, depth);
		const pitchRatio = horizontalExtent / (height + horizontalExtent + 0.001);
		// Map from 30° (tall) to 55° (flat) - slightly less top-down for better 3D feel
		const minPitch = Math.PI / 6; // 30°
		const maxPitch = (11 * Math.PI) / 36; // 55°
		const pitchAngle = THREE.MathUtils.lerp(minPitch, maxPitch, pitchRatio);

		// Calculate base yaw based on width vs depth ratio
		// Wide objects (X >> Z) → yaw closer to front view
		// Deep objects (Z >> X) → yaw closer to side view
		const yawRatio = depth / (width + depth + 0.001);

		// Adapt yaw range based on screen aspect ratio
		// Wide screens (aspect > 1): prefer angles that show more horizontal extent
		// Tall screens (aspect < 1): prefer angles that show more vertical composition
		const aspectInfluence = Math.min(Math.max((screenAspect - 1.0) * 0.2, -0.1), 0.1);
		const minYaw = Math.PI / 6 - aspectInfluence; // ~30° baseline
		const maxYaw = Math.PI / 3 + aspectInfluence; // ~60° baseline
		const yawAngle = THREE.MathUtils.lerp(minYaw, maxYaw, yawRatio);

		return { yaw: yawAngle, pitch: pitchAngle };
	}

	/**
	 * Calculate optimal position for perspective camera
	 * Automatically selects viewing angle based on bounding box dimensions
	 * to maximize the visible projected area.
	 * Returns both the camera position and the optimal look-at target (which may be offset from center).
	 */
	private calculatePerspectiveFraming(
		center: THREE.Vector3,
		objectSize: THREE.Vector3, // Full object dimensions (x, y, z)
		aspect: number,
		padding: number
	): { position: THREE.Vector3; target: THREE.Vector3 } {
		const camera = this.activeCamera.camera as THREE.PerspectiveCamera;
		const fov = THREE.MathUtils.degToRad(camera.fov); // Vertical FoV in radians
		const tanFov2 = Math.tan(fov / 2);
		const paddingFactor = 1 + padding * 2;

		// Calculate optimal viewing angles based on object shape AND screen aspect ratio
		const { yaw: yawAngle, pitch: pitchAngle } = this.calculateOptimalViewingAngles(
			objectSize,
			aspect
		);

		const cosYaw = Math.cos(yawAngle);
		const sinYaw = Math.sin(yawAngle);
		const cosPitch = Math.cos(pitchAngle);
		const sinPitch = Math.sin(pitchAngle);

		// Calculate normalized direction vector FROM center TO camera (Camera Z axis)
		const camBack = new THREE.Vector3(cosPitch * sinYaw, sinPitch, cosPitch * cosYaw).normalize();

		// Compute Camera Basis Vectors
		const worldUp = new THREE.Vector3(0, 1, 0);
		const camRight = new THREE.Vector3().crossVectors(worldUp, camBack).normalize();
		if (camRight.lengthSq() < 0.001) camRight.set(1, 0, 0);
		const camUp = new THREE.Vector3().crossVectors(camBack, camRight).normalize();

		// Generate the 8 corners relative to the geometric center
		const halfSize = objectSize.clone().multiplyScalar(0.5);
		const corners = [
			new THREE.Vector3(halfSize.x, halfSize.y, halfSize.z),
			new THREE.Vector3(halfSize.x, halfSize.y, -halfSize.z),
			new THREE.Vector3(halfSize.x, -halfSize.y, halfSize.z),
			new THREE.Vector3(halfSize.x, -halfSize.y, -halfSize.z),
			new THREE.Vector3(-halfSize.x, halfSize.y, halfSize.z),
			new THREE.Vector3(-halfSize.x, halfSize.y, -halfSize.z),
			new THREE.Vector3(-halfSize.x, -halfSize.y, halfSize.z),
			new THREE.Vector3(-halfSize.x, -halfSize.y, -halfSize.z),
		];

		// Transform corners to Camera Space (but centered at 0,0,0)
		// We want to find camera offset (cx, cy) and distance d
		const rotatedCorners = corners.map(
			(c) => new THREE.Vector3(c.dot(camRight), c.dot(camUp), c.dot(camBack))
		);

		let cx = 0; // Camera lateral shift (Right)
		let cy = 0; // Camera vertical shift (Up)
		let d = 0; // Camera distance (Back)

		// Iteratively refine Position (d) and Target Offset (cx, cy)
		// to center the bounding box on screen and fit it tightly.
		for (let i = 0; i < 3; i++) {
			// 1. Calculate required distance 'd' to fit all points given current centering (cx, cy)
			let maxReqD = 0;

			for (const p of rotatedCorners) {
				// Vector from Camera(cx, cy, d) to Point(p.x, p.y, p.z)
				// Relative pos: (p.x - cx, p.y - cy, p.z - d)
				// Depth in front of camera: dist = d - p.z
				// Screen X: (p.x - cx) / dist
				// Screen Y: (p.y - cy) / dist
				// Constraint: |Screen X| <= tan * aspect / padding

				// Derivation:
				// |p.x - cx| / (D - p.z) <= tan * aspect / padding
				// D - p.z >= |p.x - cx| * padding / (tan * aspect)
				// D >= p.z + ...

				const dx = Math.abs(p.x - cx);
				const dy = Math.abs(p.y - cy);

				const reqDzX = (dx * paddingFactor) / (tanFov2 * aspect);
				const reqDzY = (dy * paddingFactor) / tanFov2;

				const reqD = p.z + Math.max(reqDzX, reqDzY);
				maxReqD = Math.max(maxReqD, reqD);
			}

			// Apply minimum distance constraint - reduced from 0.8 to 0.1 to allow tighter framing
			const maxDim = Math.max(objectSize.x, objectSize.y, objectSize.z);
			d = Math.max(maxReqD, maxDim * 0.1, ABSOLUTE_MIN_PERSPECTIVE_DISTANCE);

			// 2. Calculate Screen-Space Bounding Box to find centering error
			let minU = Infinity,
				maxU = -Infinity;
			let minV = Infinity,
				maxV = -Infinity;

			for (const p of rotatedCorners) {
				const dist = d - p.z;
				if (dist < 0.001) continue; // Should not happen with min distance

				const u = (p.x - cx) / dist;
				const v = (p.y - cy) / dist;

				minU = Math.min(minU, u);
				maxU = Math.max(maxU, u);
				minV = Math.min(minV, v);
				maxV = Math.max(maxV, v);
			}

			// 3. Adjust cx, cy to center the bounding box (avg U/V should be 0)
			const centerU = (minU + maxU) / 2;
			const centerV = (minV + maxV) / 2;

			// We want to shift camera such that centerU/V becomes 0.
			// Approximate correction: shift camera by center * average_depth
			// Since dist varies, 'd' is a good enough approximation for convergence.
			// If centerU > 0 (box is to the right), we move camera right (increase cx).
			cx += centerU * d;
			cy += centerV * d;

			// Stop if converged
			if (Math.abs(centerU) < 0.001 && Math.abs(centerV) < 0.001) break;
		}

		// Calculate final positions in World Space
		// Target is offset from geometric center by (cx, cy) in camera plane
		const targetOffset = camRight.clone().multiplyScalar(cx).add(camUp.clone().multiplyScalar(cy));

		const target = center.clone().add(targetOffset);
		const position = target.clone().add(camBack.multiplyScalar(d));

		return { position, target };
	}

	/**
	 * Calculate optimal position and rotation for isometric camera
	 */
	private calculateIsometricFraming(
		center: THREE.Vector3,
		objectSize: THREE.Vector3,
		// @ts-ignore aspect is used by calculateOrthographicSize called from focusOnSchematics
		aspect: number,
		// @ts-ignore padding is used by calculateOrthographicSize called from focusOnSchematics
		padding: number
	): { position: THREE.Vector3; rotation: THREE.Euler } {
		const presetName = this.activeCameraKey; // Assume current active camera is isometric or similar ortho
		const preset =
			CameraManager.CAMERA_PRESETS[presetName as keyof typeof CameraManager.CAMERA_PRESETS] ||
			CameraManager.CAMERA_PRESETS.isometric;

		// Use preset rotation if available, otherwise a default isometric-like rotation
		const rotationArray = preset.rotation || CameraManager.CAMERA_PRESETS.isometric.rotation;
		const rotation = new THREE.Euler(...rotationArray);

		// Position the camera far enough along its viewing vector.
		// Distance is based on the object's largest dimension to ensure it's outside the object.
		const maxObjectDim = Math.max(objectSize.x, objectSize.y, objectSize.z);
		// Safety factor to ensure camera is well outside the object.
		// Padding is already accounted for in ortho frustum size.
		const distanceFactor = maxObjectDim * 1.5 + ABSOLUTE_MIN_ORTHO_VISIBLE_HEIGHT * 2;

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
			padding = 0.08,
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
		const currentCamRotation = (this.activeCamera.rotation as THREE.Euler).clone();

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
			console.warn("Cannot start auto-orbit: No circular camera path or path not found.");
			return;
		}
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

	/**
	 * Set custom isometric viewing angles
	 * @param pitchDegrees Vertical angle in degrees (0-90, default ~35.264 for true isometric)
	 * @param yawDegrees Horizontal rotation in degrees (default 45)
	 * @param refocus Whether to refocus on schematics after changing angles (default true)
	 */
	public setIsometricAngles(
		pitchDegrees: number,
		yawDegrees: number = 45,
		refocus: boolean = true
	): void {
		// Clamp pitch to reasonable values
		pitchDegrees = Math.max(0, Math.min(89, pitchDegrees));

		// Convert to radians
		const pitchRad = -(pitchDegrees * Math.PI) / 180;
		const yawRad = (yawDegrees * Math.PI) / 180;

		// Update the preset
		const isometricPreset = CameraManager.CAMERA_PRESETS.isometric as any;
		isometricPreset.rotation = [pitchRad, yawRad, 0];

		// If currently in isometric mode, apply the change
		if (this.activeCameraKey === "isometric") {
			const rotation = new THREE.Euler(pitchRad, yawRad, 0);
			this.activeCamera.rotation = [rotation.x, rotation.y, rotation.z];

			// Refocus if requested
			if (
				refocus &&
				this.schematicRenderer.schematicManager &&
				!this.schematicRenderer.schematicManager.isEmpty()
			) {
				this.focusOnSchematics({
					animationDuration: 0.5,
					easing: (t) => t * t * (3 - 2 * t),
				});
			}

			console.log(`Isometric angles updated: pitch=${pitchDegrees}°, yaw=${yawDegrees}°`);
		}
	}

	/**
	 * Reset isometric angles to true isometric view
	 * @param refocus Whether to refocus on schematics (default true)
	 */
	public resetIsometricAngles(refocus: boolean = true): void {
		const trueIsometricPitch = Math.atan(1 / Math.sqrt(2)) * (180 / Math.PI);
		this.setIsometricAngles(trueIsometricPitch, 45, refocus);
	}

	/**
	 * Get current isometric viewing angles
	 * @returns Object with pitch and yaw in degrees, or null if not in isometric mode
	 */
	public getIsometricAngles(): { pitch: number; yaw: number } | null {
		if (this.activeCameraKey !== "isometric") {
			return null;
		}

		const preset = CameraManager.CAMERA_PRESETS.isometric;
		if (!preset.rotation) return null;

		return {
			pitch: -(preset.rotation[0] * 180) / Math.PI,
			yaw: (preset.rotation[1] * 180) / Math.PI,
		};
	}

	public dispose(): void {
		this.recordingManager.dispose();
		this.stopAnimation();
		this.stopAutoOrbit();

		// Dispose fly controls
		if (this.flyControls) {
			this.flyControls.dispose();
			this.flyControls = null;
		}

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
