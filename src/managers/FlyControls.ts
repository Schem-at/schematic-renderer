// managers/FlyControls.ts
// First-person fly controls using PointerLockControls for smooth camera movement

import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { EventEmitter } from "events";

export interface FlyControlsOptions {
	/** Movement speed in units per second */
	moveSpeed?: number;
	/** Sprint multiplier when holding shift */
	sprintMultiplier?: number;
	/** Look sensitivity (mouse movement) */
	lookSensitivity?: number;
	/** Keybinds for movement */
	keybinds?: Partial<FlyControlsKeybinds>;
}

export interface FlyControlsKeybinds {
	forward: string;
	backward: string;
	left: string;
	right: string;
	up: string;
	down: string;
	sprint: string;
}

const DEFAULT_KEYBINDS: FlyControlsKeybinds = {
	forward: "KeyW",
	backward: "KeyS",
	left: "KeyA",
	right: "KeyD",
	up: "Space",
	down: "KeyC",
	sprint: "ShiftLeft",
};

/**
 * First-person fly controls for navigating 3D scenes.
 * Click to enter fly mode, ESC to exit.
 * WASD to move, Space/C for up/down, Shift to sprint.
 */
export class FlyControls extends EventEmitter {
	public enabled: boolean = true;
	public isLocked: boolean = false;

	private pointerLockControls: PointerLockControls;
	private camera: THREE.Camera;
	private domElement: HTMLElement;

	// Movement state
	private moveSpeed: number;
	private sprintMultiplier: number;
	private keybinds: FlyControlsKeybinds;

	// Input tracking
	private pressedKeys = new Set<string>();
	private velocity = new THREE.Vector3();
	private direction = new THREE.Vector3();

	// UI elements
	private overlayElement: HTMLDivElement | null = null;

	constructor(camera: THREE.Camera, domElement: HTMLElement, options: FlyControlsOptions = {}) {
		super();
		this.camera = camera;
		this.domElement = domElement;

		// Apply options
		this.moveSpeed = options.moveSpeed ?? 10;
		this.sprintMultiplier = options.sprintMultiplier ?? 2.5;
		this.keybinds = { ...DEFAULT_KEYBINDS, ...options.keybinds };

		// Create PointerLockControls
		this.pointerLockControls = new PointerLockControls(camera, domElement);

		// Set up event listeners
		this.setupEventListeners();

		// Create overlay UI
		this.createOverlay();
	}

	private setupEventListeners(): void {
		// Pointer lock events
		this.pointerLockControls.addEventListener("lock", () => {
			this.isLocked = true;
			this.showOverlay(false);
			this.emit("lock");
		});

		this.pointerLockControls.addEventListener("unlock", () => {
			this.isLocked = false;
			this.pressedKeys.clear();
			this.velocity.set(0, 0, 0);
			// Only show overlay if fly controls are enabled
			if (this.enabled) {
				this.showOverlay(true);
			}
			this.emit("unlock");
		});

		// Click to lock
		this.domElement.addEventListener("click", this.onCanvasClick);

		// Keyboard events
		document.addEventListener("keydown", this.onKeyDown);
		document.addEventListener("keyup", this.onKeyUp);
	}

	private onCanvasClick = (): void => {
		if (this.enabled && !this.isLocked) {
			this.lock();
		}
	};

	private onKeyDown = (event: KeyboardEvent): void => {
		if (!this.enabled || !this.isLocked) return;

		this.pressedKeys.add(event.code);

		// Prevent default for movement keys
		if (Object.values(this.keybinds).includes(event.code)) {
			event.preventDefault();
		}
	};

	private onKeyUp = (event: KeyboardEvent): void => {
		this.pressedKeys.delete(event.code);
	};

	private onOverlayClick = (): void => {
		if (this.enabled && !this.isLocked) {
			this.lock();
		}
	};

	private createOverlay(): void {
		this.overlayElement = document.createElement("div");
		Object.assign(this.overlayElement.style, {
			position: "absolute",
			top: "0",
			left: "0",
			width: "100%",
			height: "100%",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			backgroundColor: "rgba(0, 0, 0, 0.5)",
			color: "white",
			fontFamily: "system-ui, -apple-system, sans-serif",
			fontSize: "18px",
			textAlign: "center",
			cursor: "pointer",
			zIndex: "900", // Lower than sidebar (1000) so UI panels appear above
			pointerEvents: "auto",
			opacity: "0",
			transition: "opacity 0.2s ease",
		});

		const content = document.createElement("div");
		content.innerHTML = `
			<div style="font-size: 24px; margin-bottom: 12px;">Click to Enter Fly Mode</div>
			<div style="font-size: 14px; color: rgba(255,255,255,0.7);">
				<div>WASD - Move</div>
				<div>Space - Up • C - Down</div>
				<div>Shift - Sprint</div>
				<div>ESC - Exit</div>
			</div>
		`;
		this.overlayElement.appendChild(content);

		// Add click listener to overlay
		this.overlayElement.addEventListener("click", this.onOverlayClick);

		// Position relative to canvas
		const parent = this.domElement.parentElement;
		if (parent) {
			parent.style.position = "relative";
			parent.appendChild(this.overlayElement);
		}

		// Initially hidden
		this.showOverlay(false);
	}

	private showOverlay(visible: boolean): void {
		if (this.overlayElement) {
			this.overlayElement.style.opacity = visible ? "1" : "0";
			this.overlayElement.style.pointerEvents = visible ? "auto" : "none";
		}
	}

	/**
	 * Show or hide the fly controls overlay
	 * @param visible Whether the overlay should be visible
	 */
	public setOverlayVisible(visible: boolean): void {
		this.showOverlay(visible);
	}

	/**
	 * Lock the pointer and enter fly mode
	 */
	public lock(): void {
		if (this.enabled) {
			this.pointerLockControls.lock();
		}
	}

	/**
	 * Unlock the pointer and exit fly mode
	 */
	public unlock(): void {
		this.pointerLockControls.unlock();
	}

	/**
	 * Toggle pointer lock
	 */
	public toggle(): void {
		if (this.isLocked) {
			this.unlock();
		} else {
			this.lock();
		}
	}

	/**
	 * Update movement - call this every frame
	 */
	public update(deltaTime: number): void {
		if (!this.enabled || !this.isLocked) return;

		// Calculate movement direction
		this.direction.set(0, 0, 0);

		// Forward/Backward
		if (this.pressedKeys.has(this.keybinds.forward)) {
			this.direction.z -= 1;
		}
		if (this.pressedKeys.has(this.keybinds.backward)) {
			this.direction.z += 1;
		}

		// Left/Right (strafe)
		if (this.pressedKeys.has(this.keybinds.left)) {
			this.direction.x -= 1;
		}
		if (this.pressedKeys.has(this.keybinds.right)) {
			this.direction.x += 1;
		}

		// Up/Down (world space)
		if (this.pressedKeys.has(this.keybinds.up)) {
			this.direction.y += 1;
		}
		if (this.pressedKeys.has(this.keybinds.down)) {
			this.direction.y -= 1;
		}

		// Normalize direction to prevent faster diagonal movement
		if (this.direction.length() > 0) {
			this.direction.normalize();
		}

		// Apply sprint multiplier
		let speed = this.moveSpeed;
		if (this.pressedKeys.has(this.keybinds.sprint)) {
			speed *= this.sprintMultiplier;
		}

		// Calculate velocity
		this.velocity.copy(this.direction).multiplyScalar(speed * deltaTime);

		// Get camera direction vectors
		const cameraDirection = new THREE.Vector3();
		this.camera.getWorldDirection(cameraDirection);

		// Create camera-relative coordinate system (XZ plane for horizontal movement)
		const forward = new THREE.Vector3(cameraDirection.x, 0, cameraDirection.z).normalize();
		const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

		// Apply movement in camera space
		const movement = new THREE.Vector3();
		movement.addScaledVector(forward, -this.velocity.z); // Forward/backward
		movement.addScaledVector(right, -this.velocity.x); // Left/right
		movement.y += this.velocity.y; // Up/down in world space

		// Update camera position
		this.camera.position.add(movement);

		// Emit change event
		if (movement.length() > 0) {
			this.emit("change");
		}
	}

	// Getters/Setters for settings

	public getMoveSpeed(): number {
		return this.moveSpeed;
	}

	public setMoveSpeed(speed: number): void {
		this.moveSpeed = speed;
	}

	public getSprintMultiplier(): number {
		return this.sprintMultiplier;
	}

	public setSprintMultiplier(multiplier: number): void {
		this.sprintMultiplier = multiplier;
	}

	public getKeybinds(): FlyControlsKeybinds {
		return { ...this.keybinds };
	}

	public setKeybinds(keybinds: Partial<FlyControlsKeybinds>): void {
		this.keybinds = { ...this.keybinds, ...keybinds };
	}

	/**
	 * Get the underlying PointerLockControls for advanced usage
	 */
	public getPointerLockControls(): PointerLockControls {
		return this.pointerLockControls;
	}

	/**
	 * Clean up resources
	 */
	public dispose(): void {
		// Remove event listeners
		this.domElement.removeEventListener("click", this.onCanvasClick);
		document.removeEventListener("keydown", this.onKeyDown);
		document.removeEventListener("keyup", this.onKeyUp);

		// Unlock if locked
		if (this.isLocked) {
			this.unlock();
		}

		// Remove overlay and its click listener
		if (this.overlayElement) {
			this.overlayElement.removeEventListener("click", this.onOverlayClick);
			if (this.overlayElement.parentElement) {
				this.overlayElement.parentElement.removeChild(this.overlayElement);
			}
		}
		this.overlayElement = null;

		// Dispose PointerLockControls
		this.pointerLockControls.dispose();

		// Clear state
		this.pressedKeys.clear();
		this.removeAllListeners();
	}
}
