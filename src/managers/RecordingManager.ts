import * as THREE from "three";
import { SchematicRenderer } from "../SchematicRenderer";
import { FFmpeg } from "@ffmpeg/ffmpeg";

export interface RecordingOptions {
	width?: number;
	height?: number;
	frameRate?: number;
	quality?: number;
	/** Use JPEG for intermediate frames (faster, smaller) vs PNG (lossless) */
	useJpegFrames?: boolean;
	/** JPEG quality for intermediate frames (0.8-0.95 recommended) */
	jpegQuality?: number;
	/** Batch size for writing frames to FFmpeg (higher = more memory, faster) */
	batchSize?: number;
	/** FFmpeg encoding preset: ultrafast, superfast, veryfast, faster, fast, medium */
	encodingPreset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium";
	/** CRF value for encoding quality (18-28, lower = better quality, larger file) */
	crf?: number;
	onStart?: () => void;
	onProgress?: (progress: number) => void;
	onFfmpegProgress?: (progress: number, time: number) => void;
	onComplete?: (blob: Blob) => void;
}

export interface ScreenshotOptions {
	width?: number;
	height?: number;
	quality?: number;
	format?: "image/png" | "image/jpeg";
}

// Frame buffer for batch processing
interface FrameBuffer {
	data: Uint8Array;
	index: number;
}

// Raw frame data for deferred encoding
interface RawFrame {
	imageData: ImageData;
	index: number;
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

	// Optimization: frame buffer for batch writing
	private frameBuffer: FrameBuffer[] = [];
	private pendingWrites: Promise<void>[] = [];
	private useJpegFrames: boolean = true;
	private jpegQuality: number = 0.92;

	// Raw frame storage for fast capture mode
	private rawFrames: RawFrame[] = [];
	private useFastCapture: boolean = true;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.recordingCanvas = document.createElement("canvas");
		this.ctx2d = this.recordingCanvas.getContext("2d", {
			alpha: false, // No alpha for video frames - faster
			desynchronized: true,
			willReadFrequently: true, // Hint for optimization
		});

		if (!this.schematicRenderer.options.ffmpeg) {
			console.groupCollapsed("FFmpeg not found");
			console.warn("FFmpeg not found in options");
			console.warn("Recording will not work");
			console.groupEnd();
			return;
		}

		this.ffmpeg = this.schematicRenderer.options.ffmpeg;
	}

	/**
	 * Fast synchronous frame capture - stores raw ImageData for later encoding
	 * This is much faster than toBlob() during real-time capture
	 */
	private captureFrameSync(): ImageData | null {
		if (!this.ctx2d) return null;
		const mainCanvas = this.schematicRenderer.renderManager?.renderer.domElement;
		if (!mainCanvas) return null;

		// Draw to recording canvas
		this.ctx2d.drawImage(mainCanvas, 0, 0);

		// Get raw pixel data (synchronous and fast)
		return this.ctx2d.getImageData(0, 0, this.recordingCanvas.width, this.recordingCanvas.height);
	}

	/**
	 * Convert ImageData to JPEG/PNG blob asynchronously
	 */
	private async imageDataToBlob(imageData: ImageData, quality: number = 0.92): Promise<Uint8Array> {
		// Create a temporary canvas for encoding
		const tempCanvas = document.createElement("canvas");
		tempCanvas.width = imageData.width;
		tempCanvas.height = imageData.height;
		const tempCtx = tempCanvas.getContext("2d", { alpha: false });
		if (!tempCtx) throw new Error("Failed to create temp context");

		tempCtx.putImageData(imageData, 0, 0);

		const mimeType = this.useJpegFrames ? "image/jpeg" : "image/png";
		const frameQuality = this.useJpegFrames ? quality : 1.0;

		return new Promise<Uint8Array>((resolve, reject) => {
			tempCanvas.toBlob(
				(blob) => {
					if (!blob) {
						reject(new Error("Failed to create blob from canvas"));
						return;
					}
					blob
						.arrayBuffer()
						.then((buffer) => {
							resolve(new Uint8Array(buffer));
						})
						.catch(reject);
				},
				mimeType,
				frameQuality
			);
		});
	}

	/**
	 * Capture a frame optimized for video recording
	 * Uses JPEG by default for much faster encoding (3-5x faster than PNG)
	 */
	private async captureFrame(quality: number = 0.92): Promise<Uint8Array> {
		if (!this.ctx2d) throw new Error("Recording context not initialized");
		const mainCanvas = this.schematicRenderer.renderManager?.renderer.domElement;
		if (!mainCanvas) throw new Error("Main canvas not found");

		// Draw directly without clearing (faster for opaque content)
		this.ctx2d.drawImage(mainCanvas, 0, 0);

		// Use JPEG for video frames - much faster to encode and smaller
		const mimeType = this.useJpegFrames ? "image/jpeg" : "image/png";
		const frameQuality = this.useJpegFrames ? quality || this.jpegQuality : 1.0;

		return new Promise<Uint8Array>((resolve, reject) => {
			this.recordingCanvas.toBlob(
				(blob) => {
					if (!blob) {
						reject(new Error("Failed to create blob from canvas"));
						return;
					}
					blob
						.arrayBuffer()
						.then((buffer) => {
							resolve(new Uint8Array(buffer));
						})
						.catch(reject);
				},
				mimeType,
				frameQuality
			);
		});
	}

	/**
	 * Capture frame for PNG screenshots (lossless)
	 */
	private async captureFramePNG(quality: number = 1.0): Promise<Uint8Array> {
		if (!this.ctx2d) throw new Error("Recording context not initialized");
		const mainCanvas = this.schematicRenderer.renderManager?.renderer.domElement;
		if (!mainCanvas) throw new Error("Main canvas not found");

		this.ctx2d.drawImage(mainCanvas, 0, 0);

		return new Promise<Uint8Array>((resolve, reject) => {
			this.recordingCanvas.toBlob(
				(blob) => {
					if (!blob) {
						reject(new Error("Failed to create blob from canvas"));
						return;
					}
					blob
						.arrayBuffer()
						.then((buffer) => {
							resolve(new Uint8Array(buffer));
						})
						.catch(reject);
				},
				"image/png",
				quality
			);
		});
	}

	public setCameraToFirstPathPoint(): void {
		const camera = this.schematicRenderer.cameraManager.activeCamera
			.camera as THREE.PerspectiveCamera;
		const path = this.schematicRenderer.cameraManager.cameraPathManager.getPath("circularPath");
		if (!path) throw new Error("Path not found");
		const { position, target } = path.getPoint(0);
		camera.position.copy(position);
		camera.lookAt(target);
	}

	/**
	 * Takes a screenshot of the current view
	 */
	public async takeScreenshot(options: ScreenshotOptions = {}): Promise<Blob> {
		const {
			width = this.schematicRenderer.renderManager?.renderer.domElement.width || 3840,
			height = this.schematicRenderer.renderManager?.renderer.domElement.height || 2160,
			quality = 0.95,
			format = "image/png",
		} = options;

		// Store original settings
		const tempSettings = await this.setupTemporarySettings(width, height);

		await new Promise((resolve) => requestAnimationFrame(resolve));
		try {
			// For screenshots, we need to explicitly render since we're not in an animation loop
			this.schematicRenderer.renderManager?.render();

			// Use PNG capture for screenshots (lossless)
			const frameData = await this.captureFramePNG(quality);
			return new Blob([frameData as BlobPart], { type: format });
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

	/**
	 * Write frames to FFmpeg in batches for better performance
	 */
	private async flushFrameBuffer(): Promise<void> {
		if (!this.ffmpeg || this.frameBuffer.length === 0) return;

		const writePromises = this.frameBuffer.map(async (frame) => {
			const ext = this.useJpegFrames ? "jpg" : "png";
			const filename = `frame${frame.index.toString().padStart(6, "0")}.${ext}`;
			await this.ffmpeg!.writeFile(filename, frame.data);
		});

		await Promise.all(writePromises);
		this.frameBuffer = [];
	}

	public async startRecording(duration: number, options: RecordingOptions = {}): Promise<void> {
		if (!this.ffmpeg) {
			console.error("FFmpeg not found");
			this.stopRecording();
			return;
		}
		if (this.isRecording) throw new Error("Recording already in progress");
		console.log("Starting recording...");

		const {
			width = 1920, // Default to 1080p for faster encoding
			height = 1080,
			frameRate = 60,
			useJpegFrames = true, // JPEG is 3-5x faster to encode
			jpegQuality = 0.92,
			batchSize = 30, // Larger batches for better throughput
			encodingPreset = "veryfast", // Good balance of speed and quality
			crf = 20, // Good quality (lower = better, 18-28 typical)
			onStart,
			onProgress,
			onFfmpegProgress,
			onComplete,
		} = options;

		// Configure frame capture
		this.useJpegFrames = useJpegFrames;
		this.jpegQuality = jpegQuality;
		this.frameBuffer = [];
		this.pendingWrites = [];
		this.rawFrames = [];
		this.useFastCapture = true; // Use fast synchronous capture

		try {
			console.log("Setting up recording...");
			console.log(`  Resolution: ${width}x${height}`);
			console.log(`  Frame rate: ${frameRate} FPS`);
			console.log(`  Frame format: ${useJpegFrames ? "JPEG" : "PNG"}`);
			console.log(`  Encoding preset: ${encodingPreset}`);
			console.log(`  Fast capture mode: ${this.useFastCapture ? "enabled" : "disabled"}`);

			await this.setupRecording(width, height);
			console.log("Recording setup complete");
			this.frameCount = 0;
			this.isRecording = true;

			if (onStart) onStart();

			const totalFrames = duration * frameRate;
			const ext = useJpegFrames ? "jpg" : "png";
			console.log(`Recording ${totalFrames} frames at ${frameRate} FPS...`);

			const startTime = performance.now();

			this.schematicRenderer.cameraManager.animateCameraAlongPath({
				targetFps: frameRate,
				totalFrames,
				lookAtTarget: true,
				onUpdate: async () => {
					if (!this.isRecording) return;

					if (this.useFastCapture) {
						// Fast path: synchronous capture, store raw ImageData
						const imageData = this.captureFrameSync();
						if (imageData) {
							this.rawFrames.push({
								imageData,
								index: this.frameCount,
							});
						}
						this.frameCount++;
					} else {
						// Legacy path: async capture with immediate encoding
						const frame = await this.captureFrame(jpegQuality);
						this.frameBuffer.push({
							data: frame,
							index: this.frameCount,
						});
						this.frameCount++;

						if (this.frameBuffer.length >= batchSize) {
							const writePromise = this.flushFrameBuffer();
							this.pendingWrites.push(writePromise);
						}
					}

					if (onProgress) onProgress(this.frameCount / totalFrames);
				},
				onComplete: async () => {
					if (!this.isRecording) return;

					const captureTime = performance.now() - startTime;
					console.log(`Frame capture complete in ${(captureTime / 1000).toFixed(1)}s`);
					console.log(`Captured ${this.rawFrames.length || this.frameCount} frames`);

					if (this.useFastCapture && this.rawFrames.length > 0) {
						// Encode raw frames to JPEG/PNG and write to FFmpeg
						console.log("Encoding frames to image format...");
						const encodeFramesStart = performance.now();

						const totalRawFrames = this.rawFrames.length;
						let encodedCount = 0;

						// Process frames in batches for better memory management
						for (let i = 0; i < this.rawFrames.length; i += batchSize) {
							const batch = this.rawFrames.slice(i, Math.min(i + batchSize, this.rawFrames.length));

							// Encode batch in parallel
							const encodedBatch = await Promise.all(
								batch.map(async (rawFrame) => {
									const data = await this.imageDataToBlob(rawFrame.imageData, jpegQuality);
									return { data, index: rawFrame.index };
								})
							);

							// Write batch to FFmpeg
							await Promise.all(
								encodedBatch.map(async (frame) => {
									const filename = `frame${frame.index.toString().padStart(6, "0")}.${ext}`;
									await this.ffmpeg!.writeFile(filename, frame.data);
								})
							);

							encodedCount += batch.length;

							// Report progress during frame encoding phase
							if (onFfmpegProgress) {
								const encodeProgress = (encodedCount / totalRawFrames) * 50; // 0-50% for encoding
								onFfmpegProgress(encodeProgress, performance.now() - encodeFramesStart);
							}
						}

						// Clear raw frames to free memory
						this.rawFrames = [];

						const encodeFramesTime = performance.now() - encodeFramesStart;
						console.log(`Frame encoding complete in ${(encodeFramesTime / 1000).toFixed(1)}s`);
					} else {
						// Legacy path: flush remaining buffer
						await this.flushFrameBuffer();
						await Promise.all(this.pendingWrites);
						this.pendingWrites = [];
					}

					console.log("Encoding video with FFmpeg...");
					const ffmpegStart = performance.now();

					try {
						if (!this.ffmpeg) {
							console.error("FFmpeg not found");
							return;
						}

						// Set up progress tracking
						let progressInterval: ReturnType<typeof setInterval> | null = null;
						const estimatedFfmpegTimeMs = this.frameCount * 10; // ~10ms per frame for FFmpeg

						if (onFfmpegProgress) {
							const progressCallback = ({
								progress = 0,
								time = 0,
							}: {
								progress?: number;
								time?: number;
							}) => {
								const progressPercent = 50 + progress * 50; // 50-100% for FFmpeg
								if (progressPercent > 50) {
									onFfmpegProgress(progressPercent, time);
								}
							};
							// @ts-ignore
							this.ffmpeg.on("progress", progressCallback);

							let lastReportedProgress = 50;
							progressInterval = setInterval(() => {
								const elapsed = performance.now() - ffmpegStart;
								const estimatedProgress = 50 + Math.min(45, (elapsed / estimatedFfmpegTimeMs) * 50);
								if (estimatedProgress > lastReportedProgress) {
									lastReportedProgress = estimatedProgress;
									onFfmpegProgress(estimatedProgress, elapsed);
								}
							}, 100);
						}

						// Build FFmpeg command with optimized settings
						const ffmpegArgs = [
							"-framerate",
							frameRate.toString(),
							"-pattern_type",
							"sequence",
							"-start_number",
							"0",
							"-i",
							`frame%06d.${ext}`,
							"-c:v",
							"libx264",
							"-preset",
							encodingPreset,
							"-threads",
							"0",
							"-crf",
							crf.toString(),
							"-pix_fmt",
							"yuv420p",
							"-movflags",
							"+faststart",
							"output.mp4",
						];

						await this.ffmpeg.exec(ffmpegArgs);

						if (progressInterval) {
							clearInterval(progressInterval);
						}

						if (onFfmpegProgress) {
							onFfmpegProgress(100, performance.now() - ffmpegStart);
						}

						const ffmpegTime = performance.now() - ffmpegStart;
						console.log(`FFmpeg encoding complete in ${(ffmpegTime / 1000).toFixed(1)}s`);

						// Get the video data
						const data = await this.ffmpeg.readFile("output.mp4");

						let blobData: BlobPart;
						if (data instanceof Uint8Array) {
							blobData = data as any;
						} else if (typeof data === "string") {
							const binaryString = atob(data);
							const bytes = new Uint8Array(binaryString.length);
							for (let i = 0; i < binaryString.length; i++) {
								bytes[i] = binaryString.charCodeAt(i);
							}
							blobData = bytes;
						} else {
							throw new Error("Unexpected data type from FFmpeg");
						}

						const blob = new Blob([blobData], { type: "video/mp4" });
						console.log(`Video size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

						// Cleanup frames in background
						this.cleanupFramesAsync(this.frameCount, ext);

						try {
							await this.ffmpeg.deleteFile("output.mp4");
						} catch (e) {
							// Ignore cleanup errors
						}

						const totalTime = performance.now() - startTime;
						console.log(`Total recording time: ${(totalTime / 1000).toFixed(1)}s`);

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

	/**
	 * Cleanup frames asynchronously in background
	 */
	private async cleanupFramesAsync(frameCount: number, ext: string = "png"): Promise<void> {
		if (!this.ffmpeg) return;

		// Delete in batches to avoid blocking
		const batchSize = 50;
		for (let i = 0; i < frameCount; i += batchSize) {
			const batch = [];
			for (let j = i; j < Math.min(i + batchSize, frameCount); j++) {
				const filename = `frame${j.toString().padStart(6, "0")}.${ext}`;
				batch.push(
					this.ffmpeg.deleteFile(filename).catch(() => {
						// Ignore individual file deletion errors
					})
				);
			}
			await Promise.all(batch);
		}
	}

	private cleanup(): void {
		if (this.originalSettings) {
			const renderer = this.schematicRenderer.renderManager?.renderer;
			if (!renderer) throw new Error("Renderer not found");
			const camera = this.schematicRenderer.cameraManager.activeCamera
				.camera as THREE.PerspectiveCamera;
			renderer.setSize(this.originalSettings.width, this.originalSettings.height, false);
			renderer.setPixelRatio(this.originalSettings.pixelRatio);
			camera.aspect = this.originalSettings.aspect;
			camera.updateProjectionMatrix();
			this.originalSettings = null;
		}
	}

	public stopRecording(): void {
		console.log("Recording complete");
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
