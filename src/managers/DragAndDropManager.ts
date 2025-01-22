import { SchematicRenderer } from "../SchematicRenderer";
import { UIManager } from "./UIManager";

export interface DragAndDropManagerOptions {
	acceptedFileTypes?: string[];
	callbacks?: {
		onSchematicLoaded?: (schematicName: string) => void;
		onSchematicDropped?: (file: File) => void | Promise<void>; // Called immediately when valid file is dropped
		onSchematicDropSuccess?: (file: File) => void | Promise<void>; // Called after successful drop and validation
		onSchematicDropFailed?: (file: File, error: Error) => void | Promise<void>; // Called if drop processing fails
		onInvalidFileType?: (file: File) => void | Promise<void>; // Called when file type is not accepted
		onLoadingProgress?: (file: File, progress: number) => void | Promise<void>; // Optional progress callback
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

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			for (const file of files) {
				if (this.isAcceptedFileType(file)) {
					try {
						// Call the initial drop callback
						await this.options.callbacks?.onSchematicDropped?.(file);

						// Show loading indicator
						this.uiManager.showLoadingIndicator(`Loading ${file.name}...`);

						console.log("Loading", file.name);
						// Call drop success callback
						await this.options.callbacks?.onSchematicDropSuccess?.(file);

						// Load the schematic
						await this.loadSchematicFromFile(file);

						// Hide loading indicator
						this.uiManager.hideLoadingIndicator();
					} catch (error) {
						// Hide loading indicator and show error message
						console.error(error);
						this.uiManager.hideLoadingIndicator();
						const errorMessage =
							error instanceof Error ? error.message : "Unknown error";
						this.uiManager.showMessage(
							`Error loading ${file.name}: ${errorMessage}`
						);

						// Call the failure callback
						await this.options.callbacks?.onSchematicDropFailed?.(
							file,
							error instanceof Error ? error : new Error(errorMessage)
						);
					}
				} else {
					// Show error message
					this.uiManager.showMessage(`Unsupported file type: ${file.name}`);
					// Call invalid file type callback
					await this.options.callbacks?.onInvalidFileType?.(file);
				}
			}
		}
	};

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

	private async loadSchematicFromFile(file: File) {
		try {
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

			// Call the callback if provided
			const callback = this.options.callbacks?.onSchematicLoaded;
			if (callback) {
				callback(file.name);
			}
		} catch (error) {
			throw error;
		}
	}

	public dispose() {
		this.canvas.removeEventListener("dragover", this.onDragOver);
		this.canvas.removeEventListener("drop", this.onDrop);
	}
}
