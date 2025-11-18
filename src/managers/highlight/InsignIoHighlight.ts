// managers/highlight/InsignIoHighlight.ts
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Highlight } from './Highlight';
import { SchematicRenderer } from '../../SchematicRenderer';
import { DslEntry } from '../../types/insign';

export type BoxPair = [[number, number, number], [number, number, number]];

export interface InsignIoStyle {
	color: THREE.Color | number;
	opacity: number;
	filled: boolean;
	visible: boolean;
	showLabel: boolean;
	showEdges: boolean;
	edgeThickness: number;
	showBitNumbers: boolean; // Show bit indices for each position
	showDataType: boolean; // Show data type in label
	showPositionCount: boolean; // Show number of positions
	highlightFirstBit: boolean; // Highlight bit 0 differently
}

export interface InsignIoOptions {
	regionId: string;
	entry: DslEntry;
	positions: Array<[number, number, number]>; // Sorted positions from Insign IO parsing
	dataType: string; // e.g., "unsigned", "signed:8", "bool"
	ioDirection: 'input' | 'output';
	style?: Partial<InsignIoStyle>;
}

const DEFAULT_INPUT_STYLE: InsignIoStyle = {
	color: 0x4499ff, // Blue for inputs
	opacity: 0.2,
	filled: true,
	visible: true,
	showLabel: true,
	showEdges: true,
	edgeThickness: 0.05,
	showBitNumbers: true,
	showDataType: true,
	showPositionCount: true,
	highlightFirstBit: true,
};

const DEFAULT_OUTPUT_STYLE: InsignIoStyle = {
	color: 0xff4466, // Red for outputs
	opacity: 0.2,
	filled: true,
	visible: true,
	showLabel: true,
	showEdges: true,
	edgeThickness: 0.05,
	showBitNumbers: true,
	showDataType: true,
	showPositionCount: true,
	highlightFirstBit: true,
};

/**
 * Specialized highlight for Insign IO regions with enhanced visualization
 * Shows individual bit positions, data types, and direction
 */
export class InsignIoHighlight implements Highlight {
	private renderer: SchematicRenderer;
	private regionId: string;
	private positions: Array<[number, number, number]>;
	private dataType: string;
	private ioDirection: 'input' | 'output';
	private style: InsignIoStyle;
	private meshes: THREE.Object3D[] = [];
	private labels: CSS2DObject[] = [];
	private bitLabels: CSS2DObject[] = [];
	private isActive: boolean = false;

	constructor(renderer: SchematicRenderer, options: InsignIoOptions) {
		this.renderer = renderer;
		this.regionId = options.regionId;
		// options.entry is available but not stored as we don't need it
		this.positions = options.positions;
		this.dataType = options.dataType;
		this.ioDirection = options.ioDirection;

		const defaultStyle = options.ioDirection === 'input' ? DEFAULT_INPUT_STYLE : DEFAULT_OUTPUT_STYLE;
		this.style = { ...defaultStyle, ...options.style };
	}

	getName(): string {
		return `insign_io_${this.regionId}`;
	}

	/**
	 * Activate the highlight - create and add meshes to the scene
	 */
	activate(): void {
		if (this.isActive) return;
		this.isActive = true;

		if (this.positions.length === 0) {
			console.warn(`[InsignIoHighlight] No positions for IO region: ${this.regionId}`);
			return;
		}

		// Create individual block highlights for each position
		this.positions.forEach((pos, index) => {
			const isFirstBit = index === 0 && this.style.highlightFirstBit;
			const mesh = this.createBlockHighlight(pos, index, isFirstBit);
			if (mesh) {
				this.meshes.push(mesh);
				this.renderer.sceneManager.scene.add(mesh);

				// Create bit number label if enabled
				if (this.style.showBitNumbers) {
					const bitLabel = this.createBitLabel(pos, index);
					if (bitLabel) {
						this.bitLabels.push(bitLabel);
						this.renderer.sceneManager.scene.add(bitLabel);
					}
				}
			}
		});

		// Create main label for the entire IO region
		if (this.style.showLabel) {
			const centerPos = this.calculateCenterPosition();
			const label = this.createMainLabel(centerPos);
			if (label) {
				this.labels.push(label);
				this.renderer.sceneManager.scene.add(label);
			}
		}

		console.log(
			`[InsignIoHighlight] Activated ${this.ioDirection} '${this.regionId}' with ${this.positions.length} positions`
		);
	}

	/**
	 * Deactivate the highlight - remove and dispose all meshes
	 */
	deactivate(): void {
		if (!this.isActive) return;
		this.isActive = false;

		// Remove and dispose meshes
		this.meshes.forEach((mesh) => {
			this.renderer.sceneManager.scene.remove(mesh);
			if (mesh instanceof THREE.Mesh) {
				mesh.geometry.dispose();
				if (Array.isArray(mesh.material)) {
					mesh.material.forEach((mat) => mat.dispose());
				} else {
					mesh.material.dispose();
				}
			}
		});
		this.meshes = [];

		// Remove labels
		this.labels.forEach((label) => {
			this.renderer.sceneManager.scene.remove(label);
			label.element.remove();
		});
		this.labels = [];

		// Remove bit labels
		this.bitLabels.forEach((label) => {
			this.renderer.sceneManager.scene.remove(label);
			label.element.remove();
		});
		this.bitLabels = [];
	}

	/**
	 * Update the highlight (called each frame)
	 */
	update(_deltaTime: number): void {
		// Could add animations here (pulsing, etc.)
	}

	/**
	 * Update the style of the highlight
	 */
	updateStyle(newStyle: Partial<InsignIoStyle>): void {
		this.style = { ...this.style, ...newStyle };

		// Recreate meshes with new style
		this.deactivate();
		this.activate();
	}

	/**
	 * Create a highlight mesh for a single block position
	 */
	private createBlockHighlight(
		pos: [number, number, number],
		_bitIndex: number,
		isFirstBit: boolean
	): THREE.Object3D | null {
		const [x, y, z] = pos;

		// Get schematic offset (same as CustomIoHighlight)
		const schematics = this.renderer.schematicManager?.getAllSchematics();
		let schematicOffset = new THREE.Vector3(0, 0, 0);
		
		if (schematics && schematics.length > 0) {
			const firstSchematic = schematics[0];
			schematicOffset.copy(firstSchematic.position);
		}

		// Create a group to hold both the filled box and edges
		const group = new THREE.Group();
		// Position at block coordinates + schematic offset (no +0.5 needed)
		group.position.set(x + schematicOffset.x, y + schematicOffset.y, z + schematicOffset.z);

		const color = new THREE.Color(this.style.color as number);

		// Create filled box if enabled
		if (this.style.filled) {
			const geometry = new THREE.BoxGeometry(1, 1, 1);
			const material = new THREE.MeshBasicMaterial({
				color: isFirstBit ? color.clone().multiplyScalar(1.3) : color,
				transparent: true,
				opacity: isFirstBit ? this.style.opacity * 1.5 : this.style.opacity,
				side: THREE.DoubleSide,
				depthWrite: false,
			});

			const mesh = new THREE.Mesh(geometry, material);
			mesh.renderOrder = 1000; // Render after normal blocks
			group.add(mesh);
		}

		// Create edge outline if enabled
		if (this.style.showEdges) {
			const edgeGroup = this.createThickEdges(color, isFirstBit);
			group.add(edgeGroup);
		}

		return group;
	}

	/**
	 * Create thick edges around a block
	 */
	private createThickEdges(color: THREE.Color, isFirstBit: boolean): THREE.Group {
		const group = new THREE.Group();
		const thickness = isFirstBit ? this.style.edgeThickness * 1.5 : this.style.edgeThickness;

		// Define the 12 edges of a cube
		const edges = [
			// Bottom face
			[
				[-0.5, -0.5, -0.5],
				[0.5, -0.5, -0.5],
			],
			[
				[0.5, -0.5, -0.5],
				[0.5, -0.5, 0.5],
			],
			[
				[0.5, -0.5, 0.5],
				[-0.5, -0.5, 0.5],
			],
			[
				[-0.5, -0.5, 0.5],
				[-0.5, -0.5, -0.5],
			],
			// Top face
			[
				[-0.5, 0.5, -0.5],
				[0.5, 0.5, -0.5],
			],
			[
				[0.5, 0.5, -0.5],
				[0.5, 0.5, 0.5],
			],
			[
				[0.5, 0.5, 0.5],
				[-0.5, 0.5, 0.5],
			],
			[
				[-0.5, 0.5, 0.5],
				[-0.5, 0.5, -0.5],
			],
			// Vertical edges
			[
				[-0.5, -0.5, -0.5],
				[-0.5, 0.5, -0.5],
			],
			[
				[0.5, -0.5, -0.5],
				[0.5, 0.5, -0.5],
			],
			[
				[0.5, -0.5, 0.5],
				[0.5, 0.5, 0.5],
			],
			[
				[-0.5, -0.5, 0.5],
				[-0.5, 0.5, 0.5],
			],
		];

		const material = new THREE.MeshBasicMaterial({
			color: isFirstBit ? color.clone().multiplyScalar(1.3) : color,
			transparent: false,
			depthWrite: false,
		});

		edges.forEach(([start, end]) => {
			const geometry = new THREE.CylinderGeometry(thickness, thickness, 1, 8);
			const mesh = new THREE.Mesh(geometry, material);

			// Position and orient the cylinder along the edge
			const startVec = new THREE.Vector3(start[0], start[1], start[2]);
			const endVec = new THREE.Vector3(end[0], end[1], end[2]);
			const direction = endVec.clone().sub(startVec);
			const length = direction.length();

			mesh.scale.y = length;
			mesh.position.copy(startVec.clone().add(direction.clone().multiplyScalar(0.5)));

			// Orient cylinder along edge
			mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());

			mesh.renderOrder = 1001;
			group.add(mesh);
		});

		return group;
	}

	/**
	 * Create a bit number label for a position
	 */
	private createBitLabel(pos: [number, number, number], bitIndex: number): CSS2DObject | null {
		const [x, y, z] = pos;

		// Get schematic offset
		const schematics = this.renderer.schematicManager?.getAllSchematics();
		let schematicOffset = new THREE.Vector3(0, 0, 0);
		
		if (schematics && schematics.length > 0) {
			const firstSchematic = schematics[0];
			schematicOffset.copy(firstSchematic.position);
		}

		const div = document.createElement('div');
		div.className = 'insign-io-bit-label';
		div.textContent = `${bitIndex}`;
		div.style.cssText = `
			color: white;
			background: rgba(0, 0, 0, 0.7);
			padding: 2px 6px;
			border-radius: 3px;
			font-size: 11px;
			font-weight: bold;
			font-family: monospace;
			pointer-events: none;
			user-select: none;
		`;

		const label = new CSS2DObject(div);
		// Position above the block with schematic offset
		label.position.set(x + schematicOffset.x, y + schematicOffset.y + 1.2, z + schematicOffset.z);
		return label;
	}

	/**
	 * Create the main label for the IO region
	 */
	private createMainLabel(position: THREE.Vector3): CSS2DObject | null {
		const div = document.createElement('div');
		div.className = 'insign-io-main-label';

		// Build label text
		let labelText = this.regionId;
		if (this.style.showDataType) {
			labelText += ` (${this.dataType})`;
		}
		if (this.style.showPositionCount) {
			labelText += ` [${this.positions.length} bits]`;
		}

		div.textContent = labelText;

		const bgColor = this.ioDirection === 'input' ? 'rgba(68, 153, 255, 0.9)' : 'rgba(255, 68, 102, 0.9)';

		div.style.cssText = `
			color: white;
			background: ${bgColor};
			padding: 4px 10px;
			border-radius: 4px;
			font-size: 13px;
			font-weight: bold;
			font-family: sans-serif;
			pointer-events: none;
			user-select: none;
			box-shadow: 0 2px 4px rgba(0,0,0,0.3);
		`;

		const label = new CSS2DObject(div);
		label.position.copy(position);
		label.position.y += 2; // Above the region
		return label;
	}

	/**
	 * Calculate the center position of all IO positions
	 */
	private calculateCenterPosition(): THREE.Vector3 {
		if (this.positions.length === 0) {
			return new THREE.Vector3(0, 0, 0);
		}

		const sum = this.positions.reduce(
			(acc, pos) => {
				acc.x += pos[0];
				acc.y += pos[1];
				acc.z += pos[2];
				return acc;
			},
			{ x: 0, y: 0, z: 0 }
		);

		return new THREE.Vector3(
			sum.x / this.positions.length + 0.5,
			sum.y / this.positions.length + 0.5,
			sum.z / this.positions.length + 0.5
		);
	}

	/**
	 * Get the IO direction
	 */
	public getDirection(): 'input' | 'output' {
		return this.ioDirection;
	}

	/**
	 * Get the data type
	 */
	public getDataType(): string {
		return this.dataType;
	}

	/**
	 * Get the number of positions (bits)
	 */
	public getPositionCount(): number {
		return this.positions.length;
	}

	/**
	 * Get all positions
	 */
	public getPositions(): Array<[number, number, number]> {
		return [...this.positions];
	}
}

