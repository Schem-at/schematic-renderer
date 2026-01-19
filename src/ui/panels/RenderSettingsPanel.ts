// RenderSettingsPanel.ts - Panel for render settings

import { BasePanel, BasePanelOptions } from "./BasePanel";
import {
	UIColors,
	createToggle,
	createSlider,
	createSelect,
	createColorPicker,
	createSettingRow,
	createButton,
	createLabel,
} from "../UIComponents";
import * as THREE from "three";

export interface RenderSettings {
	hdriEnabled: boolean;
	backgroundColor: string;
	cameraMode: "perspective" | "isometric" | "perspective_fpv";
	isometricPitch: number;
	isometricYaw: number;
	ssaoEnabled: boolean;
	ssaoIntensity: number;
	ssaoRadius: number;
	smaaEnabled: boolean;
	gammaEnabled: boolean;
	gammaValue: number;
	showGrid: boolean;
	showAxes: boolean;
	ambientLightIntensity: number;
	directionalLightIntensity: number;
	autoOrbitEnabled: boolean;
	autoOrbitDuration: number;
}

const DEFAULT_RENDER_SETTINGS: RenderSettings = {
	hdriEnabled: true,
	backgroundColor: "#87ceeb",
	cameraMode: "perspective",
	isometricPitch: 35.264,
	isometricYaw: 45,
	ssaoEnabled: true,
	ssaoIntensity: 5.0,
	ssaoRadius: 1.0,
	smaaEnabled: true,
	gammaEnabled: true,
	gammaValue: 0.5,
	showGrid: false,
	showAxes: false,
	ambientLightIntensity: 2.2,
	directionalLightIntensity: 1.0,
	autoOrbitEnabled: false,
	autoOrbitDuration: 30,
};

/**
 * Render settings panel for managing visual and camera settings.
 */
export class RenderSettingsPanel extends BasePanel {
	private settings: RenderSettings = { ...DEFAULT_RENDER_SETTINGS };
	private cameraModeSelect!: HTMLSelectElement;
	private isometricControls!: HTMLDivElement;

	constructor(options: BasePanelOptions) {
		super(options);
		this.initializeSettingsFromRenderer();
		this.init();
		this.subscribeToEvents();
	}

	private initializeSettingsFromRenderer(): void {
		const cameraManager = this.renderer.cameraManager;
		if (cameraManager) {
			const activeCameraKey = (cameraManager as any).activeCameraKey;
			if (["isometric", "perspective", "perspective_fpv"].includes(activeCameraKey)) {
				this.settings.cameraMode = activeCameraKey;
			}

			const angles = cameraManager.getIsometricAngles();
			if (angles) {
				this.settings.isometricPitch = angles.pitch;
				this.settings.isometricYaw = angles.yaw;
			}

			this.settings.autoOrbitEnabled = cameraManager.isAutoOrbitEnabled();
		}

		const renderManager = this.renderer.renderManager;
		if (renderManager) {
			this.settings.hdriEnabled = !!this.renderer.options.hdri;
			this.settings.ssaoEnabled = renderManager.isSSAOEnabled();

			const presets = renderManager.getSSAOPresets();
			if (presets) {
				this.settings.ssaoIntensity = presets.perspective.intensity;
				this.settings.ssaoRadius = presets.perspective.aoRadius;
			}
		}

		const sceneManager = this.renderer.sceneManager;
		if (sceneManager) {
			this.settings.showGrid = sceneManager.showGrid;
			this.settings.showAxes = sceneManager.showAxes;

			const lights = sceneManager.getLights();
			const ambient = lights.get("ambientLight") as THREE.AmbientLight;
			const directional = lights.get("directionalLight") as THREE.DirectionalLight;
			if (ambient) this.settings.ambientLightIntensity = ambient.intensity;
			if (directional) this.settings.directionalLightIntensity = directional.intensity;
		}

		this.settings.gammaValue = this.renderer.options.gamma ?? 0.5;
	}

	protected buildContent(): void {
		const content = this.createContent();

		content.appendChild(this.createBackgroundSection());
		content.appendChild(this.createCameraSection());
		content.appendChild(this.createPostProcessingSection());
		content.appendChild(this.createSceneSection());
		content.appendChild(this.createLightingSection());
		content.appendChild(this.createFooter());

		this.container.appendChild(content);
	}

	private createBackgroundSection(): HTMLDivElement {
		const section = this.createSection("Background");

		const hdriToggle = createToggle(this.settings.hdriEnabled, (enabled) => {
			this.settings.hdriEnabled = enabled;
			this.applyHDRISetting(enabled);
			this.emitChange(this.settings);
		});
		section.appendChild(
			createSettingRow("HDRI Environment", hdriToggle, {
				tooltip: "Use HDRI for realistic lighting and reflections",
			})
		);

		const colorPicker = createColorPicker(this.settings.backgroundColor, (color) => {
			this.settings.backgroundColor = color;
			this.applyBackgroundColor(color);
			this.emitChange(this.settings);
		});
		section.appendChild(
			createSettingRow("Background Color", colorPicker, {
				tooltip: "Solid background color (visible when HDRI is disabled)",
			})
		);

		return section;
	}

	private createCameraSection(): HTMLDivElement {
		const section = this.createSection("Camera");

		this.cameraModeSelect = createSelect(
			[
				{ value: "perspective", label: "Perspective" },
				{ value: "isometric", label: "Isometric" },
				{ value: "perspective_fpv", label: "First Person" },
			],
			this.settings.cameraMode,
			(value) => {
				this.settings.cameraMode = value as RenderSettings["cameraMode"];
				this.applyCameraMode(this.settings.cameraMode);
				this.updateIsometricControlsVisibility();
				this.emitChange(this.settings);
			}
		);
		section.appendChild(createSettingRow("Camera Mode", this.cameraModeSelect));

		this.isometricControls = document.createElement("div");
		this.isometricControls.style.marginTop = "8px";

		const pitchLabel = createLabel("Pitch Angle");
		const pitchSlider = createSlider(this.settings.isometricPitch, {
			min: 10,
			max: 80,
			step: 1,
			formatValue: (v) => `${v.toFixed(0)}\u00B0`,
			onChange: (value) => {
				this.settings.isometricPitch = value;
				this.applyIsometricAngles();
				this.emitChange(this.settings);
			},
		});
		this.isometricControls.appendChild(pitchLabel);
		this.isometricControls.appendChild(pitchSlider);

		const yawLabel = createLabel("Rotation Angle");
		yawLabel.style.marginTop = "12px";
		const yawSlider = createSlider(this.settings.isometricYaw, {
			min: 0,
			max: 90,
			step: 1,
			formatValue: (v) => `${v.toFixed(0)}\u00B0`,
			onChange: (value) => {
				this.settings.isometricYaw = value;
				this.applyIsometricAngles();
				this.emitChange(this.settings);
			},
		});
		this.isometricControls.appendChild(yawLabel);
		this.isometricControls.appendChild(yawSlider);

		const resetIsoBtn = createButton(
			"Reset to True Isometric",
			() => {
				this.settings.isometricPitch = 35.264;
				this.settings.isometricYaw = 45;
				this.renderer.cameraManager.resetIsometricAngles(true);
				this.emitChange(this.settings);
			},
			{ primary: false }
		);
		resetIsoBtn.style.marginTop = "12px";
		resetIsoBtn.style.width = "100%";
		this.isometricControls.appendChild(resetIsoBtn);

		section.appendChild(this.isometricControls);
		this.updateIsometricControlsVisibility();

		// Auto-Orbit
		const orbitRow = document.createElement("div");
		orbitRow.style.marginTop = "16px";

		const autoOrbitToggle = createToggle(this.settings.autoOrbitEnabled, (enabled) => {
			this.settings.autoOrbitEnabled = enabled;
			this.renderer.setAutoOrbit(enabled);
			this.emitChange(this.settings);
		});
		orbitRow.appendChild(createSettingRow("Auto-Orbit", autoOrbitToggle));

		const durationSlider = createSlider(this.settings.autoOrbitDuration, {
			min: 5,
			max: 120,
			step: 5,
			formatValue: (v) => `${v}s`,
			onChange: (value) => {
				this.settings.autoOrbitDuration = value;
				this.renderer.setAutoOrbitDuration(value);
				this.emitChange(this.settings);
			},
		});
		orbitRow.appendChild(createSettingRow("Orbit Duration", durationSlider));

		section.appendChild(orbitRow);

		return section;
	}

	private createPostProcessingSection(): HTMLDivElement {
		const section = this.createSection("Post-Processing");

		const ssaoToggle = createToggle(this.settings.ssaoEnabled, (enabled) => {
			this.settings.ssaoEnabled = enabled;
			this.renderer.renderManager?.setSSAOEnabled(enabled);
			this.emitChange(this.settings);
		});
		section.appendChild(
			createSettingRow("Ambient Occlusion (SSAO)", ssaoToggle, {
				tooltip: "Adds soft shadows in corners and crevices",
			})
		);

		const intensitySlider = createSlider(this.settings.ssaoIntensity, {
			min: 0.5,
			max: 10,
			step: 0.5,
			formatValue: (v) => v.toFixed(1),
			onChange: (value) => {
				this.settings.ssaoIntensity = value;
				this.renderer.setSSAOParameters({ intensity: value });
				this.emitChange(this.settings);
			},
		});
		section.appendChild(createSettingRow("SSAO Intensity", intensitySlider));

		const radiusSlider = createSlider(this.settings.ssaoRadius, {
			min: 0.1,
			max: 3,
			step: 0.1,
			formatValue: (v) => v.toFixed(1),
			onChange: (value) => {
				this.settings.ssaoRadius = value;
				this.renderer.setSSAOParameters({ aoRadius: value });
				this.emitChange(this.settings);
			},
		});
		section.appendChild(createSettingRow("SSAO Radius", radiusSlider));

		const smaaToggle = createToggle(this.settings.smaaEnabled, (enabled) => {
			this.settings.smaaEnabled = enabled;
			if (enabled) {
				this.renderer.renderManager?.enableEffect("smaa");
			} else {
				this.renderer.renderManager?.disableEffect("smaa");
			}
			this.emitChange(this.settings);
		});
		section.appendChild(
			createSettingRow("Anti-Aliasing (SMAA)", smaaToggle, {
				tooltip: "Smooths jagged edges",
			})
		);

		const gammaToggle = createToggle(this.settings.gammaEnabled, (enabled) => {
			this.settings.gammaEnabled = enabled;
			if (enabled) {
				this.renderer.renderManager?.enableEffect("gammaCorrection");
			} else {
				this.renderer.renderManager?.disableEffect("gammaCorrection");
			}
			this.emitChange(this.settings);
		});
		section.appendChild(createSettingRow("Gamma Correction", gammaToggle));

		const gammaSlider = createSlider(this.settings.gammaValue, {
			min: 0.1,
			max: 1.5,
			step: 0.05,
			formatValue: (v) => v.toFixed(2),
			onChange: (value) => {
				this.settings.gammaValue = value;
				this.renderer.renderManager?.setGamma(value);
				this.emitChange(this.settings);
			},
		});
		section.appendChild(createSettingRow("Gamma Value", gammaSlider));

		return section;
	}

	private createSceneSection(): HTMLDivElement {
		const section = this.createSection("Scene Helpers");

		const gridToggle = createToggle(this.settings.showGrid, (enabled) => {
			this.settings.showGrid = enabled;
			this.renderer.sceneManager.showGrid = enabled;
			this.emitChange(this.settings);
		});
		section.appendChild(createSettingRow("Show Grid", gridToggle));

		const axesToggle = createToggle(this.settings.showAxes, (enabled) => {
			this.settings.showAxes = enabled;
			this.renderer.sceneManager.showAxes = enabled;
			this.emitChange(this.settings);
		});
		section.appendChild(createSettingRow("Show Axes", axesToggle));

		return section;
	}

	private createLightingSection(): HTMLDivElement {
		const section = this.createSection("Lighting", true);

		const ambientSlider = createSlider(this.settings.ambientLightIntensity, {
			min: 0,
			max: 5,
			step: 0.1,
			formatValue: (v) => v.toFixed(1),
			onChange: (value) => {
				this.settings.ambientLightIntensity = value;
				this.applyLightIntensity("ambientLight", value);
				this.emitChange(this.settings);
			},
		});
		section.appendChild(createSettingRow("Ambient Light", ambientSlider));

		const directionalSlider = createSlider(this.settings.directionalLightIntensity, {
			min: 0,
			max: 3,
			step: 0.1,
			formatValue: (v) => v.toFixed(1),
			onChange: (value) => {
				this.settings.directionalLightIntensity = value;
				this.applyLightIntensity("directionalLight", value);
				this.emitChange(this.settings);
			},
		});
		section.appendChild(createSettingRow("Directional Light", directionalSlider));

		return section;
	}

	private createFooter(): HTMLDivElement {
		const footer = document.createElement("div");
		Object.assign(footer.style, {
			padding: "16px",
			borderTop: `1px solid ${UIColors.border}`,
			display: "flex",
			gap: "8px",
		});

		const resetBtn = createButton("Reset All", () => this.resetToDefaults(), { primary: false });
		footer.appendChild(resetBtn);

		const focusBtn = createButton("Focus Camera", () => {
			this.renderer.cameraManager.focusOnSchematics({ animationDuration: 0.5 });
		});
		footer.appendChild(focusBtn);

		return footer;
	}

	private updateIsometricControlsVisibility(): void {
		if (this.isometricControls) {
			this.isometricControls.style.display =
				this.settings.cameraMode === "isometric" ? "block" : "none";
		}
	}

	private applyHDRISetting(enabled: boolean): void {
		if (!enabled) {
			this.renderer.sceneManager.scene.background = new THREE.Color(this.settings.backgroundColor);
		} else if (this.renderer.options.hdri) {
			this.renderer.renderManager?.setupHDRIBackground(this.renderer.options.hdri);
		}
	}

	private applyBackgroundColor(color: string): void {
		this.renderer.renderManager?.setIsometricBackgroundColor(color);
		if (!this.settings.hdriEnabled) {
			this.renderer.sceneManager.scene.background = new THREE.Color(color);
		}
	}

	private applyCameraMode(mode: RenderSettings["cameraMode"]): void {
		this.renderer.cameraManager.switchCameraPreset(mode);
	}

	private applyIsometricAngles(): void {
		if (this.settings.cameraMode === "isometric") {
			this.renderer.cameraManager.setIsometricAngles(
				this.settings.isometricPitch,
				this.settings.isometricYaw,
				true
			);
		}
	}

	private applyLightIntensity(lightName: string, intensity: number): void {
		const lights = this.renderer.sceneManager.getLights();
		const light = lights.get(lightName);
		if (light) {
			light.intensity = intensity;
		}
	}

	private resetToDefaults(): void {
		this.settings = { ...DEFAULT_RENDER_SETTINGS };
		this.applyAllSettings();
		this.rebuildUI();
		this.emitChange(this.settings);
	}

	private applyAllSettings(): void {
		this.applyHDRISetting(this.settings.hdriEnabled);
		this.applyBackgroundColor(this.settings.backgroundColor);
		this.applyCameraMode(this.settings.cameraMode);
		if (this.settings.cameraMode === "isometric") {
			this.applyIsometricAngles();
		}
		this.renderer.setAutoOrbit(this.settings.autoOrbitEnabled);
		this.renderer.setAutoOrbitDuration(this.settings.autoOrbitDuration);
		this.renderer.renderManager?.setSSAOEnabled(this.settings.ssaoEnabled);
		this.renderer.setSSAOParameters({
			intensity: this.settings.ssaoIntensity,
			aoRadius: this.settings.ssaoRadius,
		});
		if (this.settings.smaaEnabled) {
			this.renderer.renderManager?.enableEffect("smaa");
		} else {
			this.renderer.renderManager?.disableEffect("smaa");
		}
		if (this.settings.gammaEnabled) {
			this.renderer.renderManager?.enableEffect("gammaCorrection");
		} else {
			this.renderer.renderManager?.disableEffect("gammaCorrection");
		}
		this.renderer.renderManager?.setGamma(this.settings.gammaValue);
		this.renderer.sceneManager.showGrid = this.settings.showGrid;
		this.renderer.sceneManager.showAxes = this.settings.showAxes;
		this.applyLightIntensity("ambientLight", this.settings.ambientLightIntensity);
		this.applyLightIntensity("directionalLight", this.settings.directionalLightIntensity);
	}

	private rebuildUI(): void {
		this.container.innerHTML = "";
		this.buildContent();
	}

	private subscribeToEvents(): void {
		this.renderer.cameraManager.on("cameraChanged", (event) => {
			if (event.newCamera !== this.settings.cameraMode) {
				this.settings.cameraMode = event.newCamera;
				if (this.cameraModeSelect) {
					this.cameraModeSelect.value = event.newCamera;
				}
				this.updateIsometricControlsVisibility();
			}
		});
	}

	// Public API

	public getSettings(): RenderSettings {
		return { ...this.settings };
	}

	public setSettings(settings: Partial<RenderSettings>): void {
		this.settings = { ...this.settings, ...settings };
		this.applyAllSettings();
		this.emitChange(this.settings);
	}

	public setCameraMode(mode: RenderSettings["cameraMode"]): void {
		this.settings.cameraMode = mode;
		this.applyCameraMode(mode);
		if (this.cameraModeSelect) {
			this.cameraModeSelect.value = mode;
		}
		this.updateIsometricControlsVisibility();
		this.emitChange(this.settings);
	}

	public setSSAOEnabled(enabled: boolean): void {
		this.settings.ssaoEnabled = enabled;
		this.renderer.renderManager?.setSSAOEnabled(enabled);
		this.emitChange(this.settings);
	}

	public setBackgroundColor(color: string): void {
		this.settings.backgroundColor = color;
		this.applyBackgroundColor(color);
		this.emitChange(this.settings);
	}

	public setHDRIEnabled(enabled: boolean): void {
		this.settings.hdriEnabled = enabled;
		this.applyHDRISetting(enabled);
		this.emitChange(this.settings);
	}
}
