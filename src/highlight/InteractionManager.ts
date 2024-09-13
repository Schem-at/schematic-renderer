// InteractionManager.ts
import * as THREE from "three";
import { EventEmitter } from "./EventEmitter";

export class InteractionManager {
	private eventEmitter: EventEmitter;
	private renderer: THREE.WebGLRenderer;
	private currentHoverData: {
		position: THREE.Vector3;
		faceNormal: THREE.Vector3;
	} | null = null;

	constructor(renderer: THREE.WebGLRenderer, eventEmitter: EventEmitter) {
		this.renderer = renderer;
		this.eventEmitter = eventEmitter;

		// Listen to hover events
		this.eventEmitter.on("hover", this.onHover);

		// Listen to user input events
		this.renderer.domElement.addEventListener("mousedown", this.onMouseDown);
	}

	private onHover = (
		data: { position: THREE.Vector3; faceNormal: THREE.Vector3 } | null
	) => {
		this.currentHoverData = data;
	};

	private onMouseDown = (event: MouseEvent) => {
		if (event.button === 2) {
			// Right mouse button
			if (this.currentHoverData) {
				this.eventEmitter.emit("placeBlock", this.currentHoverData);
			}
		}
	};

	dispose() {
		// Clean up event listeners
		this.eventEmitter.off("hover", this.onHover);
		this.renderer.domElement.removeEventListener("mousedown", this.onMouseDown);
	}
}
