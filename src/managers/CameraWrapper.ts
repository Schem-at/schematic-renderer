// managers/CameraWrapper.ts
import * as THREE from "three";
import { EventEmitter } from "events";
// @ts-ignore
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
// @ts-ignore
import { CreativeControls } from "three-creative-controls"

import { SchematicRenderer } from "../SchematicRenderer";

export class CameraWrapper extends EventEmitter {
	private _camera: THREE.Camera;
	// @ts-ignore
	private _type: "perspective" | "orthographic";
	private rendererDomElement: HTMLCanvasElement;

	constructor(
		type: "perspective" | "orthographic",
		rendererDomElement: HTMLCanvasElement,
		private schematicRenderer: SchematicRenderer,
		params: any = {}
	) {
		super();
		this._type = type;
		this.rendererDomElement = rendererDomElement;

		if (type === "perspective") {
			this._camera = new THREE.PerspectiveCamera(
				params.fov ?? 75,
				params.aspect ?? window.innerWidth / window.innerHeight,
				params.near ?? 0.1,
				params.far ?? 1000
			);
			if (params.position) {
				this.position = params.position;
			} else {
				this.position = [0, 0, 5];
			}

			if (params.rotation) {
				this.rotation = params.rotation;
			} else {
				this.rotation = [0, 0, 0];
			}

			if (params.lookAt) {
				this.lookAt(params.lookAt);
			} else {
				this.lookAt([0, 0, 0]);
			}
		} else {
			const d = params.size ?? 20;
            const aspect = params.aspect ?? window.innerWidth / window.innerHeight;
            
            const isometricScale = Math.sqrt(2) / 2; // This helps correct the "squishiness"
            const correctedD = d * isometricScale;
            
            this._camera = new THREE.OrthographicCamera(
                -correctedD * aspect,
                correctedD * aspect,
                correctedD,
                -correctedD,
                params.near ?? 0.1,
                params.far ?? 1000
            );
		}
	}

	// Expose the underlying camera
	get camera() {
		return this._camera;
	}

	// FOV
	get fov() {
		if (this._camera instanceof THREE.PerspectiveCamera) {
			return this._camera.fov;
		}
		return 75;
	}

	set fov(value: number) {
		if (this._camera instanceof THREE.PerspectiveCamera) {
			console.log(`Updating FOV to ${value}`);
			this._camera.fov = value;
			this._camera.updateProjectionMatrix();
			this.emit("propertyChanged", { property: "fov", value });
		}
	}

	// Position
	get position() {
		return this._camera.position;
	}

	set position(value: THREE.Vector3 | THREE.Vector3Tuple | Array<number>) {
		if (Array.isArray(value)) {
			this._camera.position.set(value[0], value[1], value[2]);
		} else {
			this._camera.position.copy(value);
		}
		if (this._camera instanceof THREE.PerspectiveCamera) {
			this._camera.updateProjectionMatrix();
		}

		this.emit("propertyChanged", {
			property: "position",
			value: this._camera.position.clone(),
		});
	}

	// Rotation
	get rotation() {
		return this._camera.rotation;
	}

	set rotation(value: THREE.Euler | [number, number, number]) {
		if (Array.isArray(value)) {
			this._camera.rotation.set(value[0], value[1], value[2]);
		} else {
			this._camera.rotation.copy(value);
		}
		if (this._camera instanceof THREE.PerspectiveCamera) {
			this._camera.updateProjectionMatrix();
		}
		this.emit("propertyChanged", {
			property: "rotation",
			value: this._camera.rotation.clone(),
		});
	}

	updateAspectRatio(aspect: number) {
		if (this._camera instanceof THREE.PerspectiveCamera) {
			this._camera.aspect = aspect;
			this._camera.updateProjectionMatrix();
		} else if (this._camera instanceof THREE.OrthographicCamera) {
            this._camera.left = -aspect;
            this._camera.right = aspect;
            this._camera.updateProjectionMatrix();
		}
		this.emit("propertyChanged", { property: "aspect", value: aspect });
	}

	createControls(type: "orbit" | "creative" | any) {
		let controls: any;
		if (type === "orbit") {
			controls = new OrbitControls(
				this._camera,
				this.rendererDomElement
			);
		} else if (type === "creative") {
			// Add null checks and default values
			const uiManager = this.schematicRenderer.uiManager;
			if (!uiManager) {
				console.warn('UIManager not initialized, creative controls might not work as expected');
				controls = CreativeControls.Controls(
					this._camera,
					this.rendererDomElement,
					null,
					null
				);
				return controls;
			}
	
			const { menu, blocker } = uiManager.createFPVElements();
			
			controls = CreativeControls.Controls(
				this._camera,
				this.rendererDomElement,
				menu,
				blocker
			);
		}
		return controls;
	}

	setPosition(position: THREE.Vector3 | THREE.Vector3Tuple) {
		if (Array.isArray(position)) {
			this._camera.position.set(position[0], position[1], position[2]);
		} else {
			this._camera.position.copy(position);
		}
		if (this._camera instanceof THREE.PerspectiveCamera) {
			this._camera.updateProjectionMatrix();
		}
		this.emit("propertyChanged", { property: "position", value: position });
	}

	lookAt(target: THREE.Vector3 | THREE.Vector3Tuple) {
		if (Array.isArray(target)) {
			this._camera.lookAt(new THREE.Vector3(...target));
		} else {
			this._camera.lookAt(target);
		}
		if (this._camera instanceof THREE.PerspectiveCamera) {
			this._camera.updateProjectionMatrix();
		}
		this.emit("propertyChanged", { property: "lookAt", value: target });
	}


	setPositionLookAt(position: THREE.Vector3 | THREE.Vector3Tuple, target: THREE.Vector3 | THREE.Vector3Tuple) {
		if (Array.isArray(position)) {
			this._camera.position.set(position[0], position[1], position[2]);
		}
		else {
			this._camera.position.copy(position);
		}
		if (Array.isArray(target)) {
			this._camera.lookAt(new THREE.Vector3(...target));
		}
		else {
			this._camera.lookAt(target);
		}
		if (this._camera instanceof THREE.PerspectiveCamera) {
			this._camera.updateProjectionMatrix();
		}
		this.emit("propertyChanged", { property: "position", value: position });
		this.emit("propertyChanged", { property: "lookAt", value: target });
	}	

	changeType(type: "perspective" | "orthographic") {
		this._type = type;
		if (type === "perspective") {
			const currentCamera = this._camera as THREE.OrthographicCamera;
			const aspect = window.innerWidth / window.innerHeight;
			this._camera = new THREE.PerspectiveCamera(
				75,
				aspect,
				currentCamera.near,
				currentCamera.far
			);
		} else {
			const currentCamera = this._camera as THREE.PerspectiveCamera;
			const d = 20;
			const aspect = window.innerWidth / window.innerHeight;
			this._camera = new THREE.OrthographicCamera(
				-d * aspect,
				d * aspect,
				d,
				-d,
				currentCamera.near,
				currentCamera.far
			);
		}
		this.position = this._camera.position;
		this.rotation = this._camera.rotation;
		this.emit("propertyChanged", { property: "type", value: type });
	}
}
