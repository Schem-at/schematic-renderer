// PerformancePanel.ts - Panel for performance monitoring

import { BasePanel, BasePanelOptions } from "./BasePanel";
import { UIColors, createSettingRow, createToggle, createSlider } from "../UIComponents";

interface PerformanceMetrics {
	fps: number;
	frameTime: number;
	drawCalls: number;
	triangles: number;
	geometries: number;
	textures: number;
	memory: number;
}

/**
 * Performance panel for monitoring render performance.
 */
export class PerformancePanel extends BasePanel {
	private updateInterval: number | null = null;
	private metricsContainer!: HTMLDivElement;
	private metricElements: Map<string, HTMLSpanElement> = new Map();
	private autoUpdate: boolean = true;

	constructor(options: BasePanelOptions) {
		super(options);
		this.init();
	}

	protected buildContent(): void {
		const content = this.createContent();

		content.appendChild(this.createMetricsSection());
		content.appendChild(this.createSettingsSection());

		this.container.appendChild(content);
	}

	private createMetricsSection(): HTMLDivElement {
		const section = this.createSection("Performance Metrics");

		this.metricsContainer = document.createElement("div");
		Object.assign(this.metricsContainer.style, {
			display: "grid",
			gridTemplateColumns: "1fr 1fr",
			gap: "8px",
		});

		const metrics = [
			{ key: "fps", label: "FPS", unit: "" },
			{ key: "frameTime", label: "Frame", unit: "ms" },
			{ key: "drawCalls", label: "Draw Calls", unit: "" },
			{ key: "triangles", label: "Triangles", unit: "" },
			{ key: "geometries", label: "Geometries", unit: "" },
			{ key: "textures", label: "Textures", unit: "" },
			{ key: "memory", label: "Memory", unit: "MB" },
		];

		for (const metric of metrics) {
			const card = this.createMetricCard(metric.key, metric.label, metric.unit);
			this.metricsContainer.appendChild(card);
		}

		section.appendChild(this.metricsContainer);

		return section;
	}

	private createMetricCard(key: string, label: string, unit: string): HTMLDivElement {
		const card = document.createElement("div");
		Object.assign(card.style, {
			padding: "12px",
			backgroundColor: UIColors.inputBackground,
			borderRadius: "6px",
			textAlign: "center",
		});

		const valueEl = document.createElement("div");
		Object.assign(valueEl.style, {
			fontSize: "20px",
			fontWeight: "600",
			color: UIColors.text,
			fontFamily: "monospace",
		});
		valueEl.textContent = "0";
		this.metricElements.set(key, valueEl);
		card.appendChild(valueEl);

		const labelEl = document.createElement("div");
		Object.assign(labelEl.style, {
			fontSize: "10px",
			color: UIColors.textDim,
			marginTop: "4px",
			textTransform: "uppercase",
			letterSpacing: "0.5px",
		});
		labelEl.textContent = label + (unit ? ` (${unit})` : "");
		card.appendChild(labelEl);

		return card;
	}

	private createSettingsSection(): HTMLDivElement {
		const section = this.createSection("Settings", true);

		const autoUpdateToggle = createToggle(this.autoUpdate, (enabled) => {
			this.autoUpdate = enabled;
			if (enabled && this.isActive) {
				this.startUpdating();
			} else {
				this.stopUpdating();
			}
		});
		section.appendChild(createSettingRow("Auto Update", autoUpdateToggle));

		// Target FPS slider
		const currentTargetFPS = (this.renderer as any).targetFPS ?? 60;
		const targetFpsSlider = createSlider(currentTargetFPS, {
			min: 10,
			max: 144,
			step: 1,
			formatValue: (v) => `${v}`,
			onChange: (value) => {
				(this.renderer as any).targetFPS = value;
			},
		});
		section.appendChild(createSettingRow("Target FPS", targetFpsSlider));

		// Adaptive FPS / Idle Mode toggle
		const adaptiveFpsEnabled = (this.renderer as any).enableAdaptiveFPS ?? true;
		const idleModeToggle = createToggle(adaptiveFpsEnabled, (enabled) => {
			(this.renderer as any).enableAdaptiveFPS = enabled;
			// Force wake from idle when disabling
			if (!enabled) {
				(this.renderer as any).isIdle = false;
				(this.renderer as any).lastInteractionTime = performance.now();
			}
		});
		section.appendChild(
			createSettingRow("Idle Mode", idleModeToggle, {
				tooltip: "Reduce FPS when scene is idle to save power",
			})
		);

		// Idle FPS slider (only relevant when idle mode is on)
		const currentIdleFPS = (this.renderer as any).idleFPS ?? 1;
		const idleFpsSlider = createSlider(currentIdleFPS, {
			min: 1,
			max: 30,
			step: 1,
			formatValue: (v) => `${v}`,
			onChange: (value) => {
				(this.renderer as any).idleFPS = value;
			},
		});
		section.appendChild(
			createSettingRow("Idle FPS", idleFpsSlider, {
				tooltip: "FPS when scene is idle (lower = less power usage)",
			})
		);

		const logFpsToggle = createToggle(this.renderer.options.logFPS ?? false, (enabled) => {
			this.renderer.options.logFPS = enabled;
		});
		section.appendChild(createSettingRow("Log FPS to Console", logFpsToggle));

		return section;
	}

	protected override onActivate(): void {
		if (this.autoUpdate) {
			this.startUpdating();
		}
	}

	protected override onDeactivate(): void {
		this.stopUpdating();
	}

	private startUpdating(): void {
		if (this.updateInterval) return;

		this.updateInterval = window.setInterval(() => {
			this.updateMetrics();
		}, 100); // Update every 100ms
	}

	private stopUpdating(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	private updateMetrics(): void {
		const renderer = this.renderer.renderManager?.getRenderer();
		if (!renderer) return;

		const info = renderer.info;

		// Get FPS from the main renderer (which tracks actual render frames)
		const actualFps = (this.renderer as any).fps ?? 0;

		const metrics: PerformanceMetrics = {
			fps: Math.round(actualFps),
			frameTime: actualFps > 0 ? Math.round(1000 / actualFps) : 0,
			drawCalls: info.render?.calls ?? 0,
			triangles: info.render?.triangles ?? 0,
			geometries: info.memory?.geometries ?? 0,
			textures: info.memory?.textures ?? 0,
			memory: this.getMemoryUsage(),
		};

		this.displayMetrics(metrics);
	}

	private getMemoryUsage(): number {
		// Use performance.memory if available (Chrome only)
		const perf = performance as any;
		if (perf.memory) {
			return Math.round(perf.memory.usedJSHeapSize / (1024 * 1024));
		}
		return 0;
	}

	private displayMetrics(metrics: PerformanceMetrics): void {
		for (const [key, value] of Object.entries(metrics)) {
			const el = this.metricElements.get(key);
			if (el) {
				if (key === "triangles" && value > 1000000) {
					el.textContent = `${(value / 1000000).toFixed(1)}M`;
				} else if (key === "triangles" && value > 1000) {
					el.textContent = `${(value / 1000).toFixed(1)}K`;
				} else if (key === "fps") {
					el.textContent = value.toString();
					// Color code FPS
					if (value >= 55) {
						el.style.color = UIColors.success;
					} else if (value >= 30) {
						el.style.color = UIColors.warning;
					} else {
						el.style.color = UIColors.danger;
					}
				} else {
					el.textContent = value.toString();
				}
			}
		}
	}

	// Public API

	public getMetrics(): PerformanceMetrics {
		const renderer = this.renderer.renderManager?.getRenderer();
		const info = renderer?.info;
		const actualFps = (this.renderer as any).fps ?? 0;

		return {
			fps: Math.round(actualFps),
			frameTime: actualFps > 0 ? Math.round(1000 / actualFps) : 0,
			drawCalls: info?.render?.calls ?? 0,
			triangles: info?.render?.triangles ?? 0,
			geometries: info?.memory?.geometries ?? 0,
			textures: info?.memory?.textures ?? 0,
			memory: this.getMemoryUsage(),
		};
	}

	public setAutoUpdate(enabled: boolean): void {
		this.autoUpdate = enabled;
		if (enabled && this.isActive) {
			this.startUpdating();
		} else {
			this.stopUpdating();
		}
	}

	public override dispose(): void {
		this.stopUpdating();
		this.metricElements.clear();
		super.dispose();
	}
}
