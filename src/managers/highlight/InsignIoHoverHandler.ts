// managers/highlight/InsignIoHoverHandler.ts
import * as THREE from "three";
import { Highlight } from "./Highlight";
import { SchematicRenderer } from "../../SchematicRenderer";
import { OverlayContent } from "../OverlayManager";

/**
 * Hover handler for Insign IO regions
 * Shows overlay with IO metadata when hovering over IO blocks
 */
export class InsignIoHoverHandler implements Highlight {
	private renderer: SchematicRenderer;
	private isActive: boolean = false;
	private raycaster: THREE.Raycaster = new THREE.Raycaster();
	private mouse: THREE.Vector2 = new THREE.Vector2();
	private currentHoveredRegion: string | null = null;

	constructor(renderer: SchematicRenderer) {
		this.renderer = renderer;
	}

	getName(): string {
		return "insign_io_hover_handler";
	}

	activate(): void {
		if (this.isActive) return;
		this.isActive = true;

		// Listen to mouse move events
		this.renderer.canvas.addEventListener("mousemove", this.onMouseMove);
	}

	deactivate(): void {
		if (!this.isActive) return;
		this.isActive = false;

		this.renderer.canvas.removeEventListener("mousemove", this.onMouseMove);
		this.hideOverlay();
	}

	update(_deltaTime: number): void {
		// No per-frame updates needed
	}

	private onMouseMove = (event: MouseEvent): void => {
		if (!this.isActive || !this.renderer.insignIoManager) return;

		// Calculate mouse position in normalized device coordinates
		const rect = this.renderer.canvas.getBoundingClientRect();
		this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		// Update raycaster
		const camera = this.renderer.cameraManager.activeCamera?.camera;
		if (!camera) return;

		this.raycaster.setFromCamera(this.mouse, camera);

		// Check for intersections with IO region meshes
		const hoveredRegion = this.findHoveredIoRegion();

		if (hoveredRegion !== this.currentHoveredRegion) {
			this.currentHoveredRegion = hoveredRegion;

			if (hoveredRegion) {
				this.showOverlayForRegion(hoveredRegion, event.clientX, event.clientY);
			} else {
				this.hideOverlay();
			}
		} else if (hoveredRegion && this.renderer.overlayManager) {
			// Update overlay position as mouse moves
			this.renderer.overlayManager.updatePosition({
				x: event.clientX,
				y: event.clientY,
			});
		}
	};

	/**
	 * Find which IO region is currently being hovered
	 */
	private findHoveredIoRegion(): string | null {
		if (!this.renderer.insignIoManager) return null;

		// Get all visible IO region IDs
		const visibleRegions = this.renderer.insignIoManager.getVisibleRegionIds();

		// Check each visible region's blocks
		for (const regionId of visibleRegions) {
			const region = this.renderer.insignIoManager.getRegion(regionId);
			if (!region) continue;

			// Check if mouse is hovering over any position in this region
			for (const pos of region.positions) {
				if (this.isHoveringBlock(pos)) {
					return regionId;
				}
			}
		}

		return null;
	}

	/**
	 * Check if mouse is hovering over a specific block position
	 */
	private isHoveringBlock(pos: [number, number, number]): boolean {
		// Get schematic offset
		const schematics = this.renderer.schematicManager?.getAllSchematics();
		if (!schematics || schematics.length === 0) return false;

		const schematicOffset = schematics[0].position;

		// Create a bounding box for the block
		const blockMin = new THREE.Vector3(
			pos[0] + schematicOffset.x - 0.5,
			pos[1] + schematicOffset.y - 0.5,
			pos[2] + schematicOffset.z - 0.5
		);
		const blockMax = new THREE.Vector3(
			pos[0] + schematicOffset.x + 0.5,
			pos[1] + schematicOffset.y + 0.5,
			pos[2] + schematicOffset.z + 0.5
		);
		const box = new THREE.Box3(blockMin, blockMax);

		// Check if ray intersects this box
		const intersection = new THREE.Vector3();
		return this.raycaster.ray.intersectBox(box, intersection) !== null;
	}

	/**
	 * Show overlay for a specific IO region
	 */
	private showOverlayForRegion(regionId: string, mouseX: number, mouseY: number): void {
		if (!this.renderer.overlayManager || !this.renderer.insignIoManager) return;

		const region = this.renderer.insignIoManager.getRegion(regionId);
		if (!region) return;

		// Build overlay content
		const content: OverlayContent = {
			title: regionId.replace(/^io\./, ""),
			subtitle: region.ioDirection.toUpperCase(),
			sections: [
				{
					title: "Type Information",
					items: [
						{
							label: "Data Type",
							value: region.dataType,
							color: "#4fc3f7",
							icon: "📊",
						},
						{
							label: "Bit Width",
							value: region.positions.length,
							color: "#81c784",
							icon: "🔢",
						},
						{
							label: "Direction",
							value: region.ioDirection === "input" ? "Input" : "Output",
							color: region.ioDirection === "input" ? "#64b5f6" : "#e57373",
							icon: region.ioDirection === "input" ? "⬇️" : "⬆️",
						},
					],
				},
				{
					title: "Position Details",
					items: [
						{
							label: "First Position",
							value: `(${region.positions[0][0]}, ${region.positions[0][1]}, ${region.positions[0][2]})`,
							color: "#ffb74d",
						},
						{
							label: "Last Position",
							value: `(${region.positions[region.positions.length - 1][0]}, ${region.positions[region.positions.length - 1][1]}, ${region.positions[region.positions.length - 1][2]})`,
							color: "#ffb74d",
						},
					],
				},
			],
		};

		// Add sort strategy if available
		if (region.sortStrategy) {
			content.sections[0].items.push({
				label: "Sort Strategy",
				value: region.sortStrategy,
				color: "#ba68c8",
				icon: "🔀",
			});
		}

		this.renderer.overlayManager.show(content, { x: mouseX, y: mouseY });
	}

	/**
	 * Hide the overlay
	 */
	private hideOverlay(): void {
		if (this.renderer.overlayManager) {
			this.renderer.overlayManager.hide();
		}
	}
}
