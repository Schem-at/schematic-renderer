import { SchematicRenderer } from "../SchematicRenderer";
import { UIManager } from "./UIManager";
import { FileType, FileTypeUtility } from "../utils/FileTypeUtil";

export interface DragAndDropManagerOptions {
	acceptedFileTypes?: string[];
	callbacks?: {
		// Schematic callbacks
		onSchematicLoaded?: (schematicName: string) => void;
		onSchematicDropped?: (file: File) => void | Promise<void>;
		onSchematicDropSuccess?: (file: File) => void | Promise<void>;
		onSchematicDropFailed?: (file: File, error: Error) => void | Promise<void>;

		// Resource pack callbacks
		onResourcePackLoaded?: (packName: string) => void | Promise<void>;
		onResourcePackDropped?: (file: File) => void | Promise<void>;
		onResourcePackDropSuccess?: (file: File) => void | Promise<void>;
		onResourcePackDropFailed?: (
			file: File,
			error: Error
		) => void | Promise<void>;

		// General callbacks
		onInvalidFileType?: (file: File) => void | Promise<void>;
		onLoadingProgress?: (file: File, progress: number) => void | Promise<void>;
	};
}

export class DragAndDropManager {
	private renderer: SchematicRenderer;
	private options: DragAndDropManagerOptions;
	private canvas: HTMLCanvasElement;
	private uiManager: UIManager;

	constructor(renderer: SchematicRenderer, options: DragAndDropManagerOptions) {
		this.renderer = renderer;
		this.options = options;
		this.canvas = this.renderer.canvas;
		this.uiManager = this.renderer.uiManager as UIManager;

		this.initialize();
	}

	private initialize() {
		this.canvas.addEventListener("dragover", this.onDragOver);
		this.canvas.addEventListener("dragleave", this.onDragLeave);
		this.canvas.addEventListener("drop", this.onDrop);
	}

	private onDragOver = (event: DragEvent) => {
		event.preventDefault();
		// Show visual feedback
		this.uiManager.showOverlay();
		this.uiManager.emptyStateOverlay.style.border = "4px dashed #00ff00";
		const uploadOverlayContent = this.uiManager.emptyStateOverlay
			.getElementsByClassName("uploadOverlayContent")
			.item(0) as HTMLElement;
		uploadOverlayContent.style.transform = "translate(-50%, -50%) scale(1.1)";
		if (this.renderer.options.enableDragAndDrop) {
			this.uiManager.showEmptyState();
		}
	};

	private onDragLeave = (event: DragEvent) => {
		event.preventDefault();
		// Hide visual feedback
		this.uiManager.hideOverlay();
		this.uiManager.emptyStateOverlay.style.border = "none";
		const uploadOverlayContent = this.uiManager.emptyStateOverlay
			.getElementsByClassName("uploadOverlayContent")
			.item(0) as HTMLElement;
		uploadOverlayContent.style.transform = "translate(-50%, -50%) scale(1)";
		if (!this.renderer.schematicManager?.isEmpty()) {
			this.uiManager.hideEmptyState();
		}
	};

	private onDrop = async (event: DragEvent) => {
		event.preventDefault();

		// Hide visual feedback
		this.uiManager.hideOverlay();
		this.canvas.style.border = "none";
		console.log("Draged file detected");

		this.uiManager.hideEmptyState();

		const files = event.dataTransfer?.files;
		console.log("Files dropped:", files);
		if (files && files.length > 0) {
			for (const file of files) {
				// Determine file type using our utility
				const startTime = performance.now();

				const fileType = FileTypeUtility.determineFileType(file);
				console.log(
					"File type determined in",
					performance.now() - startTime,
					"ms"
				);

				if (fileType === FileType.SCHEMATIC && this.isAcceptedFileType(file)) {
					const startTime = performance.now();
					await this.handleSchematicDrop(file);
					console.log(
						"Schematic drop handled in",
						performance.now() - startTime,
						"ms"
					);
				} else if (fileType === FileType.RESOURCE_PACK) {
					await this.handleResourcePackDrop(file);
				} else {
					// Show error message for unsupported file types
					const extension = file.name.split(".").pop()?.toLowerCase() || "unknown";
					const supportedTypes = this.options.acceptedFileTypes?.length
						? this.options.acceptedFileTypes.join(", ")
						: "schem, litematic, nbt, schematic, mcstructure";
					this.uiManager.showMessage(
						`Unsupported file type: .${extension}\nSupported formats: ${supportedTypes}`
					);
					// Call invalid file type callback
					await this.options.callbacks?.onInvalidFileType?.(file);
				}
			}
		}
	};

	private async handleSchematicDrop(file: File): Promise<void> {
		try {
			// Call the initial schematic drop callback
			await this.options.callbacks?.onSchematicDropped?.(file);

			// Show loading indicator
			this.uiManager.showLoadingIndicator(`Loading schematic: ${file.name}...`);

			console.log("Loading schematic", file.name);

			// Load the schematic directly through schematicManager
			await this.renderer.schematicManager?.loadSchematicFromFile(file, {
				onProgress: (progress) => {
					// Update UI based on stage and progress
					this.uiManager.showLoadingIndicator(
						`${progress.message} (${Math.round(progress.progress)}%)`
					);

					// Call the progress callback if provided
					this.options.callbacks?.onLoadingProgress?.(file, progress.progress);
				},
			});

			console.log("Schematic loaded successfully:", file.name);

			// Call the schematic loaded callback if provided
			if (this.options.callbacks?.onSchematicLoaded) {
				this.options.callbacks.onSchematicLoaded(file.name);
			}

			// Hide loading indicator
			this.uiManager.hideLoadingIndicator();

			// Call schematic drop success callback
			await this.options.callbacks?.onSchematicDropSuccess?.(file);
		} catch (error) {
			// Hide loading indicator and show error message
			console.error(error);
			this.uiManager.hideLoadingIndicator();
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			this.uiManager.showMessage(
				`Error loading schematic ${file.name}: ${errorMessage}`
			);

			// Call the failure callback
			await this.options.callbacks?.onSchematicDropFailed?.(
				file,
				error instanceof Error ? error : new Error(errorMessage)
			);
		}
	}

	private async handleResourcePackDrop(file: File): Promise<void> {
		try {
			// Call the initial resource pack drop callback
			await this.options.callbacks?.onResourcePackDropped?.(file);

			// Show loading indicator
			this.uiManager.showLoadingIndicator(
				`Loading resource pack: ${file.name}...`
			);

			console.log("Loading resource pack", file.name);

			// Validate resource pack
			const isValid = await FileTypeUtility.validateResourcePack(file);
			if (!isValid) {
				throw new Error("Invalid resource pack format");
			}

			// Use the SchematicRenderer's method to add the resource pack
			await this.renderer.addResourcePack(file);

			// Call resource pack success callback
			await this.options.callbacks?.onResourcePackDropSuccess?.(file);

			// Hide loading indicator
			this.uiManager.hideLoadingIndicator();
			this.uiManager.showMessage(
				`Resource pack ${file.name} loaded successfully!`
			);

			// Call the resource pack loaded callback
			await this.options.callbacks?.onResourcePackLoaded?.(file.name);
		} catch (error) {
			// Hide loading indicator and show error message
			console.error(error);
			this.uiManager.hideLoadingIndicator();
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			this.uiManager.showMessage(
				`Error loading resource pack ${file.name}: ${errorMessage}`
			);

			// Call the failure callback
			await this.options.callbacks?.onResourcePackDropFailed?.(
				file,
				error instanceof Error ? error : new Error(errorMessage)
			);
		}
	}

	private isAcceptedFileType(file: File): boolean {
		if (
			!this.options.acceptedFileTypes ||
			this.options.acceptedFileTypes.length === 0
		) {
			return true; // Accept all file types by default
		}
		const extension = file.name.split(".").pop()?.toLowerCase();
		return this.options.acceptedFileTypes.includes(extension || "");
	}

	// This method is no longer used - we call loadSchematicFromFile directly from handleSchematicDrop
	// to avoid potential circular calls

	public dispose() {
		this.canvas.removeEventListener("dragover", this.onDragOver);
		this.canvas.removeEventListener("dragleave", this.onDragLeave);
		this.canvas.removeEventListener("drop", this.onDrop);
	}
}
