import { SchematicRenderer } from "../../../src/SchematicRenderer";
import { SchematicExporter } from "../../../src/export/SchematicExporter";
import { KeyframeTrack } from "../../../src/camera/KeyframeTrack";
import type { InterpolationMode } from "../../../src/camera/KeyframeTrack";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import * as THREE from "three";

// ---------- FFmpeg Setup ----------
const ffmpeg = new FFmpeg();
let ffmpegReady = false;
let rendererReady = false;

const initFFmpeg = async () => {
	try {
		const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
		await ffmpeg.load({
			coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
			wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
		});
		ffmpegReady = true;
		window.dispatchEvent(new CustomEvent("ffmpeg-ready"));
	} catch (e) {
		console.error("FFmpeg failed to load:", e);
	}
};
initFFmpeg();

// No default schematic — user loads via drag-and-drop or file picker

// ---------- Renderer Setup ----------
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

// Constructor: (canvas, schematicData, defaultResourcePacks, options)
const renderer = new SchematicRenderer(
	canvas,
	{}, // schematicData — user loads via UI
	{}, // defaultResourcePacks
	{
		ffmpeg: ffmpeg,
		hdri: "/minecraft_day.hdr",
		gamma: 0.45,
		enableAdaptiveFPS: true,
		targetFPS: 30,
		postProcessingOptions: { enabled: true },
		debugOptions: { enableInspector: false },
		showCameraPathVisualization: false,
		enableDragAndDrop: true,
		singleSchematicMode: true,
		enableInteraction: false,
		callbacks: {
			onRendererInitialized: async (r: SchematicRenderer) => {
				r.uiManager?.hideEmptyState();
				rendererReady = true;
				window.dispatchEvent(new CustomEvent("renderer-ready", { detail: r }));
			},
			onSchematicLoaded: (name: string) => {
				window.dispatchEvent(new CustomEvent("schematic-loaded", { detail: name }));
			},
		},
	}
);

(window as any).renderer = renderer;

// ---------- Helpers ----------
function getActiveControls(): any {
	const cm = renderer.cameraManager;
	if (!cm) return null;
	return cm.controls.get(cm.activeControlKey) || null;
}

function getControlsTarget(): THREE.Vector3 {
	const controls = getActiveControls();
	if (controls && "target" in controls) {
		return controls.target.clone();
	}
	return new THREE.Vector3(0, 0, 0);
}

// ---------- Keyframe ----------
interface Keyframe {
	position: number; // percentage 0-100 on the timeline
	cameraPos: THREE.Vector3;
	cameraTarget: THREE.Vector3;
	label: string;
	posText: string;
	targetText: string;
	timeText: string;
}

// ---------- Alpine.js UI ----------
(window as any).mediaCaptureUI = function () {
	return {
		// State
		activeMode: "screenshot" as "screenshot" | "video" | "export",
		// Camera settings
		camera: {
			fov: 75,
		},
		// Auto-thumbnail
		autoThumbnail: {
			enabled: false,
			presetName: "Thumbnail 512", // matches a built-in preset name
		},
		lastThumbnailUrl: null as string | null,
		rendererReady: false,
		ffmpegReady: false,
		isRecording: false,
		isPreviewPlaying: false,
		recordingProgress: 0,
		recordingStatus: "",
		cameraInfo: "perspective",
		cameraPosition: "0, 0, 0",
		callbackLog: [] as Array<{ time: string; type: string; message: string }>,

		// Screenshot settings
		screenshot: {
			format: "image/png" as "image/png" | "image/jpeg" | "image/webp",
			preset: "1080p",
			width: 1920,
			height: 1080,
			quality: 0.95,
		},

		// Recording settings
		recording: {
			duration: 5,
			preset: "1080p",
			width: 1920,
			height: 1080,
			fps: 60,
			useJpeg: true,
			encodingPreset: "veryfast",
			crf: 20,
		},

		// Background settings
		background: {
			mode: "hdri" as "hdri" | "solid" | "transparent" | "image",
			hdriPath: "/minecraft_day.hdr",
			color: "#222222",
			imagePath: null as string | null,
			_imageTexture: null as THREE.Texture | null,
			presetColors: [
				{ name: "Black", value: "#000000" },
				{ name: "White", value: "#ffffff" },
				{ name: "Sky Blue", value: "#87ceeb" },
				{ name: "Dark Gray", value: "#222222" },
				{ name: "Midnight", value: "#191970" },
				{ name: "Forest", value: "#228b22" },
				{ name: "Warm Gray", value: "#3a3a3a" },
				{ name: "Crimson", value: "#dc143c" },
			],
		},

		// 3D Export settings
		exportOpts: {
			format: "glb" as "glb" | "gltf" | "obj" | "stl" | "usdz",
			quality: "high" as "low" | "medium" | "high" | "ultra",
			centerAtOrigin: true,
		},

		// Capture presets
		presets: [] as Array<{ name: string; config: any }>,
		presetName: "",
		builtinPresets: [
			{ name: "Thumbnail 512", config: { width: 512, height: 512, format: "image/webp", quality: 0.85, fov: 50, bgMode: "transparent" } },
			{ name: "Social 1:1", config: { width: 1080, height: 1080, format: "image/png", quality: 0.95, fov: 60, bgMode: "hdri" } },
			{ name: "Hero 4K", config: { width: 3840, height: 2160, format: "image/png", quality: 1.0, fov: 75, bgMode: "hdri" } },
			{ name: "Banner 3:1", config: { width: 1500, height: 500, format: "image/webp", quality: 0.9, fov: 90, bgMode: "hdri" } },
			{ name: "Icon 256", config: { width: 256, height: 256, format: "image/webp", quality: 0.8, fov: 45, bgMode: "transparent" } },
		],

		_loadPresets() {
			try {
				const saved = localStorage.getItem("mediaCapturePresets");
				if (saved) this.presets = JSON.parse(saved);
			} catch (_) {}
		},

		_savePresetsToStorage() {
			localStorage.setItem("mediaCapturePresets", JSON.stringify(this.presets));
		},

		/** Capture current settings as a preset config */
		_captureConfig(): any {
			const cam = renderer.cameraManager?.activeCamera.camera;
			const camPos = cam ? { x: cam.position.x, y: cam.position.y, z: cam.position.z } : null;
			const target = getControlsTarget();
			const camTarget = { x: target.x, y: target.y, z: target.z };
			return {
				width: this.screenshot.width,
				height: this.screenshot.height,
				format: this.screenshot.format,
				quality: this.screenshot.quality,
				fov: this.camera.fov,
				bgMode: this.background.mode,
				bgColor: this.background.color,
				bgHdri: this.background.hdriPath,
				camPos,
				camTarget,
			};
		},

		/** Apply a preset config to current settings */
		applyPreset(config: any) {
			if (config.width) this.screenshot.width = config.width;
			if (config.height) this.screenshot.height = config.height;
			if (config.format) this.screenshot.format = config.format;
			if (config.quality) this.screenshot.quality = config.quality;
			if (config.fov) this.setFov(config.fov);
			if (config.bgMode) {
				this.background.mode = config.bgMode;
				if (config.bgColor) this.background.color = config.bgColor;
				if (config.bgHdri) this.background.hdriPath = config.bgHdri;
				this.applyBackground();
			}
			if (config.camPos && config.camTarget) {
				const pos = new THREE.Vector3(config.camPos.x, config.camPos.y, config.camPos.z);
				const tgt = new THREE.Vector3(config.camTarget.x, config.camTarget.y, config.camTarget.z);
				this._scrubCameraTo(pos, tgt);
			}
			this.screenshot.preset = "custom";
			this.log("event", `Preset applied: ${config.width}x${config.height} ${config.format}`);
		},

		savePreset() {
			const name = this.presetName.trim();
			if (!name) return;
			const config = this._captureConfig();
			// Update if exists, otherwise add
			const idx = this.presets.findIndex((p: any) => p.name === name);
			if (idx >= 0) {
				this.presets[idx].config = config;
			} else {
				this.presets.push({ name, config });
			}
			this._savePresetsToStorage();
			this.presetName = "";
			this.log("success", `Preset saved: ${name}`);
		},

		deletePreset(index: number) {
			const name = this.presets[index]?.name;
			this.presets.splice(index, 1);
			this._savePresetsToStorage();
			this.log("event", `Preset deleted: ${name}`);
		},

		// Orbit settings
		orbit: {
			keyframeCount: 12,
			padding: 0.08,
			heightFactor: 0.6,
			startAngle: 0,   // degrees
			endAngle: 360,    // degrees
		},

		// Timeline — uses KeyframeTrack from the library
		track: new KeyframeTrack("catmull-rom"),
		selectedKeyframe: null as number | null,
		playheadPosition: 0,
		showPathViz: false,
		_isDraggingKeyframe: false,
		_dragKeyframeIndex: -1,
		_isScrubbing: false,

		// Proxy getters for template compatibility
		get keyframes() { return this.track.getKeyframes() as any[]; },
		get interpolation() { return this.track.interpolation; },
		set interpolation(v: InterpolationMode) { this.track.interpolation = v; },

		get selectedKeyframeData() {
			if (this.selectedKeyframe === null) return null;
			return this.track.getKeyframe(this.selectedKeyframe) || null;
		},

		get viewportAspect(): string {
			if (this.activeMode === "video") {
				return `${this.recording.width} / ${this.recording.height}`;
			}
			return `${this.screenshot.width} / ${this.screenshot.height}`;
		},

		// --- Init ---
		init() {
			window.addEventListener("renderer-ready", () => {
				if (!this.rendererReady) {
					this.rendererReady = true;
					this.log("success", "Renderer initialized");
					this.startCameraPolling();
					this.refreshPacks();
				}
			});
			window.addEventListener("ffmpeg-ready", () => {
				if (!this.ffmpegReady) {
					this.ffmpegReady = true;
					this.log("event", "FFmpeg loaded and ready");
				}
			});
			window.addEventListener("schematic-loaded", ((e: CustomEvent) => {
				this.log("event", `Schematic loaded: ${e.detail}`);
				if (this.autoThumbnail.enabled) {
					// Delay to let mesh build finish
					setTimeout(() => this.generateAutoThumbnail(e.detail), 500);
				}
			}) as EventListener);

			// If renderer already initialized before Alpine init ran
			if (rendererReady && !this.rendererReady) {
				this.rendererReady = true;
				this.log("success", "Renderer initialized");
				this.startCameraPolling();
				this.refreshPacks();
			}
			// If FFmpeg already loaded before Alpine init ran
			if (ffmpegReady && !this.ffmpegReady) {
				this.ffmpegReady = true;
				this.log("event", "FFmpeg loaded and ready");
			}

			this._loadPresets();
		},

		// --- Mode switching ---
		setMode(mode: "screenshot" | "video" | "export") {
			// Hide path viz when leaving video mode
			if (this.activeMode === "video" && mode !== "video" && this.showPathViz) {
				const scene = renderer.sceneManager?.scene;
				const viz = scene?.getObjectByName("kfPathViz");
				if (viz) viz.visible = false;
			}
			// Show it again when returning to video mode
			if (mode === "video" && this.showPathViz) {
				const scene = renderer.sceneManager?.scene;
				const viz = scene?.getObjectByName("kfPathViz");
				if (viz) viz.visible = true;
			}
			this.activeMode = mode;

			// Sync FOV from camera when entering screenshot
			if (mode === "screenshot" || mode === "video") {
				const cam = renderer.cameraManager?.activeCamera.camera;
				if (cam && cam instanceof THREE.PerspectiveCamera) {
					this.camera.fov = Math.round(cam.fov);
				}
			}
		},

		// --- Camera controls ---
		setFov(fov: number) {
			this.camera.fov = fov;
			const cam = renderer.cameraManager?.activeCamera.camera;
			if (cam && cam instanceof THREE.PerspectiveCamera) {
				cam.fov = fov;
				cam.updateProjectionMatrix();
			}
		},

		switchToPerspective() {
			renderer.cameraManager?.switchCameraPreset("perspective");
			this.cameraInfo = "perspective";
			this.log("event", "Switched to perspective camera");
			setTimeout(() => {
				const cam = renderer.cameraManager?.activeCamera.camera;
				if (cam && cam instanceof THREE.PerspectiveCamera) {
					this.camera.fov = Math.round(cam.fov);
				}
			}, 100);
		},

		switchToIsometric() {
			renderer.cameraManager?.switchCameraPreset("isometric");
			renderer.cameraManager?.resetIsometricAngles(true);
			this.cameraInfo = "isometric";
			this.log("event", "Switched to isometric camera");
			// RenderManager auto-swaps HDRI for solid color in isometric mode.
			// Re-apply our background choice after the switch settles.
			setTimeout(() => this.applyBackground(), 100);
		},

		/** Snap camera to a named angle */
		snapCameraAngle(angle: string) {
			renderer.cameraManager?.snapToAngle(angle);
			this.log("event", `Camera snap: ${angle}`);
		},

		// --- Logging ---
		log(type: string, message: string) {
			const now = new Date();
			const time = now.toLocaleTimeString("en-US", { hour12: false }) + "." + String(now.getMilliseconds()).padStart(3, "0");
			this.callbackLog.push({ time, type, message });
			// Auto-scroll
			setTimeout(() => {
				const el = document.getElementById("callbackLog");
				if (el) el.scrollTop = el.scrollHeight;
			}, 0);
		},

		clearLog() {
			this.callbackLog = [];
		},

		// --- Camera polling ---
		startCameraPolling() {
			setInterval(() => {
				if (!renderer.cameraManager) return;
				const cam = renderer.cameraManager.activeCamera.camera;
				this.cameraPosition = `${cam.position.x.toFixed(1)}, ${cam.position.y.toFixed(1)}, ${cam.position.z.toFixed(1)}`;
				this.cameraInfo = cam instanceof THREE.OrthographicCamera ? "isometric" : "perspective";
			}, 200);
		},

		// --- Screenshot ---
		applyScreenshotPreset() {
			const presets: Record<string, [number, number]> = {
				"1080p": [1920, 1080],
				"1440p": [2560, 1440],
				"4k": [3840, 2160],
				"square_1k": [1024, 1024],
				"square_2k": [2048, 2048],
			};
			const p = presets[this.screenshot.preset];
			if (p) {
				this.screenshot.width = p[0];
				this.screenshot.height = p[1];
			}
		},

		async takeScreenshot() {
			this.log("event", `Taking screenshot: ${this.screenshot.width}x${this.screenshot.height} ${this.screenshot.format}`);
			try {
				const blob = await renderer.takeScreenshot({
					width: this.screenshot.width,
					height: this.screenshot.height,
					quality: this.screenshot.quality,
					format: this.screenshot.format,
					transparent: this.background.mode === "transparent",
				});

				this.log("success", `Screenshot captured: ${(blob.size / 1024).toFixed(1)} KB`);

				const url = URL.createObjectURL(blob);
				const extMap: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
				const ext = extMap[this.screenshot.format] || "png";
				const a = document.createElement("a");
				a.href = url;
				a.download = `schematic-capture-${Date.now()}.${ext}`;
				a.click();
				URL.revokeObjectURL(url);

				this.log("success", `Downloaded: ${a.download}`);
			} catch (e: any) {
				this.log("error", `Screenshot failed: ${e.message}`);
			}
		},

		// --- Recording ---
		applyRecordingPreset() {
			const presets: Record<string, [number, number]> = {
				"1080p": [1920, 1080],
				"1440p": [2560, 1440],
				"4k": [3840, 2160],
			};
			const p = presets[this.recording.preset];
			if (p) {
				this.recording.width = p[0];
				this.recording.height = p[1];
			}
		},

		async toggleRecording() {
			if (this.isRecording) {
				this.isRecording = false;
				this.recordingStatus = "Stopped";
				this.log("event", "Recording stopped");
				return;
			}

			if (this.track.length < 2) {
				this.log("error", "Need at least 2 keyframes to record");
				return;
			}

			this.isRecording = true;
			this.recordingProgress = 0;
			this.recordingStatus = "Capturing frames...";

			const { width, height, fps, duration, useJpeg, encodingPreset, crf } = this.recording;
			this.log("event", `Recording: ${width}x${height} @ ${fps}fps, ${duration}s, ${this.interpolation}`);

			// Jump to first keyframe
			const firstKf = this.track.getKeyframe(0);
			if (firstKf) {
				this._scrubCameraTo(firstKf.cameraPos, firstKf.cameraTarget);
			}

			try {
				const recordingManager = renderer.cameraManager.recordingManager;
				await recordingManager.startRecording(duration, {
					width,
					height,
					frameRate: fps,
					useJpegFrames: useJpeg,
					encodingPreset: encodingPreset as any,
					crf,
					// Use the library's onFrame callback — drives camera from our KeyframeTrack
					onFrame: (progress: number) => {
						const pct = progress * 100;
						const result = this.track.getAt(pct);
						if (result) {
							this._scrubCameraTo(result.position, result.target);
						}
						this.playheadPosition = pct;
					},
					onStart: () => {
						this.log("event", "Recording capture started");
					},
					onProgress: (progress: number) => {
						this.recordingProgress = progress * 50;
						this.recordingStatus = `Capturing: ${Math.round(progress * 100)}%`;
					},
					onFfmpegProgress: (progress: number) => {
						this.recordingProgress = progress;
						this.recordingStatus = `Encoding: ${Math.round(progress)}%`;
					},
					onComplete: (blob: Blob) => {
						this.isRecording = false;
						this.recordingProgress = 100;
						this.recordingStatus = "Complete!";
						this.log("success", `Recording complete: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

						const url = URL.createObjectURL(blob);
						const a = document.createElement("a");
						a.href = url;
						a.download = `schematic-recording-${Date.now()}.mp4`;
						a.click();
						URL.revokeObjectURL(url);
						this.log("success", `Downloaded: ${a.download}`);
					},
				});
			} catch (e: any) {
				this.isRecording = false;
				this.recordingStatus = "Failed";
				this.log("error", `Recording failed: ${e.message}`);
			}
		},

		// --- Background (uses library setBackgroundMode API) ---

		async applyBackground() {
			if (!this.rendererReady || !renderer.renderManager) return;

			const rm = renderer.renderManager;

			switch (this.background.mode) {
				case "hdri":
					await rm.setBackgroundMode("hdri", {
						hdriPath: this.background.hdriPath,
						force: true,
					});
					this.log("event", `HDRI background: ${this.background.hdriPath}`);
					break;

				case "solid":
					await rm.setBackgroundMode("solid", { color: this.background.color });
					this.log("event", `Solid background: ${this.background.color}`);
					break;

				case "transparent":
					await rm.setBackgroundMode("transparent");
					this.log("event", "Transparent background");
					break;

				case "image":
					if (this.background._imageTexture) {
						await rm.setBackgroundMode("image", { imageTexture: this.background._imageTexture });
					}
					this.log("event", `Image background: ${this.background.imagePath || "none"}`);
					break;
			}
		},

		uploadBackgroundImage() {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = "image/*";
			input.onchange = async (event) => {
				const file = (event.target as HTMLInputElement).files?.[0];
				if (!file) return;
				this.log("event", `Loading background image: ${file.name}`);
				try {
					const url = URL.createObjectURL(file);
					const loader = new THREE.TextureLoader();
					const texture = await new Promise<THREE.Texture>((resolve, reject) => {
						loader.load(url, resolve, undefined, reject);
					});
					texture.colorSpace = THREE.SRGBColorSpace;
					this.background._imageTexture = texture;
					this.background.imagePath = file.name;
					this.background.mode = "image";
					await this.applyBackground();
					this.log("success", `Background image loaded: ${file.name}`);
				} catch (e: any) {
					this.log("error", `Background image failed: ${e.message}`);
				}
			};
			input.click();
		},

		// --- Auto thumbnail ---
		async generateAutoThumbnail(schematicName?: string) {
			this.log("event", `Generating auto-thumbnail${schematicName ? ` for ${schematicName}` : ""}...`);

			try {
				// Find preset config
				const presetName = this.autoThumbnail.presetName;
				const builtin = this.builtinPresets.find((p: any) => p.name === presetName);
				const user = this.presets.find((p: any) => p.name === presetName);
				const config = (builtin || user)?.config;

				if (!config) {
					this.log("error", `Auto-thumbnail preset "${presetName}" not found`);
					return;
				}

				// Apply preset settings temporarily
				const prevFormat = this.screenshot.format;
				const prevWidth = this.screenshot.width;
				const prevHeight = this.screenshot.height;
				const prevQuality = this.screenshot.quality;

				this.screenshot.width = config.width || 512;
				this.screenshot.height = config.height || 512;
				this.screenshot.format = config.format || "image/webp";
				this.screenshot.quality = config.quality || 0.85;
				if (config.fov) this.setFov(config.fov);

				// Fit camera to schematic
				await renderer.cameraManager?.focusOnSchematics({ padding: 0.08, animationDuration: 0 });

				// Wait a frame for the render
				await new Promise((r) => requestAnimationFrame(r));
				await new Promise((r) => requestAnimationFrame(r));

				// Capture using library API (handles transparent + webp natively)
				const blob = await renderer.takeScreenshot({
					width: this.screenshot.width,
					height: this.screenshot.height,
					quality: this.screenshot.quality,
					format: this.screenshot.format,
					transparent: config.bgMode === "transparent",
				});

				// Store as preview URL
				if (this.lastThumbnailUrl) URL.revokeObjectURL(this.lastThumbnailUrl);
				this.lastThumbnailUrl = URL.createObjectURL(blob);

				this.log("success", `Auto-thumbnail: ${this.screenshot.width}x${this.screenshot.height} ${this.screenshot.format} (${(blob.size / 1024).toFixed(1)} KB)`);

				// Restore settings
				this.screenshot.format = prevFormat;
				this.screenshot.width = prevWidth;
				this.screenshot.height = prevHeight;
				this.screenshot.quality = prevQuality;
			} catch (e: any) {
				this.log("error", `Auto-thumbnail failed: ${e.message}`);
			}
		},

		// --- Framing ---
		async frameFit() {
			try {
				await renderer.cameraManager?.focusOnSchematics({ padding: 0.1, animationDuration: 0.5 });
				this.log("event", "Camera framed to fit all schematics");
			} catch (e: any) {
				this.log("error", `Frame fit failed: ${e.message}`);
			}
		},

		async frameFitInstant() {
			try {
				await renderer.cameraManager?.focusOnSchematics({ padding: 0.1, animationDuration: 0 });
				this.log("event", "Camera snapped to fit schematics");
			} catch (e: any) {
				this.log("error", `Frame fit failed: ${e.message}`);
			}
		},

		async frameZoomOrbit() {
			try {
				await renderer.cameraManager?.zoomToOrbitPosition({ duration: 1.0, padding: 0.15 });
				this.log("event", "Camera zoomed to orbit position");
			} catch (e: any) {
				this.log("error", `Zoom to orbit failed: ${e.message}`);
			}
		},

		frameLookAtCenter() {
			renderer.cameraManager?.lookAtSchematicsCenter();
			this.log("event", "Camera looking at schematics center");
		},

		// --- 3D Export ---
		async export3D() {
			this.log("event", `Exporting ${this.exportOpts.format.toUpperCase()} (${this.exportOpts.quality})...`);

			try {
				const exporter = new SchematicExporter();

				exporter.on("exportProgress", (progress) => {
					this.log("data", `Export ${progress.phase}: ${Math.round(progress.progress * 100)}% - ${progress.message}`);
				});

				const meshes = renderer.sceneManager?.scene;
				if (!meshes) {
					this.log("error", "No scene available for export");
					return;
				}

				const result = await exporter.export(meshes, {
					format: this.exportOpts.format,
					quality: this.exportOpts.quality,
					centerAtOrigin: this.exportOpts.centerAtOrigin,
				});

				this.log("success", `Export complete: ${result.filename} (${(result.size / 1024).toFixed(1)} KB, ${result.duration.toFixed(0)}ms)`);
				exporter.download(result);
			} catch (e: any) {
				this.log("error", `Export failed: ${e.message}`);
			}
		},

		// --- Timeline / Keyframes ---

		_makeKeyframe(position: number): Keyframe {
			const cam = renderer.cameraManager?.activeCamera.camera;
			const camPos = cam ? cam.position.clone() : new THREE.Vector3();
			const target = getControlsTarget();
			return {
				position,
				cameraPos: camPos,
				cameraTarget: target,
				label: `KF ${this.keyframes.length + 1}`,
				posText: `${camPos.x.toFixed(1)}, ${camPos.y.toFixed(1)}, ${camPos.z.toFixed(1)}`,
				targetText: `${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)}`,
				timeText: `${((position / 100) * this.recording.duration).toFixed(2)}s`,
			};
		},

		_insertKeyframe(kf: Keyframe) {
			this.track.addKeyframe(kf.position, kf.cameraPos, kf.cameraTarget, kf.label);
			this.track.enforceFirstLast();
			// Select the newly added keyframe
			const kfs = this.track.getKeyframes();
			this.selectedKeyframe = kfs.findIndex(k => k.label === kf.label);
		},

		/** First and last keyframes are locked in position (not draggable) */
		isLockedKeyframe(i: number): boolean {
			return i === 0 || i === this.keyframes.length - 1;
		},

		addKeyframeAtPlayhead() {
			const kf = this._makeKeyframe(this.playheadPosition);
			this._insertKeyframe(kf);
			this.log("event", `Keyframe added at ${kf.timeText}`);
		},

		addKeyframeAtClick(event: MouseEvent) {
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			const pct = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
			const kf = this._makeKeyframe(pct);
			this._insertKeyframe(kf);
			this.log("event", `Keyframe added at ${kf.timeText}`);
		},

		/** Update the selected keyframe's camera to current view */
		updateSelectedKeyframe() {
			if (this.selectedKeyframe === null) return;
			const kf = this.keyframes[this.selectedKeyframe];
			if (!kf) return;
			const cam = renderer.cameraManager?.activeCamera.camera;
			if (!cam) return;

			kf.cameraPos = cam.position.clone();
			kf.cameraTarget = getControlsTarget();
			kf.posText = `${kf.cameraPos.x.toFixed(1)}, ${kf.cameraPos.y.toFixed(1)}, ${kf.cameraPos.z.toFixed(1)}`;
			kf.targetText = `${kf.cameraTarget.x.toFixed(1)}, ${kf.cameraTarget.y.toFixed(1)}, ${kf.cameraTarget.z.toFixed(1)}`;
			this.log("event", `Keyframe ${this.selectedKeyframe + 1} updated to current camera`);
		},

		selectKeyframe(i: number) {
			this.selectedKeyframe = i;
		},

		jumpToKeyframe(i: number) {
			const kf = this.keyframes[i];
			if (!kf) return;
			this._scrubCameraTo(kf.cameraPos, kf.cameraTarget);
			this.playheadPosition = kf.position;
			this.log("event", `Jumped to keyframe ${i + 1}`);
		},

		removeSelectedKeyframe() {
			if (this.selectedKeyframe === null) return;
			// Don't allow removing if it would leave less than 2 keyframes
			// and don't remove first/last
			if (this.isLockedKeyframe(this.selectedKeyframe) && this.keyframes.length <= 2) {
				this.log("event", "Can't remove locked keyframe");
				return;
			}
			this.track.removeKeyframe(this.selectedKeyframe);
			this.track.enforceFirstLast();
			this.selectedKeyframe = null;
			this.log("event", "Keyframe removed");
		},

		clearKeyframes() {
			this.track.clear();
			this.selectedKeyframe = null;
			this.playheadPosition = 0;
			// Remove visualization
			const scene = renderer.sceneManager?.scene;
			const viz = scene?.getObjectByName("kfPathViz");
			if (viz) scene!.remove(viz);
			this.showPathViz = false;
			this.log("event", "Timeline cleared");
		},

		// --- Scrub camera (uses KeyframeTrack from library) ---

		_scrubCameraTo(position: THREE.Vector3, target: THREE.Vector3) {
			const cam = renderer.cameraManager?.activeCamera.camera;
			if (!cam) return;

			const controls = getActiveControls();
			const wasEnabled = controls?.enabled;
			if (controls) controls.enabled = false;

			cam.position.copy(position);
			if (controls && "target" in controls) {
				controls.target.copy(target);
			}
			cam.lookAt(target);

			if (controls) {
				controls.enabled = wasEnabled;
				controls.update?.();
			}
		},

		_scrubToPercent(pct: number) {
			this.playheadPosition = pct;
			const result = this.track.getAt(pct);
			if (result) {
				this._scrubCameraTo(result.position, result.target);
			}
		},

		// --- Timeline mouse interactions ---
		onTimelineMouseDown(event: MouseEvent) {
			const track = event.currentTarget as HTMLElement;
			const rect = track.getBoundingClientRect();
			const pct = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));

			this._isScrubbing = true;
			this._scrubToPercent(pct);
			document.body.classList.add("scrubbing");

			const onMove = (e: MouseEvent) => {
				if (!this._isScrubbing) return;
				const p = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
				this._scrubToPercent(p);
			};
			const onUp = () => {
				this._isScrubbing = false;
				document.body.classList.remove("scrubbing");
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		},

		// --- Keyframe dragging ---
		startKeyframeDrag(index: number, event: MouseEvent) {
			this._isDraggingKeyframe = true;
			this._dragKeyframeIndex = index;
			this.selectedKeyframe = index;
			document.body.classList.add("scrubbing");

			const track = (event.target as HTMLElement).parentElement!;
			const rect = track.getBoundingClientRect();

			const onMove = (e: MouseEvent) => {
				if (!this._isDraggingKeyframe) return;
				const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
				this.track.setKeyframePosition(this._dragKeyframeIndex, pct);
			};
			const onUp = () => {
				this._isDraggingKeyframe = false;
				document.body.classList.remove("scrubbing");
				// After drag, the track re-sorted — find the keyframe's new index
				const kfs = this.track.getKeyframes();
				const draggedLabel = kfs[this._dragKeyframeIndex]?.label;
				if (draggedLabel) {
					this.selectedKeyframe = kfs.findIndex(k => k.label === draggedLabel);
				}
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		},

		// --- Path visualization ---
		togglePathVisualization() {
			this.showPathViz = !this.showPathViz;
			if (this.showPathViz) {
				this._updatePathVisualization();
				this.log("event", "Path visualization enabled");
			} else {
				const scene = renderer.sceneManager?.scene;
				const viz = scene?.getObjectByName("kfPathViz");
				if (viz) scene!.remove(viz);
				this.log("event", "Path visualization disabled");
			}
		},

		// --- Orbit generates keyframes with per-angle framing ---

		useCircularPath() {
			this.track.clear();
			this.selectedKeyframe = null;
			this.playheadPosition = 0;

			const sm = renderer.schematicManager;
			if (!sm || sm.isEmpty()) {
				this.log("error", "No schematics loaded");
				return;
			}

			const boundingBox = sm.getGlobalTightWorldBox();
			if (boundingBox.isEmpty()) {
				this.log("error", "Empty schematic bounds");
				return;
			}
			const center = boundingBox.getCenter(new THREE.Vector3());
			const sphereRadius = boundingBox.getBoundingSphere(new THREE.Sphere()).radius;

			const count = this.orbit.keyframeCount;
			const startRad = (this.orbit.startAngle * Math.PI) / 180;
			const endRad = (this.orbit.endAngle * Math.PI) / 180;
			const angleRange = endRad - startRad;
			const heightOffset = sphereRadius * this.orbit.heightFactor;

			// Pass 1: compute per-angle distances, find the maximum
			const directions: THREE.Vector3[] = [];
			let maxDist = 0;
			for (let i = 0; i <= count; i++) {
				const t = i / count;
				const angle = startRad + t * angleRange;
				const dirHoriz = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
				const camDir = new THREE.Vector3(
					dirHoriz.x,
					heightOffset / sphereRadius,
					dirHoriz.z
				).normalize();
				directions.push(camDir);
				maxDist = Math.max(maxDist, renderer.cameraManager.calculateFramingDistance(camDir, boundingBox, this.orbit.padding));
			}

			// Pass 2: generate keyframes with uniform max radius (smooth circle, always in frame)
			for (let i = 0; i <= count; i++) {
				const t = i / count;
				const pos = center.clone().add(directions[i].clone().multiplyScalar(maxDist));
				const tgt = center.clone();
				const angleDeg = this.orbit.startAngle + t * (this.orbit.endAngle - this.orbit.startAngle);

				this.track.addKeyframe(t * 100, pos, tgt, `${Math.round(angleDeg)}°`);
			}
			this.track.enforceFirstLast();

			// Build visualization from actual keyframe positions
			this._updatePathVisualization();

			this.log("success", `Orbit: ${count + 1} keyframes, ${this.orbit.startAngle}°-${this.orbit.endAngle}°, per-angle framing`);
		},

		/** Build a line visualization from the actual keyframe spline */
		_updatePathVisualization() {
			const scene = renderer.sceneManager?.scene;
			if (!scene) return;

			// Remove old visualization
			const oldViz = scene.getObjectByName("kfPathViz");
			if (oldViz) scene.remove(oldViz);

			if (this.keyframes.length < 2) {
				this.showPathViz = false;
				return;
			}

			// Sample the interpolation to build the line
			const points: THREE.Vector3[] = [];
			const samples = Math.max(64, this.keyframes.length * 8);
			for (let i = 0; i <= samples; i++) {
				const pct = (i / samples) * 100;
				const result = this.track.getAt(pct);
				if (result) points.push(result.position);
			}

			const geometry = new THREE.BufferGeometry().setFromPoints(points);
			const material = new THREE.LineBasicMaterial({ color: 0x4ae8ff, opacity: 0.6, transparent: true });
			const line = new THREE.Line(geometry, material);
			line.name = "kfPathViz";
			scene.add(line);

			// Add small spheres at keyframe positions
			const kfGroup = new THREE.Group();
			kfGroup.name = "kfPathVizMarkers";
			const dotGeo = new THREE.SphereGeometry(0.15);
			const dotMat = new THREE.MeshBasicMaterial({ color: 0xffb84a });
			for (const kf of this.keyframes) {
				const dot = new THREE.Mesh(dotGeo, dotMat);
				dot.position.copy(kf.cameraPos);
				kfGroup.add(dot);
			}
			// Attach markers to the line object so they get removed together
			line.add(kfGroup);

			this.showPathViz = true;
		},

		// --- Preview animation ---
		async previewTimeline() {
			if (this.isPreviewPlaying || this.keyframes.length < 2) return;
			this.isPreviewPlaying = true;

			// Jump to first keyframe before starting
			const firstKf = this.keyframes[0];
			this._scrubCameraTo(firstKf.cameraPos, firstKf.cameraTarget);
			this.playheadPosition = 0;
			this.log("event", `Preview started (${this.interpolation})`);

			const totalMs = this.recording.duration * 1000;
			const startTime = performance.now();

			const animate = () => {
				if (!this.isPreviewPlaying) return;
				const elapsed = performance.now() - startTime;
				const t = Math.min(1, elapsed / totalMs);
				const pct = t * 100;

				const result = this.track.getAt(pct);
				if (result) {
					this._scrubCameraTo(result.position, result.target);
				}
				this.playheadPosition = pct;

				if (t < 1) {
					requestAnimationFrame(animate);
				} else {
					this.isPreviewPlaying = false;
					this.log("event", "Preview complete");
				}
			};

			requestAnimationFrame(animate);
		},

		stopPreview() {
			this.isPreviewPlaying = false;
			this.playheadPosition = 0;
			this.log("event", "Preview stopped");
		},

		// --- Right panel tabs ---
		rightTab: "log" as "log" | "resources",

		// --- HDRI upload ---
		uploadHdri() {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = ".hdr,.exr";
			input.onchange = async (event) => {
				const file = (event.target as HTMLInputElement).files?.[0];
				if (!file) return;
				this.log("event", `Loading HDRI: ${file.name}`);
				try {
					const url = URL.createObjectURL(file);
					this.background.hdriPath = url;
					this.background.mode = "hdri";
					this.applyBackground();
					this.log("success", `HDRI loaded: ${file.name}`);
				} catch (e: any) {
					this.log("error", `HDRI upload failed: ${e.message}`);
				}
			};
			input.click();
		},

		// --- Resource packs ---
		resourcePacks: [] as Array<{ id: string; name: string; enabled: boolean; icon: string | null; size: number }>,

		refreshPacks() {
			if (!renderer.packs) return;
			const packs = renderer.packs.getAllPacks();
			this.resourcePacks = packs.map((p: any) => ({
				id: p.id,
				name: p.name,
				enabled: p.enabled,
				icon: p.icon,
				size: p.size,
			}));
		},

		async uploadResourcePack() {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = ".zip";
			input.onchange = async (event) => {
				const file = (event.target as HTMLInputElement).files?.[0];
				if (!file) return;
				this.log("event", `Loading resource pack: ${file.name}`);
				try {
					const packId = await renderer.packs.loadPackFromFile(file);
					this.log("success", `Resource pack loaded: ${file.name} (${packId})`);
					this.refreshPacks();
				} catch (e: any) {
					this.log("error", `Resource pack failed: ${e.message}`);
				}
			};
			input.click();
		},

		async toggleResourcePack(packId: string) {
			try {
				const enabled = await renderer.packs.togglePack(packId);
				this.log("event", `Pack ${packId}: ${enabled ? "enabled" : "disabled"}`);
				this.refreshPacks();
			} catch (e: any) {
				this.log("error", `Toggle pack failed: ${e.message}`);
			}
		},

		async removeResourcePack(packId: string) {
			try {
				await renderer.packs.removePack(packId);
				this.log("event", `Pack removed: ${packId}`);
				this.refreshPacks();
			} catch (e: any) {
				this.log("error", `Remove pack failed: ${e.message}`);
			}
		},

		async removeAllResourcePacks() {
			try {
				await renderer.packs.removeAllPacks();
				this.log("event", "All resource packs removed");
				this.refreshPacks();
			} catch (e: any) {
				this.log("error", `Remove all packs failed: ${e.message}`);
			}
		},

		// --- Add schematic ---
		addSchematic() {
			const fileInput = document.createElement("input");
			fileInput.type = "file";
			fileInput.accept = ".schem,.schematic,.litematic,.nbt";
			fileInput.onchange = async (event) => {
				const files = (event.target as HTMLInputElement).files;
				if (files && files[0]) {
					const file = files[0];
					this.log("event", `Loading schematic: ${file.name}`);
					try {
						await renderer.schematicManager?.loadSchematicFromFile(file);
						this.log("success", `Schematic loaded: ${file.name}`);
					} catch (e: any) {
						this.log("error", `Failed to load schematic: ${e.message}`);
					}
				}
			};
			fileInput.click();
		},
	};
};
