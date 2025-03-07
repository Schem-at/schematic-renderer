import { SchematicRenderer } from "../SchematicRenderer";
import { UIManager } from "./UIManager";
import { FileType, FileTypeUtility } from "../utils/FileTypeUtil"

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
    onResourcePackDropFailed?: (file: File, error: Error) => void | Promise<void>;
    
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

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      for (const file of files) {
        // Determine file type using our utility
        const fileType = FileTypeUtility.determineFileType(file);
        
        if (fileType === FileType.SCHEMATIC && this.isAcceptedFileType(file)) {
          await this.handleSchematicDrop(file);
        } 
        else if (fileType === FileType.RESOURCE_PACK) {
          await this.handleResourcePackDrop(file);
        } 
        else {
          // Show error message for unsupported file types
          this.uiManager.showMessage(`Unsupported file type: ${file.name}`);
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
      
      // Call schematic drop success callback
      await this.options.callbacks?.onSchematicDropSuccess?.(file);

      // Load the schematic
      await this.loadSchematicFromFile(file);

      // Hide loading indicator
      this.uiManager.hideLoadingIndicator();
    } catch (error) {
      // Hide loading indicator and show error message
      console.error(error);
      this.uiManager.hideLoadingIndicator();
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.uiManager.showMessage(`Error loading schematic ${file.name}: ${errorMessage}`);

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
      this.uiManager.showLoadingIndicator(`Loading resource pack: ${file.name}...`);

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
      this.uiManager.showMessage(`Resource pack ${file.name} loaded successfully!`);

      // Call the resource pack loaded callback
      await this.options.callbacks?.onResourcePackLoaded?.(file.name);
    } catch (error) {
      // Hide loading indicator and show error message
      console.error(error);
      this.uiManager.hideLoadingIndicator();
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.uiManager.showMessage(`Error loading resource pack ${file.name}: ${errorMessage}`);

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
    this.canvas.removeEventListener("dragleave", this.onDragLeave);
    this.canvas.removeEventListener("drop", this.onDrop);
  }
}