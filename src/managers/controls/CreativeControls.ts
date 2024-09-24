// controls/CreativeControls.ts
import * as THREE from "three";
import { EventEmitter } from "events";

export class CreativeControls extends EventEmitter {
	private camera: THREE.Camera;
	private domElement: HTMLElement;
	private isLocked: boolean = false;

	// Movement flags
	private moveForward: boolean = false;
	private moveBackward: boolean = false;
	private moveLeft: boolean = false;
	private moveRight: boolean = false;
	private moveUp: boolean = false;
	private moveDown: boolean = false;

	// Movement parameters
	private velocity: THREE.Vector3 = new THREE.Vector3();
	private direction: THREE.Vector3 = new THREE.Vector3();
	private speed: number = 400.0; // Units per second
	private sensitivity: number = 0.002; // Mouse sensitivity

	// For mouse look
	private pitchObject: THREE.Object3D;
	private yawObject: THREE.Object3D;

	constructor(camera: THREE.Camera, domElement: HTMLElement) {
		super();
		this.camera = camera;
		this.domElement = domElement;

		// Setup for mouse look
		this.pitchObject = new THREE.Object3D();
		this.pitchObject.add(this.camera);

		this.yawObject = new THREE.Object3D();
		this.yawObject.position.y = 0;
		this.yawObject.add(this.pitchObject);

		// Bind event handlers
		this.bindEvents();
	}

	private bindEvents() {
		// Pointer lock
		this.domElement.addEventListener(
			"click",
			() => {
				this.domElement.requestPointerLock();
			},
			false
		);

		document.addEventListener(
			"pointerlockchange",
			this.onPointerLockChange.bind(this),
			false
		);
		document.addEventListener(
			"pointerlockerror",
			this.onPointerLockError.bind(this),
			false
		);

		// Mouse move
		document.addEventListener("mousemove", this.onMouseMove.bind(this), false);

		// Keyboard events
		document.addEventListener("keydown", this.onKeyDown.bind(this), false);
		document.addEventListener("keyup", this.onKeyUp.bind(this), false);
	}

	private onPointerLockChange() {
		if (document.pointerLockElement === this.domElement) {
			this.isLocked = true;
			this.emit("lock");
		} else {
			this.isLocked = false;
			this.emit("unlock");
		}
	}

	private onPointerLockError() {
		console.error("PointerLockControls: Unable to use Pointer Lock API");
	}

	private onMouseMove(event: MouseEvent) {
		if (!this.isLocked) return;

		const movementX =
			event.movementX || event.mozMovementX || event.webkitMovementX || 0;
		const movementY =
			event.movementY || event.mozMovementY || event.webkitMovementY || 0;

		this.yawObject.rotation.y -= movementX * this.sensitivity;
		this.pitchObject.rotation.x -= movementY * this.sensitivity;

		// Limit vertical look to prevent flipping
		this.pitchObject.rotation.x = Math.max(
			-Math.PI / 2,
			Math.min(Math.PI / 2, this.pitchObject.rotation.x)
		);
	}

	private onKeyDown(event: KeyboardEvent) {
		switch (event.code) {
			case "KeyW":
				this.moveForward = true;
				break;
			case "KeyS":
				this.moveBackward = true;
				break;
			case "KeyA":
				this.moveLeft = true;
				break;
			case "KeyD":
				this.moveRight = true;
				break;
			case "Space":
				this.moveUp = true;
				break;
			case "ShiftLeft":
			case "ShiftRight":
				this.moveDown = true;
				break;
		}
	}

	private onKeyUp(event: KeyboardEvent) {
		switch (event.code) {
			case "KeyW":
				this.moveForward = false;
				break;
			case "KeyS":
				this.moveBackward = false;
				break;
			case "KeyA":
				this.moveLeft = false;
				break;
			case "KeyD":
				this.moveRight = false;
				break;
			case "Space":
				this.moveUp = false;
				break;
			case "ShiftLeft":
			case "ShiftRight":
				this.moveDown = false;
				break;
		}
	}

	public update(delta: number) {
		// Update velocity based on movement flags
		this.velocity.x -= this.velocity.x * 10.0 * delta;
		this.velocity.y -= this.velocity.y * 10.0 * delta;
		this.velocity.z -= this.velocity.z * 10.0 * delta;

		this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
		this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
		this.direction.y = Number(this.moveUp) - Number(this.moveDown);
		this.direction.normalize();

		const acceleration = this.speed * delta;

		if (this.moveForward || this.moveBackward)
			this.velocity.z -= this.direction.z * acceleration;
		if (this.moveLeft || this.moveRight)
			this.velocity.x -= this.direction.x * acceleration;
		if (this.moveUp || this.moveDown)
			this.velocity.y -= this.direction.y * acceleration;

		// Apply movement
		this.yawObject.translateX(-this.velocity.x * delta);
		this.yawObject.translateY(this.velocity.y * delta);
		this.yawObject.translateZ(-this.velocity.z * delta);

		// Update camera position
		this.camera.position.copy(this.yawObject.position);
	}

	public getObject(): THREE.Object3D {
		return this.yawObject;
	}

	public dispose() {
		// Remove event listeners
		this.domElement.removeEventListener(
			"click",
			() => {
				this.domElement.requestPointerLock();
			},
			false
		);
		document.removeEventListener(
			"pointerlockchange",
			this.onPointerLockChange.bind(this),
			false
		);
		document.removeEventListener(
			"pointerlockerror",
			this.onPointerLockError.bind(this),
			false
		);
		document.removeEventListener(
			"mousemove",
			this.onMouseMove.bind(this),
			false
		);
		document.removeEventListener("keydown", this.onKeyDown.bind(this), false);
		document.removeEventListener("keyup", this.onKeyUp.bind(this), false);
	}
}
