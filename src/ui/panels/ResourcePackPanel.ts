// ResourcePackPanel.ts - Panel for resource pack management

import { BasePanel, BasePanelOptions } from "./BasePanel";
import { UIColors, createToggle, createButton } from "../UIComponents";

interface PackInfo {
	id: string;
	name: string;
	enabled: boolean;
	textureCount: number;
	priority: number;
	icon: string | null;
}

/**
 * Resource pack panel for managing texture packs.
 */
export class ResourcePackPanel extends BasePanel {
	private packList!: HTMLDivElement;
	private draggedItem: HTMLElement | null = null;

	constructor(options: BasePanelOptions) {
		super(options);
		this.init();
	}

	protected buildContent(): void {
		const content = this.createContent();

		content.appendChild(this.createPackListSection());
		content.appendChild(this.createActionsSection());

		this.container.appendChild(content);

		// Listen for pack changes via ResourcePackManager
		if (this.renderer.packs) {
			this.renderer.packs.onPackEvent("packsChanged", () => {
				this.refreshPackList();
			});
			this.renderer.packs.onPackEvent("packAdded", () => {
				this.refreshPackList();
			});
			this.renderer.packs.onPackEvent("packRemoved", () => {
				this.refreshPackList();
			});
		}
	}

	protected override onActivate(): void {
		// Refresh pack list when panel becomes visible
		this.refreshPackList();
	}

	private createPackListSection(): HTMLDivElement {
		const section = this.createSection("Resource Packs");

		this.packList = document.createElement("div");
		Object.assign(this.packList.style, {
			display: "flex",
			flexDirection: "column",
			gap: "4px",
			minHeight: "100px",
		});

		this.refreshPackList();
		section.appendChild(this.packList);

		const infoText = this.createInfoText(
			"Drag packs to reorder. Higher priority packs override lower ones."
		);
		section.appendChild(infoText);

		return section;
	}

	private createActionsSection(): HTMLDivElement {
		const section = this.createSection("Actions", true);

		const rebuildBtn = createButton(
			"Rebuild Atlas",
			async () => {
				await this.renderer.packs?.rebuildPackAtlas();
			},
			{ primary: false }
		);
		rebuildBtn.style.width = "100%";
		rebuildBtn.style.marginBottom = "8px";
		section.appendChild(rebuildBtn);

		const dropInfo = this.createInfoText(
			"Drop .zip resource pack files onto the canvas to add them."
		);
		section.appendChild(dropInfo);

		return section;
	}

	private refreshPackList(): void {
		this.packList.innerHTML = "";

		const packs = this.getPacksInfo();

		if (packs.length === 0) {
			const emptyState = document.createElement("div");
			Object.assign(emptyState.style, {
				padding: "20px",
				textAlign: "center",
				color: UIColors.textDim,
				fontSize: "12px",
			});
			emptyState.textContent = "No resource packs loaded";
			this.packList.appendChild(emptyState);
			return;
		}

		for (const pack of packs) {
			const item = this.createPackItem(pack);
			this.packList.appendChild(item);
		}
	}

	private getPacksInfo(): PackInfo[] {
		const packs = this.renderer.packs;
		if (!packs) return [];

		const allPacks = packs.getAllPacks();
		return allPacks.map((pack) => ({
			id: pack.id,
			name: pack.name || pack.id,
			enabled: pack.enabled ?? true,
			textureCount: pack.assetCounts?.textures || 0,
			priority: pack.priority || 0,
			icon: pack.icon || null,
		}));
	}

	private createPackItem(pack: PackInfo): HTMLDivElement {
		const item = document.createElement("div");
		item.dataset.packId = pack.id;
		item.draggable = true;

		Object.assign(item.style, {
			display: "flex",
			alignItems: "center",
			padding: "8px 12px",
			backgroundColor: UIColors.inputBackground,
			borderRadius: "4px",
			border: `1px solid ${UIColors.inputBorder}`,
			cursor: "grab",
			transition: "background-color 0.15s",
		});

		// Pack icon
		if (pack.icon) {
			const iconImg = document.createElement("img");
			iconImg.src = pack.icon;
			iconImg.alt = pack.name;
			Object.assign(iconImg.style, {
				width: "32px",
				height: "32px",
				marginRight: "10px",
				borderRadius: "4px",
				objectFit: "cover",
				imageRendering: "pixelated",
			});
			item.appendChild(iconImg);
		} else {
			// Fallback placeholder
			const placeholder = document.createElement("div");
			Object.assign(placeholder.style, {
				width: "32px",
				height: "32px",
				marginRight: "10px",
				borderRadius: "4px",
				backgroundColor: UIColors.hoverBackground,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontSize: "14px",
				color: UIColors.textDim,
			});
			placeholder.textContent = "P";
			item.appendChild(placeholder);
		}

		// Pack info
		const info = document.createElement("div");
		info.style.flex = "1";

		const name = document.createElement("div");
		name.textContent = pack.name;
		Object.assign(name.style, {
			fontSize: "12px",
			fontWeight: "500",
			color: pack.enabled ? UIColors.text : UIColors.textDim,
		});
		info.appendChild(name);

		const stats = document.createElement("div");
		stats.textContent = `${pack.textureCount} textures`;
		Object.assign(stats.style, {
			fontSize: "10px",
			color: UIColors.textDim,
		});
		info.appendChild(stats);

		item.appendChild(info);

		// Enable/disable toggle
		const toggle = createToggle(pack.enabled, async (enabled) => {
			if (enabled) {
				await this.renderer.packs?.enablePack(pack.id);
			} else {
				await this.renderer.packs?.disablePack(pack.id);
			}
		});
		item.appendChild(toggle);

		// Remove button
		const removeBtn = document.createElement("button");
		removeBtn.textContent = "\u2715";
		removeBtn.title = "Remove pack";
		Object.assign(removeBtn.style, {
			marginLeft: "8px",
			width: "24px",
			height: "24px",
			border: "none",
			borderRadius: "4px",
			backgroundColor: "transparent",
			color: UIColors.textDim,
			cursor: "pointer",
			fontSize: "12px",
		});

		removeBtn.addEventListener("mouseenter", () => {
			removeBtn.style.backgroundColor = UIColors.hoverBackground;
			removeBtn.style.color = UIColors.danger;
		});
		removeBtn.addEventListener("mouseleave", () => {
			removeBtn.style.backgroundColor = "transparent";
			removeBtn.style.color = UIColors.textDim;
		});
		removeBtn.addEventListener("click", async () => {
			await this.renderer.packs?.removePack(pack.id);
		});

		item.appendChild(removeBtn);

		// Drag events
		item.addEventListener("dragstart", (e) => {
			this.draggedItem = item;
			item.style.opacity = "0.5";
			e.dataTransfer?.setData("text/plain", pack.id);
		});

		item.addEventListener("dragend", () => {
			item.style.opacity = "1";
			this.draggedItem = null;
		});

		item.addEventListener("dragover", (e) => {
			e.preventDefault();
			if (this.draggedItem && this.draggedItem !== item) {
				item.style.backgroundColor = UIColors.activeBackground;
			}
		});

		item.addEventListener("dragleave", () => {
			item.style.backgroundColor = UIColors.inputBackground;
		});

		item.addEventListener("drop", (e) => {
			e.preventDefault();
			item.style.backgroundColor = UIColors.inputBackground;

			if (this.draggedItem && this.draggedItem !== item) {
				const draggedId = this.draggedItem.dataset.packId;
				const targetId = item.dataset.packId;

				if (draggedId && targetId) {
					this.reorderPacks(draggedId, targetId);
				}
			}
		});

		return item;
	}

	private reorderPacks(draggedId: string, targetId: string): void {
		const packs = this.renderer.packs;
		if (!packs) return;

		// Get all pack IDs in current order
		const allPacks = packs.getAllPacks();
		const currentOrder = allPacks.map((p) => p.id);
		const draggedIndex = currentOrder.indexOf(draggedId);
		const targetIndex = currentOrder.indexOf(targetId);

		if (draggedIndex === -1 || targetIndex === -1) return;

		// Remove dragged item and insert at target position
		currentOrder.splice(draggedIndex, 1);
		currentOrder.splice(targetIndex, 0, draggedId);

		packs.reorderPacks(currentOrder);
	}

	// Public API

	public getPackList(): PackInfo[] {
		return this.getPacksInfo();
	}

	public refresh(): void {
		this.refreshPackList();
	}
}
