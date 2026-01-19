// ControlsPanel.ts - Panel for camera and movement controls

import { BasePanel, BasePanelOptions } from "./BasePanel";
import { FlyControlsKeybinds } from "../../managers/FlyControls";
import {
	UIColors,
	createToggle,
	createSlider,
	createSettingRow,
	createButton,
} from "../UIComponents";

export interface ControlsSettings {
	flyModeEnabled: boolean;
	flySpeed: number;
	sprintMultiplier: number;
	keybinds: FlyControlsKeybinds;
	rotateSpeed: number;
	panSpeed: number;
	zoomSpeed: number;
	dampingFactor: number;
}

const DEFAULT_CONTROLS_SETTINGS: ControlsSettings = {
	flyModeEnabled: false,
	flySpeed: 10.0,
	sprintMultiplier: 2.5,
	keybinds: {
		forward: "KeyW",
		backward: "KeyS",
		left: "KeyA",
		right: "KeyD",
		up: "Space",
		down: "KeyC",
		sprint: "ShiftLeft",
	},
	rotateSpeed: 0.8,
	panSpeed: 1.0,
	zoomSpeed: 1.2,
	dampingFactor: 0.08,
};

/**
 * Controls panel for managing camera and movement settings.
 */
export class ControlsPanel extends BasePanel {
	private settings: ControlsSettings = { ...DEFAULT_CONTROLS_SETTINGS };
	private keybindButtons: Map<string, HTMLButtonElement> = new Map();
	private rebindingKey: keyof FlyControlsKeybinds | null = null;
	private rebindOverlay: HTMLDivElement | null = null;
	private rebindKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
	private flyModeToggle!: HTMLLabelElement;
	private infoText!: HTMLDivElement;

	constructor(options: BasePanelOptions) {
		super(options);
		this.updateSettingsFromRenderer();
		this.init(); // Build content after settings are initialized
		this.setupKeybindCapture();
	}

	private updateSettingsFromRenderer(): void {
		const cameraManager = this.renderer.cameraManager;

		// Get fly controls settings
		this.settings.flyModeEnabled = cameraManager.isFlyControlsEnabled();
		const flySettings = cameraManager.getFlyControlsSettings();
		if (flySettings) {
			this.settings.flySpeed = flySettings.moveSpeed;
			this.settings.sprintMultiplier = flySettings.sprintMultiplier;
			this.settings.keybinds = { ...flySettings.keybinds };
		}

		const orbitControls = this.getActiveOrbitControls();
		if (orbitControls) {
			this.settings.rotateSpeed = orbitControls.rotateSpeed;
			this.settings.panSpeed = orbitControls.panSpeed;
			this.settings.zoomSpeed = orbitControls.zoomSpeed;
			this.settings.dampingFactor = orbitControls.dampingFactor;
		}
	}

	private getActiveOrbitControls(): any | null {
		const activeKey = this.renderer.cameraManager.activeControlKey;
		if (activeKey && activeKey.includes("orbit")) {
			const controls = this.renderer.cameraManager.controls.get(activeKey);
			return controls || null;
		}
		for (const [key, controls] of this.renderer.cameraManager.controls) {
			if (key.includes("orbit")) {
				return controls;
			}
		}
		return null;
	}

	protected buildContent(): void {
		const content = this.createContent();

		// Control Mode Section
		content.appendChild(this.createControlModeSection());

		// Movement Settings Section
		content.appendChild(this.createMovementSection());

		// Key Bindings Section
		content.appendChild(this.createKeybindingsSection());

		// Orbit Settings Section
		content.appendChild(this.createOrbitSection());

		// Footer
		content.appendChild(this.createFooter());

		this.container.appendChild(content);
	}

	private createControlModeSection(): HTMLDivElement {
		const section = this.createSection("Control Mode");

		this.flyModeToggle = createToggle(this.settings.flyModeEnabled, (enabled) => {
			this.settings.flyModeEnabled = enabled;
			this.applyControlMode(enabled);
			this.emitChange(this.settings);
		});

		section.appendChild(
			createSettingRow("First-Person Fly Mode", this.flyModeToggle, {
				tooltip: "Switch between orbit controls and first-person fly mode",
			})
		);

		this.infoText = this.createInfoText(
			this.settings.flyModeEnabled
				? "Fly mode enabled. Click the canvas to enter, ESC to exit. WASD to move, Space/C for up/down, Shift to sprint."
				: "Orbit mode active. Use mouse to rotate, pan, and zoom."
		);
		section.appendChild(this.infoText);

		return section;
	}

	private createMovementSection(): HTMLDivElement {
		const section = this.createSection("Fly Mode Settings");

		const flySpeedSlider = createSlider(this.settings.flySpeed, {
			min: 1,
			max: 50,
			step: 0.5,
			formatValue: (v) => v.toFixed(1),
			onChange: (value) => {
				this.settings.flySpeed = value;
				this.renderer.cameraManager.setFlyControlsSettings({ moveSpeed: value });
				this.emitChange(this.settings);
			},
		});
		section.appendChild(
			createSettingRow("Fly Speed", flySpeedSlider, {
				tooltip: "Base movement speed in units per second",
			})
		);

		const sprintSlider = createSlider(this.settings.sprintMultiplier, {
			min: 1,
			max: 5,
			step: 0.1,
			formatValue: (v) => `${v.toFixed(1)}x`,
			onChange: (value) => {
				this.settings.sprintMultiplier = value;
				this.renderer.cameraManager.setFlyControlsSettings({ sprintMultiplier: value });
				this.emitChange(this.settings);
			},
		});
		section.appendChild(
			createSettingRow("Sprint Multiplier", sprintSlider, {
				tooltip: "Speed multiplier when holding sprint key",
			})
		);

		return section;
	}

	private createKeybindingsSection(): HTMLDivElement {
		const section = this.createSection("Fly Mode Key Bindings");

		const keybindNames: Array<{ key: keyof FlyControlsKeybinds; label: string }> = [
			{ key: "forward", label: "Forward" },
			{ key: "backward", label: "Backward" },
			{ key: "left", label: "Left" },
			{ key: "right", label: "Right" },
			{ key: "up", label: "Up (Ascend)" },
			{ key: "down", label: "Down (Descend)" },
			{ key: "sprint", label: "Sprint" },
		];

		for (const { key, label } of keybindNames) {
			const row = this.createKeybindRow(key, label);
			section.appendChild(row);
		}

		return section;
	}

	private createKeybindRow(key: keyof FlyControlsKeybinds, label: string): HTMLDivElement {
		const row = document.createElement("div");
		Object.assign(row.style, {
			display: "flex",
			justifyContent: "space-between",
			alignItems: "center",
			marginBottom: "8px",
		});

		const labelEl = document.createElement("span");
		labelEl.textContent = label;
		Object.assign(labelEl.style, {
			fontSize: "12px",
			color: UIColors.textMuted,
		});
		row.appendChild(labelEl);

		const button = document.createElement("button");
		button.textContent = this.formatKeyDisplay(this.settings.keybinds[key]);
		Object.assign(button.style, {
			padding: "4px 12px",
			minWidth: "60px",
			border: `1px solid ${UIColors.inputBorder}`,
			borderRadius: "4px",
			backgroundColor: UIColors.inputBackground,
			color: UIColors.text,
			fontSize: "12px",
			cursor: "pointer",
			fontFamily: "monospace",
			textAlign: "center",
		});

		button.addEventListener("click", () => {
			this.startRebinding(key, button);
		});

		button.addEventListener("mouseenter", () => {
			if (this.rebindingKey !== key) {
				button.style.backgroundColor = UIColors.hoverBackground;
			}
		});
		button.addEventListener("mouseleave", () => {
			if (this.rebindingKey !== key) {
				button.style.backgroundColor = UIColors.inputBackground;
			}
		});

		this.keybindButtons.set(key, button);
		row.appendChild(button);

		return row;
	}

	private formatKeyDisplay(key: string): string {
		// Handle keyboard event code format (e.g., "KeyW", "Space", "ShiftLeft")
		const keyMap: Record<string, string> = {
			Space: "Space",
			ShiftLeft: "Shift",
			ShiftRight: "R Shift",
			ControlLeft: "Ctrl",
			ControlRight: "R Ctrl",
			AltLeft: "Alt",
			AltRight: "R Alt",
			ArrowUp: "\u2191",
			ArrowDown: "\u2193",
			ArrowLeft: "\u2190",
			ArrowRight: "\u2192",
			Tab: "Tab",
			Enter: "Enter",
			Backspace: "Bksp",
			Escape: "Esc",
		};

		if (keyMap[key]) {
			return keyMap[key];
		}

		// Handle "Key" prefix (e.g., "KeyW" -> "W")
		if (key.startsWith("Key")) {
			return key.slice(3);
		}

		// Handle "Digit" prefix (e.g., "Digit1" -> "1")
		if (key.startsWith("Digit")) {
			return key.slice(5);
		}

		return key;
	}

	private startRebinding(key: keyof FlyControlsKeybinds, button: HTMLButtonElement): void {
		if (this.rebindingKey) {
			this.cancelRebinding();
		}

		this.rebindingKey = key;
		button.textContent = "Press key...";
		button.style.backgroundColor = UIColors.activeBackground;
		button.style.borderColor = UIColors.primary;

		this.showRebindOverlay();
	}

	private showRebindOverlay(): void {
		this.rebindOverlay = document.createElement("div");
		Object.assign(this.rebindOverlay.style, {
			position: "fixed",
			top: "0",
			left: "0",
			right: "0",
			bottom: "0",
			backgroundColor: "rgba(0, 0, 0, 0.5)",
			zIndex: "10000",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
		});

		const message = document.createElement("div");
		Object.assign(message.style, {
			padding: "20px 40px",
			backgroundColor: UIColors.panelBackground,
			borderRadius: "8px",
			color: UIColors.text,
			fontSize: "16px",
			textAlign: "center",
			border: `1px solid ${UIColors.border}`,
		});
		message.innerHTML = `
			<div style="margin-bottom: 8px;">Press any key to bind</div>
			<div style="font-size: 12px; color: ${UIColors.textDim};">
				Press Escape to cancel
			</div>
		`;
		this.rebindOverlay.appendChild(message);

		this.rebindOverlay.addEventListener("click", () => {
			this.cancelRebinding();
		});

		document.body.appendChild(this.rebindOverlay);
	}

	private hideRebindOverlay(): void {
		if (this.rebindOverlay) {
			this.rebindOverlay.remove();
			this.rebindOverlay = null;
		}
	}

	private cancelRebinding(): void {
		if (this.rebindingKey) {
			const button = this.keybindButtons.get(this.rebindingKey);
			if (button) {
				button.textContent = this.formatKeyDisplay(this.settings.keybinds[this.rebindingKey]);
				button.style.backgroundColor = UIColors.inputBackground;
				button.style.borderColor = UIColors.inputBorder;
			}
			this.rebindingKey = null;
		}
		this.hideRebindOverlay();
	}

	private completeRebinding(newKey: string): void {
		if (!this.rebindingKey) return;

		const key = this.rebindingKey;
		this.settings.keybinds[key] = newKey;

		const button = this.keybindButtons.get(key);
		if (button) {
			button.textContent = this.formatKeyDisplay(newKey);
			button.style.backgroundColor = UIColors.inputBackground;
			button.style.borderColor = UIColors.inputBorder;
		}

		// Update fly controls keybinds
		this.renderer.cameraManager.setFlyControlsSettings({
			keybinds: { [key]: newKey },
		});

		this.rebindingKey = null;
		this.hideRebindOverlay();
		this.emitChange(this.settings);
	}

	private setupKeybindCapture(): void {
		this.rebindKeydownHandler = (e: KeyboardEvent) => {
			if (!this.rebindingKey) return;

			e.preventDefault();
			e.stopPropagation();

			if (e.key === "Escape") {
				this.cancelRebinding();
				return;
			}

			// Use e.code for consistent key identification (e.g., "KeyW", "Space")
			this.completeRebinding(e.code);
		};

		document.addEventListener("keydown", this.rebindKeydownHandler, true);
	}

	private createOrbitSection(): HTMLDivElement {
		const section = this.createSection("Orbit Controls", true);

		const rotateSlider = createSlider(this.settings.rotateSpeed, {
			min: 0.1,
			max: 2.0,
			step: 0.1,
			formatValue: (v) => v.toFixed(1),
			onChange: (value) => {
				this.settings.rotateSpeed = value;
				this.applyOrbitSetting("rotateSpeed", value);
				this.emitChange(this.settings);
			},
		});
		section.appendChild(createSettingRow("Rotate Speed", rotateSlider));

		const panSlider = createSlider(this.settings.panSpeed, {
			min: 0.1,
			max: 3.0,
			step: 0.1,
			formatValue: (v) => v.toFixed(1),
			onChange: (value) => {
				this.settings.panSpeed = value;
				this.applyOrbitSetting("panSpeed", value);
				this.emitChange(this.settings);
			},
		});
		section.appendChild(createSettingRow("Pan Speed", panSlider));

		const zoomSlider = createSlider(this.settings.zoomSpeed, {
			min: 0.5,
			max: 3.0,
			step: 0.1,
			formatValue: (v) => v.toFixed(1),
			onChange: (value) => {
				this.settings.zoomSpeed = value;
				this.applyOrbitSetting("zoomSpeed", value);
				this.emitChange(this.settings);
			},
		});
		section.appendChild(createSettingRow("Zoom Speed", zoomSlider));

		const dampingSlider = createSlider(this.settings.dampingFactor, {
			min: 0.01,
			max: 0.3,
			step: 0.01,
			formatValue: (v) => v.toFixed(2),
			onChange: (value) => {
				this.settings.dampingFactor = value;
				this.applyOrbitSetting("dampingFactor", value);
				this.emitChange(this.settings);
			},
		});
		section.appendChild(
			createSettingRow("Damping", dampingSlider, {
				tooltip: "Lower = smoother, higher = more responsive",
			})
		);

		return section;
	}

	private applyOrbitSetting(
		setting: "rotateSpeed" | "panSpeed" | "zoomSpeed" | "dampingFactor",
		value: number
	): void {
		this.renderer.cameraManager.controls.forEach((controls, key) => {
			if (key.includes("orbit") && (controls as any)[setting] !== undefined) {
				(controls as any)[setting] = value;
			}
		});
	}

	private applyControlMode(flyEnabled: boolean): void {
		if (flyEnabled) {
			this.renderer.cameraManager.enableFlyControls();
		} else {
			this.renderer.cameraManager.disableFlyControls();
		}

		if (this.infoText) {
			this.infoText.textContent = flyEnabled
				? "Fly mode enabled. Click the canvas to enter, ESC to exit. WASD to move, Space/C for up/down, Shift to sprint."
				: "Orbit mode active. Use mouse to rotate, pan, and zoom.";
		}
	}

	private createFooter(): HTMLDivElement {
		const footer = document.createElement("div");
		Object.assign(footer.style, {
			padding: "16px",
			borderTop: `1px solid ${UIColors.border}`,
		});

		const resetBtn = createButton("Reset Defaults", () => this.resetToDefaults(), {
			primary: false,
		});
		resetBtn.style.width = "100%";
		footer.appendChild(resetBtn);

		return footer;
	}

	private resetToDefaults(): void {
		this.settings = { ...DEFAULT_CONTROLS_SETTINGS };
		this.applyControlMode(this.settings.flyModeEnabled);

		// Reset fly controls settings
		this.renderer.cameraManager.setFlyControlsSettings({
			moveSpeed: this.settings.flySpeed,
			sprintMultiplier: this.settings.sprintMultiplier,
			keybinds: this.settings.keybinds,
		});

		this.applyOrbitSetting("rotateSpeed", this.settings.rotateSpeed);
		this.applyOrbitSetting("panSpeed", this.settings.panSpeed);
		this.applyOrbitSetting("zoomSpeed", this.settings.zoomSpeed);
		this.applyOrbitSetting("dampingFactor", this.settings.dampingFactor);

		this.rebuildUI();
		this.emitChange(this.settings);
	}

	private rebuildUI(): void {
		this.container.innerHTML = "";
		this.keybindButtons.clear();
		this.buildContent();
	}

	// Public API

	public getSettings(): ControlsSettings {
		return { ...this.settings };
	}

	public setSettings(settings: Partial<ControlsSettings>): void {
		this.settings = { ...this.settings, ...settings };

		if (settings.flyModeEnabled !== undefined) {
			this.applyControlMode(settings.flyModeEnabled);
		}

		// Update fly controls settings
		const flySettings: any = {};
		if (settings.flySpeed !== undefined) flySettings.moveSpeed = settings.flySpeed;
		if (settings.sprintMultiplier !== undefined)
			flySettings.sprintMultiplier = settings.sprintMultiplier;
		if (settings.keybinds) flySettings.keybinds = settings.keybinds;

		if (Object.keys(flySettings).length > 0) {
			this.renderer.cameraManager.setFlyControlsSettings(flySettings);
		}

		this.rebuildUI();
		this.emitChange(this.settings);
	}

	public setFlyModeEnabled(enabled: boolean): void {
		this.settings.flyModeEnabled = enabled;
		this.applyControlMode(enabled);
		this.emitChange(this.settings);
	}

	public setKeybind(action: keyof FlyControlsKeybinds, key: string): void {
		this.settings.keybinds[action] = key;
		this.renderer.cameraManager.setFlyControlsSettings({
			keybinds: { [action]: key },
		});

		const button = this.keybindButtons.get(action);
		if (button) {
			button.textContent = this.formatKeyDisplay(key);
		}

		this.emitChange(this.settings);
	}

	public override dispose(): void {
		this.hideRebindOverlay();
		this.keybindButtons.clear();
		if (this.rebindKeydownHandler) {
			document.removeEventListener("keydown", this.rebindKeydownHandler, true);
		}
		super.dispose();
	}
}
