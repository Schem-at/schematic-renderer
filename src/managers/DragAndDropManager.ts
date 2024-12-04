import { SchematicRenderer } from '../SchematicRenderer';
import { UIManager } from './UIManager';

export interface DragAndDropManagerOptions {
  acceptedFileTypes?: string[];
  callbacks?: {
    onSchematicLoaded?: (schematicName: string) => void;
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
    this.canvas.addEventListener('dragover', this.onDragOver);
    this.canvas.addEventListener('dragleave', this.onDragLeave);
    this.canvas.addEventListener('drop', this.onDrop);
  }

  private onDragOver = (event: DragEvent) => {
    event.preventDefault();
    // Show visual feedback
    this.uiManager.showOverlay();
    this.canvas.style.border = '2px dashed #00ff00';
  };

  private onDragLeave = (event: DragEvent) => {
    event.preventDefault();
    // Hide visual feedback
    this.uiManager.hideOverlay();
    this.canvas.style.border = 'none';
  };

  private onDrop = async (event: DragEvent) => {
    event.preventDefault();
    // Hide visual feedback
    this.uiManager.hideOverlay();
    this.canvas.style.border = 'none';

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      for (const file of files) {
        if (this.isAcceptedFileType(file)) {
          // Show loading indicator
          this.uiManager.showLoadingIndicator(`Loading ${file.name}...`);
          try {
            await this.loadSchematicFromFile(file);
            // Hide loading indicator
            this.uiManager.hideLoadingIndicator();
          } catch (error) {
            // Hide loading indicator and show error message
            console.error(error);
            this.uiManager.hideLoadingIndicator();
            const errorMessage = (error instanceof Error) ? error.message : 'Unknown error';
            this.uiManager.showMessage(`Error loading ${file.name}: ${errorMessage}`);
          }
        } else {
          // Show error message
          this.uiManager.showMessage(`Unsupported file type: ${file.name}`);
        }
      }
    }
  };

  private isAcceptedFileType(file: File): boolean {
    if (!this.options.acceptedFileTypes || this.options.acceptedFileTypes.length === 0) {
      return true; // Accept all file types by default
    }
    const extension = file.name.split('.').pop()?.toLowerCase();
    return this.options.acceptedFileTypes.includes(extension || '');
  }

  private async loadSchematicFromFile(file: File) {
    try {
      await this.renderer.schematicManager?.loadSchematicFromFile(file);
  
      // Call the callback if provided
      const callback = this.options.callbacks?.onSchematicLoaded;
      if (callback) {
        callback(file.name);
      }
    } catch (error) {
      throw error; // Let the caller handle the error
    }
  }

  public dispose() {
    this.canvas.removeEventListener('dragover', this.onDragOver);
    this.canvas.removeEventListener('drop', this.onDrop);
  }
}
