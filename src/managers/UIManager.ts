import { SchematicRenderer } from "../SchematicRenderer";

export class UIManager {
	private renderer: SchematicRenderer;
	private overlay: HTMLDivElement;
	private loadingIndicator: HTMLDivElement;
	private messageBox: HTMLDivElement;
	private progressBar: HTMLDivElement;
	public emptyStateOverlay: HTMLDivElement;
	// Add to UIManager class
	private fpvOverlay: HTMLDivElement | null = null;
	private fpvMenu: HTMLDivElement | null = null;
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

	public createFPVElements() {
		const canvas = this.renderer.canvas;
		
		// Create blocker
		this.fpvOverlay = document.createElement("div");
		Object.assign(this.fpvOverlay.style, {
			position: "absolute",
			top: "0",
			left: "0",
			width: "100%",
			height: "100%",
			backgroundColor: "rgba(20, 20, 20, 0.6)",
			display: "none",
			zIndex: "1000",
			pointerEvents: "auto",
			transition: "background-color 0.2s ease"
		});
	
		// Create menu
		this.fpvMenu = document.createElement("div");
		Object.assign(this.fpvMenu.style, {
			position: "absolute",
			top: "50%",
			left: "50%",
			transform: "translate(-50%, -50%)",
			textAlign: "center",
			color: "#fff",
			padding: "2rem",
			borderRadius: "8px",
			cursor: "pointer",
			pointerEvents: "auto",
			backgroundColor: "rgba(0, 0, 0, 0.3)"
		});
	
		const title = document.createElement("h2");
		title.textContent = "Creative Mode";
		Object.assign(title.style, {
			fontSize: "1.5rem",
			fontWeight: "600",
			marginBottom: "1.5rem"
		});
	
		const controls = document.createElement("div");
		Object.assign(controls.style, {
			fontSize: "1.125rem",
			opacity: "0.8",
			lineHeight: "1.5"
		});
		controls.innerHTML = `
			<div style="text-align: left;">
				<div><span style="opacity: 0.6;">Move:</span> WASD</div>
				<div><span style="opacity: 0.6;">Fly up:</span> SPACE</div>
				<div><span style="opacity: 0.6;">Fly down:</span> SHIFT</div>
				<div><span style="opacity: 0.6;">Look:</span> MOUSE</div>
				<div><span style="opacity: 0.6;">Exit:</span> ESC</div>
			</div>
		`;
	
		const instruction = document.createElement("p");
		instruction.textContent = "Click anywhere to begin";
		Object.assign(instruction.style, {
			marginTop: "1.5rem",
			fontSize: "1rem",
			opacity: "0.6"
		});
	
		this.fpvMenu.appendChild(title);
		this.fpvMenu.appendChild(controls);
		this.fpvMenu.appendChild(instruction);
		this.fpvOverlay.appendChild(this.fpvMenu);
	
		// Add to canvas parent and ensure parent has relative positioning
		const canvasParent = canvas.parentElement;
		if (canvasParent) {
			if (getComputedStyle(canvasParent).position === 'static') {
				canvasParent.style.position = 'relative';
			}
			canvasParent.appendChild(this.fpvOverlay);
		}

		this.keydownHandler = (e: KeyboardEvent) => {
            if (this.renderer.cameraManager.activeControlKey == "creative" && e.code === 'Space') {
                e.preventDefault();
            }
        };

        // Initially attach the handler
        window.addEventListener('keydown', this.keydownHandler);
	
		return {
			menu: this.fpvMenu,
			blocker: this.fpvOverlay
		};
	}

	public showFPVOverlay() {
		if (this.fpvOverlay) {
			this.fpvOverlay.style.display = 'block';
			if (this.fpvMenu) {
				this.fpvMenu.style.display = 'block';
			}
		}
	}

	public hideFPVOverlay() {
		if (this.fpvOverlay) {
			this.fpvOverlay.style.display = 'none';
			if (this.fpvMenu) {
				this.fpvMenu.style.display = 'none';
			}
		}
	} 

	constructor(renderer: SchematicRenderer) {
		this.renderer = renderer;
		this.overlay = document.createElement("div");
		this.loadingIndicator = document.createElement("div");
		this.messageBox = document.createElement("div");
		this.progressBar = document.createElement("div");
		if (this.renderer.options.enableDragAndDrop) {
			this.emptyStateOverlay = this.createUploadStateOverlay();
		} else {
			this.emptyStateOverlay = document.createElement("div");
		}
		this.createOverlay();
	}

	public showEmptyState() {
		this.emptyStateOverlay.style.display = "block";
	}

	public hideEmptyState() {
		this.emptyStateOverlay.style.display = "none";
	}

	private createUploadStateOverlay() {
		let emptyStateOverlay = document.createElement("div");
		const container = this.renderer.canvas.parentElement || document.body;

		emptyStateOverlay.style.position = "absolute";
		emptyStateOverlay.style.top = "0";
		emptyStateOverlay.style.left = "0";
		emptyStateOverlay.style.width = "100%";
		emptyStateOverlay.style.height = "100%";
		emptyStateOverlay.style.backgroundColor = "rgba(20, 20,20,0.6)";
		emptyStateOverlay.style.display = "none";
		emptyStateOverlay.style.transition = "background-color 0.2s ease";
		emptyStateOverlay.style.pointerEvents = "none";

		// Create content container
		const content = document.createElement("div");
		content.classList.add("uploadOverlayContent");
		content.style.position = "absolute";
		content.style.top = "50%";
		content.style.left = "50%";
		content.style.transform = "translate(-50%, -50%)";
		content.style.textAlign = "center";
		content.style.color = "#fff";
		content.style.padding = "2rem";
		content.style.borderRadius = "8px";
		content.style.transition = "transform 0.2s ease";

		// Create upload icon
		const iconContainer = document.createElement("div");
		iconContainer.innerHTML = `
			<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" 
				 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
			  <polyline points="17 8 12 3 7 8"/>
			  <line x1="12" y1="3" x2="12" y2="15"/>
			</svg>
		`;
		iconContainer.style.marginBottom = "1.5rem";
		iconContainer.style.padding = "1.5rem";
		iconContainer.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
		iconContainer.style.borderRadius = "50%";
		iconContainer.style.width = "fit-content";
		iconContainer.style.margin = "0 auto 1.5rem auto";

		// Create text content
		const title = document.createElement("h2");
		title.textContent = "No Schematics Loaded";
		title.style.fontSize = "1.5rem";
		title.style.fontWeight = "600";
		title.style.marginBottom = "0.5rem";

		const subtitle = document.createElement("p");
		subtitle.textContent = "Drag and drop your schematic files here";
		subtitle.style.fontSize = "1.125rem";
		subtitle.style.opacity = "0.8";
		subtitle.style.marginBottom = "0.5rem";

		const supportedFormats = document.createElement("p");
		supportedFormats.textContent =
			"Supports .schematic, .schem, and .litematic files";
		supportedFormats.style.fontSize = "0.875rem";
		supportedFormats.style.opacity = "0.6";
		supportedFormats.style.marginBottom = "1.5rem";

		// Create file input and button
		const fileInput = document.createElement("input");
		fileInput.type = "file";
		fileInput.accept = ".schematic,.schem,.litematic";
		fileInput.style.display = "none";

		const uploadButton = document.createElement("button");
		uploadButton.textContent = "Browse Files";
		uploadButton.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
		uploadButton.style.color = "#fff";
		uploadButton.style.border = "none";
		uploadButton.style.padding = "0.75rem 1.5rem";
		uploadButton.style.borderRadius = "4px";
		uploadButton.style.cursor = "pointer";
		uploadButton.style.transition = "background-color 0.2s ease";
		uploadButton.style.pointerEvents = "auto"; // Enable clicking

		uploadButton.addEventListener("mouseover", () => {
			uploadButton.style.backgroundColor = "rgba(255, 255, 255, 0.3)";
		});

		uploadButton.addEventListener("mouseout", () => {
			uploadButton.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
		});

		uploadButton.addEventListener("click", (e) => {
			e.stopPropagation();
			fileInput.click();
		});

		fileInput.addEventListener("change", async (e) => {
			const files = (e.target as HTMLInputElement).files;
			if (files && files.length > 0) {
				const file = files[0];
				// Trigger the same file handling logic as drag and drop
				const dropEvent = new DragEvent("drop", {
					dataTransfer: new DataTransfer(),
				});
				(dropEvent.dataTransfer as DataTransfer).items.add(file);
				this.renderer.canvas.dispatchEvent(dropEvent);
			}
		});

		// Append all elements
		content.appendChild(iconContainer);
		content.appendChild(title);
		content.appendChild(subtitle);
		content.appendChild(supportedFormats);
		content.appendChild(fileInput);
		content.appendChild(uploadButton);
		emptyStateOverlay.appendChild(content);
		container.appendChild(emptyStateOverlay);

		return emptyStateOverlay;
	}

	private createOverlay() {
		const container = this.renderer.canvas.parentElement || document.body;

		// Create overlay
		this.overlay.style.position = "absolute";
		this.overlay.style.top = "0";
		this.overlay.style.left = "0";
		this.overlay.style.width = "100%";
		this.overlay.style.height = "100%";
		this.overlay.style.pointerEvents = "none"; // Allow clicks to pass through
		this.overlay.style.display = "none"; // Hidden by default

		// Create loading indicator
		this.loadingIndicator.style.position = "absolute";
		this.loadingIndicator.style.top = "50%";
		this.loadingIndicator.style.left = "50%";
		this.loadingIndicator.style.transform = "translate(-50%, -50%)";
		this.loadingIndicator.style.padding = "10px";
		this.loadingIndicator.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
		this.loadingIndicator.style.color = "#fff";
		this.loadingIndicator.style.borderRadius = "5px";
		this.loadingIndicator.style.display = "none";

		// Create message box
		this.messageBox.style.position = "absolute";
		this.messageBox.style.bottom = "10px";
		this.messageBox.style.left = "50%";
		this.messageBox.style.transform = "translateX(-50%)";
		this.messageBox.style.padding = "10px";
		this.messageBox.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
		this.messageBox.style.color = "#fff";
		this.messageBox.style.borderRadius = "5px";
		this.messageBox.style.display = "none";

		// Append elements
		this.overlay.appendChild(this.loadingIndicator);
		this.overlay.appendChild(this.messageBox);
		container.appendChild(this.overlay);

		this.progressBar.style.position = "absolute";
		this.progressBar.style.bottom = "0";
		this.progressBar.style.left = "0";
		this.progressBar.style.width = "0%";
		this.progressBar.style.height = "5px";
		this.progressBar.style.backgroundColor = "#00ff00";
		this.progressBar.style.transition = "width 0.2s ease";
		this.progressBar.style.display = "none";

		this.overlay.appendChild(this.progressBar);
	}

	// Methods to control progress bar
	public showProgressBar() {
		this.progressBar.style.display = "block";
		this.showOverlay();
	}

	public hideProgressBar() {
		this.progressBar.style.display = "none";
		this.hideOverlay();
	}

	public updateProgress(progress: number) {
		this.progressBar.style.width = `${progress * 100}%`;
	}

	public showOverlay() {
		this.overlay.style.display = "block";
	}

	public hideOverlay() {
		this.overlay.style.display = "none";
	}

	public showLoadingIndicator(message: string = "Loading...") {
		this.loadingIndicator.textContent = message;
		this.loadingIndicator.style.display = "block";
		this.showOverlay();
	}

	public hideLoadingIndicator() {
		this.loadingIndicator.style.display = "none";
		this.hideOverlay();
	}

	public showMessage(message: string, duration: number = 3000) {
		this.messageBox.textContent = message;
		this.messageBox.style.display = "block";
		this.showOverlay();

		// Hide after duration
		setTimeout(() => {
			this.messageBox.style.display = "none";
			this.hideOverlay();
		}, duration);
	}

	public dispose() {

		if (this.keydownHandler) {
            window.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
		}
		
		// Existing cleanup
		this.overlay.remove();

		// Clean up FPV elements
		this.fpvOverlay?.remove();
		this.fpvMenu = null;
		this.fpvOverlay = null;
	}
}
