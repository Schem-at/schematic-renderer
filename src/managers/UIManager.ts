import { SchematicRenderer } from '../SchematicRenderer';

export class UIManager {
    private renderer: SchematicRenderer;
    private overlay: HTMLDivElement;
    private loadingIndicator: HTMLDivElement;
    private messageBox: HTMLDivElement;
    private progressBar: HTMLDivElement;
    
    constructor(renderer: SchematicRenderer) {
      this.renderer = renderer;
      this.overlay = document.createElement('div');
      this.loadingIndicator = document.createElement('div');
      this.messageBox = document.createElement('div');
      this.progressBar = document.createElement('div');
      
      this.createOverlay();
    }
  
    private createOverlay() {
      const container = this.renderer.canvas.parentElement || document.body;
  
      // Create overlay
      this.overlay.style.position = 'absolute';
      this.overlay.style.top = '0';
      this.overlay.style.left = '0';
      this.overlay.style.width = '100%';
      this.overlay.style.height = '100%';
      this.overlay.style.pointerEvents = 'none'; // Allow clicks to pass through
      this.overlay.style.display = 'none'; // Hidden by default
  
      // Create loading indicator
      this.loadingIndicator.style.position = 'absolute';
      this.loadingIndicator.style.top = '50%';
      this.loadingIndicator.style.left = '50%';
      this.loadingIndicator.style.transform = 'translate(-50%, -50%)';
      this.loadingIndicator.style.padding = '10px';
      this.loadingIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      this.loadingIndicator.style.color = '#fff';
      this.loadingIndicator.style.borderRadius = '5px';
      this.loadingIndicator.style.display = 'none';
  
      // Create message box
      this.messageBox.style.position = 'absolute';
      this.messageBox.style.bottom = '10px';
      this.messageBox.style.left = '50%';
      this.messageBox.style.transform = 'translateX(-50%)';
      this.messageBox.style.padding = '10px';
      this.messageBox.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      this.messageBox.style.color = '#fff';
      this.messageBox.style.borderRadius = '5px';
      this.messageBox.style.display = 'none';
  
      // Append elements
      this.overlay.appendChild(this.loadingIndicator);
      this.overlay.appendChild(this.messageBox);
      container.appendChild(this.overlay);
    
      this.progressBar.style.position = 'absolute';
      this.progressBar.style.bottom = '0';
      this.progressBar.style.left = '0';
      this.progressBar.style.width = '0%';
      this.progressBar.style.height = '5px';
      this.progressBar.style.backgroundColor = '#00ff00';
      this.progressBar.style.transition = 'width 0.2s ease';
      this.progressBar.style.display = 'none';
    
      this.overlay.appendChild(this.progressBar);
    }
    
    // Methods to control progress bar
    public showProgressBar() {
      this.progressBar.style.display = 'block';
      this.showOverlay();
    }
    
    public hideProgressBar() {
      this.progressBar.style.display = 'none';
      this.hideOverlay();
    }
    
    public updateProgress(progress: number) {
      this.progressBar.style.width = `${progress * 100}%`;
    }
  
    public showOverlay() {
      this.overlay.style.display = 'block';
    }
  
    public hideOverlay() {
      this.overlay.style.display = 'none';
    }
  
    public showLoadingIndicator(message: string = 'Loading...') {
      this.loadingIndicator.textContent = message;
      this.loadingIndicator.style.display = 'block';
      this.showOverlay();
    }
  
    public hideLoadingIndicator() {
      this.loadingIndicator.style.display = 'none';
      this.hideOverlay();
    }
  
    public showMessage(message: string, duration: number = 3000) {
      this.messageBox.textContent = message;
      this.messageBox.style.display = 'block';
      this.showOverlay();
  
      // Hide after duration
      setTimeout(() => {
        this.messageBox.style.display = 'none';
        this.hideOverlay();
      }, duration);
    }
  
    public dispose() {
      // Remove overlay from DOM
      this.overlay.remove();
    }
  }
  