import * as THREE from "three";
import { Highlight } from "./Highlight";
import { SchematicRenderer } from "../../SchematicRenderer";
import { SelectableObject } from "../SelectableObject";
import { DefinitionRegionWrapper, BlockPosition, SchematicWrapper } from "../../nucleationExports";

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

	// 'baseRegion' stores the original, unfiltered selection (usually from bounds)
	private baseRegion: DefinitionRegionWrapper;
	// 'activeRegion' stores the potentially filtered region used for display and logic
	private activeRegion: DefinitionRegionWrapper;

	// Visual components
	private meshes: THREE.Mesh[] = [];
	private wireframes: THREE.LineSegments[] = [];
	private handles: Map<string, THREE.Mesh> = new Map();

	private isActive: boolean = false;
	private color: number;
	private opacity: number;

	private schematicId?: string;
	private filters: string[] = [];

	constructor(renderer: SchematicRenderer, options: EditableRegionOptions & { schematicId?: string }) {
		this.renderer = renderer;
		this.name = options.name;
		this.id = `region_${options.name}`;
		this.schematicId = options.schematicId;

		// Initialize the base region
		this.baseRegion = DefinitionRegionWrapper.fromBounds(
			new BlockPosition(options.min.x, options.min.y, options.min.z),
			new BlockPosition(options.max.x, options.max.y, options.max.z)
		);
		// Initialize active region as a copy of base
		this.activeRegion = this.baseRegion.copy();

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

		// Create handles for interaction
		this.createFaceHandles();

		// Default to hidden handles (not in edit mode)
		this.setEditMode(false);

		// Initial build
		this.rebuildVisuals();
	}

	private createFaceHandles() {
		const handleGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
		const handleMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });

		const faces = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'];

		for (const face of faces) {
			const handle = new THREE.Mesh(handleGeometry, handleMaterial.clone());
			handle.name = `${this.id}_handle_${face}`;
			handle.userData = {
				isHandle: true,
				regionName: this.name,
				face: face
			};
			this.group.add(handle);
			this.handles.set(face, handle);
		}
	}

	public getDefinitionRegion(): DefinitionRegionWrapper {
		return this.activeRegion;
	}

	/**
	 * Recomputes the active region from base region + filters
	 */
	private updateActiveRegion(): void {
		// Free old active region
		this.activeRegion.free();

		if (this.filters.length === 0) {
			this.activeRegion = this.baseRegion.copy();
		} else {
			// Need schematic for filtering
			let schematicWrapper: SchematicWrapper | undefined;

			if (this.schematicId) {
				const schematic = this.renderer.schematicManager?.getSchematic(this.schematicId);
				schematicWrapper = schematic?.schematicWrapper;
			}

			if (!schematicWrapper) {
				console.warn(`Cannot apply filters to region '${this.name}': No schematic associated.`);
				this.activeRegion = this.baseRegion.copy();
				return;
			}

			// Apply filters
			const copy = this.baseRegion.copy();
			let filteredRegion = copy.filterByBlock(schematicWrapper, this.filters[0]);

			for (let i = 1; i < this.filters.length; i++) {
				const nextFiltered = copy.filterByBlock(schematicWrapper, this.filters[i]);
				filteredRegion.unionInto(nextFiltered);
				nextFiltered.free();
			}

			copy.free();
			this.activeRegion = filteredRegion;
		}

		this.rebuildVisuals();
	}

	public rebuildVisuals(): void {
		// 1. Clean up existing meshes
		this.meshes.forEach(mesh => {
			this.group.remove(mesh);
			mesh.geometry.dispose();
			(mesh.material as THREE.Material).dispose();
		});
		this.meshes = [];

		this.wireframes.forEach(wireframe => {
			this.group.remove(wireframe);
			wireframe.geometry.dispose();
			(wireframe.material as THREE.Material).dispose();
		});
		this.wireframes = [];

		// 2. Calculate overall bounds and center
		// Use ACTIVE region for visuals
		const bounds = this.activeRegion.getBounds();
		if (!bounds) return; // Empty region

		const min = new THREE.Vector3(bounds.min[0], bounds.min[1], bounds.min[2]);
		const max = new THREE.Vector3(bounds.max[0], bounds.max[1], bounds.max[2]);

		// Center of the bounding box of the whole region
		const overallCenter = new THREE.Vector3()
			.addVectors(min, max)
			.multiplyScalar(0.5); // Block center logic: (min+max)/2

		// Position group at center
		if (this.schematicId) {
			this.group.position.copy(overallCenter);
		} else {
			const schematics = this.renderer.schematicManager?.getAllSchematics();
			if (schematics && schematics.length > 0) {
				const schematicPos = schematics[0].position;
				this.group.position.copy(overallCenter).add(schematicPos);
			} else {
				this.group.position.copy(overallCenter);
			}
		}

		this.group.rotation.set(0, 0, 0);
		this.group.scale.set(1, 1, 1);

		// 3. Create meshes for each box, relative to group center
		const boxes = this.activeRegion.getBoxes();
		const epsilon = 0.005;

		for (const box of boxes) {
			const bMin = new THREE.Vector3(box.min[0], box.min[1], box.min[2]);
			const bMax = new THREE.Vector3(box.max[0], box.max[1], box.max[2]);

			const width = bMax.x - bMin.x + 1;
			const height = bMax.y - bMin.y + 1;
			const depth = bMax.z - bMin.z + 1;

			// Center of this specific box
			const bCenter = new THREE.Vector3(
				bMin.x + width / 2 - 0.5,
				bMin.y + height / 2 - 0.5,
				bMin.z + depth / 2 - 0.5
			);

			// Position relative to group
			const localPos = bCenter.clone().sub(overallCenter);

			const geometry = new THREE.BoxGeometry(width + epsilon, height + epsilon, depth + epsilon);
			const material = new THREE.MeshBasicMaterial({
				color: this.color,
				opacity: this.opacity,
				transparent: true,
				depthWrite: false,
				side: THREE.DoubleSide
			});

			const mesh = new THREE.Mesh(geometry, material);
			mesh.position.copy(localPos);
			this.group.add(mesh);
			this.meshes.push(mesh);

			// Wireframe
			const edges = new THREE.EdgesGeometry(geometry);
			const lineMaterial = new THREE.LineBasicMaterial({
				color: this.color,
				linewidth: 2
			});
			const wireframe = new THREE.LineSegments(edges, lineMaterial);
			wireframe.position.copy(localPos);
			this.group.add(wireframe);
			this.wireframes.push(wireframe);
		}

		// 4. Update handles (relative to group center)
		// NOTE: Handles normally control the BASE region.
		// If filtered, the bounds might be smaller/disjoint.
		// For now, let's position handles based on the VISIBLE bounds (active region).
		// This might be confusing if the user drags a handle and the region 'snaps' because
		// it's actually modifying the base region which is then filtered.
		// Ideally, we should show handles for the BASE region (the selection box)
		// even if the content is filtered?
		// User: "Should essentially return nothing since I have no diamonds...".
		// If nothing is returned, handles will be at 0,0,0 or hidden?
		// If bounds are null, we returned early, so handles won't update.
		// Let's rely on updateHandlePositions to handle 'empty' state if passed valid vectors.
		this.updateHandlePositions(min, max, overallCenter);
	}

	private updateHandlePositions(min: THREE.Vector3, max: THREE.Vector3, center: THREE.Vector3) {
		if (this.handles.size === 0) return;

		// X faces - offset by 0.5 to sit on the block face
		this.handles.get('minX')!.position.set(min.x - center.x - 0.5, 0, 0);
		this.handles.get('maxX')!.position.set(max.x + 1 - center.x - 0.5, 0, 0);

		// Y faces
		this.handles.get('minY')!.position.set(0, min.y - center.y - 0.5, 0);
		this.handles.get('maxY')!.position.set(0, max.y + 1 - center.y - 0.5, 0);

		// Z faces
		this.handles.get('minZ')!.position.set(0, 0, min.z - center.z - 0.5);
		this.handles.get('maxZ')!.position.set(0, 0, max.z + 1 - center.z - 0.5);

		// Reset scales
		this.handles.forEach(h => h.scale.set(1, 1, 1));
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

	public setEditMode(enabled: boolean): void {
		this.handles.forEach(handle => {
			handle.visible = enabled;
		});
		this.wireframes.forEach(w => w.visible = true);
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
		// Animations
	}

	public updateBoundsFromTransform(): void {
		const position = this.group.position.clone();
		const scale = this.group.scale.clone();

		// Get current definition bounds from ACTIVE region
		// (because that's what we see and manipulate)
		const bounds = this.activeRegion.getBounds();
		if (!bounds) return;

		const min = new THREE.Vector3(bounds.min[0], bounds.min[1], bounds.min[2]);
		const max = new THREE.Vector3(bounds.max[0], bounds.max[1], bounds.max[2]);

		if (!this.schematicId) {
			const schematics = this.renderer.schematicManager?.getAllSchematics();
			if (schematics && schematics.length > 0) {
				position.sub(schematics[0].position);
			}
		}

		const size = new THREE.Vector3().subVectors(max, min).addScalar(1);
		const newSize = size.clone().multiply(scale);

		// New center is 'position' (now corrected to local space)
		const newCenter = position;

		// Calculate new min/max
		const newMin = newCenter.clone().sub(newSize.clone().multiplyScalar(0.5)).round();
		const newMax = newMin.clone().add(newSize).subScalar(1).round();

		// Update BASE region definition (always a box from bounds)
		// We lose complex shape if we just resize the bounding box.
		// However, the gizmo is a box manipulator.
		// If we are manipulating a filtered region, what does it mean to resize it?
		// Typically, we resize the selection area.
		// For now, let's assume we re-define the base region to these new bounds.
		this.baseRegion.free();
		this.baseRegion = DefinitionRegionWrapper.fromBounds(
			new BlockPosition(newMin.x, newMin.y, newMin.z),
			new BlockPosition(newMax.x, newMax.y, newMax.z)
		);

		// Recompute active region (apply filters to new base)
		this.updateActiveRegion();
	}

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

	/**
	 * Returns the overall bounding box of the ACTIVE (filtered) region.
	 * If the region is empty (e.g. filter matches nothing), returns empty/zero bounds.
	 */
	public getBounds(): { min: THREE.Vector3, max: THREE.Vector3 } {
		const bounds = this.activeRegion.getBounds();
		if (!bounds) return { min: new THREE.Vector3(), max: new THREE.Vector3() };
		return {
			min: new THREE.Vector3(bounds.min[0], bounds.min[1], bounds.min[2]),
			max: new THREE.Vector3(bounds.max[0], bounds.max[1], bounds.max[2])
		};
	}

	/**
	 * Returns array of bounding boxes for the ACTIVE (filtered) region.
	 * Useful for seeing disjoint parts.
	 */
	public getBoundingBoxes(): Array<{ min: THREE.Vector3, max: THREE.Vector3 }> {
		const boxes = this.activeRegion.getBoxes();
		return boxes.map((box: any) => ({
			min: new THREE.Vector3(box.min[0], box.min[1], box.min[2]),
			max: new THREE.Vector3(box.max[0], box.max[1], box.max[2])
		}));
	}

	public addFilter(filter: string): this {
		if (!this.filters.includes(filter)) {
			this.filters.push(filter);
			this.updateActiveRegion();
		}
		return this;
	}

	public setFilters(filters: string[]): this {
		this.filters = [...filters];
		this.updateActiveRegion();
		return this;
	}

	public clearFilters(): this {
		this.filters = [];
		this.updateActiveRegion();
		return this;
	}

	public addPoint(point: { x: number; y: number; z: number }): this {
		this.baseRegion.addPoint(point.x, point.y, point.z);
		this.updateActiveRegion();
		return this;
	}

	public getFilters(): string[] {
		return [...this.filters];
	}

	// @ts-ignore
	public toDefinitionRegion(schematic?: SchematicWrapper): DefinitionRegionWrapper {
		// activeRegion is already filtered, so just return a copy.
		// The 'schematic' arg is preserved for API compatibility but not strictly needed if we trust activeRegion.
		return this.activeRegion.copy();
	}

	public setBounds(min: THREE.Vector3, max: THREE.Vector3): this {
		this.baseRegion.free();
		this.baseRegion = DefinitionRegionWrapper.fromBounds(
			new BlockPosition(min.x, min.y, min.z),
			new BlockPosition(max.x, max.y, max.z)
		);
		this.updateActiveRegion();
		return this;
	}

	public setColor(color: number): this {
		this.color = color;
		this.meshes.forEach(mesh => {
			if (mesh.material instanceof THREE.MeshBasicMaterial) {
				mesh.material.color.setHex(color);
			}
		});
		this.wireframes.forEach(wf => {
			if (wf.material instanceof THREE.LineBasicMaterial) {
				wf.material.color.setHex(color);
			}
		});
		return this;
	}

	public setOpacity(opacity: number): this {
		this.opacity = opacity;
		this.meshes.forEach(mesh => {
			if (mesh.material instanceof THREE.MeshBasicMaterial) {
				mesh.material.opacity = opacity;
			}
		});
		return this;
	}

	public dispose(): void {
		this.deactivate();

		if (this.group.parent) {
			this.group.parent.remove(this.group);
		}

		this.meshes.forEach(mesh => {
			mesh.geometry.dispose();
			(mesh.material as THREE.Material).dispose();
		});
		this.meshes = [];

		this.wireframes.forEach(wf => {
			wf.geometry.dispose();
			(wf.material as THREE.Material).dispose();
		});
		this.wireframes = [];

		this.handles.forEach(handle => {
			handle.geometry.dispose();
			(handle.material as THREE.Material).dispose();
		});
		this.handles.clear();

		if (this.baseRegion) {
			this.baseRegion.free();
		}
		if (this.activeRegion) {
			this.activeRegion.free();
		}
	}

	public setBaseRegion(region: DefinitionRegionWrapper): this {
		this.baseRegion.free();
		this.baseRegion = region.clone();
		this.updateActiveRegion();
		return this;
	}
}
