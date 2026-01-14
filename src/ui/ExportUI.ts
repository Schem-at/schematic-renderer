// ExportUI.ts - UI Component for Schematic Export Management

import { SchematicExporter } from "../export/SchematicExporter";
import { SchematicObject } from "../managers/SchematicObject";
import {
	ExportUIOptions,
	ExportFormat,
	ExportQuality,
	ExportOptions,
	ExportProgress,
	ExportResult,
	NormalMode,
} from "../types/export";

/**
 * Export UI Component
 * Provides a visual interface for exporting schematics with various options
 */
export class ExportUI {
	private exporter: SchematicExporter;
	private container: HTMLDivElement;
	private isVisible: boolean = false;
	private options: Required<ExportUIOptions>;
	private canvas: HTMLCanvasElement;
	private getSchematic: () => SchematicObject | null;

	// UI Elements
	private formatSelect!: HTMLSelectElement;
	private qualitySelect!: HTMLSelectElement;
	private normalModeSelect!: HTMLSelectElement;
	private filenameInput!: HTMLInputElement;
	private progressBar!: HTMLDivElement;
	private progressText!: HTMLDivElement;
	private exportButton!: HTMLButtonElement;

	// Current export state
	private isExporting: boolean = false;
	private currentResult: ExportResult | null = null;

	constructor(
		canvas: HTMLCanvasElement,
		getSchematic: () => SchematicObject | null,
		options: ExportUIOptions = {}
	) {
		this.canvas = canvas;
		this.getSchematic = getSchematic;
		this.exporter = new SchematicExporter();

		this.options = {
			enableUI: options.enableUI ?? true,
			uiPosition: options.uiPosition ?? "top-right",
			enableKeyboardShortcuts: options.enableKeyboardShortcuts ?? true,
			toggleUIShortcut: options.toggleUIShortcut ?? "KeyE",
			defaultOptions: options.defaultOptions ?? {},
			availableFormats: options.availableFormats ?? ["glb", "gltf", "obj", "stl"],
			autoDownload: options.autoDownload ?? true,
		};

		this.container = this.createContainer();
		this.setupEventListeners();

		if (this.options.enableKeyboardShortcuts) {
			this.setupKeyboardShortcuts();
		}
	}

	private createContainer(): HTMLDivElement {
		const container = document.createElement("div");
		container.className = "export-ui";

		// Position styles
		const positions: Record<
			string,
			{ top?: string; right?: string; bottom?: string; left?: string }
		> = {
			"top-left": { top: "10px", left: "10px" },
			"top-right": { top: "10px", right: "10px" },
			"bottom-left": { bottom: "10px", left: "10px" },
			"bottom-right": { bottom: "10px", right: "10px" },
		};

		const pos = positions[this.options.uiPosition];

		Object.assign(container.style, {
			position: "absolute",
			...pos,
			width: "340px",
			backgroundColor: "rgba(20, 20, 25, 0.95)",
			borderRadius: "8px",
			boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
			fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
			fontSize: "13px",
			color: "#e0e0e0",
			zIndex: "1000",
			display: "none",
			overflow: "hidden",
			border: "1px solid rgba(255, 255, 255, 0.1)",
		});

		// Header
		const header = this.createHeader();
		container.appendChild(header);

		// Content
		const content = this.createContent();
		container.appendChild(content);

		// Footer with export button
		const footer = this.createFooter();
		container.appendChild(footer);

		// Append to canvas parent
		const parent = this.canvas.parentElement;
		if (parent) {
			if (getComputedStyle(parent).position === "static") {
				parent.style.position = "relative";
			}
			parent.appendChild(container);
		}

		return container;
	}

	private createHeader(): HTMLDivElement {
		const header = document.createElement("div");
		Object.assign(header.style, {
			display: "flex",
			justifyContent: "space-between",
			alignItems: "center",
			padding: "12px 16px",
			borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
			background: "rgba(255, 255, 255, 0.03)",
		});

		// Title with icon
		const titleContainer = document.createElement("div");
		Object.assign(titleContainer.style, {
			display: "flex",
			alignItems: "center",
			gap: "8px",
		});

		const title = document.createElement("span");
		title.textContent = "Export Schematic";
		Object.assign(title.style, {
			fontWeight: "600",
			fontSize: "14px",
		});
		titleContainer.appendChild(title);
		header.appendChild(titleContainer);

		// Close Button
		const closeBtn = this.createIconButton("✕", "Close", () => this.hide());
		header.appendChild(closeBtn);

		return header;
	}

	private createContent(): HTMLDivElement {
		const content = document.createElement("div");
		Object.assign(content.style, {
			padding: "16px",
			display: "flex",
			flexDirection: "column",
			gap: "16px",
		});

		// Filename input
		content.appendChild(this.createFilenameSection());

		// Format selection
		content.appendChild(this.createFormatSection());

		// Quality selection
		content.appendChild(this.createQualitySection());

		// Normal mode selection
		content.appendChild(this.createNormalModeSection());

		// Additional options
		content.appendChild(this.createOptionsSection());

		// Progress section (hidden by default)
		content.appendChild(this.createProgressSection());

		return content;
	}

	private createFilenameSection(): HTMLDivElement {
		const section = document.createElement("div");

		const label = this.createLabel("Filename");
		section.appendChild(label);

		this.filenameInput = document.createElement("input");
		this.filenameInput.type = "text";
		this.filenameInput.placeholder = "schematic_export";
		this.filenameInput.value = this.options.defaultOptions.filename || "schematic_export";
		Object.assign(this.filenameInput.style, {
			width: "100%",
			padding: "8px 12px",
			border: "1px solid rgba(255, 255, 255, 0.15)",
			borderRadius: "4px",
			backgroundColor: "rgba(255, 255, 255, 0.05)",
			color: "#e0e0e0",
			fontSize: "13px",
			outline: "none",
			boxSizing: "border-box",
		});
		this.filenameInput.addEventListener("focus", () => {
			this.filenameInput.style.borderColor = "#4a6cf7";
		});
		this.filenameInput.addEventListener("blur", () => {
			this.filenameInput.style.borderColor = "rgba(255, 255, 255, 0.15)";
		});
		section.appendChild(this.filenameInput);

		return section;
	}

	private createFormatSection(): HTMLDivElement {
		const section = document.createElement("div");

		const label = this.createLabel("Export Format");
		section.appendChild(label);

		this.formatSelect = this.createSelect(
			this.options.availableFormats.map((format) => ({
				value: format,
				label: this.getFormatLabel(format),
			})),
			this.options.defaultOptions.format || "glb"
		);
		section.appendChild(this.formatSelect);

		// Format description
		const desc = document.createElement("div");
		desc.className = "format-description";
		Object.assign(desc.style, {
			fontSize: "11px",
			color: "rgba(255, 255, 255, 0.5)",
			marginTop: "4px",
		});
		desc.textContent = SchematicExporter.getFormatDescription(
			(this.options.defaultOptions.format || "glb") as ExportFormat
		);
		section.appendChild(desc);

		this.formatSelect.addEventListener("change", () => {
			desc.textContent = SchematicExporter.getFormatDescription(
				this.formatSelect.value as ExportFormat
			);
		});

		return section;
	}

	private createQualitySection(): HTMLDivElement {
		const section = document.createElement("div");

		const label = this.createLabel("Quality");
		section.appendChild(label);

		this.qualitySelect = this.createSelect(
			[
				{ value: "low", label: "Low (Fast export, small file)" },
				{ value: "medium", label: "Medium (Balanced)" },
				{ value: "high", label: "High (Better quality)" },
				{ value: "ultra", label: "Ultra (Maximum quality)" },
			],
			this.options.defaultOptions.quality || "high"
		);
		section.appendChild(this.qualitySelect);

		return section;
	}

	private createNormalModeSection(): HTMLDivElement {
		const section = document.createElement("div");

		const labelContainer = document.createElement("div");
		Object.assign(labelContainer.style, {
			display: "flex",
			justifyContent: "space-between",
			alignItems: "center",
		});

		const label = this.createLabel("Normal Handling");
		labelContainer.appendChild(label);

		const helpIcon = document.createElement("span");
		helpIcon.textContent = "ℹ️";
		helpIcon.title =
			"Fixes inside-out/see-through faces. 'Flip Winding' reverses triangle order. 'Double-sided' renders both sides (safest).";
		helpIcon.style.cursor = "help";
		helpIcon.style.fontSize = "12px";
		labelContainer.appendChild(helpIcon);

		section.appendChild(labelContainer);

		this.normalModeSelect = this.createSelect(
			[
				{ value: "double-sided", label: "Double-sided (Recommended)" },
				{ value: "flip", label: "Flip Winding Order" },
				{ value: "recompute", label: "Flip + Recompute Normals" },
				{ value: "default", label: "No Change (Original)" },
			],
			this.options.defaultOptions.normalMode || "double-sided"
		);
		section.appendChild(this.normalModeSelect);

		return section;
	}

	private createOptionsSection(): HTMLDivElement {
		const section = document.createElement("div");

		const label = this.createLabel("Options");
		section.appendChild(label);

		const optionsGrid = document.createElement("div");
		Object.assign(optionsGrid.style, {
			display: "grid",
			gridTemplateColumns: "1fr 1fr",
			gap: "8px",
		});

		// Center at origin
		optionsGrid.appendChild(this.createCheckbox("centerOrigin", "Center at origin", false));

		// Optimize
		optionsGrid.appendChild(this.createCheckbox("optimize", "Optimize mesh", true));

		// Embed textures
		optionsGrid.appendChild(this.createCheckbox("embedTextures", "Embed textures", true));

		// Visible only
		optionsGrid.appendChild(this.createCheckbox("visibleOnly", "Visible only", true));

		// Force opaque - fixes depth sorting issues
		optionsGrid.appendChild(
			this.createCheckbox(
				"forceOpaque",
				"Force opaque",
				false,
				"Removes all transparency - fixes depth sorting issues in viewers"
			)
		);

		section.appendChild(optionsGrid);

		return section;
	}

	private createProgressSection(): HTMLDivElement {
		const section = document.createElement("div");
		section.className = "progress-section";
		Object.assign(section.style, {
			display: "none",
		});

		this.progressText = document.createElement("div");
		Object.assign(this.progressText.style, {
			fontSize: "12px",
			marginBottom: "8px",
			color: "rgba(255, 255, 255, 0.7)",
		});
		this.progressText.textContent = "Preparing export...";
		section.appendChild(this.progressText);

		const progressContainer = document.createElement("div");
		Object.assign(progressContainer.style, {
			width: "100%",
			height: "4px",
			backgroundColor: "rgba(255, 255, 255, 0.1)",
			borderRadius: "2px",
			overflow: "hidden",
		});

		this.progressBar = document.createElement("div");
		Object.assign(this.progressBar.style, {
			width: "0%",
			height: "100%",
			backgroundColor: "#4a6cf7",
			borderRadius: "2px",
			transition: "width 0.2s ease-out",
		});
		progressContainer.appendChild(this.progressBar);

		section.appendChild(progressContainer);

		return section;
	}

	private createFooter(): HTMLDivElement {
		const footer = document.createElement("div");
		Object.assign(footer.style, {
			padding: "12px 16px",
			borderTop: "1px solid rgba(255, 255, 255, 0.1)",
			display: "flex",
			justifyContent: "space-between",
			alignItems: "center",
			gap: "8px",
		});

		// Cancel button (hidden by default)
		const cancelBtn = document.createElement("button");
		cancelBtn.textContent = "Cancel";
		cancelBtn.className = "cancel-btn";
		Object.assign(cancelBtn.style, {
			padding: "8px 16px",
			border: "1px solid rgba(255, 255, 255, 0.2)",
			borderRadius: "4px",
			backgroundColor: "transparent",
			color: "#e0e0e0",
			cursor: "pointer",
			fontSize: "13px",
			display: "none",
		});
		cancelBtn.addEventListener("click", () => this.cancelExport());
		footer.appendChild(cancelBtn);

		// Spacer
		const spacer = document.createElement("div");
		spacer.style.flex = "1";
		footer.appendChild(spacer);

		// Export button
		this.exportButton = document.createElement("button");
		this.exportButton.textContent = "Export";
		Object.assign(this.exportButton.style, {
			padding: "8px 24px",
			border: "none",
			borderRadius: "4px",
			backgroundColor: "#4a6cf7",
			color: "#fff",
			cursor: "pointer",
			fontSize: "13px",
			fontWeight: "500",
			transition: "background-color 0.15s",
		});
		this.exportButton.addEventListener("mouseenter", () => {
			if (!this.isExporting) {
				this.exportButton.style.backgroundColor = "#5b7af8";
			}
		});
		this.exportButton.addEventListener("mouseleave", () => {
			if (!this.isExporting) {
				this.exportButton.style.backgroundColor = "#4a6cf7";
			}
		});
		this.exportButton.addEventListener("click", () => this.startExport());
		footer.appendChild(this.exportButton);

		return footer;
	}

	private createLabel(text: string): HTMLLabelElement {
		const label = document.createElement("label");
		label.textContent = text;
		Object.assign(label.style, {
			display: "block",
			fontSize: "12px",
			fontWeight: "500",
			marginBottom: "6px",
			color: "rgba(255, 255, 255, 0.8)",
		});
		return label;
	}

	private createSelect(
		options: { value: string; label: string }[],
		defaultValue: string
	): HTMLSelectElement {
		const select = document.createElement("select");
		Object.assign(select.style, {
			width: "100%",
			padding: "8px 12px",
			border: "1px solid rgba(255, 255, 255, 0.15)",
			borderRadius: "4px",
			backgroundColor: "rgba(255, 255, 255, 0.05)",
			color: "#e0e0e0",
			fontSize: "13px",
			outline: "none",
			cursor: "pointer",
		});

		options.forEach((opt) => {
			const option = document.createElement("option");
			option.value = opt.value;
			option.textContent = opt.label;
			option.style.backgroundColor = "#1a1a1f";
			select.appendChild(option);
		});

		select.value = defaultValue;

		select.addEventListener("focus", () => {
			select.style.borderColor = "#4a6cf7";
		});
		select.addEventListener("blur", () => {
			select.style.borderColor = "rgba(255, 255, 255, 0.15)";
		});

		return select;
	}

	private createCheckbox(
		id: string,
		label: string,
		checked: boolean,
		tooltip?: string
	): HTMLLabelElement {
		const container = document.createElement("label");
		Object.assign(container.style, {
			display: "flex",
			alignItems: "center",
			gap: "6px",
			cursor: "pointer",
			fontSize: "12px",
			color: "rgba(255, 255, 255, 0.7)",
		});

		if (tooltip) {
			container.title = tooltip;
		}

		const input = document.createElement("input");
		input.type = "checkbox";
		input.id = `export-${id}`;
		input.checked = checked;
		Object.assign(input.style, {
			width: "14px",
			height: "14px",
			cursor: "pointer",
		});
		container.appendChild(input);

		const labelText = document.createElement("span");
		labelText.textContent = label;
		container.appendChild(labelText);

		return container;
	}

	private createIconButton(icon: string, title: string, onClick: () => void): HTMLButtonElement {
		const btn = document.createElement("button");
		btn.textContent = icon;
		btn.title = title;
		Object.assign(btn.style, {
			width: "28px",
			height: "28px",
			border: "none",
			borderRadius: "4px",
			backgroundColor: "rgba(255, 255, 255, 0.08)",
			color: "#e0e0e0",
			cursor: "pointer",
			fontSize: "12px",
			transition: "background-color 0.15s",
		});
		btn.addEventListener("mouseenter", () => {
			btn.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
		});
		btn.addEventListener("mouseleave", () => {
			btn.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
		});
		btn.addEventListener("click", onClick);
		return btn;
	}

	private getFormatLabel(format: ExportFormat): string {
		const labels: Record<ExportFormat, string> = {
			gltf: "GLTF (.gltf) - JSON",
			glb: "GLB (.glb) - Binary",
			obj: "OBJ (.obj) - Wavefront",
			stl: "STL (.stl) - 3D Print",
		};
		return labels[format];
	}

	private setupEventListeners(): void {
		// Listen to exporter events
		this.exporter.on("exportProgress", (progress: ExportProgress) => {
			this.updateProgress(progress.progress, progress.message);
		});

		this.exporter.on("exportComplete", (result: ExportResult) => {
			this.handleExportComplete(result);
		});

		this.exporter.on("exportError", (error) => {
			this.handleExportError(error);
		});
	}

	private setupKeyboardShortcuts(): void {
		document.addEventListener("keydown", (e) => {
			// Check if focused element is an input
			if (
				document.activeElement?.tagName === "INPUT" ||
				document.activeElement?.tagName === "TEXTAREA" ||
				document.activeElement?.tagName === "SELECT"
			) {
				return;
			}

			if (e.code === this.options.toggleUIShortcut) {
				this.toggle();
			}
		});
	}

	private getExportOptions(): ExportOptions {
		const centerOrigin =
			(this.container.querySelector("#export-centerOrigin") as HTMLInputElement)?.checked ?? false;
		const optimize =
			(this.container.querySelector("#export-optimize") as HTMLInputElement)?.checked ?? true;
		const embedTextures =
			(this.container.querySelector("#export-embedTextures") as HTMLInputElement)?.checked ?? true;
		const visibleOnly =
			(this.container.querySelector("#export-visibleOnly") as HTMLInputElement)?.checked ?? true;
		const forceOpaque =
			(this.container.querySelector("#export-forceOpaque") as HTMLInputElement)?.checked ?? false;

		return {
			filename: this.filenameInput.value || "schematic_export",
			format: this.formatSelect.value as ExportFormat,
			quality: this.qualitySelect.value as ExportQuality,
			normalMode: this.normalModeSelect.value as NormalMode,
			centerAtOrigin: centerOrigin,
			optimize: optimize,
			embedTextures: embedTextures,
			visibleOnly: visibleOnly,
			forceOpaque: forceOpaque,
		};
	}

	private async startExport(): Promise<void> {
		if (this.isExporting) return;

		const schematic = this.getSchematic();
		if (!schematic) {
			this.showError("No schematic loaded to export");
			return;
		}

		this.isExporting = true;
		this.setExportingState(true);

		try {
			const options = this.getExportOptions();
			const result = await this.exporter.export(schematic.group, options);

			if (this.options.autoDownload) {
				this.exporter.download(result);
			}

			this.currentResult = result;
		} catch (error) {
			console.error("Export failed:", error);
		} finally {
			this.isExporting = false;
			this.setExportingState(false);
		}
	}

	private cancelExport(): void {
		this.exporter.cancel();
		this.isExporting = false;
		this.setExportingState(false);
	}

	private setExportingState(exporting: boolean): void {
		const progressSection = this.container.querySelector(".progress-section") as HTMLDivElement;
		const cancelBtn = this.container.querySelector(".cancel-btn") as HTMLButtonElement;

		if (exporting) {
			progressSection.style.display = "block";
			cancelBtn.style.display = "block";
			this.exportButton.textContent = "Exporting...";
			this.exportButton.style.backgroundColor = "#666";
			this.exportButton.style.cursor = "not-allowed";
			this.progressBar.style.width = "0%";
		} else {
			progressSection.style.display = "none";
			cancelBtn.style.display = "none";
			this.exportButton.textContent = "Export";
			this.exportButton.style.backgroundColor = "#4a6cf7";
			this.exportButton.style.cursor = "pointer";
		}
	}

	private updateProgress(progress: number, message: string): void {
		this.progressBar.style.width = `${progress * 100}%`;
		this.progressText.textContent = message;
	}

	private handleExportComplete(result: ExportResult): void {
		this.updateProgress(1, `Export complete! (${this.formatFileSize(result.size)})`);

		// Show success message briefly
		setTimeout(() => {
			if (!this.isExporting) {
				const progressSection = this.container.querySelector(".progress-section") as HTMLDivElement;
				progressSection.style.display = "none";
			}
		}, 2000);

		// Clean up download URL after a delay
		setTimeout(() => {
			if (this.currentResult) {
				this.exporter.revokeUrl(this.currentResult);
				this.currentResult = null;
			}
		}, 5000);
	}

	private handleExportError(error: { message: string }): void {
		this.showError(`Export failed: ${error.message}`);
	}

	private showError(message: string): void {
		this.progressText.textContent = message;
		this.progressText.style.color = "#ff6b6b";
		const progressSection = this.container.querySelector(".progress-section") as HTMLDivElement;
		progressSection.style.display = "block";

		setTimeout(() => {
			this.progressText.style.color = "rgba(255, 255, 255, 0.7)";
			progressSection.style.display = "none";
		}, 3000);
	}

	private formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}

	public show(): void {
		this.isVisible = true;
		this.container.style.display = "block";

		// Update filename based on current schematic
		const schematic = this.getSchematic();
		if (schematic) {
			this.filenameInput.value = schematic.name || "schematic_export";
		}
	}

	public hide(): void {
		this.isVisible = false;
		this.container.style.display = "none";
	}

	public toggle(): void {
		if (this.isVisible) {
			this.hide();
		} else {
			this.show();
		}
	}

	public isShowing(): boolean {
		return this.isVisible;
	}

	public destroy(): void {
		this.container.remove();
	}

	public dispose(): void {
		this.destroy();
	}

	/**
	 * Get the exporter instance for programmatic use
	 */
	public getExporter(): SchematicExporter {
		return this.exporter;
	}

	/**
	 * Set default filename
	 */
	public setFilename(filename: string): void {
		this.filenameInput.value = filename;
	}

	/**
	 * Set default format
	 */
	public setFormat(format: ExportFormat): void {
		this.formatSelect.value = format;
	}
}
