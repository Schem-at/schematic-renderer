import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { Line2 } from "three/addons/lines/Line2.js";

export class Grid extends THREE.Object3D {
    private majorGrid: Line2[];
    private minorGrid: Line2[];
	private majorStep: number;
	private gridSize: number;
	private fadeDistance: number;

	private getLine(
		start: THREE.Vector3,
		end: THREE.Vector3,
		color: number = 0xffffff,
		lineWidth: number = 1,
		resolution: THREE.Vector2 = new THREE.Vector2(
			window.innerWidth,
			window.innerHeight
		)
	): Line2 {
		// Create the geometry
		const geometry = new LineGeometry();
		geometry.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);

		// Create the material
		const material = new LineMaterial({
			color: color,
			linewidth: lineWidth * 0.001, // Convert to world units (millimeters)
			worldUnits: true,
			resolution: resolution,
			alphaToCoverage: true,
			dashed: false,
		});

		// Create and return the line
		return new Line2(geometry, material);
	}

    constructor(
        // @ts-ignore
		camera: THREE.Camera,
		gridSize: number = 1000,
		majorStep: number = 8,
		minorStep: number = 1,
		majorColor: number = 0xAAAAAA,
		minorColor: number = 0x666666,
		fadeDistance: number = 100 // Distance at which grid starts fading
	) {
		super();
		this.gridSize = gridSize;
		this.majorStep = majorStep;
		this.fadeDistance = fadeDistance;

		// Create minor grid with custom shader material
		this.minorGrid = this.getGridLines(minorStep, minorColor, 15, true);
		this.minorGrid.forEach(element => {
            this.add(element);
        });

		// Create major grid with custom shader material
		this.majorGrid = this.getGridLines(majorStep, majorColor, 30, true);
        this.majorGrid.forEach(element => {
            this.add(element);
        });

		//add two lines one for x (red) and one for z (blue)
		const xLine = this.getLine(
			new THREE.Vector3(-gridSize, 0, 0),
			new THREE.Vector3(gridSize, 0, 0),
			0xff0000,
			40
		);

		const zLine = this.getLine(
			new THREE.Vector3(0, 0, -gridSize),
			new THREE.Vector3(0, 0, gridSize),
			0x0000ff,
			40
		);

		this.add(xLine);
		this.add(zLine);

		// Add labels for major grid lines
		this.addLabels();
	}



    // private createGridLines(
    //     step: number,
    //     color: number,
	// 	lineWidth: number,
	// 	ignoreZero: boolean = false
    // ): THREE.LineSegments {
    //     // Create custom shader material for distance-based opacity
    //     const material = new THREE.ShaderMaterial({
    //         uniforms: {
    //             color: { value: new THREE.Color(color) },
    //             opacity: { value: step === this.majorStep ? 1.0 : 0.5 },
    //             cameraNear: { value: this.camera.near },
    //             cameraFar: { value: this.camera.far },
    //             fadeDistance: { value: this.fadeDistance }
    //         },
    //         vertexShader: `
    //             varying vec3 vPosition;
    //             void main() {
    //                 vPosition = position;
    //                 gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    //             }
    //         `,
    //         fragmentShader: `
    //             uniform vec3 color;
    //             uniform float opacity;
    //             uniform float cameraNear;
    //             uniform float cameraFar;
    //             uniform float fadeDistance;
    //             varying vec3 vPosition;

    //             void main() {
    //                 float dist = length(vPosition);
    //                 float fadeStart = fadeDistance * 0.5;
    //                 float fadeEnd = fadeDistance;
                    
    //                 // Calculate fade factor
    //                 float fadeFactor = 1.0 - smoothstep(fadeStart, fadeEnd, dist);
                    
    //                 // Add subtle pulse effect based on distance
    //                 float pulse = sin(dist * 0.05) * 0.1 + 0.9;
                    
    //                 gl_FragColor = vec4(color, opacity * fadeFactor * pulse);
    //             }
    //         `,
    //         transparent: true,
    //         side: THREE.DoubleSide
    //     });

    //     const vertices: number[] = [];

    //     // Create grid with varying density
    //     for (let i = 0; i <= this.gridSize; i += step) {
	// 		if (ignoreZero && i === 0) continue; // Skip origin
            
    //         vertices.push(i, 0, -this.gridSize);
    //         vertices.push(i, 0, this.gridSize);
    //         vertices.push(-this.gridSize, 0, i);
	// 		vertices.push(this.gridSize, 0, i);
			
	// 		vertices.push(-i, 0, -this.gridSize);
    //         vertices.push(-i, 0, this.gridSize);
    //         vertices.push(-this.gridSize, 0, -i);
    //         vertices.push(this.gridSize, 0, -i);
    //     }

    //     const geometry = new THREE.BufferGeometry();
    //     geometry.setAttribute(
    //         "position",
    //         new THREE.Float32BufferAttribute(vertices, 3)
    //     );

    //     return new THREE.LineSegments(geometry, material);
    // }

	private getGridLines(
		step: number,
		color: number,
		lineWidth: number,
		ignoreZero: boolean = false
	): Line2[]{
		const lines: Line2[] = [];
		for (let i = 0; i <= this.gridSize; i += step) {
			if (ignoreZero && i === 0) continue;

			lines.push(
				this.getLine(
					new THREE.Vector3(i, 0, -this.gridSize),
					new THREE.Vector3(i, 0, this.gridSize),
					color,
					lineWidth
				)
            );

            lines.push(
				this.getLine(
					new THREE.Vector3(-i, 0, -this.gridSize),
					new THREE.Vector3(-i, 0, this.gridSize),
					color,
					lineWidth
				)
            );
            
            lines.push(
                this.getLine(
                    new THREE.Vector3(-this.gridSize, 0, i),
                    new THREE.Vector3(this.gridSize, 0, i),
					color,
					lineWidth
				)
            );
            lines.push(
                this.getLine(
                    new THREE.Vector3(-this.gridSize, 0, -i),
                    new THREE.Vector3(this.gridSize, 0, -i),
					color,
					lineWidth
				)
			);
		}
		return lines
	}

	/**
	 * Adds labels at major grid intersections.
	 */
	private addLabels() {
		const step = this.majorStep;
		const labelColor = 0xcccccc; // Softer white color

		for (let i = 0; i <= this.fadeDistance; i += step) {
			for (let j = 0; j <= this.fadeDistance; j += step) {
				// if (i === 0) continue; // Skip origin

				// Create labels only at the edges of the visible grid
				this.addLabel(
					i.toString() + "," + j.toString(),
					new THREE.Vector3(i, 0, j), // Directly on the grid
					labelColor,
					false // Not an axis label
				);

				this.addLabel(
					-i.toString() + "," + j.toString(),
					new THREE.Vector3(-i, 0, j), // Directly on the grid
					labelColor,
					false // Not an axis label
				);

				this.addLabel(
					i.toString() + "," + -j.toString(),
					new THREE.Vector3(i, 0, -j), // Directly on the grid
					labelColor,
					false // Not an axis label
				);

				this.addLabel(
					-i.toString() + "," + -j.toString(),
					new THREE.Vector3(-i, 0, -j), // Directly on the grid
					labelColor,
					false // Not an axis label
				);
			}
		}

		// // Add minimal axis indicators
		// const axisOffset = step / 2;
		// this.addLabel("X", new THREE.Vector3(axisOffset, 0, 0), 0xff3333, true);
		// this.addLabel("Z", new THREE.Vector3(0, 0, axisOffset), 0x3333ff, true);
	}

	/**
	 * Creates and adds a label sprite to the grid.
	 * @param text The text to display.
	 * @param position The position of the label.
	 * @param color The color of the text.
	 */
	private addLabel(
		text: string,
		position: THREE.Vector3,
		color: number,
		isAxisLabel: boolean
	) {
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");

		if (context) {
			// Set canvas size - make it rectangular for better ground projection
			canvas.width = 256;
			canvas.height = 64;

			// Clear canvas
			context.clearRect(0, 0, canvas.width, canvas.height);

			const fadeFactor =
				1.0 - Math.min(1.0, Math.abs(position.x) / this.fadeDistance);
			// Modern font styling
			const fontSize = isAxisLabel ? 40 : 32;
			context.font = `${fontSize}px Inter, -apple-system, system-ui, sans-serif`;
			context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
			context.textAlign = "center";
			context.textBaseline = "middle";
			context.globalAlpha = fadeFactor;

			// Draw text
			context.fillText(text, canvas.width / 2, canvas.height / 2);

			// Create texture
			const texture = new THREE.CanvasTexture(canvas);
			texture.minFilter = THREE.LinearFilter;
			texture.magFilter = THREE.LinearFilter;

			// Create a plane geometry instead of using a sprite
			const aspectRatio = canvas.width / canvas.height;
			const labelGeometry = new THREE.PlaneGeometry(2 * aspectRatio, 2);
			const labelMaterial = new THREE.MeshBasicMaterial({
				map: texture,
				transparent: true,
				opacity: isAxisLabel ? 0.9 : 0.7,
				side: THREE.DoubleSide,
				depthWrite: false,
			});

			const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);

			// Position slightly above the grid to prevent z-fighting
			position.y = 0.01;
			labelMesh.position.copy(position);

			// Rotate to lie flat on the ground
			labelMesh.rotation.x = -Math.PI / 2;

			// Scale the label
			const scale = isAxisLabel ? 0.7 : 0.5;
			labelMesh.scale.set(scale, scale, scale);

			// Ensure labels render above grid
			labelMesh.renderOrder = isAxisLabel ? 2 : 1;

			this.add(labelMesh);
		}
	}

	public update() {
		
	}

}
