import { EventEmitter } from "events";
import * as THREE from "three";
import { SchematicRenderer } from "../SchematicRenderer";
import { EditableRegionHighlight } from "./highlight/EditableRegionHighlight";

export class RegionManager extends EventEmitter {
	private renderer: SchematicRenderer;
	private regions: Map<string, EditableRegionHighlight> = new Map();

	constructor(renderer: SchematicRenderer) {
		super();
		this.renderer = renderer;
		this.setupEventListeners();
	}

	private setupEventListeners() {
		// Listen for gizmo modifications to snap regions to grid
		this.renderer.eventEmitter.on("gizmoObjectModified", (data: { object: THREE.Object3D }) => {
			const region = this.getRegionByObject(data.object);
			if (region) {
				// Check if modification came from a handle or the main group
				// For now we assume main group since we haven't implemented handle selection fully
				region.updateBoundsFromTransform();
				this.emit("regionModified", region);
			}
		});
	}

	private getRegionByObject(object: THREE.Object3D): EditableRegionHighlight | undefined {
		for (const region of this.regions.values()) {
			// Check if object is the region group itself
			if (region.group === object) {
				return region;
			}
			// Check if object is a child of the region group (e.g. handle)
			// Traverse up to find if it belongs to this region
			let parent = object.parent;
			while (parent) {
				if (parent === region.group) {
					return region;
				}
				parent = parent.parent;
			}
		}
		return undefined;
	}

	public createRegion(
		name: string,
		min: { x: number, y: number, z: number },
		max: { x: number, y: number, z: number },
		schematicId?: string
	): EditableRegionHighlight {
		if (this.regions.has(name)) {
			console.warn(`Region ${name} already exists, updating bounds.`);
			const region = this.regions.get(name)!;
			region.setBounds(new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, max.y, max.z));
			return region;
		}

		const region = new EditableRegionHighlight(this.renderer, {
			name,
			min,
			max,
			schematicId
		});

		this.regions.set(name, region);
		// region.activate(); // Don't auto-activate, wait for edit mode or explicit show

		return region;
	}

	public setEditMode(enabled: boolean) {
		this.regions.forEach(region => {
			region.setEditMode(enabled);
			if (enabled) {
				region.activate();
			} else {
				region.deactivate();
			}
		});

		if (!enabled) {
			this.renderer.gizmoManager?.detach();
		}
	}

	public getRegion(name: string): EditableRegionHighlight | undefined {
		return this.regions.get(name);
	}

	public removeRegion(name: string): boolean {
		const region = this.regions.get(name);
		if (region) {
			region.dispose();
			this.regions.delete(name);
			return true;
		}
		return false;
	}

	/**
	 * Selects a region for editing with gizmos
	 */
	public editRegion(name: string): void {
		const region = this.regions.get(name);
		if (region && this.renderer.gizmoManager) {
			// Ensure region handles are visible
			region.setEditMode(true);
			region.activate();

			// We need to trigger the selection event that GizmoManager listens to
			this.renderer.eventEmitter.emit("objectSelected", region);

			// Default to translate mode for moving the whole region, since handles allow scaling
			this.renderer.gizmoManager.setMode("translate");

			// Force gizmo visibility and ensure it's on top
			// Access private property safely
			const gizmoManager = this.renderer.gizmoManager as any;
			if (gizmoManager.transformControls) {
				const controls = gizmoManager.transformControls;
				controls.visible = true;
				controls.enabled = true;
				// Force depth test disable again to be sure
				controls.depthTest = false;
				controls.depthWrite = false;
				controls.renderOrder = 999;

				// Make sure we update the helper immediately
				if (gizmoManager.update) gizmoManager.update();
			}

		} else {
			console.warn(`Region ${name} not found or GizmoManager not enabled.`);
		}
	}

	/**
	 * Updates the visual appearance of a region
	 */
	public updateRegionLook(name: string, options: { color?: number; opacity?: number }): void {
		const region = this.regions.get(name);
		if (region) {
			if (options.color !== undefined) {
				region.setColor(options.color);
			}
			if (options.opacity !== undefined) {
				region.setOpacity(options.opacity);
			}
		} else {
			console.warn(`Region ${name} not found.`);
		}
	}

	public getAllRegions(): EditableRegionHighlight[] {
		return Array.from(this.regions.values());
	}

	public getRegionsForSchematic(schematicId: string): EditableRegionHighlight[] {
		return Array.from(this.regions.values()).filter(region => (region as any).schematicId === schematicId);
	}

	public dispose() {
		this.regions.forEach(region => region.dispose());
		this.regions.clear();
	}
}
