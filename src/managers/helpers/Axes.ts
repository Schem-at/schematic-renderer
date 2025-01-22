// Axes.ts
import * as THREE from "three";

export class Axes extends THREE.Object3D {
	private axes: THREE.AxesHelper;
	private labels: THREE.Sprite[] = [];
	private camera: THREE.Camera;

	constructor(size = 100, camera: THREE.Camera) {
		super();
		this.camera = camera;
		this.axes = new THREE.AxesHelper(size);

		// Slightly offset axes to prevent z-fighting with the grid
		this.axes.position.y = 0.02;
		this.axes.renderOrder = 2; // Ensure axes render above grid labels

		this.add(this.axes);
		this.addLabels(size);

		// Update labels to always face the camera
		this.updateLabels();
	}

	/**
	 * Adds labels for the X, Y, and Z axes.
	 * @param size The size of the axes.
	 */
	private addLabels(size: number) {
		this.addLabel("X", new THREE.Vector3(size + 1, 0.02, 0), 0xff0000);
		this.addLabel("Y", new THREE.Vector3(0, size + 1, 0), 0x00ff00);
		this.addLabel("Z", new THREE.Vector3(0, 0.02, size + 1), 0x0000ff);
	}

	/**
	 * Creates and adds a label sprite to the axes.
	 * @param text The text to display.
	 * @param position The position of the label.
	 * @param color The color of the text.
	 */
	private addLabel(text: string, position: THREE.Vector3, color: number) {
		const fontSize = 128;
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");

		if (context) {
			// Set canvas size
			canvas.width = 512;
			canvas.height = 512;

			// Clear canvas
			context.clearRect(0, 0, canvas.width, canvas.height);

			// Set font properties
			context.font = `Bold ${fontSize}px Arial`;
			context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
			context.textAlign = "center";
			context.textBaseline = "middle";

			// Draw text
			context.fillText(text, canvas.width / 2, canvas.height / 2);

			// Create texture and sprite
			const texture = new THREE.CanvasTexture(canvas);
			texture.minFilter = THREE.LinearFilter;
			const spriteMaterial = new THREE.SpriteMaterial({
				map: texture,
				transparent: true,
			});
			const sprite = new THREE.Sprite(spriteMaterial);
			sprite.position.copy(position);
			sprite.scale.set(3, 3, 1); // Adjust scale as needed

			// Assign renderOrder to ensure labels are rendered above the axes
			sprite.renderOrder = 3;

			this.add(sprite);
			this.labels.push(sprite);
		}
	}

	/**
	 * Ensures all labels face the camera.
	 */
	private updateLabels() {
		this.labels.forEach((label) => {
			label.quaternion.copy(this.camera.quaternion);
		});
	}

	/**
	 * Call this method in your animation loop to keep the labels updated.
	 */
	public update() {
		this.updateLabels();
	}

	/**
	 * Sets the visibility of the axes and labels.
	 * @param visible Whether the axes should be visible.
	 */
	public setVisible(visible: boolean) {
		this.axes.visible = visible;
		this.labels.forEach((label) => (label.visible = visible));
	}
}
