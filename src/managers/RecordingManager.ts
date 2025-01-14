import * as THREE from "three";
import { SchematicRenderer } from "../SchematicRenderer";
import { FFmpeg } from "@ffmpeg/ffmpeg";

export interface RecordingOptions {
	width?: number;
	height?: number;
	frameRate?: number;
	quality?: number;
	onStart?: () => void;
	onProgress?: (progress: number) => void;
	onComplete?: (blob: Blob) => void;
}

export interface ScreenshotOptions {
	width?: number;
	height?: number;
	quality?: number;
	format?: "image/png" | "image/jpeg";
}

export class RecordingManager {
	public isRecording: boolean = false;
	private schematicRenderer: SchematicRenderer;
	private recordingCanvas: HTMLCanvasElement;
	private ctx2d: CanvasRenderingContext2D | null = null;
	private ffmpeg?: FFmpeg;
	private frameCount: number = 0;
	private originalSettings: {
		width: number;
		height: number;
		pixelRatio: number;
		aspect: number;
	} | null = null;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.recordingCanvas = document.createElement("canvas");
		this.ctx2d = this.recordingCanvas.getContext("2d", {
			alpha: false,
			desynchronized: true,
		});

		if (!this.schematicRenderer.options.ffmpeg) {
			console.error("FFmpeg not found in options");
			console.error("Recording will not work");
			return;
		}

		this.ffmpeg = this.schematicRenderer.options.ffmpeg;
	}
	private async captureFrame(quality: number = 1.0): Promise<Uint8Array> {
		if (!this.ffmpeg) {
			console.error("FFmpeg not found");
			return new Uint8Array();
		}
		if (!this.ctx2d) throw new Error("Recording context not initialized");
		const mainCanvas =
			this.schematicRenderer.renderManager?.renderer.domElement;
		if (!mainCanvas) throw new Error("Main canvas not found");

		// During animation, the scene is already being rendered for us
		// so we don't need to call render() here
		return new Promise<Uint8Array>((resolve) => {
			this.ctx2d!.drawImage(mainCanvas, 0, 0);
			this.recordingCanvas.toBlob(
				(blob) => {
					const reader = new FileReader();
					reader.onloadend = () => {
						resolve(new Uint8Array(reader.result as ArrayBuffer));
					};
					reader.readAsArrayBuffer(blob!);
				},
				"image/png",
				quality
			);
		});
	}

	/**
	 * Takes a screenshot of the current view
	 */
	public async takeScreenshot(options: ScreenshotOptions = {}): Promise<Blob> {
		const {
			width = this.schematicRenderer.renderManager?.renderer.domElement.width ||
				3840,
			height = this.schematicRenderer.renderManager?.renderer.domElement
				.height || 2160,
			quality = 0.9,
			format = "image/png",
		} = options;

		// Store original settings
		const tempSettings = await this.setupTemporarySettings(width, height);

		try {
			// For screenshots, we need to explicitly render since we're not in an animation loop
			this.schematicRenderer.renderManager?.render();

			const frameData = await this.captureFrame(quality);
			// @ts-ignore
			return new Blob([frameData.buffer], { type: format });
		} catch (error) {
			throw error;
		} finally {
			// Restore original settings
			this.restoreSettings(tempSettings);
		}
	}

	private async setupTemporarySettings(width: number, height: number) {
		const renderer = this.schematicRenderer.renderManager?.renderer;
		if (!renderer) throw new Error("Renderer not found");
		const camera = this.schematicRenderer.cameraManager.activeCamera
			.camera as THREE.PerspectiveCamera;

		// Store current settings
		const tempSettings = {
			width: renderer.domElement.width,
			height: renderer.domElement.height,
			pixelRatio: renderer.getPixelRatio(),
			aspect: camera.aspect,
		};

		// Apply new settings
		this.recordingCanvas.width = width;
		this.recordingCanvas.height = height;
		renderer.setPixelRatio(1.0);
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();

		return tempSettings;
	}

	private restoreSettings(settings: {
		width: number;
		height: number;
		pixelRatio: number;
		aspect: number;
	}): void {
		const renderer = this.schematicRenderer.renderManager?.renderer;
		if (!renderer) throw new Error("Renderer not found");
		const camera = this.schematicRenderer.cameraManager.activeCamera
			.camera as THREE.PerspectiveCamera;

		renderer.setSize(settings.width, settings.height, false);
		renderer.setPixelRatio(settings.pixelRatio);
		camera.aspect = settings.aspect;
		camera.updateProjectionMatrix();
	}

	private async setupRecording(width: number, height: number): Promise<void> {
		if (!this.ffmpeg) {
			console.error("FFmpeg not found");
			return;
		}
		const renderer = this.schematicRenderer.renderManager?.renderer;
		if (!renderer) throw new Error("Renderer not found");
		const camera = this.schematicRenderer.cameraManager.activeCamera
			.camera as THREE.PerspectiveCamera;

		this.originalSettings = {
			width: renderer.domElement.clientWidth,
			height: renderer.domElement.clientHeight,
			pixelRatio: renderer.getPixelRatio(),
			aspect: camera.aspect,
		};

		this.recordingCanvas.width = width;
		this.recordingCanvas.height = height;
		renderer.setPixelRatio(1.0);
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	}

    // @ts-ignore
	private async cleanupFrames(frameCount: number) {
		if (!this.ffmpeg) return;
		for (let i = 0; i < frameCount; i++) {
			const filename = `frame${i.toString().padStart(6, "0")}.png`;
			try {
				await this.ffmpeg.deleteFile(filename);
			} catch (error) {
				console.warn(`Failed to delete frame ${filename}`, error);
			}
		}
	}

	public async startRecording(
		duration: number,
		options: RecordingOptions = {}
	): Promise<void> {
		if (!this.ffmpeg) {
			console.error("FFmpeg not found");
			this.stopRecording();
			return;
		}
		if (this.isRecording) throw new Error("Recording already in progress");
		console.log("Starting recording...");

		const {
			width = 3840,
			height = 2160,
			frameRate = 60,
			onStart,
            onProgress,
            // @ts-ignore
			onComplete,
		} = options;
		if (!this.ffmpeg) {
			console.error("FFmpeg not found");
			this.stopRecording();
			return;
		}
		try {
			console.log("Setting up recording...");
			await this.setupRecording(width, height);
			console.log("Recording setup complete");
			this.frameCount = 0;
			this.isRecording = true;

			if (onStart) onStart();

			const totalFrames = duration * frameRate;
			console.log(`Recording ${totalFrames} frames at ${frameRate} FPS...`);
			this.schematicRenderer.cameraManager.animateCameraAlongPath({
				targetFps: frameRate,
				totalFrames,
				lookAtTarget: true,
				onUpdate: async () => {
					if (!this.isRecording) return;

					const frame = await this.captureFrame();
					const filename = `frame${this.frameCount
						.toString()
						.padStart(6, "0")}.png`;
					if (!this.ffmpeg) {
						console.error("FFmpeg not found");
						return;
					}
					await this.ffmpeg.writeFile(filename, frame);
					this.frameCount++;

					if (onProgress) onProgress(this.frameCount / totalFrames);
				},
				onComplete: async () => {
					if (!this.isRecording) return;
					console.log("Recording complete");
					console.log("Encoding video...");
					try {
						if (!this.ffmpeg) {
							console.error("FFmpeg not found");
							return;
						}
						await this.ffmpeg.exec([
							"-framerate",
							frameRate.toString(),
							"-pattern_type",
							"sequence",
							"-start_number",
							"0",
							"-i",
							"frame%06d.png",
							"-c:v",
							"libx264",
							"-preset",
							"ultrafast",
							"-threads",
							"0",
							"-crf",
							"23",
							"-pix_fmt",
							"yuv420p",
							"output.mp4",
						]);
						// Get the video blob
						const data = await this.ffmpeg.readFile("output.mp4");
						// @ts-ignore
						const blob = new Blob([data.buffer], { type: "video/mp4" });

						// Cleanup everything
						await this.cleanupFrames(this.frameCount);
						await this.ffmpeg.deleteFile("output.mp4");

						// Wait a small delay before restoring WebGL context
						await new Promise((resolve) => setTimeout(resolve, 100));

						if (onComplete) onComplete(blob);
					} catch (error) {
						console.error("FFmpeg encoding failed:", error);
						throw error;
                    }
						this.stopRecording();
                    
				},
			});
		} catch (error) {
            this.cleanup();
            console.error("Recording failed:", error);
			throw error;
		}
	}

	private cleanup(): void {
		if (this.originalSettings) {
			const renderer = this.schematicRenderer.renderManager?.renderer;
			if (!renderer) throw new Error("Renderer not found");
            const camera = this.schematicRenderer.cameraManager.activeCamera
				.camera as THREE.PerspectiveCamera;
			renderer.setSize(
				this.originalSettings.width,
				this.originalSettings.height,
				false
            );
			renderer.setPixelRatio(this.originalSettings.pixelRatio);
            camera.aspect = this.originalSettings.aspect;
			camera.updateProjectionMatrix();
			this.originalSettings = null;
		}
	}

    public stopRecording(): void {
        console.log('Recording complete');
		this.isRecording = false;
		this.cleanup();
	}

	public dispose(): void {
		this.stopRecording();
		if (!this.ffmpeg) {
			console.error("FFmpeg not found");
			return;
		}
		this.ffmpeg.terminate();
	}
}
