// KeyboardShortcutManager.ts - Unified keyboard shortcut handling

import { KeyboardShortcut, KeyboardShortcutMap, SidebarAction } from "./types";

/**
 * Manages keyboard shortcuts for the sidebar UI.
 * Handles modifier keys (Ctrl, Shift, Alt) and prevents conflicts with input elements.
 */
export class KeyboardShortcutManager {
	private shortcuts: Map<SidebarAction, KeyboardShortcut> = new Map();
	private handlers: Map<SidebarAction, () => void> = new Map();
	private enabled: boolean = true;
	private boundKeydownHandler: (e: KeyboardEvent) => void;

	constructor(shortcuts: KeyboardShortcutMap = {}) {
		this.setShortcuts(shortcuts);
		this.boundKeydownHandler = this.handleKeydown.bind(this);
		document.addEventListener("keydown", this.boundKeydownHandler);
	}

	/**
	 * Update multiple shortcut mappings at once
	 */
	public setShortcuts(shortcuts: KeyboardShortcutMap): void {
		for (const [action, shortcut] of Object.entries(shortcuts)) {
			if (shortcut) {
				this.shortcuts.set(action as SidebarAction, shortcut);
			}
		}
	}

	/**
	 * Set or remove a single shortcut
	 */
	public setShortcut(action: SidebarAction, shortcut: KeyboardShortcut | null): void {
		if (shortcut) {
			this.shortcuts.set(action, shortcut);
		} else {
			this.shortcuts.delete(action);
		}
	}

	/**
	 * Get a shortcut for an action
	 */
	public getShortcut(action: SidebarAction): KeyboardShortcut | undefined {
		return this.shortcuts.get(action);
	}

	/**
	 * Get all shortcuts as a map
	 */
	public getShortcuts(): KeyboardShortcutMap {
		const result: KeyboardShortcutMap = {};
		for (const [action, shortcut] of this.shortcuts) {
			result[action] = shortcut;
		}
		return result;
	}

	/**
	 * Register a handler for an action
	 */
	public onAction(action: SidebarAction, handler: () => void): void {
		this.handlers.set(action, handler);
	}

	/**
	 * Remove a handler for an action
	 */
	public offAction(action: SidebarAction): void {
		this.handlers.delete(action);
	}

	/**
	 * Enable or disable all shortcuts
	 */
	public setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	/**
	 * Check if shortcuts are enabled
	 */
	public isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Get human-readable shortcut string for display
	 */
	public formatShortcut(shortcut: KeyboardShortcut): string {
		const isMac = navigator.platform.includes("Mac");
		const parts: string[] = [];

		if (shortcut.ctrl) {
			parts.push(isMac ? "\u2318" : "Ctrl");
		}
		if (shortcut.shift) {
			parts.push(isMac ? "\u21E7" : "Shift");
		}
		if (shortcut.alt) {
			parts.push(isMac ? "\u2325" : "Alt");
		}

		parts.push(this.formatKey(shortcut.key));
		return parts.join(isMac ? "" : "+");
	}

	/**
	 * Format a key code for display
	 */
	private formatKey(code: string): string {
		const keyMap: Record<string, string> = {
			Digit1: "1",
			Digit2: "2",
			Digit3: "3",
			Digit4: "4",
			Digit5: "5",
			Digit6: "6",
			Digit7: "7",
			Digit8: "8",
			Digit9: "9",
			Digit0: "0",
			Escape: "Esc",
			Tab: "Tab",
			Space: "Space",
			Enter: "Enter",
			Backspace: "Bksp",
			ArrowUp: "\u2191",
			ArrowDown: "\u2193",
			ArrowLeft: "\u2190",
			ArrowRight: "\u2192",
		};

		if (keyMap[code]) {
			return keyMap[code];
		}

		// Handle KeyA, KeyB, etc.
		if (code.startsWith("Key")) {
			return code.substring(3);
		}

		return code;
	}

	/**
	 * Handle keydown events
	 */
	private handleKeydown(e: KeyboardEvent): void {
		if (!this.enabled) return;

		// Ignore if typing in an input element
		if (this.isInputFocused()) return;

		// Check each registered shortcut
		for (const [action, shortcut] of this.shortcuts) {
			if (this.matchesShortcut(e, shortcut)) {
				e.preventDefault();
				e.stopPropagation();

				const handler = this.handlers.get(action);
				if (handler) {
					handler();
				}
				return;
			}
		}
	}

	/**
	 * Check if a keyboard event matches a shortcut
	 */
	private matchesShortcut(e: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
		// Check key code
		if (e.code !== shortcut.key) return false;

		// Check Ctrl/Cmd modifier (treat Cmd on Mac as Ctrl)
		const ctrlPressed = e.ctrlKey || e.metaKey;
		if (!!shortcut.ctrl !== ctrlPressed) return false;

		// Check Shift modifier
		if (!!shortcut.shift !== e.shiftKey) return false;

		// Check Alt modifier
		if (!!shortcut.alt !== e.altKey) return false;

		return true;
	}

	/**
	 * Check if an input element is currently focused
	 */
	private isInputFocused(): boolean {
		const activeElement = document.activeElement;
		if (!activeElement) return false;

		const tagName = activeElement.tagName;
		return (
			tagName === "INPUT" ||
			tagName === "TEXTAREA" ||
			tagName === "SELECT" ||
			(activeElement as HTMLElement).isContentEditable
		);
	}

	/**
	 * Parse a shortcut string like "Ctrl+Shift+1" into a KeyboardShortcut object
	 */
	public static parseShortcut(str: string): KeyboardShortcut | null {
		if (!str) return null;

		const parts = str.split("+").map((p) => p.trim().toLowerCase());
		const shortcut: KeyboardShortcut = { key: "" };

		for (const part of parts) {
			switch (part) {
				case "ctrl":
				case "cmd":
				case "meta":
					shortcut.ctrl = true;
					break;
				case "shift":
					shortcut.shift = true;
					break;
				case "alt":
				case "option":
					shortcut.alt = true;
					break;
				default:
					// This is the key
					if (part.length === 1) {
						// Single character - convert to KeyX format
						if (/[a-z]/.test(part)) {
							shortcut.key = `Key${part.toUpperCase()}`;
						} else if (/[0-9]/.test(part)) {
							shortcut.key = `Digit${part}`;
						}
					} else if (part === "escape" || part === "esc") {
						shortcut.key = "Escape";
					} else if (part === "tab") {
						shortcut.key = "Tab";
					} else if (part === "space") {
						shortcut.key = "Space";
					} else if (part === "enter") {
						shortcut.key = "Enter";
					} else {
						// Assume it's already a key code
						shortcut.key = part;
					}
					break;
			}
		}

		return shortcut.key ? shortcut : null;
	}

	/**
	 * Clean up event listeners
	 */
	public dispose(): void {
		document.removeEventListener("keydown", this.boundKeydownHandler);
		this.shortcuts.clear();
		this.handlers.clear();
	}
}
