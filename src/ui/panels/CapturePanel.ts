// CapturePanel.ts - Panel for screenshot and recording

import { BasePanel, BasePanelOptions } from "./BasePanel";
import {
	UIColors,
	createToggle,
	createSlider,
	createSelect,
	createSettingRow,
	createButton,
	createLabel,
	createNumberInput,
} from "../UIComponents";

export interface ScreenshotSettings {
	width: number;
	height: number;
	quality: number;
	format: "image/png" | "image/jpeg";
}

export interface RecordingSettings {
	width: number;
	height: number;
	frameRate: number;
	duration: number;
}

const DEFAULT_SCREENSHOT_PRESETS = [
	{ label: "1080p (1920\u00D71080)", width: 1920, height: 1080 },
	{ label: "1440p (2560\u00D71440)", width: 2560, height: 1440 },
	{ label: "4K (3840\u00D72160)", width: 3840, height: 2160 },
	{ label: "Square (2048\u00D72048)", width: 2048, height: 2048 },
	{ label: "Custom", width: 0, height: 0 },
];

/**
 * Capture panel for screenshots and video recording.
 */
export class CapturePanel extends BasePanel {
	private screenshotSettings: ScreenshotSettings = {
		width: 1920,
		height: 1080,
		quality: 0.95,
		format: "image/png",
	};

	private recordingSettings: RecordingSettings = {
		width: 1920,
		height: 1080,
		frameRate: 60,
		duration: 10,
	};

	private pathVisible: boolean = false;
	private isRecording: boolean = false;
	private customSizeContainer!: HTMLDivElement;
	private recordingStatus!: HTMLDivElement;
	private progressBar!: HTMLDivElement;
	private progressText!: HTMLDivElement;

	constructor(options: BasePanelOptions) {
		super(options);
		this.init();
	}

	protected buildContent(): void {
		const content = this.createContent();

		content.appendChild(this.createScreenshotSection());
		content.appendChild(this.createCameraPathSection());
		content.appendChild(this.createRecordingSection());

		this.container.appendChild(content);
	}

	private createScreenshotSection(): HTMLDivElement {
		const section = this.createSection("Screenshot");

		const presetSelect = createSelect(
			DEFAULT_SCREENSHOT_PRESETS.map((p) => ({
				value: `${p.width}x${p.height}`,
				label: p.label,
			})),
			`${this.screenshotSettings.width}x${this.screenshotSettings.height}`,
			(value) => {
				if (value === "0x0") {
					this.customSizeContainer.style.display = "block";
				} else {
					this.customSizeContainer.style.display = "none";
					const [w, h] = value.split("x").map(Number);
					this.screenshotSettings.width = w;
					this.screenshotSettings.height = h;
				}
			}
		);
		section.appendChild(createSettingRow("Resolution", presetSelect));

		// Custom size container
		this.customSizeContainer = document.createElement("div");
		this.customSizeContainer.style.display = "none";
		this.customSizeContainer.style.marginTop = "8px";

		const sizeRow = document.createElement("div");
		Object.assign(sizeRow.style, {
			display: "flex",
			gap: "12px",
			alignItems: "center",
		});

		const widthContainer = document.createElement("div");
		widthContainer.style.flex = "1";
		widthContainer.appendChild(createLabel("Width"));
		const widthInput = createNumberInput(this.screenshotSettings.width, {
			min: 100,
			max: 8192,
			step: 1,
			onChange: (val) => {
				this.screenshotSettings.width = val;
			},
		});
		widthContainer.appendChild(widthInput);
		sizeRow.appendChild(widthContainer);

		const heightContainer = document.createElement("div");
		heightContainer.style.flex = "1";
		heightContainer.appendChild(createLabel("Height"));
		const heightInput = createNumberInput(this.screenshotSettings.height, {
			min: 100,
			max: 8192,
			step: 1,
			onChange: (val) => {
				this.screenshotSettings.height = val;
			},
		});
		heightContainer.appendChild(heightInput);
		sizeRow.appendChild(heightContainer);

		this.customSizeContainer.appendChild(sizeRow);
		section.appendChild(this.customSizeContainer);

		const formatSelect = createSelect(
			[
				{ value: "image/png", label: "PNG (Lossless)" },
				{ value: "image/jpeg", label: "JPEG (Smaller)" },
			],
			this.screenshotSettings.format,
			(value) => {
				this.screenshotSettings.format = value as ScreenshotSettings["format"];
			}
		);
		section.appendChild(createSettingRow("Format", formatSelect));

		const qualitySlider = createSlider(this.screenshotSettings.quality * 100, {
			min: 50,
			max: 100,
			step: 5,
			formatValue: (v) => `${v}%`,
			onChange: (value) => {
				this.screenshotSettings.quality = value / 100;
			},
		});
		section.appendChild(createSettingRow("Quality", qualitySlider));

		const buttonContainer = document.createElement("div");
		buttonContainer.style.marginTop = "12px";

		const screenshotBtn = createButton("Take Screenshot", () => this.takeScreenshot());
		screenshotBtn.style.width = "100%";
		buttonContainer.appendChild(screenshotBtn);

		section.appendChild(buttonContainer);

		return section;
	}

	private createCameraPathSection(): HTMLDivElement {
		const section = this.createSection("Camera Path (Orbit)");

		const pathToggle = createToggle(this.pathVisible, (enabled) => {
			this.pathVisible = enabled;
			if (enabled) {
				this.renderer.cameraManager.showPathVisualization("circularPath");
			} else {
				this.renderer.cameraManager.hidePathVisualization("circularPath");
			}
		});
		section.appendChild(
			createSettingRow("Show Path", pathToggle, {
				tooltip: "Display the camera orbit path in the scene",
			})
		);

		const path = this.renderer.cameraManager.cameraPathManager.getPath("circularPath");
		const initialRadius = (path as any)?.getRadius?.() ?? 20;
		const initialHeight = (path as any)?.getHeight?.() ?? 10;

		const radiusSlider = createSlider(initialRadius, {
			min: 5,
			max: 200,
			step: 1,
			formatValue: (v) => `${v.toFixed(0)}`,
			onChange: (value) => {
				this.updatePathParameter("radius", value);
			},
		});
		section.appendChild(createSettingRow("Radius", radiusSlider));

		const heightSlider = createSlider(initialHeight, {
			min: -50,
			max: 100,
			step: 1,
			formatValue: (v) => `${v.toFixed(0)}`,
			onChange: (value) => {
				this.updatePathParameter("height", value);
			},
		});
		section.appendChild(createSettingRow("Height", heightSlider));

		const controlsRow = document.createElement("div");
		Object.assign(controlsRow.style, {
			display: "flex",
			gap: "8px",
			marginTop: "12px",
		});

		const fitBtn = createButton(
			"Auto Fit",
			() => {
				this.renderer.cameraManager.cameraPathManager.fitCircularPathToSchematics("circularPath");
				this.refreshPathVisualization();
			},
			{ primary: false }
		);
		fitBtn.style.flex = "1";
		controlsRow.appendChild(fitBtn);

		const previewBtn = createButton("Preview", () => this.previewPath(), { primary: false });
		previewBtn.style.flex = "1";
		controlsRow.appendChild(previewBtn);

		section.appendChild(controlsRow);

		return section;
	}

	private createRecordingSection(): HTMLDivElement {
		const section = this.createSection("Recording", true);

		const ffmpegAvailable = !!this.renderer.options.ffmpeg;

		if (!ffmpegAvailable) {
			const warningDiv = document.createElement("div");
			Object.assign(warningDiv.style, {
				padding: "12px",
				backgroundColor: "rgba(255, 152, 0, 0.15)",
				borderRadius: "4px",
				fontSize: "12px",
				color: UIColors.warning,
				marginBottom: "12px",
			});
			warningDiv.innerHTML = `
				<strong>FFmpeg not available</strong><br>
				Video recording requires FFmpeg. Pass it to the renderer options to enable recording.
			`;
			section.appendChild(warningDiv);
		}

		const recordPresetSelect = createSelect(
			[
				{ value: "1920x1080", label: "1080p (1920\u00D71080)" },
				{ value: "2560x1440", label: "1440p (2560\u00D71440)" },
				{ value: "3840x2160", label: "4K (3840\u00D72160)" },
			],
			`${this.recordingSettings.width}x${this.recordingSettings.height}`,
			(value) => {
				const [w, h] = value.split("x").map(Number);
				this.recordingSettings.width = w;
				this.recordingSettings.height = h;
			}
		);
		section.appendChild(createSettingRow("Resolution", recordPresetSelect));

		const fpsSelect = createSelect(
			[
				{ value: "30", label: "30 FPS" },
				{ value: "60", label: "60 FPS" },
			],
			this.recordingSettings.frameRate.toString(),
			(value) => {
				this.recordingSettings.frameRate = parseInt(value);
			}
		);
		section.appendChild(createSettingRow("Frame Rate", fpsSelect));

		const durationSlider = createSlider(this.recordingSettings.duration, {
			min: 5,
			max: 60,
			step: 5,
			formatValue: (v) => `${v}s`,
			onChange: (value) => {
				this.recordingSettings.duration = value;
			},
		});
		section.appendChild(createSettingRow("Duration", durationSlider));

		// Recording status
		this.recordingStatus = document.createElement("div");
		this.recordingStatus.style.display = "none";
		Object.assign(this.recordingStatus.style, {
			marginTop: "12px",
			padding: "12px",
			backgroundColor: "rgba(255, 255, 255, 0.05)",
			borderRadius: "4px",
		});

		this.progressText = document.createElement("div");
		Object.assign(this.progressText.style, {
			fontSize: "12px",
			color: UIColors.textMuted,
			marginBottom: "8px",
		});
		this.recordingStatus.appendChild(this.progressText);

		this.progressBar = document.createElement("div");
		Object.assign(this.progressBar.style, {
			width: "100%",
			height: "4px",
			backgroundColor: "rgba(255, 255, 255, 0.1)",
			borderRadius: "2px",
			overflow: "hidden",
		});

		const progressFill = document.createElement("div");
		Object.assign(progressFill.style, {
			width: "0%",
			height: "100%",
			backgroundColor: UIColors.primary,
			transition: "width 0.1s",
		});
		this.progressBar.appendChild(progressFill);
		this.recordingStatus.appendChild(this.progressBar);

		section.appendChild(this.recordingStatus);

		const buttonContainer = document.createElement("div");
		buttonContainer.style.marginTop = "12px";

		const recordBtn = createButton("Start Recording", () => this.startRecording(), {
			disabled: !ffmpegAvailable,
		});
		recordBtn.style.width = "100%";
		if (!ffmpegAvailable) {
			recordBtn.style.opacity = "0.5";
			recordBtn.style.cursor = "not-allowed";
		}
		buttonContainer.appendChild(recordBtn);

		section.appendChild(buttonContainer);

		return section;
	}

	private updatePathParameter(param: "radius" | "height", value: number): void {
		const path = this.renderer.cameraManager.cameraPathManager.getPath("circularPath");
		if (!path || typeof (path as any).updateParameters !== "function") return;

		const params: any = {};
		params[param] = value;
		(path as any).updateParameters(params);

		this.refreshPathVisualization();
	}

	private refreshPathVisualization(): void {
		if (this.pathVisible) {
			this.renderer.cameraManager.hidePathVisualization("circularPath");
			this.renderer.cameraManager.showPathVisualization("circularPath");
		}
	}

	private previewPath(): void {
		// Start a quick camera animation along the path
		const path = this.renderer.cameraManager.cameraPathManager.getPath("circularPath");
		if (path) {
			this.renderer.cameraManager.animateCameraAlongPath({
				pathName: "circularPath",
				totalFrames: 300, // ~5 seconds at 60fps
				targetFps: 60,
			});
		}
	}

	// Public API

	public async takeScreenshot(): Promise<Blob | null> {
		const blob = await this.renderer.cameraManager.recordingManager.takeScreenshot({
			width: this.screenshotSettings.width,
			height: this.screenshotSettings.height,
			format: this.screenshotSettings.format,
			quality: this.screenshotSettings.quality,
		});

		if (blob) {
			// Auto-download
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `screenshot_${Date.now()}.${this.screenshotSettings.format === "image/png" ? "png" : "jpg"}`;
			a.click();
			URL.revokeObjectURL(url);
		}

		return blob;
	}

	public async startRecording(): Promise<void> {
		if (this.isRecording || !this.renderer.options.ffmpeg) return;

		this.isRecording = true;
		this.recordingStatus.style.display = "block";
		this.progressText.textContent = "Recording...";

		try {
			// Start recording
			await this.renderer.cameraManager.recordingManager.startRecording(
				this.recordingSettings.duration,
				{
					width: this.recordingSettings.width,
					height: this.recordingSettings.height,
					frameRate: this.recordingSettings.frameRate,
					onProgress: (progress: number) => {
						const progressFill = this.progressBar.firstChild as HTMLDivElement;
						if (progressFill) {
							progressFill.style.width = `${progress * 100}%`;
						}
						this.progressText.textContent = `Recording... ${Math.round(progress * 100)}%`;
					},
				}
			);

			// Recording completed - handled by RecordingManager
			this.progressText.textContent = "Recording complete!";
			setTimeout(() => {
				this.recordingStatus.style.display = "none";
			}, 2000);
		} catch (error) {
			console.error("Recording error:", error);
			this.progressText.textContent = `Recording failed: ${error}`;
		} finally {
			this.isRecording = false;
		}
	}

	public getScreenshotSettings(): ScreenshotSettings {
		return { ...this.screenshotSettings };
	}

	public getRecordingSettings(): RecordingSettings {
		return { ...this.recordingSettings };
	}
}
