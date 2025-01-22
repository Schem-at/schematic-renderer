// AnnotationHighlight.ts
import * as THREE from "three";
import { Highlight } from "../highlight/Highlight";

import { SchematicRenderer } from "../../SchematicRenderer";

export class AnnotationHighlight implements Highlight {
	private schematicRenderer: SchematicRenderer;
	private annotations: {
		[key: string]: { mesh: THREE.Mesh; label: THREE.Sprite };
	} = {};
	private annotationInput: HTMLDivElement;
	// @ts-ignore
	private raycaster: THREE.Raycaster;
	// @ts-ignore
	private mouse: THREE.Vector2;
	// @ts-ignore
	private hoverPosition: THREE.Vector3 | null = null;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;

		this.schematicRenderer.eventEmitter.on(
			"addAnnotation",
			this.onAddAnnotation
		);
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
		this.schematicRenderer.eventEmitter.off(
			"addAnnotation",
			this.onAddAnnotation
		);
	}

	// @ts-ignore
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
		if(!this.schematicRenderer.renderManager) return;
		// Convert world position to screen coordinates
		const screenPosition = position
			.clone()
			.project(this.schematicRenderer.cameraManager.activeCamera.camera);
		const x =
			(screenPosition.x * 0.5 + 0.5) *
			this.schematicRenderer.renderManager.getRenderer().domElement.clientWidth;
		const y =
			(-screenPosition.y * 0.5 + 0.5) *
			this.schematicRenderer.renderManager.getRenderer().domElement
				.clientHeight;

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
		this.schematicRenderer.sceneManager.scene.add(highlightCube);
		this.schematicRenderer.sceneManager.scene.add(sprite);
		this.annotations[key] = { mesh: highlightCube, label: sprite };
	}

	private removeAnnotation(position: THREE.Vector3) {
		const key = `${position.x},${position.y},${position.z}`;
		if (this.annotations[key]) {
			this.schematicRenderer.sceneManager.scene.remove(
				this.annotations[key].mesh
			);
			this.schematicRenderer.sceneManager.scene.remove(
				this.annotations[key].label
			);
			delete this.annotations[key];
		}
	}

	private clearAllAnnotations() {
		for (const key in this.annotations) {
			this.schematicRenderer.sceneManager.scene.remove(
				this.annotations[key].mesh
			);
			this.schematicRenderer.sceneManager.scene.remove(
				this.annotations[key].label
			);
		}
		this.annotations = {};
	}

	private updateAnnotationVisibility() {
		const cameraPosition =
			this.schematicRenderer.cameraManager.activeCamera.position as THREE.Vector3;
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
