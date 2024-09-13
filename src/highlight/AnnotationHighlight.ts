// AnnotationHighlight.ts
import * as THREE from "three";
import { Highlight } from "./Highlight";
import { EventEmitter } from "./EventEmitter";

export class AnnotationHighlight implements Highlight {
	private schematicRenderer: any;
	private scene: THREE.Scene;
	private camera: THREE.Camera;
	private renderer: THREE.WebGLRenderer;
	private eventEmitter: EventEmitter;
	private annotations: {
		[key: string]: { mesh: THREE.Mesh; label: THREE.Sprite };
	} = {};
	private annotationInput: HTMLDivElement;
	private raycaster: THREE.Raycaster;
	private mouse: THREE.Vector2;
	private hoverPosition: THREE.Vector3 | null = null;

	constructor(
		schematicRenderer: any,
		scene: THREE.Scene,
		camera: THREE.Camera,
		renderer: THREE.WebGLRenderer,
		eventEmitter: EventEmitter
	) {
		this.schematicRenderer = schematicRenderer;
		this.scene = scene;
		this.camera = camera;
		this.renderer = renderer;
		this.eventEmitter = eventEmitter;

		this.eventEmitter.on("addAnnotation", this.onAddAnnotation);
		this.annotationInput = document.createElement("div");
		this.raycaster = new THREE.Raycaster();
		this.mouse = new THREE.Vector2();
		this.createAnnotationInput();
	}

	private onAddAnnotation = (position: THREE.Vector3) => {
		this.showAnnotationInput(position);
	};

	activate() {}

	deactivate() {
		this.clearAllAnnotations();
		this.annotationInput.remove();
		this.eventEmitter.off("addAnnotation", this.onAddAnnotation);
	}

	update(deltaTime: number) {
		this.updateAnnotationVisibility();
	}

	private createAnnotationInput() {
		this.annotationInput = document.createElement("div");
		this.annotationInput.style.position = "absolute";
		this.annotationInput.style.display = "none";
		this.annotationInput.innerHTML = `
      <input type="text" id="annotation-text" style="width: 200px;">
      <button id="submit-annotation">Add</button>
      <button id="cancel-annotation">Cancel</button>
    `;
		document.body.appendChild(this.annotationInput);

		const submitButton =
			this.annotationInput.querySelector("#submit-annotation");
		const cancelButton =
			this.annotationInput.querySelector("#cancel-annotation");
		const inputField = this.annotationInput.querySelector(
			"#annotation-text"
		) as HTMLInputElement;

		submitButton?.addEventListener("click", () => this.submitAnnotation());
		cancelButton?.addEventListener("click", () => this.hideAnnotationInput());
		inputField?.addEventListener("keypress", (e) => {
			if (e.key === "Enter") this.submitAnnotation();
		});
	}

	private showAnnotationInput(position: THREE.Vector3) {
		// Convert world position to screen coordinates
		const screenPosition = position.clone().project(this.camera);
		const x =
			(screenPosition.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
		const y =
			(-screenPosition.y * 0.5 + 0.5) * this.renderer.domElement.clientHeight;

		this.annotationInput.style.display = "block";
		this.annotationInput.style.left = `${x}px`;
		this.annotationInput.style.top = `${y}px`;
		(
			this.annotationInput.querySelector("#annotation-text") as HTMLInputElement
		).focus();
		this.annotationInput.dataset.position = JSON.stringify(position.toArray());
	}

	private hideAnnotationInput() {
		this.annotationInput.style.display = "none";
		(
			this.annotationInput.querySelector("#annotation-text") as HTMLInputElement
		).value = "";
	}

	private submitAnnotation() {
		const text = (
			this.annotationInput.querySelector("#annotation-text") as HTMLInputElement
		).value;
		const positionArray = JSON.parse(
			this.annotationInput.dataset.position || "[]"
		);
		const position = new THREE.Vector3().fromArray(positionArray);
		if (text) {
			this.addAnnotation(position, text);
		}

		this.hideAnnotationInput();
	}

	private addAnnotation(
		position: THREE.Vector3,
		text: string,
		color: number = 0x00aaff
	) {
		const key = `${position.x},${position.y},${position.z}`;

		// Remove existing annotation at this position if it exists
		this.removeAnnotation(position);

		// Create highlight cube
		const geometry = new THREE.BoxGeometry(1.05, 1.05, 1.05);
		const material = new THREE.MeshBasicMaterial({
			color: color,
			opacity: 0.3,
			transparent: true,
		});
		const highlightCube = new THREE.Mesh(geometry, material);
		highlightCube.position.copy(
			new THREE.Vector3(position.x, position.y, position.z)
		);
		highlightCube.userData.isHighlight = true;

		// Create text sprite
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		canvas.width = 256;
		canvas.height = 128;

		if (context) {
			context.fillStyle = "rgba(0, 0, 0, 0.8)";
			context.fillRect(0, 0, canvas.width, canvas.height);

			// Draw a border
			context.strokeStyle = `rgb(${(color >> 16) & 255}, ${
				(color >> 8) & 255
			}, ${color & 255})`;
			context.lineWidth = 2;
			context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

			context.textAlign = "left";
			context.textBaseline = "top";
			context.fillStyle = "white";

			context.font = "20px Courier New";
			context.fillText(text, 5, 5);
		}

		// Create sprite from canvas
		const texture = new THREE.CanvasTexture(canvas);
		const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
		const sprite = new THREE.Sprite(spriteMaterial);
		sprite.scale.set(2, 1, 2);
		sprite.position.copy(position).add(new THREE.Vector3(0, 1.25, 0));

		// Add to scene and store reference
		this.scene.add(highlightCube);
		this.scene.add(sprite);
		this.annotations[key] = { mesh: highlightCube, label: sprite };
	}

	private removeAnnotation(position: THREE.Vector3) {
		const key = `${position.x},${position.y},${position.z}`;
		if (this.annotations[key]) {
			this.scene.remove(this.annotations[key].mesh);
			this.scene.remove(this.annotations[key].label);
			delete this.annotations[key];
		}
	}

	private clearAllAnnotations() {
		for (const key in this.annotations) {
			this.scene.remove(this.annotations[key].mesh);
			this.scene.remove(this.annotations[key].label);
		}
		this.annotations = {};
	}

	private updateAnnotationVisibility() {
		const cameraPosition = this.camera.position;
		for (const key in this.annotations) {
			const annotation = this.annotations[key];
			if (annotation && annotation.label && annotation.label.position) {
				const distance = cameraPosition.distanceTo(annotation.label.position);
				const opacity = Math.min(Math.max(0, 1 - (distance - 5) / 10), 1);
				if (annotation.label.material) {
					(annotation.label.material as THREE.SpriteMaterial).opacity = opacity;
				}
				if (
					annotation.mesh &&
					annotation.mesh.material &&
					"opacity" in annotation.mesh.material
				) {
					(annotation.mesh.material as THREE.MeshBasicMaterial).opacity =
						opacity * 0.3;
				}
			}
		}
	}
}
