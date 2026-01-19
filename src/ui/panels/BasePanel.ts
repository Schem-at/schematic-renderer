// BasePanel.ts - Abstract base class for sidebar panels

import { SchematicRenderer } from "../../SchematicRenderer";
import { UIColors, UIStyles } from "../UIComponents";

export interface BasePanelOptions {
	/** Reference to the renderer */
	renderer: SchematicRenderer;
	/** Callback when settings change */
	onSettingsChange?: (settings: unknown) => void;
}

/**
 * Abstract base class for sidebar panels.
 * Provides common structure and lifecycle methods for panel implementations.
 */
export abstract class BasePanel {
	protected renderer: SchematicRenderer;
	protected container: HTMLDivElement;
	protected isActive: boolean = false;
	protected onSettingsChange?: (settings: unknown) => void;

	constructor(options: BasePanelOptions) {
		this.renderer = options.renderer;
		this.onSettingsChange = options.onSettingsChange;
		this.container = this.createContainer();
		// Note: buildContent() must be called by subclasses after their own initialization
	}

	/**
	 * Initialize the panel content. Must be called by subclasses at the end of their constructor.
	 */
	protected init(): void {
		this.buildContent();
	}

	/**
	 * Create the panel's container element
	 */
	protected createContainer(): HTMLDivElement {
		const container = document.createElement("div");
		Object.assign(container.style, {
			display: "none",
			flexDirection: "column",
			height: "100%",
			overflowY: "auto",
			overflowX: "hidden",
		});
		return container;
	}

	/**
	 * Build the panel's internal content.
	 * Subclasses must implement this to create their UI.
	 */
	protected abstract buildContent(): void;

	/**
	 * Called when the panel becomes visible/active.
	 * Subclasses can override for activation logic.
	 */
	protected onActivate(): void {}

	/**
	 * Called when the panel becomes hidden/inactive.
	 * Subclasses can override for deactivation logic.
	 */
	protected onDeactivate(): void {}

	/**
	 * Activate the panel (make it visible)
	 */
	public activate(): void {
		this.isActive = true;
		this.container.style.display = "flex";
		this.onActivate();
	}

	/**
	 * Deactivate the panel (hide it)
	 */
	public deactivate(): void {
		this.isActive = false;
		this.container.style.display = "none";
		this.onDeactivate();
	}

	/**
	 * Check if the panel is currently active
	 */
	public isActivePanel(): boolean {
		return this.isActive;
	}

	/**
	 * Get the panel's DOM element
	 */
	public getElement(): HTMLDivElement {
		return this.container;
	}

	/**
	 * Emit a settings change event
	 */
	protected emitChange(settings: unknown): void {
		if (this.onSettingsChange) {
			this.onSettingsChange(settings);
		}
	}

	/**
	 * Create a section container with title
	 */
	protected createSection(title: string, isLast: boolean = false): HTMLDivElement {
		const section = document.createElement("div");
		Object.assign(section.style, {
			...UIStyles.section,
			borderBottom: isLast ? "none" : UIStyles.section.borderBottom,
			paddingBottom: isLast ? "0" : UIStyles.section.paddingBottom,
		});

		const titleEl = document.createElement("div");
		titleEl.textContent = title;
		Object.assign(titleEl.style, UIStyles.sectionTitle);
		section.appendChild(titleEl);

		return section;
	}

	/**
	 * Create a content wrapper with padding
	 */
	protected createContent(): HTMLDivElement {
		const content = document.createElement("div");
		Object.assign(content.style, {
			padding: "16px",
			display: "flex",
			flexDirection: "column",
			gap: "16px",
		});
		return content;
	}

	/**
	 * Create an info/help text element
	 */
	protected createInfoText(text: string): HTMLDivElement {
		const info = document.createElement("div");
		info.textContent = text;
		Object.assign(info.style, {
			fontSize: "11px",
			color: UIColors.textDim,
			marginTop: "8px",
			lineHeight: "1.4",
		});
		return info;
	}

	/**
	 * Clean up resources
	 */
	public dispose(): void {
		this.container.remove();
	}
}
