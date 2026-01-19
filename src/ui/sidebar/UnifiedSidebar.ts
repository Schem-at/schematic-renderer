// UnifiedSidebar.ts - Main sidebar container component

import { UIColors } from "../UIComponents";
import { SidebarPosition, SidebarTabId, SidebarTabConfig } from "./types";
import { BasePanel } from "../panels/BasePanel";

export interface UnifiedSidebarOptions {
	/** Canvas element to attach sidebar to */
	canvas: HTMLCanvasElement;
	/** Position of the sidebar */
	position: SidebarPosition;
	/** Width of the content area */
	width: number;
	/** Whether to start collapsed */
	collapsed: boolean;
	/** Ordered list of tab configurations */
	tabs: SidebarTabConfig[];
	/** Callback when a tab is clicked */
	onTabClick?: (tabId: SidebarTabId) => void;
	/** Callback when collapse/expand button is clicked */
	onToggle?: () => void;
}

/**
 * The main sidebar container that holds the tab bar and content area.
 */
export class UnifiedSidebar {
	private container: HTMLDivElement;
	private tabBar: HTMLDivElement;
	private contentArea: HTMLDivElement;
	private headerArea: HTMLDivElement;
	private collapsed: boolean;
	private position: SidebarPosition;
	private width: number;
	private tabs: SidebarTabConfig[];
	private tabElements: Map<SidebarTabId, HTMLButtonElement> = new Map();
	private activeTabId: SidebarTabId | null = null;
	private panels: Map<SidebarTabId, BasePanel> = new Map();
	private onTabClick?: (tabId: SidebarTabId) => void;
	private onToggle?: () => void;

	// Tab bar width (vertical icons)
	private readonly TAB_BAR_WIDTH = 48;
	// Animation duration
	private readonly ANIMATION_DURATION = 200;

	constructor(options: UnifiedSidebarOptions) {
		this.position = options.position;
		this.width = options.width;
		this.collapsed = options.collapsed;
		this.tabs = options.tabs;
		this.onTabClick = options.onTabClick;
		this.onToggle = options.onToggle;

		this.container = this.createContainer(options.canvas);
		this.tabBar = this.createTabBar();
		this.headerArea = this.createHeaderArea();
		this.contentArea = this.createContentArea();

		// Assemble the sidebar
		this.container.appendChild(this.tabBar);

		const mainArea = document.createElement("div");
		Object.assign(mainArea.style, {
			display: "flex",
			flexDirection: "column",
			flex: "1",
			minWidth: "0",
			overflow: "hidden",
		});
		mainArea.appendChild(this.headerArea);
		mainArea.appendChild(this.contentArea);
		this.container.appendChild(mainArea);

		// Build tabs
		this.buildTabs();

		// Set initial collapsed state
		this.setCollapsed(this.collapsed, false);
	}

	/**
	 * Create the main container
	 */
	private createContainer(canvas: HTMLCanvasElement): HTMLDivElement {
		const container = document.createElement("div");

		Object.assign(container.style, {
			position: "absolute",
			top: "0",
			bottom: "0",
			[this.position]: "0",
			display: "flex",
			flexDirection: this.position === "right" ? "row" : "row-reverse",
			backgroundColor: UIColors.panelBackground,
			borderLeft: this.position === "right" ? `1px solid ${UIColors.border}` : "none",
			borderRight: this.position === "left" ? `1px solid ${UIColors.border}` : "none",
			boxShadow: UIColors.shadow,
			fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
			fontSize: "13px",
			color: UIColors.text,
			zIndex: "1000",
			transition: `width ${this.ANIMATION_DURATION}ms ease-out`,
			overflow: "hidden",
		});

		// Append to canvas parent
		const parent = canvas.parentElement;
		if (parent) {
			if (getComputedStyle(parent).position === "static") {
				parent.style.position = "relative";
			}
			parent.appendChild(container);
		}

		return container;
	}

	/**
	 * Create the vertical tab bar
	 */
	private createTabBar(): HTMLDivElement {
		const tabBar = document.createElement("div");

		Object.assign(tabBar.style, {
			width: `${this.TAB_BAR_WIDTH}px`,
			minWidth: `${this.TAB_BAR_WIDTH}px`,
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			paddingTop: "8px",
			paddingBottom: "8px",
			gap: "4px",
			backgroundColor: "rgba(0, 0, 0, 0.2)",
			borderRight: this.position === "right" ? `1px solid ${UIColors.border}` : "none",
			borderLeft: this.position === "left" ? `1px solid ${UIColors.border}` : "none",
		});

		return tabBar;
	}

	/**
	 * Create the header area with title and close button
	 */
	private createHeaderArea(): HTMLDivElement {
		const header = document.createElement("div");

		Object.assign(header.style, {
			display: "flex",
			justifyContent: "space-between",
			alignItems: "center",
			padding: "12px 16px",
			borderBottom: `1px solid ${UIColors.border}`,
			backgroundColor: UIColors.headerBackground,
			minHeight: "48px",
		});

		// Title (will be updated when tab changes)
		const title = document.createElement("span");
		title.id = "sidebar-title";
		title.textContent = "Settings";
		Object.assign(title.style, {
			fontWeight: "600",
			fontSize: "14px",
		});
		header.appendChild(title);

		// Close button
		const closeBtn = document.createElement("button");
		closeBtn.textContent = "\u2715"; // X symbol
		closeBtn.title = "Collapse sidebar";
		Object.assign(closeBtn.style, {
			width: "28px",
			height: "28px",
			border: "none",
			borderRadius: "4px",
			backgroundColor: "transparent",
			color: UIColors.text,
			cursor: "pointer",
			fontSize: "14px",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			transition: "background-color 0.15s",
		});

		closeBtn.addEventListener("mouseenter", () => {
			closeBtn.style.backgroundColor = UIColors.hoverBackground;
		});
		closeBtn.addEventListener("mouseleave", () => {
			closeBtn.style.backgroundColor = "transparent";
		});
		closeBtn.addEventListener("click", () => {
			if (this.onToggle) {
				this.onToggle();
			}
		});

		header.appendChild(closeBtn);

		return header;
	}

	/**
	 * Create the content area where panels are displayed
	 */
	private createContentArea(): HTMLDivElement {
		const content = document.createElement("div");

		Object.assign(content.style, {
			flex: "1",
			overflowY: "auto",
			overflowX: "hidden",
		});

		return content;
	}

	/**
	 * Build tab buttons from configuration
	 */
	private buildTabs(): void {
		// Sort tabs by order
		const sortedTabs = [...this.tabs].sort((a, b) => a.order - b.order);

		for (const tab of sortedTabs) {
			if (!tab.enabled) continue;

			const button = this.createTabButton(tab);
			this.tabElements.set(tab.id, button);
			this.tabBar.appendChild(button);
		}

		// Add spacer to push collapse button to bottom
		const spacer = document.createElement("div");
		spacer.style.flex = "1";
		this.tabBar.appendChild(spacer);

		// Add collapse/expand toggle at bottom
		const toggleBtn = this.createToggleButton();
		this.tabBar.appendChild(toggleBtn);
	}

	/**
	 * Create a tab button
	 */
	private createTabButton(tab: SidebarTabConfig): HTMLButtonElement {
		const button = document.createElement("button");
		button.textContent = tab.icon;
		button.title = tab.label;
		button.dataset.tabId = tab.id;

		Object.assign(button.style, {
			width: "36px",
			height: "36px",
			border: "none",
			borderRadius: "8px",
			backgroundColor: "transparent",
			color: UIColors.textMuted,
			cursor: "pointer",
			fontSize: "18px",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			transition: "all 0.15s",
		});

		button.addEventListener("mouseenter", () => {
			if (this.activeTabId !== tab.id) {
				button.style.backgroundColor = UIColors.hoverBackground;
			}
		});

		button.addEventListener("mouseleave", () => {
			if (this.activeTabId !== tab.id) {
				button.style.backgroundColor = "transparent";
			}
		});

		button.addEventListener("click", () => {
			if (this.onTabClick) {
				this.onTabClick(tab.id);
			}
		});

		return button;
	}

	/**
	 * Create the collapse/expand toggle button
	 */
	private createToggleButton(): HTMLButtonElement {
		const button = document.createElement("button");
		button.title = this.collapsed ? "Expand sidebar" : "Collapse sidebar";
		button.innerHTML = this.getToggleIcon();

		Object.assign(button.style, {
			width: "36px",
			height: "36px",
			border: "none",
			borderRadius: "8px",
			backgroundColor: "transparent",
			color: UIColors.textMuted,
			cursor: "pointer",
			fontSize: "16px",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			transition: "all 0.15s",
			marginTop: "8px",
		});

		button.addEventListener("mouseenter", () => {
			button.style.backgroundColor = UIColors.hoverBackground;
		});

		button.addEventListener("mouseleave", () => {
			button.style.backgroundColor = "transparent";
		});

		button.addEventListener("click", () => {
			if (this.onToggle) {
				this.onToggle();
			}
		});

		return button;
	}

	/**
	 * Get the appropriate toggle icon based on position and state
	 */
	private getToggleIcon(): string {
		if (this.position === "right") {
			return this.collapsed ? "\u25C0" : "\u25B6"; // Left or right arrow
		} else {
			return this.collapsed ? "\u25B6" : "\u25C0"; // Right or left arrow
		}
	}

	/**
	 * Set the active tab
	 */
	public setActiveTab(tabId: SidebarTabId | null): void {
		// Update previous tab button style
		if (this.activeTabId) {
			const prevButton = this.tabElements.get(this.activeTabId);
			if (prevButton) {
				prevButton.style.backgroundColor = "transparent";
				prevButton.style.color = UIColors.textMuted;
			}
		}

		// Deactivate previous panel
		if (this.activeTabId) {
			const prevPanel = this.panels.get(this.activeTabId);
			if (prevPanel) {
				prevPanel.deactivate();
			}
		}

		this.activeTabId = tabId;

		// Update new tab button style
		if (tabId) {
			const button = this.tabElements.get(tabId);
			if (button) {
				button.style.backgroundColor = UIColors.activeBackground;
				button.style.color = UIColors.text;
			}

			// Update header title
			const tab = this.tabs.find((t) => t.id === tabId);
			const titleEl = this.headerArea.querySelector("#sidebar-title");
			if (titleEl && tab) {
				titleEl.textContent = tab.label;
			}

			// Activate panel
			const panel = this.panels.get(tabId);
			if (panel) {
				panel.activate();
			}
		}
	}

	/**
	 * Register a panel for a tab
	 */
	public registerPanel(tabId: SidebarTabId, panel: BasePanel): void {
		this.panels.set(tabId, panel);
		this.contentArea.appendChild(panel.getElement());
	}

	/**
	 * Set collapsed state
	 */
	public setCollapsed(collapsed: boolean, animate: boolean = true): void {
		this.collapsed = collapsed;

		const fullWidth = this.TAB_BAR_WIDTH + this.width;
		const collapsedWidth = this.TAB_BAR_WIDTH;

		if (animate) {
			this.container.style.transition = `width ${this.ANIMATION_DURATION}ms ease-out`;
		} else {
			this.container.style.transition = "none";
		}

		this.container.style.width = collapsed ? `${collapsedWidth}px` : `${fullWidth}px`;

		// Update toggle button
		const toggleBtn = this.tabBar.lastElementChild as HTMLButtonElement;
		if (toggleBtn) {
			toggleBtn.innerHTML = this.getToggleIcon();
			toggleBtn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
		}

		// Restore transition after non-animated change
		if (!animate) {
			requestAnimationFrame(() => {
				this.container.style.transition = `width ${this.ANIMATION_DURATION}ms ease-out`;
			});
		}
	}

	/**
	 * Check if sidebar is collapsed
	 */
	public isCollapsed(): boolean {
		return this.collapsed;
	}

	/**
	 * Toggle collapsed state
	 */
	public toggle(): void {
		this.setCollapsed(!this.collapsed);
	}

	/**
	 * Show the sidebar (expand if collapsed)
	 */
	public show(): void {
		if (this.collapsed) {
			this.setCollapsed(false);
		}
	}

	/**
	 * Hide the sidebar (collapse)
	 */
	public hide(): void {
		if (!this.collapsed) {
			this.setCollapsed(true);
		}
	}

	/**
	 * Set whether the entire sidebar is hidden (display: none)
	 */
	public setHidden(hidden: boolean): void {
		this.container.style.display = hidden ? "none" : "flex";
	}

	/**
	 * Check if the sidebar is hidden entirely
	 */
	public isHiddenEntirely(): boolean {
		return this.container.style.display === "none";
	}

	/**
	 * Get the DOM element
	 */
	public getElement(): HTMLDivElement {
		return this.container;
	}

	/**
	 * Update tab configuration
	 */
	public updateTabs(tabs: SidebarTabConfig[]): void {
		this.tabs = tabs;

		// Clear existing tab buttons (except spacer and toggle)
		const children = Array.from(this.tabBar.children);
		for (const child of children) {
			if (child instanceof HTMLButtonElement && child.dataset.tabId) {
				child.remove();
			}
		}
		this.tabElements.clear();

		// Re-add tab buttons at the start
		const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);
		const firstChild = this.tabBar.firstChild;

		for (const tab of sortedTabs) {
			if (!tab.enabled) continue;

			const button = this.createTabButton(tab);
			this.tabElements.set(tab.id, button);
			this.tabBar.insertBefore(button, firstChild);
		}

		// Re-apply active state if needed
		if (this.activeTabId) {
			this.setActiveTab(this.activeTabId);
		}
	}

	/**
	 * Update tooltip for a tab (to show shortcut)
	 */
	public setTabTooltip(tabId: SidebarTabId, tooltip: string): void {
		const button = this.tabElements.get(tabId);
		if (button) {
			button.title = tooltip;
		}
	}

	/**
	 * Clean up resources
	 */
	public dispose(): void {
		// Dispose all panels
		for (const panel of this.panels.values()) {
			panel.dispose();
		}
		this.panels.clear();
		this.tabElements.clear();
		this.container.remove();
	}
}
