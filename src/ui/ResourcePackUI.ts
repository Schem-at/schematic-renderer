// ResourcePackUI.ts - UI Component for Resource Pack Management

import { ResourcePackManager } from "../managers/ResourcePackManager";
import { ResourcePackInfo, ResourcePackOptions } from "../types/resourcePack";

/**
 * Resource Pack Management UI Component
 * Provides a visual interface for managing resource packs with drag-and-drop reordering
 */
export class ResourcePackUI {
	private manager: ResourcePackManager;
	private container: HTMLDivElement;
	private packList: HTMLDivElement;
	private isVisible: boolean = false;
	private options: ResourcePackOptions;
	private canvas: HTMLCanvasElement;
	private draggedPackId: string | null = null;

	constructor(
		manager: ResourcePackManager,
		canvas: HTMLCanvasElement,
		options: ResourcePackOptions = {}
	) {
		this.manager = manager;
		this.canvas = canvas;
		this.options = {
			enableUI: true,
			uiPosition: "top-right",
			showIcons: true,
			enableDragReorder: true,
			enableKeyboardShortcuts: true,
			toggleUIShortcut: "KeyP",
			...options,
		};

		this.container = this.createContainer();
		this.packList = this.createPackList();
		this.container.appendChild(this.packList);

		// Subscribe to pack events
		this.subscribeToEvents();

		// Setup keyboard shortcuts
		if (this.options.enableKeyboardShortcuts) {
			this.setupKeyboardShortcuts();
		}

		// Initial render
		this.render();
	}

	private createContainer(): HTMLDivElement {
		const container = document.createElement("div");
		container.className = "resource-pack-ui";

		// Position styles
		const positions: Record<
			string,
			{ top?: string; right?: string; bottom?: string; left?: string }
		> = {
			"top-left": { top: "10px", left: "10px" },
			"top-right": { top: "10px", right: "10px" },
			"bottom-left": { bottom: "10px", left: "10px" },
			"bottom-right": { bottom: "10px", right: "10px" },
		};

		const pos = positions[this.options.uiPosition || "top-right"];

		Object.assign(container.style, {
			position: "absolute",
			...pos,
			width: "320px",
			maxHeight: "500px",
			backgroundColor: "rgba(20, 20, 25, 0.95)",
			borderRadius: "8px",
			boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
			fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
			fontSize: "13px",
			color: "#e0e0e0",
			zIndex: "1000",
			display: "none",
			overflow: "hidden",
			border: "1px solid rgba(255, 255, 255, 0.1)",
		});

		// Header
		const header = this.createHeader();
		container.appendChild(header);

		// Append to canvas parent
		const parent = this.canvas.parentElement;
		if (parent) {
			if (getComputedStyle(parent).position === "static") {
				parent.style.position = "relative";
			}
			parent.appendChild(container);
		}

		return container;
	}

	private createHeader(): HTMLDivElement {
		const header = document.createElement("div");
		Object.assign(header.style, {
			display: "flex",
			justifyContent: "space-between",
			alignItems: "center",
			padding: "12px 16px",
			borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
			background: "rgba(255, 255, 255, 0.03)",
		});

		// Title
		const title = document.createElement("span");
		title.textContent = "Resource Packs";
		Object.assign(title.style, {
			fontWeight: "600",
			fontSize: "14px",
		});
		header.appendChild(title);

		// Actions
		const actions = document.createElement("div");
		Object.assign(actions.style, {
			display: "flex",
			gap: "8px",
		});

		// Add Pack Button
		const addBtn = this.createIconButton("➕", "Add Pack", () => this.triggerFileUpload());
		actions.appendChild(addBtn);

		// Close Button
		const closeBtn = this.createIconButton("✕", "Close", () => this.hide());
		actions.appendChild(closeBtn);

		header.appendChild(actions);

		return header;
	}

	private createPackList(): HTMLDivElement {
		const list = document.createElement("div");
		list.className = "resource-pack-list";
		Object.assign(list.style, {
			maxHeight: "350px",
			overflowY: "auto",
			padding: "8px",
		});

		return list;
	}

	private createIconButton(icon: string, title: string, onClick: () => void): HTMLButtonElement {
		const btn = document.createElement("button");
		btn.textContent = icon;
		btn.title = title;
		Object.assign(btn.style, {
			width: "28px",
			height: "28px",
			border: "none",
			borderRadius: "4px",
			backgroundColor: "rgba(255, 255, 255, 0.08)",
			color: "#e0e0e0",
			cursor: "pointer",
			fontSize: "12px",
			transition: "background-color 0.15s",
		});
		btn.addEventListener("mouseenter", () => {
			btn.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
		});
		btn.addEventListener("mouseleave", () => {
			btn.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
		});
		btn.addEventListener("click", onClick);
		return btn;
	}

	private subscribeToEvents(): void {
		this.manager.onPackEvent("packAdded", () => this.render());
		this.manager.onPackEvent("packRemoved", () => this.render());
		this.manager.onPackEvent("packToggled", () => this.render());
		this.manager.onPackEvent("packOrderChanged", () => this.render());
	}

	private setupKeyboardShortcuts(): void {
		document.addEventListener("keydown", (e) => {
			// Check if focused element is an input
			if (
				document.activeElement?.tagName === "INPUT" ||
				document.activeElement?.tagName === "TEXTAREA"
			) {
				return;
			}

			if (e.code === this.options.toggleUIShortcut) {
				this.toggle();
			}
		});
	}

	public render(): void {
		const packs = this.manager.getAllPacks();
		this.packList.innerHTML = "";

		if (packs.length === 0) {
			const emptyState = this.createEmptyState();
			this.packList.appendChild(emptyState);
			return;
		}

		for (const pack of packs) {
			const packItem = this.createPackItem(pack);
			this.packList.appendChild(packItem);
		}

		// Footer with stats
		const footer = this.createFooter(packs);
		this.packList.appendChild(footer);
	}

	private createEmptyState(): HTMLDivElement {
		const empty = document.createElement("div");
		Object.assign(empty.style, {
			textAlign: "center",
			padding: "40px 20px",
			color: "rgba(255, 255, 255, 0.5)",
		});

		const icon = document.createElement("div");
		icon.textContent = "📦";
		icon.style.fontSize = "32px";
		icon.style.marginBottom = "12px";
		empty.appendChild(icon);

		const text = document.createElement("div");
		text.textContent = "No resource packs loaded";
		text.style.marginBottom = "16px";
		empty.appendChild(text);

		const addBtn = document.createElement("button");
		addBtn.textContent = "Add Resource Pack";
		Object.assign(addBtn.style, {
			padding: "8px 16px",
			border: "none",
			borderRadius: "4px",
			backgroundColor: "#4a6cf7",
			color: "#fff",
			cursor: "pointer",
			fontSize: "13px",
		});
		addBtn.addEventListener("click", () => this.triggerFileUpload());
		empty.appendChild(addBtn);

		return empty;
	}

	private createPackItem(pack: ResourcePackInfo): HTMLDivElement {
		const item = document.createElement("div");
		item.className = "resource-pack-item";
		item.dataset.packId = pack.id;

		Object.assign(item.style, {
			display: "flex",
			alignItems: "center",
			gap: "10px",
			padding: "10px 12px",
			marginBottom: "4px",
			borderRadius: "6px",
			backgroundColor: pack.enabled ? "rgba(74, 108, 247, 0.15)" : "rgba(255, 255, 255, 0.03)",
			border: "1px solid " + (pack.enabled ? "rgba(74, 108, 247, 0.3)" : "transparent"),
			cursor: this.options.enableDragReorder ? "grab" : "default",
			transition: "all 0.15s",
			opacity: pack.enabled ? "1" : "0.6",
		});

		// Drag handle
		if (this.options.enableDragReorder) {
			item.draggable = true;
			this.setupDragEvents(item, pack.id);
		}

		// Icon
		if (this.options.showIcons) {
			const iconContainer = document.createElement("div");
			Object.assign(iconContainer.style, {
				width: "32px",
				height: "32px",
				borderRadius: "4px",
				backgroundColor: "rgba(255, 255, 255, 0.1)",
				overflow: "hidden",
				flexShrink: "0",
			});

			if (pack.icon) {
				const iconImg = document.createElement("img");
				iconImg.src = pack.icon;
				iconImg.alt = pack.name;
				Object.assign(iconImg.style, {
					width: "100%",
					height: "100%",
					objectFit: "cover",
					imageRendering: "pixelated",
				});
				iconContainer.appendChild(iconImg);
			} else {
				iconContainer.textContent = "📦";
				Object.assign(iconContainer.style, {
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: "16px",
				});
			}
			item.appendChild(iconContainer);
		}

		// Info
		const info = document.createElement("div");
		Object.assign(info.style, {
			flex: "1",
			minWidth: "0",
		});

		const name = document.createElement("div");
		name.textContent = pack.name;
		Object.assign(name.style, {
			fontWeight: "500",
			whiteSpace: "nowrap",
			overflow: "hidden",
			textOverflow: "ellipsis",
		});
		info.appendChild(name);

		const stats = document.createElement("div");
		stats.textContent = `${pack.assetCounts.textures} textures • Priority ${pack.priority}`;
		Object.assign(stats.style, {
			fontSize: "11px",
			color: "rgba(255, 255, 255, 0.5)",
			marginTop: "2px",
		});
		info.appendChild(stats);

		item.appendChild(info);

		// Actions
		const actions = document.createElement("div");
		Object.assign(actions.style, {
			display: "flex",
			gap: "4px",
			alignItems: "center",
		});

		// Toggle switch
		const toggle = this.createToggleSwitch(pack.enabled, async () => {
			await this.manager.togglePack(pack.id);
		});
		actions.appendChild(toggle);

		// Remove button
		const removeBtn = this.createIconButton("🗑️", "Remove", async () => {
			await this.manager.removePack(pack.id);
		});
		removeBtn.style.width = "24px";
		removeBtn.style.height = "24px";
		removeBtn.style.fontSize = "10px";
		actions.appendChild(removeBtn);

		item.appendChild(actions);

		return item;
	}

	private createToggleSwitch(
		isOn: boolean,
		onChange: () => void | Promise<void>
	): HTMLLabelElement {
		const label = document.createElement("label");
		Object.assign(label.style, {
			position: "relative",
			display: "inline-block",
			width: "36px",
			height: "20px",
			cursor: "pointer",
		});

		const input = document.createElement("input");
		input.type = "checkbox";
		input.checked = isOn;
		input.style.opacity = "0";
		input.style.width = "0";
		input.style.height = "0";
		input.addEventListener("change", () => {
			// Handle async onChange properly
			const result = onChange();
			if (result instanceof Promise) {
				result.catch((err) => console.error("Toggle error:", err));
			}
		});
		label.appendChild(input);

		const slider = document.createElement("span");
		Object.assign(slider.style, {
			position: "absolute",
			top: "0",
			left: "0",
			right: "0",
			bottom: "0",
			backgroundColor: isOn ? "#4a6cf7" : "rgba(255, 255, 255, 0.2)",
			borderRadius: "20px",
			transition: "0.2s",
		});

		const knob = document.createElement("span");
		Object.assign(knob.style, {
			position: "absolute",
			content: '""',
			height: "14px",
			width: "14px",
			left: isOn ? "19px" : "3px",
			bottom: "3px",
			backgroundColor: "#fff",
			borderRadius: "50%",
			transition: "0.2s",
		});
		slider.appendChild(knob);

		label.appendChild(slider);

		return label;
	}

	private createFooter(packs: ResourcePackInfo[]): HTMLDivElement {
		const footer = document.createElement("div");
		Object.assign(footer.style, {
			padding: "12px",
			marginTop: "8px",
			borderTop: "1px solid rgba(255, 255, 255, 0.1)",
			fontSize: "11px",
			color: "rgba(255, 255, 255, 0.5)",
			display: "flex",
			justifyContent: "space-between",
		});

		const enabledCount = packs.filter((p) => p.enabled).length;
		const totalTextures = packs
			.filter((p) => p.enabled)
			.reduce((sum, p) => sum + p.assetCounts.textures, 0);

		footer.innerHTML = `
			<span>${enabledCount}/${packs.length} enabled</span>
			<span>${totalTextures} total textures</span>
		`;

		return footer;
	}

	private setupDragEvents(item: HTMLDivElement, packId: string): void {
		item.addEventListener("dragstart", (e) => {
			this.draggedPackId = packId;
			item.style.opacity = "0.5";
			e.dataTransfer?.setData("text/plain", packId);
		});

		item.addEventListener("dragend", () => {
			item.style.opacity = "1";
			this.draggedPackId = null;
		});

		item.addEventListener("dragover", (e) => {
			e.preventDefault();
			if (this.draggedPackId && this.draggedPackId !== packId) {
				item.style.borderTop = "2px solid #4a6cf7";
			}
		});

		item.addEventListener("dragleave", () => {
			item.style.borderTop = "";
		});

		item.addEventListener("drop", async (e) => {
			e.preventDefault();
			item.style.borderTop = "";

			if (this.draggedPackId && this.draggedPackId !== packId) {
				// Get all current items
				const items = Array.from(
					this.packList.querySelectorAll(".resource-pack-item")
				) as HTMLDivElement[];
				const packIds = items.map((i) => i.dataset.packId!);

				// Calculate new order
				const fromIndex = packIds.indexOf(this.draggedPackId);
				const toIndex = packIds.indexOf(packId);

				if (fromIndex !== -1 && toIndex !== -1) {
					packIds.splice(fromIndex, 1);
					packIds.splice(toIndex, 0, this.draggedPackId);
					await this.manager.reorderPacks(packIds);
				}
			}
		});
	}

	private triggerFileUpload(): void {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".zip";
		input.multiple = true;

		input.addEventListener("change", async () => {
			const files = input.files;
			if (files) {
				for (const file of Array.from(files)) {
					try {
						await this.manager.loadPackFromFile(file);
					} catch (error) {
						console.error("Failed to load pack:", error);
					}
				}
			}
		});

		input.click();
	}

	public show(): void {
		this.isVisible = true;
		this.container.style.display = "block";
		this.render();
	}

	public hide(): void {
		this.isVisible = false;
		this.container.style.display = "none";
	}

	public toggle(): void {
		if (this.isVisible) {
			this.hide();
		} else {
			this.show();
		}
	}

	public isShowing(): boolean {
		return this.isVisible;
	}

	public destroy(): void {
		this.container.remove();
	}

	/**
	 * Dispose of the UI (alias for destroy)
	 */
	public dispose(): void {
		this.destroy();
	}
}
