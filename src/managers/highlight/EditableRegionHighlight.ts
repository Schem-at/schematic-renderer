import * as THREE from "three";
import { Highlight } from "./Highlight";
import { SchematicRenderer } from "../../SchematicRenderer";
import { SelectableObject } from "../SelectableObject";

export interface EditableRegionOptions {
	name: string;
	min: { x: number; y: number; z: number };
	max: { x: number; y: number; z: number };
	color?: number;
	opacity?: number;
}

export class EditableRegionHighlight implements Highlight, SelectableObject {
	private renderer: SchematicRenderer;
	public name: string;
	public id: string;
	public group: THREE.Group;

	private min: THREE.Vector3;
	private max: THREE.Vector3;

	// Visual components
	private mesh: THREE.Mesh;
	private wireframe: THREE.LineSegments;
	private handles: Map<string, THREE.Mesh> = new Map();

	private isActive: boolean = false;
	private color: number;
	private opacity: number;

	private schematicId?: string;

	constructor(renderer: SchematicRenderer, options: EditableRegionOptions & { schematicId?: string }) {
		this.renderer = renderer;
		this.name = options.name;
		this.id = `region_${options.name}`;
		this.schematicId = options.schematicId;
		this.min = new THREE.Vector3(options.min.x, options.min.y, options.min.z);
		this.max = new THREE.Vector3(options.max.x, options.max.y, options.max.z);
		this.color = options.color || 0xffff00;
		this.opacity = options.opacity || 0.3;

		this.group = new THREE.Group();
		this.group.name = this.id;

		// Parent to schematic if provided
		if (this.schematicId) {
			const schematic = this.renderer.schematicManager?.getSchematic(this.schematicId);
			if (schematic) {
				schematic.group.add(this.group);
			} else {
				console.warn(`Schematic ${this.schematicId} not found, falling back to scene parenting.`);
				this.renderer.sceneManager.scene.add(this.group);
			}
		} else {
			this.renderer.sceneManager.scene.add(this.group);
		}

		// 1. Transparent box mesh
		const geometry = new THREE.BoxGeometry(1, 1, 1);
		const material = new THREE.MeshBasicMaterial({
			color: this.color,
			opacity: this.opacity,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide
		});
		this.mesh = new THREE.Mesh(geometry, material);
		this.group.add(this.mesh);

		// 2. Wireframe helper for better visibility
		const edges = new THREE.EdgesGeometry(geometry);
		const lineMaterial = new THREE.LineBasicMaterial({
			color: this.color,
			linewidth: 2
		});
		this.wireframe = new THREE.LineSegments(edges, lineMaterial);
		this.group.add(this.wireframe);

		// 3. Create handles for each face
		this.createFaceHandles();

		// Default to hidden handles (not in edit mode)
		this.setEditMode(false);

		this.updateMeshTransform();
	}

	private createFaceHandles() {
		const handleGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
		const handleMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });

		const faces = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'];

		for (const face of faces) {
			const handle = new THREE.Mesh(handleGeometry, handleMaterial.clone());
			handle.name = `${this.id}_handle_${face}`;
			// Add user data to identify handle and axis
			handle.userData = {
				isHandle: true,
				regionName: this.name,
				face: face
			};
			this.group.add(handle);
			this.handles.set(face, handle);
		}
	}

	public getName(): string {
		return this.name;
	}

	public activate(): void {
		if (this.isActive) return;
		this.isActive = true;
		this.group.visible = true;
	}

	public deactivate(): void {
		if (!this.isActive) return;
		this.isActive = false;
		this.group.visible = false;
	}

	// Toggle edit mode (show/hide handles)
	public setEditMode(enabled: boolean): void {
		this.handles.forEach(handle => {
			handle.visible = enabled;
		});

		// If disabled, also hide the wireframe potentially? 
		// Or keep wireframe for visibility but disable handles
		this.wireframe.visible = true; // Always keep wireframe visible if region is active
	}

	public edit(): void {
		this.renderer.regionManager?.editRegion(this.name);
	}

	public remove(): boolean {
		return this.renderer.regionManager?.removeRegion(this.name) || false;
	}

	public updateLook(options: { color?: number; opacity?: number }): void {
		this.renderer.regionManager?.updateRegionLook(this.name, options);
	}

	public update(_deltaTime: number): void {
		// Could handle animations here
	}

	private updateMeshTransform(): void {
		// Calculate size and center in local coordinates
		// min and max are inclusive integer block coordinates
		// Example: min=0, max=0 -> size=1, center=0
		const size = new THREE.Vector3().subVectors(this.max, this.min).addScalar(1);
		const center = new THREE.Vector3().addVectors(this.min, this.max).multiplyScalar(0.5);

		if (this.schematicId) {
			// If parented to schematic, we are in local space.
			// Block 0,0,0 in schematic corresponds to local 0,0,0 if centered blocks.
			this.group.position.copy(center);
		} else {
			// If in world space, we need to apply schematic offset manually
			const schematics = this.renderer.schematicManager?.getAllSchematics();
			let schematicOffset = new THREE.Vector3(0, 0, 0);
			if (schematics && schematics.length > 0) {
				schematicOffset.copy(schematics[0].position);
			}
			this.group.position.copy(center).add(schematicOffset);
		}

		this.group.scale.copy(size);
		this.group.rotation.set(0, 0, 0);

		// Update handle positions relative to the scaled box
		// Note: The group is scaled, so local coordinates are relative to size 1,1,1
		// Center is 0,0,0. Extents are +/- 0.5

		if (this.handles.size > 0) {
			// Because the parent group is scaled, we need to counter-scale handles to keep them constant size
			const invScale = new THREE.Vector3(1 / size.x, 1 / size.y, 1 / size.z);
			const handleScale = invScale.clone().multiplyScalar(0.8); // Fixed visual size

			// X faces
			this.handles.get('minX')!.position.set(-0.5, 0, 0);
			this.handles.get('maxX')!.position.set(0.5, 0, 0);

			// Y faces
			this.handles.get('minY')!.position.set(0, -0.5, 0);
			this.handles.get('maxY')!.position.set(0, 0.5, 0);

			// Z faces
			this.handles.get('minZ')!.position.set(0, 0, -0.5);
			this.handles.get('maxZ')!.position.set(0, 0, 0.5);

			// Apply scale to keep handles uniform size visually
			this.handles.forEach(handle => {
				handle.scale.copy(handleScale);
			});
		}
	}

	public updateBoundsFromTransform(): void {
		const position = this.group.position.clone();
		const scale = this.group.scale.clone();

		if (!this.schematicId) {
			const schematics = this.renderer.schematicManager?.getAllSchematics();
			if (schematics && schematics.length > 0) {
				position.sub(schematics[0].position);
			}
		}

		const halfSize = scale.clone().multiplyScalar(0.5);
		// Center = min + halfSize => min = Center - halfSize
		// But Center was (min + max)/2 + 0.5
		// We need to reverse: center = (min+max)/2 + 0.5
		// min = center - 0.5 - (max-min)/2
		// size = max - min + 1

		// Simpler: min = position - scale/2 - 0.5 ? No.
		// Let's trace forward:
		// pos = (min+max)/2
		// scale = max-min+1
		// max = min + scale - 1
		// pos = (min + min + scale - 1)/2 = min + scale/2 - 0.5
		// So: min = pos - scale/2 + 0.5

		const min = position.clone().sub(halfSize).addScalar(0.5);

		this.min.set(Math.floor(min.x), Math.floor(min.y), Math.floor(min.z));
		this.max.copy(this.min).add(scale).subScalar(1).round();

		this.min.min(this.max);
		this.max.max(this.min);

		this.updateMeshTransform();
	}

	// SelectableObject implementation
	public get position(): THREE.Vector3 { return this.group.position; }
	public get rotation(): THREE.Euler { return this.group.rotation; }
	public get scale(): THREE.Vector3 { return this.group.scale; }

	public setPosition(position: THREE.Vector3): void {
		this.group.position.copy(position);
		this.updateBoundsFromTransform();
	}
	public setRotation(rotation: THREE.Euler): void {
		this.group.rotation.copy(rotation);
		this.updateBoundsFromTransform();
	}
	public setScale(scale: THREE.Vector3): void {
		this.group.scale.copy(scale);
		this.updateBoundsFromTransform();
	}
	public getWorldPosition(): THREE.Vector3 {
		return this.group.getWorldPosition(new THREE.Vector3());
	}

	public getBounds(): { min: THREE.Vector3, max: THREE.Vector3 } {
		return { min: this.min.clone(), max: this.max.clone() };
	}

	public setBounds(min: THREE.Vector3, max: THREE.Vector3): void {
		this.min.copy(min);
		this.max.copy(max);
		this.updateMeshTransform();
	}

	public setColor(color: number): void {
		this.color = color;
		if (this.mesh.material instanceof THREE.MeshBasicMaterial) {
			this.mesh.material.color.setHex(color);
		}
		if (this.wireframe.material instanceof THREE.LineBasicMaterial) {
			this.wireframe.material.color.setHex(color);
		}
	}

	public setOpacity(opacity: number): void {
		this.opacity = opacity;
		if (this.mesh.material instanceof THREE.MeshBasicMaterial) {
			this.mesh.material.opacity = opacity;
		}
	}

	public dispose(): void {
		this.deactivate();

		// Remove from parent
		if (this.group.parent) {
			this.group.parent.remove(this.group);
		}

		if (this.mesh) {
			this.mesh.geometry.dispose();
			(this.mesh.material as THREE.Material).dispose();
		}
		if (this.wireframe) {
			this.wireframe.geometry.dispose();
			(this.wireframe.material as THREE.Material).dispose();
		}
		this.handles.forEach(handle => {
			handle.geometry.dispose();
			(handle.material as THREE.Material).dispose();
		});
		this.handles.clear();
	}
}
