// types.ts - Sidebar type definitions

/**
 * Represents a keyboard shortcut with modifier keys
 */
export interface KeyboardShortcut {
	/** The key code (e.g., "KeyC", "Digit1", "Escape") */
	key: string;
	/** Require Ctrl key (Cmd on macOS) */
	ctrl?: boolean;
	/** Require Shift key */
	shift?: boolean;
	/** Require Alt key (Option on macOS) */
	alt?: boolean;
}

/**
 * Tab identifiers matching the UI panels
 */
export type SidebarTabId =
	| "controls"
	| "renderSettings"
	| "capture"
	| "export"
	| "resourcePacks"
	| "performance";

/**
 * Action identifiers for keyboard shortcuts
 */
export type SidebarAction =
	| "toggleSidebar"
	| "toggleSidebarVisibility"
	| "closeSidebar"
	| "nextTab"
	| "previousTab"
	| "showControls"
	| "showRenderSettings"
	| "showCapture"
	| "showExport"
	| "showResourcePacks"
	| "showPerformance";

/**
 * Map of actions to their keyboard shortcuts
 */
export type KeyboardShortcutMap = Partial<Record<SidebarAction, KeyboardShortcut>>;

/**
 * Position of the sidebar
 */
export type SidebarPosition = "left" | "right";

/**
 * Configuration for a single tab in the sidebar
 */
export interface SidebarTabConfig {
	/** Unique identifier for the tab */
	id: SidebarTabId;
	/** Display label for the tab */
	label: string;
	/** Icon (emoji or text) */
	icon: string;
	/** Whether this tab is enabled */
	enabled: boolean;
	/** Order in the tab bar (lower = earlier) */
	order: number;
	/** Custom keyboard shortcut to show this tab (overrides default) */
	shortcut?: KeyboardShortcut;
	/** Callback when this tab is activated */
	onActivate?: () => void;
	/** Callback when this tab is deactivated */
	onDeactivate?: () => void;
}

/**
 * Complete sidebar configuration options
 */
export interface SidebarOptions {
	/** Enable the entire sidebar UI system (default: true) */
	enabled?: boolean;

	/** Sidebar position (default: "right") */
	position?: SidebarPosition;

	/** Width of the sidebar content in pixels (default: 320) */
	width?: number;

	/** Enable keyboard shortcuts globally (default: true) */
	enableKeyboardShortcuts?: boolean;

	/** Keyboard shortcut mappings (merged with defaults) */
	shortcuts?: KeyboardShortcutMap;

	/** Configuration overrides for each tab */
	tabs?: Partial<Record<SidebarTabId, Partial<SidebarTabConfig>>>;

	/** Which tabs to disable completely */
	disabledTabs?: SidebarTabId[];

	/** Default tab to show when sidebar opens (default: "controls") */
	defaultTab?: SidebarTabId;

	/** Whether sidebar is collapsed by default (default: true) */
	collapsedByDefault?: boolean;

	/** Whether sidebar is hidden entirely by default (default: false) */
	hiddenByDefault?: boolean;

	/** Callback when sidebar visibility changes */
	onVisibilityChange?: (visible: boolean) => void;

	/** Callback when active tab changes */
	onTabChange?: (tabId: SidebarTabId) => void;
}

/**
 * Default keyboard shortcuts using Ctrl+Shift+Number pattern
 */
export const DEFAULT_SHORTCUTS: Required<KeyboardShortcutMap> = {
	toggleSidebar: { key: "KeyU", ctrl: true },
	toggleSidebarVisibility: { key: "Backslash", ctrl: true },
	closeSidebar: { key: "Escape" },
	nextTab: { key: "Tab", ctrl: true },
	previousTab: { key: "Tab", ctrl: true, shift: true },
	showControls: { key: "Digit1", ctrl: true, shift: true },
	showRenderSettings: { key: "Digit2", ctrl: true, shift: true },
	showCapture: { key: "Digit3", ctrl: true, shift: true },
	showExport: { key: "Digit4", ctrl: true, shift: true },
	showResourcePacks: { key: "Digit5", ctrl: true, shift: true },
	showPerformance: { key: "Digit6", ctrl: true, shift: true },
};

/**
 * Default tab configuration
 */
export const DEFAULT_TAB_CONFIG: Record<SidebarTabId, SidebarTabConfig> = {
	controls: {
		id: "controls",
		label: "Controls",
		icon: "\u2328", // Keyboard
		enabled: true,
		order: 1,
	},
	renderSettings: {
		id: "renderSettings",
		label: "Render",
		icon: "\u2699", // Gear
		enabled: true,
		order: 2,
	},
	capture: {
		id: "capture",
		label: "Capture",
		icon: "\u29BE", // Circled white bullet (camera-like)
		enabled: true,
		order: 3,
	},
	export: {
		id: "export",
		label: "Export",
		icon: "\u2B07", // Down arrow
		enabled: true,
		order: 4,
	},
	resourcePacks: {
		id: "resourcePacks",
		label: "Packs",
		icon: "\u229E", // Squared plus (stacked layers)
		enabled: true,
		order: 5,
	},
	performance: {
		id: "performance",
		label: "Performance",
		icon: "\u2261", // Identical to (bars)
		enabled: true,
		order: 6,
	},
};

/**
 * Default sidebar options
 */
export const DEFAULT_SIDEBAR_OPTIONS: Required<SidebarOptions> = {
	enabled: true,
	position: "right",
	width: 320,
	enableKeyboardShortcuts: true,
	shortcuts: DEFAULT_SHORTCUTS,
	tabs: DEFAULT_TAB_CONFIG,
	disabledTabs: [],
	defaultTab: "controls",
	collapsedByDefault: true,
	hiddenByDefault: true,
	onVisibilityChange: () => {},
	onTabChange: () => {},
};

/**
 * State of the sidebar
 */
export interface SidebarState {
	/** Whether the sidebar is visible/expanded */
	visible: boolean;
	/** Currently active tab (null if no tab selected) */
	activeTab: SidebarTabId | null;
	/** List of enabled tabs in order */
	enabledTabs: SidebarTabId[];
}

/**
 * Map action names to tab IDs for tab-switching shortcuts
 */
export const ACTION_TO_TAB: Partial<Record<SidebarAction, SidebarTabId>> = {
	showControls: "controls",
	showRenderSettings: "renderSettings",
	showCapture: "capture",
	showExport: "export",
	showResourcePacks: "resourcePacks",
	showPerformance: "performance",
};
