// SidebarManager.ts - Main orchestrator for the unified sidebar

import { SchematicRenderer } from "../../SchematicRenderer";
import {
	SidebarOptions,
	SidebarTabId,
	SidebarTabConfig,
	SidebarState,
	SidebarAction,
	KeyboardShortcut,
	KeyboardShortcutMap,
	DEFAULT_SIDEBAR_OPTIONS,
	DEFAULT_TAB_CONFIG,
	DEFAULT_SHORTCUTS,
	ACTION_TO_TAB,
} from "./types";
import { UnifiedSidebar } from "./UnifiedSidebar";
import { KeyboardShortcutManager } from "./KeyboardShortcutManager";

// Panel imports
import { ControlsPanel } from "../panels/ControlsPanel";
import { RenderSettingsPanel } from "../panels/RenderSettingsPanel";
import { CapturePanel } from "../panels/CapturePanel";
import { ExportPanel } from "../panels/ExportPanel";
import { ResourcePackPanel } from "../panels/ResourcePackPanel";
import { PerformancePanel } from "../panels/PerformancePanel";

/**
 * Manages the unified sidebar UI system.
 * Coordinates the sidebar, tabs, panels, and keyboard shortcuts.
 */
export class SidebarManager {
	private renderer: SchematicRenderer;
	private options: Required<SidebarOptions>;
	private sidebar: UnifiedSidebar | null = null;
	private shortcutManager: KeyboardShortcutManager | null = null;
	private tabConfigs: Map<SidebarTabId, SidebarTabConfig> = new Map();
	private activeTab: SidebarTabId | null = null;
	private visible: boolean = false;
	/** Whether the entire sidebar (including tab bar) is hidden */
	private hidden: boolean = false;

	/** Direct access to panels */
	public readonly panels: {
		controls: ControlsPanel | null;
		renderSettings: RenderSettingsPanel | null;
		capture: CapturePanel | null;
		export: ExportPanel | null;
		resourcePacks: ResourcePackPanel | null;
		performance: PerformancePanel | null;
	} = {
		controls: null,
		renderSettings: null,
		capture: null,
		export: null,
		resourcePacks: null,
		performance: null,
	};

	constructor(renderer: SchematicRenderer, options: SidebarOptions = {}) {
		this.renderer = renderer;
		this.options = this.mergeOptions(options);

		if (this.options.enabled) {
			this.initialize();
		}
	}

	/**
	 * Merge user options with defaults
	 */
	private mergeOptions(options: SidebarOptions): Required<SidebarOptions> {
		// Deep merge shortcuts
		const shortcuts = {
			...DEFAULT_SHORTCUTS,
			...(options.shortcuts || {}),
		};

		// Deep merge tab configs
		const tabs: Record<SidebarTabId, SidebarTabConfig> = {} as Record<
			SidebarTabId,
			SidebarTabConfig
		>;
		for (const [id, defaultConfig] of Object.entries(DEFAULT_TAB_CONFIG)) {
			const userConfig = options.tabs?.[id as SidebarTabId];
			tabs[id as SidebarTabId] = {
				...defaultConfig,
				...userConfig,
			};
		}

		// Apply disabled tabs
		if (options.disabledTabs) {
			for (const tabId of options.disabledTabs) {
				if (tabs[tabId]) {
					tabs[tabId].enabled = false;
				}
			}
		}

		return {
			enabled: options.enabled ?? DEFAULT_SIDEBAR_OPTIONS.enabled,
			position: options.position ?? DEFAULT_SIDEBAR_OPTIONS.position,
			width: options.width ?? DEFAULT_SIDEBAR_OPTIONS.width,
			enableKeyboardShortcuts:
				options.enableKeyboardShortcuts ?? DEFAULT_SIDEBAR_OPTIONS.enableKeyboardShortcuts,
			shortcuts,
			tabs,
			disabledTabs: options.disabledTabs ?? DEFAULT_SIDEBAR_OPTIONS.disabledTabs,
			defaultTab: options.defaultTab ?? DEFAULT_SIDEBAR_OPTIONS.defaultTab,
			collapsedByDefault: options.collapsedByDefault ?? DEFAULT_SIDEBAR_OPTIONS.collapsedByDefault,
			hiddenByDefault: options.hiddenByDefault ?? DEFAULT_SIDEBAR_OPTIONS.hiddenByDefault,
			onVisibilityChange: options.onVisibilityChange ?? DEFAULT_SIDEBAR_OPTIONS.onVisibilityChange,
			onTabChange: options.onTabChange ?? DEFAULT_SIDEBAR_OPTIONS.onTabChange,
		};
	}

	/**
	 * Initialize the sidebar system
	 */
	private initialize(): void {
		// Build tab configs
		for (const [id, config] of Object.entries(this.options.tabs)) {
			this.tabConfigs.set(id as SidebarTabId, config as SidebarTabConfig);
		}

		// Create the sidebar
		this.sidebar = new UnifiedSidebar({
			canvas: this.renderer.canvas,
			position: this.options.position,
			width: this.options.width,
			collapsed: this.options.collapsedByDefault,
			tabs: Array.from(this.tabConfigs.values()),
			onTabClick: (tabId) => this.handleTabClick(tabId),
			onToggle: () => this.toggle(),
		});

		// Create panels
		this.createPanels();

		// Set up keyboard shortcuts
		if (this.options.enableKeyboardShortcuts) {
			this.setupKeyboardShortcuts();
		}

		// Update tab tooltips with shortcuts
		this.updateTabTooltips();

		// Set initial state
		this.visible = !this.options.collapsedByDefault;
		this.hidden = this.options.hiddenByDefault;

		// Hide entirely if hiddenByDefault is true
		if (this.hidden) {
			this.sidebar.setHidden(true);
		} else if (this.visible && this.options.defaultTab) {
			this.showTab(this.options.defaultTab);
		}
	}

	/**
	 * Create all panel instances
	 */
	private createPanels(): void {
		if (!this.sidebar) return;

		const panelOptions = { renderer: this.renderer };

		// Controls panel
		if (this.tabConfigs.get("controls")?.enabled) {
			this.panels.controls = new ControlsPanel(panelOptions);
			this.sidebar.registerPanel("controls", this.panels.controls);
		}

		// Render settings panel
		if (this.tabConfigs.get("renderSettings")?.enabled) {
			this.panels.renderSettings = new RenderSettingsPanel(panelOptions);
			this.sidebar.registerPanel("renderSettings", this.panels.renderSettings);
		}

		// Capture panel
		if (this.tabConfigs.get("capture")?.enabled) {
			this.panels.capture = new CapturePanel(panelOptions);
			this.sidebar.registerPanel("capture", this.panels.capture);
		}

		// Export panel
		if (this.tabConfigs.get("export")?.enabled) {
			this.panels.export = new ExportPanel(panelOptions);
			this.sidebar.registerPanel("export", this.panels.export);
		}

		// Resource packs panel
		if (this.tabConfigs.get("resourcePacks")?.enabled) {
			this.panels.resourcePacks = new ResourcePackPanel(panelOptions);
			this.sidebar.registerPanel("resourcePacks", this.panels.resourcePacks);
		}

		// Performance panel
		if (this.tabConfigs.get("performance")?.enabled) {
			this.panels.performance = new PerformancePanel(panelOptions);
			this.sidebar.registerPanel("performance", this.panels.performance);
		}
	}

	/**
	 * Set up keyboard shortcut handlers
	 */
	private setupKeyboardShortcuts(): void {
		// Build shortcuts map, merging defaults with per-tab custom shortcuts
		const shortcuts = { ...this.options.shortcuts };

		// Apply per-tab custom shortcuts (override defaults)
		for (const [tabId, config] of this.tabConfigs.entries()) {
			if (config.shortcut) {
				const action = this.getActionForTab(tabId);
				if (action) {
					shortcuts[action] = config.shortcut;
				}
			}
		}

		this.shortcutManager = new KeyboardShortcutManager(shortcuts);

		// Toggle sidebar (expand/collapse)
		this.shortcutManager.onAction("toggleSidebar", () => this.toggle());

		// Toggle sidebar visibility (show/hide entirely)
		this.shortcutManager.onAction("toggleSidebarVisibility", () => this.toggleVisibility());

		// Close sidebar
		this.shortcutManager.onAction("closeSidebar", () => {
			if (this.visible) {
				this.hide();
			}
		});

		// Tab navigation
		this.shortcutManager.onAction("nextTab", () => this.navigateTab(1));
		this.shortcutManager.onAction("previousTab", () => this.navigateTab(-1));

		// Tab shortcuts
		for (const [action, tabId] of Object.entries(ACTION_TO_TAB)) {
			if (tabId && this.tabConfigs.get(tabId)?.enabled) {
				this.shortcutManager.onAction(action as SidebarAction, () => {
					this.show(tabId);
				});
			}
		}
	}

	/**
	 * Get the action name for a given tab ID
	 */
	private getActionForTab(tabId: SidebarTabId): SidebarAction | null {
		for (const [action, id] of Object.entries(ACTION_TO_TAB)) {
			if (id === tabId) {
				return action as SidebarAction;
			}
		}
		return null;
	}

	/**
	 * Update tab tooltips to include keyboard shortcuts
	 */
	private updateTabTooltips(): void {
		if (!this.sidebar || !this.shortcutManager) return;

		for (const [action, tabId] of Object.entries(ACTION_TO_TAB)) {
			if (!tabId) continue;

			const config = this.tabConfigs.get(tabId);
			const shortcut = this.shortcutManager.getShortcut(action as SidebarAction);

			if (config && shortcut) {
				const formattedShortcut = this.shortcutManager.formatShortcut(shortcut);
				this.sidebar.setTabTooltip(tabId, `${config.label} (${formattedShortcut})`);
			}
		}
	}

	/**
	 * Handle tab click
	 */
	private handleTabClick(tabId: SidebarTabId): void {
		if (this.sidebar?.isCollapsed()) {
			// Expand and show tab
			this.show(tabId);
		} else if (this.activeTab === tabId) {
			// Clicking active tab collapses
			this.hide();
		} else {
			// Switch to clicked tab
			this.showTab(tabId);
		}
	}

	/**
	 * Navigate to next/previous tab
	 */
	private navigateTab(direction: 1 | -1): void {
		const enabledTabs = Array.from(this.tabConfigs.values())
			.filter((t) => t.enabled)
			.sort((a, b) => a.order - b.order)
			.map((t) => t.id);

		if (enabledTabs.length === 0) return;

		const currentIndex = this.activeTab ? enabledTabs.indexOf(this.activeTab) : -1;
		let newIndex = currentIndex + direction;

		// Wrap around
		if (newIndex < 0) newIndex = enabledTabs.length - 1;
		if (newIndex >= enabledTabs.length) newIndex = 0;

		this.showTab(enabledTabs[newIndex]);
	}

	// ========================
	// Public API
	// ========================

	/**
	 * Show the sidebar, optionally to a specific tab
	 */
	public show(tab?: SidebarTabId): void {
		if (!this.sidebar) return;

		this.sidebar.show();
		this.visible = true;

		if (tab) {
			this.showTab(tab);
		} else if (!this.activeTab) {
			// Show default tab if none active
			this.showTab(this.options.defaultTab);
		}

		this.options.onVisibilityChange(true);
	}

	/**
	 * Hide the sidebar
	 */
	public hide(): void {
		if (!this.sidebar) return;

		this.sidebar.hide();
		this.visible = false;
		this.options.onVisibilityChange(false);
	}

	/**
	 * Toggle sidebar visibility
	 */
	public toggle(): void {
		if (this.visible) {
			this.hide();
		} else {
			this.show();
		}
	}

	/**
	 * Switch to a specific tab
	 */
	public showTab(tabId: SidebarTabId): void {
		if (!this.sidebar) return;

		const config = this.tabConfigs.get(tabId);
		if (!config?.enabled) return;

		// Call onDeactivate callback for previous tab
		if (this.activeTab && this.activeTab !== tabId) {
			const prevConfig = this.tabConfigs.get(this.activeTab);
			if (prevConfig?.onDeactivate) {
				prevConfig.onDeactivate();
			}
		}

		this.activeTab = tabId;
		this.sidebar.setActiveTab(tabId);
		this.options.onTabChange(tabId);

		// Call onActivate callback for new tab
		if (config.onActivate) {
			config.onActivate();
		}
	}

	/**
	 * Enable the sidebar
	 */
	public enable(): void {
		if (this.sidebar) return; // Already enabled

		this.options.enabled = true;
		this.initialize();
	}

	/**
	 * Disable the sidebar
	 */
	public disable(): void {
		this.dispose();
		this.options.enabled = false;
	}

	/**
	 * Enable keyboard shortcuts
	 */
	public setKeyboardShortcutsEnabled(enabled: boolean): void {
		if (enabled && !this.shortcutManager) {
			this.setupKeyboardShortcuts();
			this.updateTabTooltips();
		} else if (!enabled && this.shortcutManager) {
			this.shortcutManager.dispose();
			this.shortcutManager = null;
		} else if (this.shortcutManager) {
			this.shortcutManager.setEnabled(enabled);
		}
	}

	/**
	 * Set a keyboard shortcut for an action
	 */
	public setShortcut(action: SidebarAction, shortcut: KeyboardShortcut | null): void {
		if (!this.shortcutManager) return;

		this.shortcutManager.setShortcut(action, shortcut);
		this.options.shortcuts[action] = shortcut || undefined;
		this.updateTabTooltips();
	}

	/**
	 * Get all keyboard shortcuts
	 */
	public getShortcuts(): KeyboardShortcutMap {
		return this.shortcutManager?.getShortcuts() || {};
	}

	/**
	 * Enable a specific tab
	 */
	public enableTab(tabId: SidebarTabId): void {
		const config = this.tabConfigs.get(tabId);
		if (config) {
			config.enabled = true;
			this.sidebar?.updateTabs(Array.from(this.tabConfigs.values()));
		}
	}

	/**
	 * Disable a specific tab
	 */
	public disableTab(tabId: SidebarTabId): void {
		const config = this.tabConfigs.get(tabId);
		if (config) {
			config.enabled = false;
			this.sidebar?.updateTabs(Array.from(this.tabConfigs.values()));

			// If this was the active tab, switch to another
			if (this.activeTab === tabId) {
				const firstEnabled = Array.from(this.tabConfigs.values()).find((t) => t.enabled);
				if (firstEnabled) {
					this.showTab(firstEnabled.id);
				}
			}
		}
	}

	/**
	 * Configure a specific tab with custom settings
	 * Allows setting custom shortcuts, callbacks, label, icon, etc.
	 */
	public configureTab(tabId: SidebarTabId, config: Partial<SidebarTabConfig>): void {
		const existing = this.tabConfigs.get(tabId);
		if (!existing) return;

		// Merge config
		Object.assign(existing, config);

		// Update sidebar UI
		this.sidebar?.updateTabs(Array.from(this.tabConfigs.values()));

		// If shortcut changed, update keyboard shortcuts
		if (config.shortcut !== undefined && this.shortcutManager) {
			const action = this.getActionForTab(tabId);
			if (action) {
				this.shortcutManager.setShortcut(action, config.shortcut || null);
				this.updateTabTooltips();
			}
		}
	}

	/**
	 * Get the configuration for a specific tab
	 */
	public getTabConfig(tabId: SidebarTabId): SidebarTabConfig | undefined {
		return this.tabConfigs.get(tabId);
	}

	/**
	 * Get current sidebar state
	 */
	public getState(): SidebarState {
		return {
			visible: this.visible,
			activeTab: this.activeTab,
			enabledTabs: Array.from(this.tabConfigs.values())
				.filter((t) => t.enabled)
				.map((t) => t.id),
		};
	}

	/**
	 * Check if sidebar is visible (expanded)
	 */
	public isVisible(): boolean {
		return this.visible;
	}

	/**
	 * Check if sidebar is collapsed
	 */
	public isCollapsed(): boolean {
		return this.sidebar?.isCollapsed() ?? true;
	}

	/**
	 * Check if sidebar is hidden entirely
	 */
	public isHidden(): boolean {
		return this.hidden;
	}

	/**
	 * Show the entire sidebar (make it visible)
	 */
	public showSidebar(): void {
		if (!this.sidebar) return;
		this.hidden = false;
		this.sidebar.setHidden(false);
		this.options.onVisibilityChange(true);
	}

	/**
	 * Hide the entire sidebar (including tab bar)
	 */
	public hideSidebar(): void {
		if (!this.sidebar) return;
		this.hidden = true;
		this.sidebar.setHidden(true);
		this.options.onVisibilityChange(false);
	}

	/**
	 * Toggle sidebar visibility (show/hide entirely)
	 */
	public toggleVisibility(): void {
		if (this.hidden) {
			this.showSidebar();
		} else {
			this.hideSidebar();
		}
	}

	/**
	 * Get the active tab ID
	 */
	public getActiveTab(): SidebarTabId | null {
		return this.activeTab;
	}

	/**
	 * Enable keyboard shortcuts
	 */
	public enableShortcuts(): void {
		this.setKeyboardShortcutsEnabled(true);
	}

	/**
	 * Disable keyboard shortcuts
	 */
	public disableShortcuts(): void {
		this.setKeyboardShortcutsEnabled(false);
	}

	/**
	 * Clean up resources
	 */
	public dispose(): void {
		this.shortcutManager?.dispose();
		this.shortcutManager = null;

		this.sidebar?.dispose();
		this.sidebar = null;

		this.panels.controls = null;
		this.panels.renderSettings = null;
		this.panels.capture = null;
		this.panels.export = null;
		this.panels.resourcePacks = null;
		this.panels.performance = null;

		this.tabConfigs.clear();
		this.activeTab = null;
		this.visible = false;
	}
}
