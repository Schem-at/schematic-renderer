// managers/CameraWrapper.ts
import * as THREE from "three";
import { EventEmitter } from "events";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";
import { CreativeControls } from "../controls/CreativeControls";

export class CameraWrapper extends EventEmitter {
	private _camera: THREE.Camera;
	private _type: "perspective" | "orthographic";
	private rendererDomElement: HTMLCanvasElement;

	constructor(
		type: "perspective" | "orthographic",
		rendererDomElement: HTMLCanvasElement,
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
		} else {
			const d = params.size ?? 20;
			const aspect = params.aspect ?? window.innerWidth / window.innerHeight;
			this._camera = new THREE.OrthographicCamera(
				-d * aspect,
				d * aspect,
				d,
				-d,
				params.near ?? 0.1,
				params.far ?? 1000
			);
		}

		// Set initial position and rotation if provided
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
		return null;
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

	set rotation(value: THREE.Euler | THREE.EulerTuple) {
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

	// Other properties and methods as needed...

	// Update aspect ratio (useful when the canvas size changes)
	updateAspectRatio(aspect: number) {
		if (this._camera instanceof THREE.PerspectiveCamera) {
			this._camera.aspect = aspect;
			this._camera.updateProjectionMatrix();
		} else if (this._camera instanceof THREE.OrthographicCamera) {
			const frustumHeight = this._camera.top - this._camera.bottom;
			this._camera.left = (-frustumHeight * aspect) / 2;
			this._camera.right = (frustumHeight * aspect) / 2;
			this._camera.updateProjectionMatrix();
		}
		this.emit("propertyChanged", { property: "aspect", value: aspect });
	}

	createControls(type: "orbit" | "pointer-lock" | any) {
		let controls: any;
		console.log(this._camera);
		if (type === "orbit") {
			controls = new OrbitControls(
				this._camera as THREE.PerspectiveCamera,
				this.rendererDomElement
			);
		} else if (type === "pointer-lock") {
			controls = new PointerLockControls(
				this._camera as THREE.PerspectiveCamera,
				this.rendererDomElement
			);
		}
		return controls;
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

	changeType(type: "perspective" | "orthographic") {
		this._type = type;
		if (type === "perspective") {
			const currentCamera = this._camera as THREE.OrthographicCamera;
			const d = 20;
			const aspect = window.innerWidth / window.innerHeight;
			this._camera = new THREE.PerspectiveCamera(
				currentCamera.fov,
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
