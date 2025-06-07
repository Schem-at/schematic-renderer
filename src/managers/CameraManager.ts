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
	position?: [number, number, number];
	defaultCameraPreset?: "perspective" | "isometric" | "perspective_fpv";
	showCameraPathVisualization?: boolean;
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

		// Setup event listeners for schematic changes to update camera path
		if (this.schematicRenderer.eventEmitter) {
			// Listen for schematic loaded/added events
			this.schematicRenderer.eventEmitter.on("schematicAdded", () => {
				// Update the camera path when a new schematic is added
				const defaultPath = this.cameraPathManager.getFirstPath();
				if (defaultPath) {
					this.cameraPathManager.fitCircularPathToSchematics(defaultPath.name);

					// If auto-orbit is active, restart it to use the updated path
					if (this.autoOrbitEnabled) {
						this.stopAutoOrbit();
						this.startAutoOrbit();
					}
				}
			});
		}

		// Start auto-orbit if enabled in options
		if (this.schematicRenderer.options.enableAutoOrbit) {
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

	public async focusOnSchematics() {
		console.log("Focusing on schematics");
		if (!this.schematicRenderer?.schematicManager) {
			return;
		}
		if (this.schematicRenderer.schematicManager.isEmpty()) {
			return;
		}

		// Temporarily disable controls
		const controls = this.controls.get(this.activeControlKey);
		if (controls) {
			controls.enabled = false;
		}

		const averagePosition =
			this.schematicRenderer.schematicManager.getSchematicsAveragePosition();
		const maxDimensions =
			this.schematicRenderer.schematicManager.getMaxSchematicDimensions();
		const maxDimension = Math.max(
			maxDimensions.x,
			maxDimensions.y,
			maxDimensions.z
		);

		if (this.activeCameraKey === "isometric") {
			// For isometric, maintain the preset rotation and adjust distance based on size
			const scale = maxDimension / 20; // Adjust this factor to control zoom level

			// Use preset rotation - convert readonly array to mutable
			const preset = CameraManager.CAMERA_PRESETS.isometric;
			this.activeCamera.rotation = [...preset.rotation!] as [
				number,
				number,
				number
			];

			// Adjust position while maintaining isometric angles
			const distance = 20 * scale; // Base distance * scale
			this.activeCamera.setPosition([
				averagePosition.x + distance,
				averagePosition.y + distance,
				averagePosition.z + distance,
			]);
		} else {
			// Original perspective camera positioning
			const rootThree = Math.sqrt(3);
			const scaledMaxDimension = maxDimension / rootThree;

			const newPosition = [
				averagePosition.x + scaledMaxDimension,
				averagePosition.y + scaledMaxDimension,
				averagePosition.z + scaledMaxDimension,
			];

			this.activeCamera.setPosition(newPosition as THREE.Vector3Tuple);
		}

		// Update controls target
		if (controls && "target" in controls) {
			controls.target.copy(averagePosition);
			controls.update();
		}

		// Re-enable controls
		if (controls) {
			controls.enabled = true;
		}

		// Update the circular camera path to fit the schematics
		// This is important for auto-orbit functionality
		this.cameraPathManager.fitCircularPathToSchematics("circularPath");

		// If auto-orbit is active, we need to restart it to use the updated path
		const wasAutoOrbitActive = this.autoOrbitEnabled;
		if (wasAutoOrbitActive) {
			// Restart auto-orbit to use the updated path
			this.stopAutoOrbit();
			this.startAutoOrbit();
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

		// Make sure we have a circular path (we only support circular paths for auto-orbit)
		if (!(defaultPath.path instanceof CircularCameraPath)) {
			console.warn("Auto-orbit only supports CircularCameraPath");
			return;
		}

		// Ensure path is fitted to the current schematics
		if (
			this.schematicRenderer?.schematicManager &&
			!this.schematicRenderer.schematicManager.isEmpty()
		) {
			this.cameraPathManager.fitCircularPathToSchematics(defaultPath.name);
		}

		// Disable controls during auto-orbit
		const controls = this.controls.get(this.activeControlKey);
		if (controls) {
			controls.enabled = false;
		}

		this.autoOrbitEnabled = true;
		this.autoOrbitStartTime = performance.now();

		// Start animation loop
		const animateOrbit = () => {
			if (!this.autoOrbitEnabled) return;

			const elapsedTime = (performance.now() - this.autoOrbitStartTime) / 1000;
			const t = (elapsedTime % this.autoOrbitDuration) / this.autoOrbitDuration;

			// Get camera position from the path
			// @ts-ignore
			const { position, rotation, target } = defaultPath.path.getPoint(t);

			// Apply position and rotation
			(this.activeCamera.position as THREE.Vector3).copy(position);
			this.activeCamera.lookAt(target);

			// Emit camera movement event
			this.emit("cameraMove", {
				position: (this.activeCamera.position as THREE.Vector3).clone(),
				rotation: (this.activeCamera.rotation as THREE.Euler).clone(),
				progress: t,
			});

			// Continue animation
			this.autoOrbitAnimationId = requestAnimationFrame(animateOrbit);
		};

		// Start the animation
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
