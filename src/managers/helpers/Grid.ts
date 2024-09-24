// InfiniteGrid.ts
import * as THREE from "three";

export class Grid extends THREE.Object3D {
	private majorGrid: THREE.LineSegments;
	private minorGrid: THREE.LineSegments;
	private labels: THREE.Sprite[] = [];
	private camera: THREE.Camera;
	private majorStep: number;
	private minorStep: number;
	private gridSize: number;

	constructor(
		camera: THREE.Camera,
		gridSize: number = 1000,
		majorStep: number = 10,
		minorStep: number = 1,
		majorColor: number = 0x888888,
		minorColor: number = 0x444444
	) {
		super();
		this.camera = camera;
		this.gridSize = gridSize;
		this.majorStep = majorStep;
		this.minorStep = minorStep;

		// Create minor grid
		this.minorGrid = this.createGridLines(minorStep, minorColor, 1);
		this.add(this.minorGrid);

		// Create major grid
		this.majorGrid = this.createGridLines(majorStep, majorColor, 2);
		this.add(this.majorGrid);

		// Add labels for major grid lines
		this.addLabels();

		// Initial alignment
		this.updateGridPosition();
	}

	/**
	 * Creates grid lines using LineSegments.
	 * @param step The spacing between lines.
	 * @param color The color of the lines.
	 * @param lineWidth The width of the lines.
	 */
	private createGridLines(
		step: number,
		color: number,
		lineWidth: number
	): THREE.LineSegments {
		const material = new THREE.LineBasicMaterial({
			color: color,
			linewidth: lineWidth,
			transparent: true,
			opacity: step === this.majorStep ? 1.0 : 0.5,
		});

		const vertices: number[] = [];

		// Vertical lines
		for (let i = -this.gridSize; i <= this.gridSize; i += step) {
			vertices.push(i, 0, -this.gridSize);
			vertices.push(i, 0, this.gridSize);
		}

		// Horizontal lines
		for (let i = -this.gridSize; i <= this.gridSize; i += step) {
			vertices.push(-this.gridSize, 0, i);
			vertices.push(this.gridSize, 0, i);
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(vertices, 3)
		);

		return new THREE.LineSegments(geometry, material);
	}

	/**
	 * Adds labels at major grid intersections.
	 */
	private addLabels() {
		const step = this.majorStep;
		const halfSize = this.gridSize;
		const labelColor = 0xffffff;

		for (let i = -halfSize; i <= halfSize; i += step) {
			if (i === 0) continue; // Skip the origin

			// X-axis labels (positive and negative)
			this.addLabel(
				i.toString(),
				new THREE.Vector3(i, 0.02, -halfSize),
				labelColor
			);
			this.addLabel(
				i.toString(),
				new THREE.Vector3(i, 0.02, halfSize),
				labelColor
			);

			// Z-axis labels (positive and negative)
			this.addLabel(
				i.toString(),
				new THREE.Vector3(-halfSize, 0.02, i),
				labelColor
			);
			this.addLabel(
				i.toString(),
				new THREE.Vector3(halfSize, 0.02, i),
				labelColor
			);
		}
	}

	/**
	 * Creates and adds a label sprite to the grid.
	 * @param text The text to display.
	 * @param position The position of the label.
	 * @param color The color of the text.
	 */
	private addLabel(text: string, position: THREE.Vector3, color: number) {
		const fontSize = 64;
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");

		if (context) {
			// Set canvas size
			canvas.width = 256;
			canvas.height = 256;

			// Clear canvas
			context.clearRect(0, 0, canvas.width, canvas.height);

			// Set font properties
			context.font = `${fontSize}px Arial`;
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
			sprite.scale.set(2, 2, 1); // Adjust scale as needed

			// Assign renderOrder to ensure labels are rendered above the grid
			sprite.renderOrder = 1;

			this.add(sprite);
			this.labels.push(sprite);
		}
	}

	/**
	 * Updates the grid position to follow the camera, creating an infinite effect.
	 */
	private updateGridPosition() {
		const camPos = this.camera.position;
		this.position.set(
			Math.floor(camPos.x / this.majorStep) * this.majorStep,
			0,
			Math.floor(camPos.z / this.majorStep) * this.majorStep
		);
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
	 * Call this method in your animation loop to keep the grid updated.
	 */
	public update() {
		this.updateGridPosition();
		this.updateLabels();
	}

	/**
	 * Sets the visibility of the grid and labels.
	 * @param visible Whether the grid should be visible.
	 */
	public setVisible(visible: boolean) {
		this.majorGrid.visible = visible;
		this.minorGrid.visible = visible;
		this.labels.forEach((label) => (label.visible = visible));
	}
}
