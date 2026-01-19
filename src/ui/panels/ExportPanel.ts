// ExportPanel.ts - Panel for 3D model export

import { BasePanel, BasePanelOptions } from "./BasePanel";
import { SchematicExporter } from "../../export/SchematicExporter";
import { ExportFormat, ExportQuality, NormalMode } from "../../types/export";
import {
	UIColors,
	createSelect,
	createSettingRow,
	createButton,
	createLabel,
	createCheckbox,
} from "../UIComponents";

export interface ExportSettings {
	filename: string;
	format: ExportFormat;
	quality: ExportQuality;
	normalMode: NormalMode;
	centerAtOrigin: boolean;
	optimizeMesh: boolean;
	embedTextures: boolean;
	forceOpaque: boolean;
}

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
	filename: "schematic_export",
	format: "glb",
	quality: "medium",
	normalMode: "default",
	centerAtOrigin: true,
	optimizeMesh: true,
	embedTextures: true,
	forceOpaque: false,
};

/**
 * Export panel for exporting schematics to 3D formats.
 */
export class ExportPanel extends BasePanel {
	private exporter!: SchematicExporter;
	private settings: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS };
	private isExporting: boolean = false;
	private filenameInput!: HTMLInputElement;
	private progressSection!: HTMLDivElement;
	private progressBar!: HTMLDivElement;
	private progressText!: HTMLDivElement;
	private exportButton!: HTMLButtonElement;

	constructor(options: BasePanelOptions) {
		super(options);
		this.exporter = new SchematicExporter();
		this.init();
	}

	protected buildContent(): void {
		const content = this.createContent();

		content.appendChild(this.createFilenameSection());
		content.appendChild(this.createFormatSection());
		content.appendChild(this.createQualitySection());
		content.appendChild(this.createOptionsSection());
		content.appendChild(this.createProgressSection());
		content.appendChild(this.createFooter());

		this.container.appendChild(content);
	}

	private createFilenameSection(): HTMLDivElement {
		const section = this.createSection("Export");

		const label = createLabel("Filename");
		section.appendChild(label);

		this.filenameInput = document.createElement("input");
		this.filenameInput.type = "text";
		this.filenameInput.placeholder = "schematic_export";
		this.filenameInput.value = this.settings.filename;
		Object.assign(this.filenameInput.style, {
			width: "100%",
			padding: "8px 12px",
			border: `1px solid ${UIColors.inputBorder}`,
			borderRadius: "4px",
			backgroundColor: UIColors.inputBackground,
			color: UIColors.text,
			fontSize: "13px",
			outline: "none",
			boxSizing: "border-box",
			marginTop: "4px",
		});

		this.filenameInput.addEventListener("change", () => {
			this.settings.filename = this.filenameInput.value || "schematic_export";
		});

		section.appendChild(this.filenameInput);

		return section;
	}

	private createFormatSection(): HTMLDivElement {
		const section = this.createSection("Format");

		const formatSelect = createSelect(
			[
				{ value: "glb", label: "GLB (Binary GLTF)" },
				{ value: "gltf", label: "GLTF (JSON + Bin)" },
				{ value: "obj", label: "OBJ (Wavefront)" },
				{ value: "stl", label: "STL (3D Printing)" },
			],
			this.settings.format,
			(value) => {
				this.settings.format = value as ExportFormat;
			}
		);
		section.appendChild(createSettingRow("File Format", formatSelect));

		return section;
	}

	private createQualitySection(): HTMLDivElement {
		const section = this.createSection("Quality");

		const qualitySelect = createSelect(
			[
				{ value: "low", label: "Low (Fast export)" },
				{ value: "medium", label: "Medium (Balanced)" },
				{ value: "high", label: "High (Better quality)" },
				{ value: "ultra", label: "Ultra (Best quality)" },
			],
			this.settings.quality,
			(value) => {
				this.settings.quality = value as ExportQuality;
			}
		);
		section.appendChild(createSettingRow("Quality Level", qualitySelect));

		const normalSelect = createSelect(
			[
				{ value: "smooth", label: "Smooth Normals" },
				{ value: "flat", label: "Flat Normals" },
				{ value: "auto", label: "Auto (Mixed)" },
			],
			this.settings.normalMode,
			(value) => {
				this.settings.normalMode = value as NormalMode;
			}
		);
		section.appendChild(createSettingRow("Normal Mode", normalSelect));

		return section;
	}

	private createOptionsSection(): HTMLDivElement {
		const section = this.createSection("Options", true);

		const checkboxes = [
			{
				id: "centerOrigin",
				label: "Center at origin",
				checked: this.settings.centerAtOrigin,
				tooltip: "Move model to origin (0,0,0)",
				onChange: (checked: boolean) => {
					this.settings.centerAtOrigin = checked;
				},
			},
			{
				id: "optimizeMesh",
				label: "Optimize mesh",
				checked: this.settings.optimizeMesh,
				tooltip: "Merge vertices and remove duplicates",
				onChange: (checked: boolean) => {
					this.settings.optimizeMesh = checked;
				},
			},
			{
				id: "embedTextures",
				label: "Embed textures",
				checked: this.settings.embedTextures,
				tooltip: "Include textures in export file",
				onChange: (checked: boolean) => {
					this.settings.embedTextures = checked;
				},
			},
			{
				id: "forceOpaque",
				label: "Force opaque",
				checked: this.settings.forceOpaque,
				tooltip: "Disable transparency (better compatibility)",
				onChange: (checked: boolean) => {
					this.settings.forceOpaque = checked;
				},
			},
		];

		for (const opt of checkboxes) {
			const checkbox = createCheckbox(opt.id, opt.label, opt.checked, opt.onChange, opt.tooltip);
			checkbox.style.marginBottom = "8px";
			section.appendChild(checkbox);
		}

		return section;
	}

	private createProgressSection(): HTMLDivElement {
		this.progressSection = document.createElement("div");
		this.progressSection.style.display = "none";
		Object.assign(this.progressSection.style, {
			padding: "16px",
			backgroundColor: "rgba(255, 255, 255, 0.03)",
			borderTop: `1px solid ${UIColors.border}`,
		});

		this.progressText = document.createElement("div");
		Object.assign(this.progressText.style, {
			fontSize: "12px",
			color: UIColors.textMuted,
			marginBottom: "8px",
		});
		this.progressText.textContent = "Exporting...";
		this.progressSection.appendChild(this.progressText);

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
		this.progressSection.appendChild(this.progressBar);

		return this.progressSection;
	}

	private createFooter(): HTMLDivElement {
		const footer = document.createElement("div");
		Object.assign(footer.style, {
			padding: "16px",
			borderTop: `1px solid ${UIColors.border}`,
		});

		this.exportButton = createButton("Export", () => this.startExport());
		this.exportButton.style.width = "100%";
		footer.appendChild(this.exportButton);

		return footer;
	}

	// Public API

	public async startExport(): Promise<void> {
		if (this.isExporting) return;

		// Get current schematic
		const schematics = this.renderer.schematicManager?.schematics;
		if (!schematics || schematics.size === 0) {
			console.warn("No schematic loaded to export");
			return;
		}

		const schematic = schematics.values().next().value;
		if (!schematic?.group) {
			console.warn("Schematic has no geometry to export");
			return;
		}

		this.isExporting = true;
		this.progressSection.style.display = "block";
		this.exportButton.disabled = true;
		this.exportButton.style.opacity = "0.5";

		try {
			const result = await this.exporter.export(schematic.group, {
				format: this.settings.format,
				quality: this.settings.quality,
				normalMode: this.settings.normalMode,
				centerAtOrigin: this.settings.centerAtOrigin,
				optimize: this.settings.optimizeMesh,
				embedTextures: this.settings.embedTextures,
				forceOpaque: this.settings.forceOpaque,
				filename: this.settings.filename,
				onProgress: (progress) => {
					const progressFill = this.progressBar.firstChild as HTMLDivElement;
					if (progressFill) {
						progressFill.style.width = `${progress.progress * 100}%`;
					}
					this.progressText.textContent = `${progress.phase}: ${(progress.progress * 100).toFixed(0)}%`;
				},
			});

			if (result.success && result.data) {
				// Auto-download - handle both Blob and ArrayBuffer
				const blob =
					result.data instanceof Blob
						? result.data
						: new Blob([result.data], { type: "application/octet-stream" });
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `${this.settings.filename}.${this.settings.format}`;
				a.click();
				URL.revokeObjectURL(url);

				this.progressText.textContent = "Export complete!";
				setTimeout(() => {
					this.progressSection.style.display = "none";
				}, 2000);
			} else {
				this.progressText.textContent = "Export failed: Unknown error";
			}
		} catch (error) {
			console.error("Export error:", error);
			this.progressText.textContent = `Export failed: ${error}`;
		} finally {
			this.isExporting = false;
			this.exportButton.disabled = false;
			this.exportButton.style.opacity = "1";
		}
	}

	public getSettings(): ExportSettings {
		return { ...this.settings };
	}

	public setFormat(format: ExportFormat): void {
		this.settings.format = format;
	}

	public setQuality(quality: ExportQuality): void {
		this.settings.quality = quality;
	}
}
