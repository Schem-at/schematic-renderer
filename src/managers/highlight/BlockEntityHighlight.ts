// BlockEntityHighlight.ts
import * as THREE from "three";
import { Highlight } from "../managers/highlight/Highlight";
import { EventEmitter } from "./EventEmitter";
import { BlockData } from "./types";

export class BlockEntityHighlight implements Highlight {
	private scene: THREE.Scene;
	private camera: THREE.Camera;
	private renderer: THREE.WebGLRenderer;
	private eventEmitter: EventEmitter;
	private schematicRenderer: any; // Access to schematics
	private tooltipElement: HTMLDivElement;

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

		this.createTooltipElement();

		// Listen for hover events
		this.eventEmitter.on("hover", this.onHover);
	}

	activate() {
		// No additional activation required
	}

	deactivate() {
		this.eventEmitter.off("hover", this.onHover);
		this.tooltipElement.remove();
	}

	update(deltaTime: number) {
		// Update tooltip position if necessary
	}

	private createTooltipElement() {
		this.tooltipElement = document.createElement("div");
		this.tooltipElement.style.position = "absolute";
		this.tooltipElement.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
		this.tooltipElement.style.color = "#fff";
		this.tooltipElement.style.padding = "5px";
		this.tooltipElement.style.borderRadius = "5px";
		this.tooltipElement.style.display = "none";
		this.tooltipElement.style.pointerEvents = "none";
		document.body.appendChild(this.tooltipElement);
	}

	private onHover = (position: THREE.Vector3 | null) => {
		if (!position) {
			this.hideTooltip();
			return;
		}
		let blockName = this.getblockName(position);
		if (blockName === "minecraft:chest") {
			const blockData = this.getBlockData(position);
			if (blockData && blockData.blockEntity) {
				this.showTooltip(blockData.blockEntity, position);
			}
		}
	};

	private getBlockData(position: THREE.Vector3): BlockData | null {
		// Access the schematic to get block data
		const firstSchematic =
			this.schematicRenderer.schematics[
				Object.keys(this.schematicRenderer.schematics)[0]
			];
		const block = firstSchematic.get_block_with_properties(
			position.x,
			position.y,
			position.z
		);

		if (block) {
			const blockEntity = firstSchematic.get_block_entity(
				position.x,
				position.y,
				position.z
			);

			return {
				name: block.name(),
				properties: block.properties(),
				blockEntity,
			};
		}

		return null;
	}

	private getblockName(position: THREE.Vector3): string | null {
		const firstSchematic =
			this.schematicRenderer.schematics[
				Object.keys(this.schematicRenderer.schematics)[0]
			];
		const block = firstSchematic.get_block(position.x, position.y, position.z);
		if (block) {
			return block;
		}
		return null;
	}

	private showTooltip(blockEntity: any, position: THREE.Vector3) {
		// Get chest items
		const items = blockEntity.nbt?.Items || [];

		// Generate tooltip content
		let content = "<strong>Chest Contents:</strong><br>";
		if (items.length > 0) {
			items.forEach((item: any) => {
				content += `- ${item.id.replace("minecraft:", "")} x${item.Count}<br>`;
			});
		} else {
			content += "Empty";
		}

		this.tooltipElement.innerHTML = content;
		this.tooltipElement.style.display = "block";

		// Update tooltip position
		this.updateTooltipPosition(position);
	}

	private hideTooltip() {
		this.tooltipElement.style.display = "none";
	}

	private updateTooltipPosition(position: THREE.Vector3) {
		// Project position to screen coordinates
		const screenPosition = position.clone().addScalar(0.5).project(this.camera);

		const x =
			(screenPosition.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
		const y =
			(-screenPosition.y * 0.5 + 0.5) * this.renderer.domElement.clientHeight;

		this.tooltipElement.style.left = `${x}px`;
		this.tooltipElement.style.top = `${y}px`;
	}
}
