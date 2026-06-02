import * as THREE from "three";
import { SchematicRenderer } from "../SchematicRenderer";
import { FFmpeg } from "@ffmpeg/ffmpeg";

/**
 * Video output codec / format.
 * - "h264":        H.264 in MP4 — opaque, lossy, very small (~1–10 Mbps).
 * - "dnxhr_444":   Avid DNxHR 444 in MOV — 12-bit 4:4:4 + alpha. Fixed-bitrate (~880 Mbps @ 1080p60).
 * - "prores_4444": Apple ProRes 4444 in MOV — 4:4:4 + alpha. Fixed-bitrate (~330 Mbps @ 1080p60).
 * - "vp9_alpha":   VP9 in WebM — yuva420p alpha. Variable bitrate, fully tunable (~5–60 Mbps).
 * - "png_zip":     ZIP archive of PNG frames — lossless, frame-perfect, no encoding step.
 *                  Often smallest for sparse transparent scenes; works with any compositor.
 *
 * Any codec marked alpha-capable implies transparent recording: alpha mode is enabled
 * on the renderer and intermediate frames are forced to PNG.
 */
export type RecordingCodec = "h264" | "dnxhr_444" | "prores_4444" | "vp9_alpha" | "png_zip";

export interface RecordingOptions {
	width?: number;
	height?: number;
	frameRate?: number;
	quality?: number;
	/** Output codec. Default "h264". Use "dnxhr_444" for transparent MOV. */
	codec?: RecordingCodec;
	/**
	 * Force a transparent-background recording. When true, the output is hard-locked to
	 * DNxHR 444 in a QuickTime MOV with a real alpha channel — regardless of any `codec`
	 * passed alongside. Use this when you want "transparent or fail," not "transparent if convenient."
	 */
	transparent?: boolean;
	/** Use JPEG for intermediate frames (faster, smaller) vs PNG (lossless). Ignored for codec="dnxhr_444" (PNG forced). */
	useJpegFrames?: boolean;
	/** JPEG quality for intermediate frames (0.8-0.95 recommended) */
	jpegQuality?: number;
	/** Batch size for writing frames to FFmpeg (higher = more memory, faster) */
	batchSize?: number;
	/** FFmpeg encoding preset (H.264 only — ignored for DNxHR) */
	encodingPreset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium";
	/** CRF value for encoding quality. H.264: 18–28 (lower=better). VP9: 15–35 (lower=better, default 30). Ignored for DNxHR/ProRes (fixed bitrate). */
	crf?: number;
	/**
	 * Target video bitrate in Mbps. Only honored by `vp9_alpha` — switches it from
	 * constant-quality to constant-bitrate. Ignored by every other codec.
	 */
	bitrateMbps?: number;
	onStart?: () => void;
	onProgress?: (progress: number) => void;
	onFfmpegProgress?: (progress: number, time: number) => void;
	onComplete?: (blob: Blob) => void;
	/**
	 * Custom camera driver callback. Called before each frame with progress (0-1).
	 * When provided, the recording loop uses this instead of animateCameraAlongPath.
	 * Use this to drive the camera with keyframes, custom paths, etc.
	 */
	onFrame?: (progress: number) => void;
}

/**
 * True for codecs that produce a real alpha channel.
 * Drives the alpha-mode renderer toggle and PNG-frames enforcement.
 */
export function codecNeedsAlpha(codec: RecordingCodec): boolean {
	return (
		codec === "dnxhr_444" || codec === "prores_4444" || codec === "vp9_alpha" || codec === "png_zip"
	);
}

/**
 * True for codecs that go through FFmpeg. The `png_zip` codec skips FFmpeg
 * entirely (we zip the captured PNG frames directly with JSZip).
 */
export function codecIsFFmpegEncoded(codec: RecordingCodec): boolean {
	return codec !== "png_zip";
}

/**
 * Resolve the effective codec from a (possibly partial) RecordingOptions.
 * `transparent: true` hard-locks the result to an alpha-capable codec — there is no
 * fallback to H.264 once transparent is requested. If the caller specified a non-alpha
 * codec alongside `transparent: true`, we upgrade to the DNxHR 444 default.
 * Pure helper — exported for testing.
 */
export function resolveCodec(opts: {
	codec?: RecordingCodec;
	transparent?: boolean;
}): RecordingCodec {
	if (opts.transparent) {
		if (opts.codec && codecNeedsAlpha(opts.codec)) return opts.codec;
		return "dnxhr_444";
	}
	return opts.codec ?? "h264";
}

/**
 * Build the FFmpeg argv array for the given codec.
 * Pure helper — exported for testing.
 *
 * `bitrateMbps` is only used by codecs that support variable bitrate (currently vp9_alpha).
 * When provided, VP9 switches from constant-quality to constant-bitrate.
 */
export function buildFfmpegArgs(opts: {
	codec: RecordingCodec;
	frameRate: number;
	ext: string;
	encodingPreset: string;
	crf: number;
	bitrateMbps?: number;
}): string[] {
	const { codec, frameRate, ext, encodingPreset, crf, bitrateMbps } = opts;
	const input = [
		"-framerate",
		frameRate.toString(),
		"-pattern_type",
		"sequence",
		"-start_number",
		"0",
		"-i",
		`frame%06d.${ext}`,
	];
	if (codec === "dnxhr_444") {
		return [
			...input,
			"-c:v",
			"dnxhd",
			"-profile:v",
			"dnxhr_444",
			"-pix_fmt",
			"yuva444p10le",
			"output.mov",
		];
	}
	if (codec === "prores_4444") {
		// prores_ks profile 4 = ProRes 4444 (alpha). Profile 5 = 4444 XQ (also alpha, higher bitrate).
		// -bits_per_mb tuning is left at encoder default for predictable output.
		return [
			...input,
			"-c:v",
			"prores_ks",
			"-profile:v",
			"4",
			"-pix_fmt",
			"yuva444p10le",
			"output.mov",
		];
	}
	if (codec === "vp9_alpha") {
		// VP9 with alpha: yuva420p, auto-alt-ref must be 0.
		// NOTE: ffmpeg.wasm is built with --disable-pthreads, so we MUST NOT pass -row-mt
		// or any threading flag — those fail silently with no useful error message.
		// Variable-quality mode by default (-b:v 0 -crf N), CBR when bitrateMbps is set.
		const rateControl =
			bitrateMbps && bitrateMbps > 0
				? ["-b:v", `${bitrateMbps}M`]
				: ["-b:v", "0", "-crf", crf.toString()];
		// "good"/4 is the recommended quality/speed balance for non-realtime VP9 encoding.
		return [
			...input,
			"-c:v",
			"libvpx-vp9",
			"-pix_fmt",
			"yuva420p",
			"-auto-alt-ref",
			"0",
			"-deadline",
			"good",
			"-cpu-used",
			"4",
			...rateControl,
			"output.webm",
		];
	}
	if (codec === "png_zip") {
		// png_zip never reaches FFmpeg — codecIsFFmpegEncoded() is checked first.
		// Return empty for symmetry with the rest of the API.
		return [];
	}
	return [
		...input,
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
}

/**
 * Output filename + MIME type for the given codec.
 * Pure helper — exported for testing.
 */
export function getOutputInfo(codec: RecordingCodec): { filename: string; mimeType: string } {
	if (codec === "dnxhr_444" || codec === "prores_4444") {
		return { filename: "output.mov", mimeType: "video/quicktime" };
	}
	if (codec === "vp9_alpha") {
		return { filename: "output.webm", mimeType: "video/webm" };
	}
	if (codec === "png_zip") {
		return { filename: "output.zip", mimeType: "application/zip" };
	}
	return { filename: "output.mp4", mimeType: "video/mp4" };
}

export interface ScreenshotOptions {
	width?: number;
	height?: number;
	quality?: number;
	format?: "image/png" | "image/jpeg" | "image/webp";
	/** Capture with transparent background (requires alpha-capable renderer) */
	transparent?: boolean;
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
	// Warn at most once per session that recording is unavailable — otherwise every
	// renderer on a multi-instance page logs it.
	private static warnedNoFfmpeg = false;

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

	// DNxHR 444 alpha-mode bookkeeping — restored by cleanup()
	private alphaModeToRestore: boolean | null = null;

	// Rolling buffer of the last N ffmpeg log lines for error surfacing
	private ffmpegLogBuffer: string[] = [];
	private readonly FFMPEG_LOG_MAX = 60;
	private ffmpegLogHandler: ((data: { message?: string }) => void) | null = null;

	constructor(schematicRenderer: SchematicRenderer) {
		this.schematicRenderer = schematicRenderer;
		this.recordingCanvas = document.createElement("canvas");
		this.ctx2d = this.recordingCanvas.getContext("2d", {
			alpha: false, // No alpha for video frames - faster
			desynchronized: true,
			willReadFrequently: true, // Hint for optimization
		});

		if (!this.schematicRenderer.options.ffmpeg) {
			if (!RecordingManager.warnedNoFfmpeg) {
				RecordingManager.warnedNoFfmpeg = true;
				console.info("[RecordingManager] No FFmpeg provided — video recording disabled.");
			}
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

		// Use 'copy' to replace pixels instead of alpha-blending (prevents frame stacking with transparent sources)
		this.ctx2d.globalCompositeOperation = "copy";
		this.ctx2d.drawImage(mainCanvas, 0, 0);
		this.ctx2d.globalCompositeOperation = "source-over";

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

		// Use 'copy' to replace pixels instead of alpha-blending (prevents frame stacking with transparent sources)
		this.ctx2d.globalCompositeOperation = "copy";
		this.ctx2d.drawImage(mainCanvas, 0, 0);
		this.ctx2d.globalCompositeOperation = "source-over";

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

		this.ctx2d.globalCompositeOperation = "copy";
		this.ctx2d.drawImage(mainCanvas, 0, 0);
		this.ctx2d.globalCompositeOperation = "source-over";

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
	 * Takes a screenshot of the current view.
	 * Supports PNG, JPEG, WebP formats with optional transparency.
	 */
	public async takeScreenshot(options: ScreenshotOptions = {}): Promise<Blob> {
		const {
			width = this.schematicRenderer.renderManager?.renderer.domElement.width || 3840,
			height = this.schematicRenderer.renderManager?.renderer.domElement.height || 2160,
			quality = 0.95,
			format = "image/png",
			transparent = false,
		} = options;

		const renderManager = this.schematicRenderer.renderManager;
		if (!renderManager) throw new Error("RenderManager not initialized");

		// Enable alpha mode if transparent requested
		const wasAlpha = renderManager.isAlphaMode();
		if (transparent && !wasAlpha) {
			await renderManager.setAlphaMode(true);
		}

		const tempSettings = await this.setupTemporarySettings(width, height);

		// Also resize composer if active
		const rm = renderManager as any;
		if (rm.composer) rm.composer.setSize(width, height);

		await new Promise((resolve) => requestAnimationFrame(resolve));
		try {
			// Render through composer (handles both alpha and opaque paths)
			if (rm.composer) {
				rm.composer.render();
			} else {
				renderManager.render();
			}

			if (transparent) {
				// Capture directly from WebGL canvas to preserve alpha channel
				const glRenderer = renderManager.renderer as THREE.WebGLRenderer;
				const captureFormat = format === "image/jpeg" ? "image/png" : format; // JPEG can't do alpha
				const blob = await new Promise<Blob>((resolve, reject) => {
					glRenderer.domElement.toBlob(
						(b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
						captureFormat,
						captureFormat === "image/png" ? undefined : quality
					);
				});
				return blob;
			} else {
				// Standard capture path
				const frameData = await this.captureFramePNG(quality);
				const intermediateBlob = new Blob([frameData as BlobPart], { type: "image/png" });

				// Re-encode to WebP if requested (canvas toBlob handles it natively)
				if (format === "image/webp") {
					return this.reencodeBlob(intermediateBlob, "image/webp", quality);
				}
				return new Blob([frameData as BlobPart], { type: format });
			}
		} finally {
			// Restore composer size
			if (rm.composer) rm.composer.setSize(tempSettings.width, tempSettings.height);
			this.restoreSettings(tempSettings);

			// Restore alpha mode
			if (transparent && !wasAlpha) {
				await renderManager.setAlphaMode(false);
			}
		}
	}

	/** Re-encode a blob to a different image format via offscreen canvas */
	private async reencodeBlob(source: Blob, targetType: string, quality: number): Promise<Blob> {
		const img = new Image();
		const url = URL.createObjectURL(source);
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = reject;
			img.src = url;
		});
		URL.revokeObjectURL(url);

		const canvas = document.createElement("canvas");
		canvas.width = img.width;
		canvas.height = img.height;
		const ctx = canvas.getContext("2d")!;
		ctx.drawImage(img, 0, 0);

		return new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(b) => (b ? resolve(b) : reject(new Error("Re-encode failed"))),
				targetType,
				quality
			);
		});
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
			jpegQuality = 0.92,
			batchSize = 30, // Larger batches for better throughput
			encodingPreset = "veryfast", // Good balance of speed and quality
			crf = 20, // Good quality (lower = better, 18-28 typical)
			onStart,
			onProgress,
			onFfmpegProgress,
			onComplete,
			onFrame,
		} = options;

		// transparent: true HARD-LOCKS codec to an alpha-capable codec — no fallback to h264.
		const codec = resolveCodec(options);
		const needsAlpha = codecNeedsAlpha(codec);
		// Any alpha codec requires PNG frames — JPEG would strip the channel.
		const useJpegFrames = needsAlpha ? false : (options.useJpegFrames ?? true);
		const bitrateMbps = options.bitrateMbps;

		// If custom camera driver provided, use the self-contained recording path
		if (onFrame) {
			return this.startRecordingWithFrameCallback(duration, options);
		}

		// Configure frame capture
		this.useJpegFrames = useJpegFrames;
		this.jpegQuality = jpegQuality;
		this.frameBuffer = [];
		this.pendingWrites = [];
		this.rawFrames = [];
		this.useFastCapture = true; // Use fast synchronous capture

		// Transparent codec: enable alpha mode on renderer + alpha-capable 2D context.
		// Restore both in cleanup. We snapshot the previous alpha state to restore correctly.
		const renderManager = this.schematicRenderer.renderManager;
		const wasAlphaMode = needsAlpha && renderManager ? renderManager.isAlphaMode() : false;
		if (needsAlpha && renderManager && !wasAlphaMode) {
			await renderManager.setAlphaMode(true);
			this.alphaModeToRestore = false;
		}
		if (needsAlpha) {
			// Recreate the recording 2D context with alpha so getImageData/toBlob preserve the channel.
			this.ctx2d = this.recordingCanvas.getContext("2d", {
				alpha: true,
				desynchronized: true,
				willReadFrequently: true,
			});
			const codecNotes: Record<Exclude<RecordingCodec, "h264">, string> = {
				dnxhr_444: "DNxHR 444 (~880 Mbps @ 1080p60, ~3.5 Gbps @ 4K60)",
				prores_4444: "ProRes 4444 (~330 Mbps @ 1080p60)",
				vp9_alpha: `VP9+alpha WebM${bitrateMbps ? ` (CBR ${bitrateMbps} Mbps)` : " (CRF " + crf + ")"}`,
				png_zip: "PNG sequence in ZIP (lossless, frame-perfect, no codec)",
			};
			console.warn(
				`Transparent export: PNG frames + alpha channel. Codec: ${codecNotes[codec as Exclude<RecordingCodec, "h264">]}.`
			);
		}

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

					// png_zip: skip FFmpeg entirely, pack PNG frames into a ZIP blob.
					if (!codecIsFFmpegEncoded(codec)) {
						console.log("Packing PNG frames into ZIP...");
						const zipStart = performance.now();
						const zipBlob = await this.packFramesAsZip(this.frameCount, ext, onFfmpegProgress);
						console.log(
							`Zip complete in ${((performance.now() - zipStart) / 1000).toFixed(1)}s (${(zipBlob.size / 1024 / 1024).toFixed(2)} MB)`
						);
						this.cleanupFramesAsync(this.frameCount, ext);
						if (onFfmpegProgress) onFfmpegProgress(100, performance.now() - zipStart);
						if (onComplete) onComplete(zipBlob);
						this.stopRecording();
						return;
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
						const ffmpegArgs = buildFfmpegArgs({
							codec,
							frameRate,
							ext,
							encodingPreset,
							crf,
							bitrateMbps,
						});

						this.attachFfmpegLogCapture();
						try {
							await this.ffmpeg.exec(ffmpegArgs);
						} catch (e) {
							throw this.wrapFfmpegError(e, ffmpegArgs);
						} finally {
							this.detachFfmpegLogCapture();
						}

						if (progressInterval) {
							clearInterval(progressInterval);
						}

						if (onFfmpegProgress) {
							onFfmpegProgress(100, performance.now() - ffmpegStart);
						}

						const ffmpegTime = performance.now() - ffmpegStart;
						console.log(`FFmpeg encoding complete in ${(ffmpegTime / 1000).toFixed(1)}s`);

						// Get the video data
						const { filename: outputFilename, mimeType: outputMime } = getOutputInfo(codec);
						const data = await this.ffmpeg.readFile(outputFilename);

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

						const blob = new Blob([blobData], { type: outputMime });
						console.log(`Video size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

						// Cleanup frames in background
						this.cleanupFramesAsync(this.frameCount, ext);

						try {
							await this.ffmpeg.deleteFile(outputFilename);
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

	/**
	 * Read PNG frames out of FFmpeg's MEMFS and pack them into a ZIP blob.
	 * Used by the `png_zip` codec — bypasses video encoding entirely so the
	 * output is the original lossless frames, plus a manifest.json.
	 */
	private async packFramesAsZip(
		frameCount: number,
		ext: string,
		onFfmpegProgress?: (progress: number, time: number) => void
	): Promise<Blob> {
		if (!this.ffmpeg) throw new Error("FFmpeg not available — cannot read frames");
		const { default: JSZip } = await import("jszip");
		const zip = new JSZip();
		const startedAt = performance.now();

		for (let i = 0; i < frameCount; i++) {
			const filename = `frame${i.toString().padStart(6, "0")}.${ext}`;
			const data = await this.ffmpeg.readFile(filename);
			const bytes =
				data instanceof Uint8Array ? data : new TextEncoder().encode(data as unknown as string);
			zip.file(filename, bytes, { binary: true });
			if (onFfmpegProgress && i % 5 === 0) {
				// 50–95% slice covers reading frames out of MEMFS
				onFfmpegProgress(50 + (i / frameCount) * 45, performance.now() - startedAt);
			}
		}

		// Add a tiny manifest so consumers know frame rate / count without parsing filenames.
		zip.file(
			"manifest.json",
			JSON.stringify(
				{
					frameCount,
					extension: ext,
					filenamePattern: `frame%06d.${ext}`,
				},
				null,
				2
			)
		);

		// store (compression level 0) — PNGs are already deflate-compressed; recompressing
		// gains ~0% and costs CPU. ZIP serves as the container, not a compressor.
		return zip.generateAsync({
			type: "blob",
			compression: "STORE",
			mimeType: "application/zip",
		});
	}

	/** Start buffering ffmpeg's log output for error surfacing. */
	private attachFfmpegLogCapture(): void {
		if (!this.ffmpeg) return;
		this.ffmpegLogBuffer = [];
		this.ffmpegLogHandler = (data: { message?: string }) => {
			if (!data.message) return;
			this.ffmpegLogBuffer.push(data.message);
			if (this.ffmpegLogBuffer.length > this.FFMPEG_LOG_MAX) {
				this.ffmpegLogBuffer.shift();
			}
		};
		// @ts-ignore — ffmpeg.wasm log event
		this.ffmpeg.on("log", this.ffmpegLogHandler);
	}

	private detachFfmpegLogCapture(): void {
		if (this.ffmpeg && this.ffmpegLogHandler) {
			// @ts-ignore
			this.ffmpeg.off?.("log", this.ffmpegLogHandler);
		}
		this.ffmpegLogHandler = null;
	}

	/**
	 * Wrap an ffmpeg.exec failure with the last log lines so the caller sees a
	 * real error message instead of "undefined". The original ffmpeg.wasm
	 * exception is usually a plain non-zero exit code with no message.
	 */
	private wrapFfmpegError(original: unknown, args: string[]): Error {
		const tail = this.ffmpegLogBuffer.slice(-15).join("\n");
		const origMsg =
			original instanceof Error ? original.message : String(original ?? "exec failed");
		const wrapped = new Error(
			`FFmpeg exec failed (${origMsg}).\nargs: ${args.join(" ")}\n--- last ffmpeg log lines ---\n${tail || "(no log captured)"}`
		);
		console.error(wrapped.message);
		return wrapped;
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

		// Restore renderer alpha mode if DNxHR 444 enabled it. Fire-and-forget — cleanup is sync.
		if (this.alphaModeToRestore !== null) {
			const target = this.alphaModeToRestore;
			this.alphaModeToRestore = null;
			this.schematicRenderer.renderManager?.setAlphaMode(target).catch((e) => {
				console.warn("Failed to restore alpha mode:", e);
			});
			// Restore opaque ctx2d for subsequent (non-transparent) recordings/screenshots
			this.ctx2d = this.recordingCanvas.getContext("2d", {
				alpha: false,
				desynchronized: true,
				willReadFrequently: true,
			});
		}
	}

	public stopRecording(): void {
		console.log("Recording complete");
		this.isRecording = false;
		this.cleanup();
	}

	/**
	 * Recording path using a custom onFrame callback for camera control.
	 * Captures frames synchronously in a loop, then encodes with FFmpeg.
	 */
	private async startRecordingWithFrameCallback(
		duration: number,
		options: RecordingOptions
	): Promise<void> {
		const {
			width = 1920,
			height = 1080,
			frameRate = 60,
			jpegQuality = 0.92,
			encodingPreset = "veryfast",
			crf = 20,
			onStart,
			onProgress,
			onFfmpegProgress,
			onComplete,
			onFrame,
		} = options;

		// transparent: true HARD-LOCKS codec to an alpha-capable codec.
		const codec = resolveCodec(options);
		const needsAlpha = codecNeedsAlpha(codec);
		const bitrateMbps = options.bitrateMbps;
		// Any alpha codec must use PNG to preserve the channel.
		const useJpegFrames = needsAlpha ? false : (options.useJpegFrames ?? true);

		if (!this.ffmpeg || !onFrame) return;

		this.useJpegFrames = useJpegFrames;
		this.jpegQuality = jpegQuality;

		try {
			// Enable alpha on renderer for any alpha codec; restore in cleanup().
			const renderManager = this.schematicRenderer.renderManager;
			if (needsAlpha && renderManager && !renderManager.isAlphaMode()) {
				await renderManager.setAlphaMode(true);
				this.alphaModeToRestore = false;
			}

			await this.setupRecording(width, height);

			// Resize composer if active
			const rm = this.schematicRenderer.renderManager as any;
			if (rm?.composer) rm.composer.setSize(width, height);

			this.frameCount = 0;
			this.isRecording = true;
			if (onStart) onStart();

			const totalFrames = duration * frameRate;
			const ext = useJpegFrames ? "jpg" : "png";
			const captureCanvas = document.createElement("canvas");
			captureCanvas.width = width;
			captureCanvas.height = height;
			// Alpha-capable context for any alpha codec so toBlob preserves the channel.
			const ctx = captureCanvas.getContext("2d", {
				alpha: needsAlpha,
				willReadFrequently: true,
			})!;

			const frames: { data: Uint8Array; index: number }[] = [];

			for (let frame = 0; frame < totalFrames; frame++) {
				if (!this.isRecording) break;

				const progress = frame / (totalFrames - 1);
				onFrame(progress);

				// Render
				if (rm?.composer) {
					rm.composer.render();
				} else {
					this.schematicRenderer.renderManager?.render();
				}

				// Capture
				const mainCanvas = this.schematicRenderer.renderManager?.renderer.domElement;
				if (mainCanvas) {
					ctx.globalCompositeOperation = "copy";
					ctx.drawImage(mainCanvas, 0, 0);
					ctx.globalCompositeOperation = "source-over";
				}

				const blob = await new Promise<Blob>((resolve) => {
					captureCanvas.toBlob(
						(b) => resolve(b!),
						useJpegFrames ? "image/jpeg" : "image/png",
						useJpegFrames ? jpegQuality : 1.0
					);
				});
				const buffer = await blob.arrayBuffer();
				frames.push({ data: new Uint8Array(buffer), index: frame });

				if (onProgress) onProgress(frame / totalFrames);

				// Yield to keep UI responsive
				if (frame % 5 === 0) await new Promise((r) => setTimeout(r, 0));
			}

			// Restore renderer
			if (rm?.composer && this.originalSettings) {
				rm.composer.setSize(this.originalSettings.width, this.originalSettings.height);
			}
			this.cleanup();

			if (!this.isRecording && frames.length < totalFrames) {
				console.log("Recording cancelled");
				return;
			}

			// Write frames to FFmpeg
			for (let i = 0; i < frames.length; i++) {
				const filename = `frame${frames[i].index.toString().padStart(6, "0")}.${ext}`;
				await this.ffmpeg!.writeFile(filename, frames[i].data);
				if (onFfmpegProgress && i % 30 === 0) {
					onFfmpegProgress(50 + (i / frames.length) * 25, 0);
				}
			}

			// png_zip: skip FFmpeg, zip the frames.
			if (!codecIsFFmpegEncoded(codec)) {
				if (onFfmpegProgress) onFfmpegProgress(80, 0);
				const zipBlob = await this.packFramesAsZip(frames.length, ext, onFfmpegProgress);
				if (onFfmpegProgress) onFfmpegProgress(100, 0);
				if (onComplete) onComplete(zipBlob);
				this.cleanupFramesAsync(frames.length, ext);
				this.isRecording = false;
				return;
			}

			// Encode
			if (onFfmpegProgress) onFfmpegProgress(75, 0);
			const ffArgs = buildFfmpegArgs({ codec, frameRate, ext, encodingPreset, crf, bitrateMbps });
			this.attachFfmpegLogCapture();
			try {
				await this.ffmpeg!.exec(ffArgs);
			} catch (e) {
				throw this.wrapFfmpegError(e, ffArgs);
			} finally {
				this.detachFfmpegLogCapture();
			}

			const { filename: outputFilename, mimeType: outputMime } = getOutputInfo(codec);
			const data = await this.ffmpeg!.readFile(outputFilename);
			const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
			const videoBlob = new Blob([bytes as BlobPart], { type: outputMime });

			if (onFfmpegProgress) onFfmpegProgress(100, 0);
			if (onComplete) onComplete(videoBlob);

			// Cleanup FFmpeg files
			this.cleanupFramesAsync(frames.length, ext);
			await this.ffmpeg!.deleteFile(outputFilename).catch(() => {});

			this.isRecording = false;
		} catch (error) {
			this.cleanup();
			this.isRecording = false;
			throw error;
		}
	}

	public dispose(): void {
		// Only stop an actual recording (avoids a spurious "Recording complete" log),
		// and only terminate ffmpeg if it was ever provided — no ffmpeg is normal.
		if (this.isRecording) {
			this.stopRecording();
		}
		this.ffmpeg?.terminate();
	}
}
