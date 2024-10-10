// managers/CameraManager.ts
import * as THREE from "three";
import { EventEmitter } from "events";

import { SchematicRenderer } from "../SchematicRenderer";
import { CameraWrapper } from "./CameraWrapper";
import { CameraPath } from '../camera/CameraPath';
type CameraType = "perspective" | "orthographic";
type ControlType = "orbit" | "pointerLock" | "none";

export class CameraManager extends EventEmitter {
	private schematicRenderer: SchematicRenderer;
	private cameras: Map<string, CameraWrapper> = new Map();
	private activeCameraKey: string;
	public controls: Map<string, any> = new Map();
	private activeControlKey: string;
	private rendererDomElement: HTMLCanvasElement;
	private animationRequestId: number | null = null;
	constructor(
		schematicRenderer: SchematicRenderer,
		defaultCameraParams: any = {}
	) {
		super();
		this.schematicRenderer = schematicRenderer;
		this.rendererDomElement = this.schematicRenderer.canvas;

		// Initialize with a default perspective camera
		const defaultCamera = this.createCamera("perspective", {
			position: defaultCameraParams.position || [0, 0, 0],
			rotation: defaultCameraParams.rotation || [0, 0, 0],
			lookAt: defaultCameraParams.lookAt || [0, 0, 0],
		});
		this.cameras.set("default", defaultCamera);
		this.activeCameraKey = "default";

		console.log(defaultCamera);
		// Initialize with default controls (OrbitControls)
		const defaultControls = defaultCamera.createControls("orbit");
		this.controls.set("orbit", defaultControls);
		this.activeControlKey = "orbit";

		// Listen to control changes
		this.setupControlEvents(defaultControls);
	}

	// Camera Management
	private createCamera(type: CameraType, params: any): CameraWrapper {
		let camera: CameraWrapper;
		if (type === "perspective") {
			camera = new CameraWrapper(
				"perspective",
				this.rendererDomElement,
				params
			);
		} else {
			camera = new CameraWrapper(
				"orthographic",
				this.rendererDomElement,
				params
			);
		}
		return camera;
	}
	

	public animateCameraAlongPath(
		cameraPath: CameraPath,
		duration: number,
		onComplete?: () => void
	  ): void {
		const startTime = performance.now();
		const animate = () => {
		  const elapsed = (performance.now() - startTime) / 1000; // Convert to seconds
		  const t = (elapsed % duration) / duration; // Loop the animation
	
		  // Get position and rotation from the path
		  const { position, rotation, target } = cameraPath.getPoint(t);
	
		  // Update the camera
		  this.activeCamera.position = position;
		  this.activeCamera.rotation = rotation;
	
			// Look at the target
			this.activeCamera.lookAt(target);
		  // Continue animation
		  if (elapsed < duration) {
			requestAnimationFrame(animate);
		  } else if (onComplete) {
			onComplete();
		  }
		};
		animate();
	}
	
	public stopAnimation(): void {
		if (this.animationRequestId !== null) {
		  cancelAnimationFrame(this.animationRequestId);
		  this.animationRequestId = null;
		}
	  }

	addCamera(key: string, type: CameraType, params: any = {}) {
		if (this.cameras.has(key)) {
			console.warn(`Camera with key '${key}' already exists. Overwriting.`);
		}
		const camera = this.createCamera(type, params);
		this.cameras.set(key, camera);
	}

	removeCamera(key: string) {
		if (this.cameras.has(key)) {
			this.cameras.delete(key);
			if (this.activeCameraKey === key) {
				const keys = Array.from(this.cameras.keys());
				this.activeCameraKey = keys.length > 0 ? keys[0] : null;
				this.emit("cameraSwitched", { key: this.activeCameraKey });
			}
		} else {
			console.warn(`Camera with key '${key}' does not exist.`);
		}
	}

	get activeCamera(): CameraWrapper {
		return this.cameras.get(this.activeCameraKey);
	}

	switchCamera(key: string) {
		if (this.cameras.has(key)) {
			this.activeCameraKey = key;
			this.emit("cameraSwitched", { key });
		} else {
			console.warn(`Camera with key '${key}' does not exist.`);
		}
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
			// Emit position change
			this.emit("propertyChanged", {
				property: "position",
				value: this.activeCamera.position.clone(),
			});

			// Emit rotation change (optional)
			this.emit("propertyChanged", {
				property: "rotation",
				value: this.activeCamera.rotation.clone(),
			});
		});
	}

	// Update loop for controls
	public update(deltaTime: number = 0) {
		const controls = this.controls.get(this.activeControlKey);
		if (controls && controls.update) {
			controls.update(deltaTime);
		}
	}

	// Expose camera properties
	get position() {
		return this.activeCamera.position;
	}

	set position(value: THREE.Vector3 | THREE.Vector3Tuple | Array<number>) {
		if (Array.isArray(value)) {
			this.activeCamera.position.set(...value);
		} else {
			this.activeCamera.position.copy(value);
		}
		this.emit("propertyChanged", { property: "position", value });
	}

	get rotation() {
		return this.activeCamera.rotation;
	}

	set rotation(value: THREE.Euler | THREE.EulerTuple) {
		if (Array.isArray(value)) {
			this.activeCamera.rotation.set(...value);
		} else {
			this.activeCamera.rotation.copy(value);
		}
		this.emit("propertyChanged", { property: "rotation", value });
	}

	// Update aspect ratio on resize
	updateAspectRatio(aspect: number) {
		this.cameras.forEach((cameraWrapper) => {
			if (cameraWrapper.camera instanceof THREE.PerspectiveCamera) {
				cameraWrapper.camera.aspect = aspect;
				cameraWrapper.camera.updateProjectionMatrix();
			} else if (cameraWrapper.camera instanceof THREE.OrthographicCamera) {
				const frustumSize = 10;
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

	public focusOnSchematics() {
		const boundingBox =
			this.schematicRenderer.schematicManager.getGlobalBoundingBox();
		const width = boundingBox[1][0] - boundingBox[0][0];
		const height = boundingBox[1][1] - boundingBox[0][1];
		const depth = boundingBox[1][2] - boundingBox[0][2];
		const distance = Math.max(width, height, depth);
		const center =
			this.schematicRenderer.schematicManager.getSchematicsAveragePosition();
		const elevationAngle = Math.PI / 4;
		const azimuthalAngle = Math.PI / 4;
		const x =
			center.x + distance * Math.sin(elevationAngle) * Math.cos(azimuthalAngle);
		const y = center.y + distance * Math.cos(elevationAngle);
		const z =
			center.z + distance * Math.sin(elevationAngle) * Math.sin(azimuthalAngle);
		this.activeCamera.position = new THREE.Vector3(x, y, z);
		this.activeCamera.lookAt(center);
	}
}
