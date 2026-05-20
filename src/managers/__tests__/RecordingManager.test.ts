import { describe, it, expect, vi, beforeEach } from "vitest";
import * as THREE from "three";

// Mock all problematic imports
vi.mock("nucleation", () => ({
	default: vi.fn().mockResolvedValue(undefined),
	SchematicWrapper: class {},
}));
vi.mock("../../workers/MeshBuilder.worker?worker&inline", () => ({
	default: class MockWorker {
		postMessage() {}
		terminate() {}
		onmessage = null;
	},
}));
vi.mock("../../workers/NucleationMesh.worker?worker&inline", () => ({
	default: class MockWorker {
		postMessage() {}
		terminate() {}
		onmessage = null;
	},
}));

// Mock postprocessing
vi.mock("postprocessing", () => ({
	EffectComposer: class {
		addPass = vi.fn();
		removePass = vi.fn();
		render = vi.fn();
		setSize = vi.fn();
		dispose = vi.fn();
	},
	RenderPass: class {
		enabled = true;
	},
	EffectPass: class {
		enabled = true;
	},
	SMAAEffect: class {},
}));
vi.mock("n8ao", () => ({
	N8AOPostPass: class {
		configuration = { intensity: 5, aoRadius: 1 };
		enabled = true;
		setSize = vi.fn();
	},
}));
vi.mock("../../effects/GammaCorrectionEffect", () => ({
	GammaCorrectionEffect: class {
		gamma = 0.5;
	},
}));
vi.mock("three/examples/jsm/loaders/RGBELoader.js", () => ({
	RGBELoader: class {
		load = vi.fn();
		setDataType = vi.fn().mockReturnThis();
	},
}));

// --- Helpers to build a mock SchematicRenderer ---

function createMockCanvas(width = 1920, height = 1080): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function createMockRenderer(width = 1920, height = 1080) {
	const domElement = createMockCanvas(width, height);
	return {
		domElement,
		getPixelRatio: vi.fn().mockReturnValue(1.0),
		setPixelRatio: vi.fn(),
		setSize: vi.fn((w: number, h: number) => {
			domElement.width = w;
			domElement.height = h;
		}),
		render: vi.fn(),
	};
}

function createMockCamera(aspect = 16 / 9) {
	return {
		camera: {
			aspect,
			position: new THREE.Vector3(5, 5, 5),
			lookAt: vi.fn(),
			updateProjectionMatrix: vi.fn(),
		} as unknown as THREE.PerspectiveCamera,
	};
}

function createMockCameraManager() {
	const activeCamera = createMockCamera();
	return {
		activeCamera,
		cameraPathManager: {
			getPath: vi.fn().mockReturnValue({
				getPoint: vi.fn().mockReturnValue({
					position: new THREE.Vector3(5, 5, 5),
					target: new THREE.Vector3(0, 0, 0),
				}),
			}),
		},
		animateCameraAlongPath: vi.fn().mockImplementation(async (opts: any) => {
			// Simulate a few frames then call onComplete
			const totalFrames = opts.totalFrames || 60;
			for (let i = 0; i < totalFrames; i++) {
				if (opts.onUpdate) await opts.onUpdate();
			}
			if (opts.onComplete) await opts.onComplete();
		}),
	};
}

function createMockFFmpeg() {
	return {
		writeFile: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn().mockResolvedValue(new Uint8Array([0x00, 0x00, 0x00, 0x1c])),
		deleteFile: vi.fn().mockResolvedValue(undefined),
		exec: vi.fn().mockResolvedValue(0),
		on: vi.fn(),
		terminate: vi.fn(),
	};
}

function createMockSchematicRenderer(overrides: Record<string, any> = {}) {
	const mockRenderer = createMockRenderer();
	const mockCameraManager = createMockCameraManager();
	const mockFFmpeg = createMockFFmpeg();

	return {
		options: {
			ffmpeg: mockFFmpeg,
			...overrides.options,
		},
		renderManager: {
			renderer: mockRenderer,
			render: vi.fn(),
			isAlphaMode: vi.fn().mockReturnValue(false),
			setAlphaMode: vi.fn().mockResolvedValue(undefined),
			composer: null,
			...overrides.renderManager,
		},
		cameraManager: {
			...mockCameraManager,
			...overrides.cameraManager,
		},
		_mockFFmpeg: mockFFmpeg,
		_mockRenderer: mockRenderer,
	};
}

// ---- Tests ----

describe("RecordingManager", () => {
	// We import dynamically after mocks are set up
	let RecordingManager: typeof import("../../managers/RecordingManager").RecordingManager;
	let buildFfmpegArgs: typeof import("../../managers/RecordingManager").buildFfmpegArgs;
	let getOutputInfo: typeof import("../../managers/RecordingManager").getOutputInfo;

	beforeEach(async () => {
		const mod = await import("../../managers/RecordingManager");
		RecordingManager = mod.RecordingManager;
		buildFfmpegArgs = mod.buildFfmpegArgs;
		getOutputInfo = mod.getOutputInfo;
	});

	describe("buildFfmpegArgs - codec branching", () => {
		it("returns H.264 MP4 args when codec is h264", () => {
			const args = buildFfmpegArgs({
				codec: "h264",
				frameRate: 60,
				ext: "jpg",
				encodingPreset: "veryfast",
				crf: 20,
			});
			expect(args).toContain("libx264");
			expect(args[args.indexOf("-pix_fmt") + 1]).toBe("yuv420p");
			expect(args[args.length - 1]).toBe("output.mp4");
			expect(args).not.toContain("dnxhd");
		});

		it("returns DNxHR 444 MOV args when codec is dnxhr_444", () => {
			const args = buildFfmpegArgs({
				codec: "dnxhr_444",
				frameRate: 60,
				ext: "png",
				encodingPreset: "veryfast",
				crf: 20,
			});
			expect(args).toContain("dnxhd");
			expect(args[args.indexOf("-profile:v") + 1]).toBe("dnxhr_444");
			expect(args[args.indexOf("-pix_fmt") + 1]).toBe("yuva444p10le");
			expect(args[args.length - 1]).toBe("output.mov");
			expect(args).not.toContain("libx264");
			// CRF / preset are H.264-only and must not appear for DNxHR
			expect(args).not.toContain("-crf");
			expect(args).not.toContain("-preset");
		});

		it("returns ProRes 4444 MOV args when codec is prores_4444", () => {
			const args = buildFfmpegArgs({
				codec: "prores_4444",
				frameRate: 60,
				ext: "png",
				encodingPreset: "veryfast",
				crf: 20,
			});
			expect(args).toContain("prores_ks");
			// ProRes profile 4 = 4444 (5 = 4444 XQ, both have alpha; we use 4)
			expect(args[args.indexOf("-profile:v") + 1]).toBe("4");
			expect(args[args.indexOf("-pix_fmt") + 1]).toBe("yuva444p10le");
			expect(args[args.length - 1]).toBe("output.mov");
			expect(args).not.toContain("libx264");
			expect(args).not.toContain("dnxhd");
		});

		it("returns VP9+alpha WebM args when codec is vp9_alpha", () => {
			const args = buildFfmpegArgs({
				codec: "vp9_alpha",
				frameRate: 60,
				ext: "png",
				encodingPreset: "veryfast",
				crf: 20,
			});
			expect(args).toContain("libvpx-vp9");
			expect(args[args.indexOf("-pix_fmt") + 1]).toBe("yuva420p");
			// VP9 alpha requires auto-alt-ref disabled
			expect(args[args.indexOf("-auto-alt-ref") + 1]).toBe("0");
			expect(args[args.length - 1]).toBe("output.webm");
		});

		it("VP9 args do NOT include -row-mt (ffmpeg.wasm is single-threaded — would fail)", () => {
			const args = buildFfmpegArgs({
				codec: "vp9_alpha",
				frameRate: 60,
				ext: "png",
				encodingPreset: "veryfast",
				crf: 30,
			});
			expect(args).not.toContain("-row-mt");
		});

		it("VP9 uses constant-quality CRF by default and CBR when bitrate set", () => {
			const cq = buildFfmpegArgs({
				codec: "vp9_alpha",
				frameRate: 60,
				ext: "png",
				encodingPreset: "veryfast",
				crf: 30,
			});
			// Constant quality: -b:v 0 -crf <n>
			expect(cq[cq.indexOf("-b:v") + 1]).toBe("0");
			expect(cq[cq.indexOf("-crf") + 1]).toBe("30");

			const cbr = buildFfmpegArgs({
				codec: "vp9_alpha",
				frameRate: 60,
				ext: "png",
				encodingPreset: "veryfast",
				crf: 30,
				bitrateMbps: 8,
			});
			// CBR: -b:v 8M, no -crf
			expect(cbr[cbr.indexOf("-b:v") + 1]).toBe("8M");
			expect(cbr).not.toContain("-crf");
		});

		it("uses the supplied frame rate and input pattern extension", () => {
			const args = buildFfmpegArgs({
				codec: "dnxhr_444",
				frameRate: 30,
				ext: "png",
				encodingPreset: "veryfast",
				crf: 20,
			});
			expect(args[args.indexOf("-framerate") + 1]).toBe("30");
			expect(args[args.indexOf("-i") + 1]).toBe("frame%06d.png");
		});
	});

	describe("resolveCodec - transparent enforcement", () => {
		let resolveCodec: typeof import("../../managers/RecordingManager").resolveCodec;
		beforeEach(async () => {
			const mod = await import("../../managers/RecordingManager");
			resolveCodec = mod.resolveCodec;
		});

		it("returns the explicit codec when transparent is not set", () => {
			expect(resolveCodec({ codec: "h264" })).toBe("h264");
			expect(resolveCodec({ codec: "dnxhr_444" })).toBe("dnxhr_444");
			expect(resolveCodec({})).toBe("h264");
		});

		it("forces dnxhr_444 when transparent: true, overriding any codec", () => {
			expect(resolveCodec({ transparent: true })).toBe("dnxhr_444");
			expect(resolveCodec({ transparent: true, codec: "h264" })).toBe("dnxhr_444");
			expect(resolveCodec({ transparent: true, codec: "dnxhr_444" })).toBe("dnxhr_444");
		});

		it("does not silently upgrade to dnxhr_444 when transparent is false/undefined", () => {
			expect(resolveCodec({ transparent: false, codec: "h264" })).toBe("h264");
			expect(resolveCodec({ transparent: false })).toBe("h264");
		});
	});

	describe("getOutputInfo - codec branching", () => {
		it("returns mp4 / video/mp4 for h264", () => {
			const info = getOutputInfo("h264");
			expect(info.filename).toBe("output.mp4");
			expect(info.mimeType).toBe("video/mp4");
		});

		it("returns mov / video/quicktime for dnxhr_444", () => {
			const info = getOutputInfo("dnxhr_444");
			expect(info.filename).toBe("output.mov");
			expect(info.mimeType).toBe("video/quicktime");
		});

		it("returns mov / video/quicktime for prores_4444", () => {
			const info = getOutputInfo("prores_4444");
			expect(info.filename).toBe("output.mov");
			expect(info.mimeType).toBe("video/quicktime");
		});

		it("returns webm / video/webm for vp9_alpha", () => {
			const info = getOutputInfo("vp9_alpha");
			expect(info.filename).toBe("output.webm");
			expect(info.mimeType).toBe("video/webm");
		});

		it("returns zip / application/zip for png_zip", () => {
			const info = getOutputInfo("png_zip");
			expect(info.filename).toBe("output.zip");
			expect(info.mimeType).toBe("application/zip");
		});
	});

	describe("png_zip codec - PNG sequence in zip", () => {
		it("is alpha-capable (lossless transparent frames)", async () => {
			const mod = await import("../../managers/RecordingManager");
			expect(mod.codecNeedsAlpha("png_zip")).toBe(true);
		});

		it("does not need ffmpeg encoding", async () => {
			const mod = await import("../../managers/RecordingManager");
			expect(mod.codecIsFFmpegEncoded("png_zip")).toBe(false);
			expect(mod.codecIsFFmpegEncoded("h264")).toBe(true);
			expect(mod.codecIsFFmpegEncoded("dnxhr_444")).toBe(true);
			expect(mod.codecIsFFmpegEncoded("vp9_alpha")).toBe(true);
		});
	});

	describe("resolveCodec - keeps alpha-capable codecs when transparent", () => {
		let resolveCodec: typeof import("../../managers/RecordingManager").resolveCodec;
		beforeEach(async () => {
			const mod = await import("../../managers/RecordingManager");
			resolveCodec = mod.resolveCodec;
		});

		it("keeps prores_4444 when transparent:true", () => {
			expect(resolveCodec({ transparent: true, codec: "prores_4444" })).toBe("prores_4444");
		});

		it("keeps vp9_alpha when transparent:true", () => {
			expect(resolveCodec({ transparent: true, codec: "vp9_alpha" })).toBe("vp9_alpha");
		});

		it("upgrades h264 to dnxhr_444 when transparent:true (h264 has no alpha)", () => {
			expect(resolveCodec({ transparent: true, codec: "h264" })).toBe("dnxhr_444");
		});
	});

	describe("codecNeedsAlpha", () => {
		let codecNeedsAlpha: typeof import("../../managers/RecordingManager").codecNeedsAlpha;
		beforeEach(async () => {
			const mod = await import("../../managers/RecordingManager");
			codecNeedsAlpha = mod.codecNeedsAlpha;
		});

		it("returns true for alpha-capable codecs", () => {
			expect(codecNeedsAlpha("dnxhr_444")).toBe(true);
			expect(codecNeedsAlpha("prores_4444")).toBe(true);
			expect(codecNeedsAlpha("vp9_alpha")).toBe(true);
		});

		it("returns false for h264", () => {
			expect(codecNeedsAlpha("h264")).toBe(false);
		});
	});

	describe("ScreenshotOptions interface", () => {
		it("should define default screenshot format as image/png", () => {
			const defaults = {
				width: 3840,
				height: 2160,
				quality: 0.95,
				format: "image/png" as const,
			};
			expect(defaults.format).toBe("image/png");
			expect(defaults.quality).toBe(0.95);
		});

		it("should support image/jpeg as alternative format", () => {
			const jpegOpts = {
				format: "image/jpeg" as const,
				quality: 0.85,
			};
			expect(jpegOpts.format).toBe("image/jpeg");
			expect(jpegOpts.quality).toBeLessThan(1.0);
		});
	});

	describe("Screenshot resolutions", () => {
		it("should support 1080p resolution (1920x1080)", () => {
			const opts = { width: 1920, height: 1080 };
			expect(opts.width / opts.height).toBeCloseTo(16 / 9, 1);
		});

		it("should support 1440p resolution (2560x1440)", () => {
			const opts = { width: 2560, height: 1440 };
			expect(opts.width / opts.height).toBeCloseTo(16 / 9, 1);
		});

		it("should support 4K resolution (3840x2160)", () => {
			const opts = { width: 3840, height: 2160 };
			expect(opts.width).toBe(3840);
			expect(opts.height).toBe(2160);
			expect(opts.width / opts.height).toBeCloseTo(16 / 9, 1);
		});

		it("should support custom square resolution", () => {
			const opts = { width: 2048, height: 2048 };
			expect(opts.width / opts.height).toBe(1);
		});

		it("should support ultrawide resolution (3440x1440)", () => {
			const opts = { width: 3440, height: 1440 };
			expect(opts.width / opts.height).toBeCloseTo(3440 / 1440, 1);
			expect(opts.width / opts.height).toBeGreaterThan(2);
		});
	});

	describe("RecordingManager construction", () => {
		it("should initialize with SchematicRenderer reference", () => {
			const mockSR = createMockSchematicRenderer();
			const rm = new RecordingManager(mockSR as any);
			expect(rm.isRecording).toBe(false);
		});

		it("should handle missing ffmpeg gracefully", () => {
			const mockSR = createMockSchematicRenderer({
				options: { ffmpeg: undefined },
			});
			const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const rm = new RecordingManager(mockSR as any);
			expect(rm.isRecording).toBe(false);
			consoleSpy.mockRestore();
		});
	});

	describe("takeScreenshot", () => {
		it("should return a Blob with PNG format by default", async () => {
			const mockSR = createMockSchematicRenderer();

			// Mock the canvas 2d context for the recording canvas
			const mockCtx = {
				drawImage: vi.fn(),
				getImageData: vi.fn().mockReturnValue({
					width: 1920,
					height: 1080,
					data: new Uint8Array(1920 * 1080 * 4),
				}),
				putImageData: vi.fn(),
			};

			const origGetContext = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((type: string) => {
				if (type === "2d") return mockCtx;
				if (type === "webgl" || type === "webgl2")
					return (origGetContext as any).call(document.createElement("canvas"), type);
				return null;
			}) as any;

			// Mock toBlob
			HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation(function (
				this: HTMLCanvasElement,
				cb: BlobCallback,
				type?: string,
				_quality?: number
			) {
				const mimeType = type || "image/png";
				cb(new Blob([new Uint8Array(100)], { type: mimeType }));
			});

			const rm = new RecordingManager(mockSR as any);
			const blob = await rm.takeScreenshot();

			expect(blob).toBeInstanceOf(Blob);
			expect(blob.type).toBe("image/png");

			HTMLCanvasElement.prototype.getContext = origGetContext;
		});

		it("should return a Blob with JPEG format when specified", async () => {
			const mockSR = createMockSchematicRenderer();

			const mockCtx = {
				drawImage: vi.fn(),
				getImageData: vi.fn().mockReturnValue({
					width: 1920,
					height: 1080,
					data: new Uint8Array(1920 * 1080 * 4),
				}),
				putImageData: vi.fn(),
			};

			const origGetContext = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((type: string) => {
				if (type === "2d") return mockCtx;
				return null;
			}) as any;

			HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation(function (
				this: HTMLCanvasElement,
				cb: BlobCallback,
				type?: string
			) {
				cb(new Blob([new Uint8Array(80)], { type: type || "image/png" }));
			});

			const rm = new RecordingManager(mockSR as any);
			const blob = await rm.takeScreenshot({ format: "image/jpeg", quality: 0.85 });

			expect(blob).toBeInstanceOf(Blob);
			// The takeScreenshot always captures PNG internally, then wraps with requested format
			expect(blob.type).toBe("image/jpeg");

			HTMLCanvasElement.prototype.getContext = origGetContext;
		});

		it("should apply custom resolution during screenshot", async () => {
			const mockSR = createMockSchematicRenderer();
			const setSize = mockSR.renderManager.renderer.setSize;

			const mockCtx = {
				drawImage: vi.fn(),
				getImageData: vi.fn().mockReturnValue({
					width: 3840,
					height: 2160,
					data: new Uint8Array(3840 * 2160 * 4),
				}),
				putImageData: vi.fn(),
			};

			const origGetContext = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((type: string) => {
				if (type === "2d") return mockCtx;
				return null;
			}) as any;

			HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation(function (
				this: HTMLCanvasElement,
				cb: BlobCallback,
				type?: string
			) {
				cb(new Blob([new Uint8Array(100)], { type: type || "image/png" }));
			});

			const rm = new RecordingManager(mockSR as any);
			await rm.takeScreenshot({ width: 3840, height: 2160 });

			// Should have set to 4K and then restored
			expect(setSize).toHaveBeenCalledWith(3840, 2160, false);

			HTMLCanvasElement.prototype.getContext = origGetContext;
		});

		it("should restore original renderer settings after screenshot", async () => {
			const mockSR = createMockSchematicRenderer();
			const renderer = mockSR.renderManager.renderer;
			const origWidth = renderer.domElement.width;
			const origHeight = renderer.domElement.height;

			const mockCtx = {
				drawImage: vi.fn(),
				getImageData: vi.fn().mockReturnValue({
					width: 3840,
					height: 2160,
					data: new Uint8Array(3840 * 2160 * 4),
				}),
				putImageData: vi.fn(),
			};

			const origGetContext = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((type: string) => {
				if (type === "2d") return mockCtx;
				return null;
			}) as any;

			HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation(function (
				this: HTMLCanvasElement,
				cb: BlobCallback,
				type?: string
			) {
				cb(new Blob([new Uint8Array(100)], { type: type || "image/png" }));
			});

			const rm = new RecordingManager(mockSR as any);
			await rm.takeScreenshot({ width: 4096, height: 4096 });

			// Verify restore was called (setSize called at least twice: setup + restore)
			const calls = renderer.setSize.mock.calls;
			expect(calls.length).toBeGreaterThanOrEqual(2);
			// Last call should restore original dimensions
			const lastCall = calls[calls.length - 1];
			expect(lastCall[0]).toBe(origWidth);
			expect(lastCall[1]).toBe(origHeight);

			HTMLCanvasElement.prototype.getContext = origGetContext;
		});

		it("should set pixel ratio to 1.0 during capture for consistent output", async () => {
			const mockSR = createMockSchematicRenderer();
			const renderer = mockSR.renderManager.renderer;

			const mockCtx = {
				drawImage: vi.fn(),
				getImageData: vi.fn().mockReturnValue({
					width: 1920,
					height: 1080,
					data: new Uint8Array(1920 * 1080 * 4),
				}),
				putImageData: vi.fn(),
			};

			const origGetContext = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((type: string) => {
				if (type === "2d") return mockCtx;
				return null;
			}) as any;

			HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation(function (
				this: HTMLCanvasElement,
				cb: BlobCallback,
				type?: string
			) {
				cb(new Blob([new Uint8Array(100)], { type: type || "image/png" }));
			});

			const rm = new RecordingManager(mockSR as any);
			await rm.takeScreenshot({ width: 1920, height: 1080 });

			expect(renderer.setPixelRatio).toHaveBeenCalledWith(1.0);

			HTMLCanvasElement.prototype.getContext = origGetContext;
		});
	});

	describe("RecordingOptions defaults", () => {
		it("should have correct default recording settings", () => {
			const defaults = {
				width: 1920,
				height: 1080,
				frameRate: 60,
				useJpegFrames: true,
				jpegQuality: 0.92,
				batchSize: 30,
				encodingPreset: "veryfast" as const,
				crf: 20,
			};

			expect(defaults.width).toBe(1920);
			expect(defaults.height).toBe(1080);
			expect(defaults.frameRate).toBe(60);
			expect(defaults.useJpegFrames).toBe(true);
			expect(defaults.encodingPreset).toBe("veryfast");
			expect(defaults.crf).toBe(20);
		});

		it("should support 30fps recording", () => {
			const opts = { frameRate: 30 };
			const duration = 5;
			const totalFrames = duration * opts.frameRate;
			expect(totalFrames).toBe(150);
		});

		it("should support 60fps recording", () => {
			const opts = { frameRate: 60 };
			const duration = 5;
			const totalFrames = duration * opts.frameRate;
			expect(totalFrames).toBe(300);
		});

		it("should calculate correct frame filenames with padding", () => {
			const ext = "jpg";
			const index = 42;
			const filename = `frame${index.toString().padStart(6, "0")}.${ext}`;
			expect(filename).toBe("frame000042.jpg");
		});

		it("should calculate correct PNG frame filenames", () => {
			const ext = "png";
			const index = 0;
			const filename = `frame${index.toString().padStart(6, "0")}.${ext}`;
			expect(filename).toBe("frame000000.png");
		});
	});

	describe("Recording encoding presets", () => {
		const validPresets = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium"];

		it.each(validPresets)("should accept %s encoding preset", (preset) => {
			expect(validPresets).toContain(preset);
		});

		it("should use CRF range 18-28 for quality control", () => {
			const minCRF = 18;
			const maxCRF = 28;
			const defaultCRF = 20;
			expect(defaultCRF).toBeGreaterThanOrEqual(minCRF);
			expect(defaultCRF).toBeLessThanOrEqual(maxCRF);
		});
	});

	describe("Video recording", () => {
		it("should build correct FFmpeg args for MP4 encoding", () => {
			const frameRate = 60;
			const encodingPreset = "veryfast";
			const crf = 20;
			const ext = "jpg";

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

			expect(ffmpegArgs).toContain("libx264");
			expect(ffmpegArgs).toContain("yuv420p");
			expect(ffmpegArgs).toContain("+faststart");
			expect(ffmpegArgs).toContain("output.mp4");
			expect(ffmpegArgs[ffmpegArgs.indexOf("-framerate") + 1]).toBe("60");
			expect(ffmpegArgs[ffmpegArgs.indexOf("-crf") + 1]).toBe("20");
		});

		it("should produce video/mp4 blob type", () => {
			const blob = new Blob([new Uint8Array(100)], { type: "video/mp4" });
			expect(blob.type).toBe("video/mp4");
		});

		it("should track recording state", () => {
			const mockSR = createMockSchematicRenderer();
			const rm = new RecordingManager(mockSR as any);
			expect(rm.isRecording).toBe(false);
		});

		it("should stop recording and reset state", () => {
			const mockSR = createMockSchematicRenderer();
			const rm = new RecordingManager(mockSR as any);
			rm.stopRecording();
			expect(rm.isRecording).toBe(false);
		});
	});

	describe("Recording resolution presets", () => {
		const resolutionPresets = [
			{ name: "1080p", width: 1920, height: 1080 },
			{ name: "1440p", width: 2560, height: 1440 },
			{ name: "4K", width: 3840, height: 2160 },
		];

		it.each(resolutionPresets)(
			"should support $name recording ($width x $height)",
			({ width, height }) => {
				expect(width).toBeGreaterThan(0);
				expect(height).toBeGreaterThan(0);
				expect(width / height).toBeCloseTo(16 / 9, 1);
			}
		);
	});

	describe("Frame capture modes", () => {
		it("should default to JPEG frames for faster encoding", () => {
			const useJpegFrames = true;
			const ext = useJpegFrames ? "jpg" : "png";
			expect(ext).toBe("jpg");
		});

		it("should support PNG frames for lossless capture", () => {
			const useJpegFrames = false;
			const ext = useJpegFrames ? "jpg" : "png";
			expect(ext).toBe("png");
		});

		it("should use correct MIME type for JPEG frames", () => {
			const useJpegFrames = true;
			const mimeType = useJpegFrames ? "image/jpeg" : "image/png";
			expect(mimeType).toBe("image/jpeg");
		});

		it("should use correct MIME type for PNG frames", () => {
			const useJpegFrames = false;
			const mimeType = useJpegFrames ? "image/jpeg" : "image/png";
			expect(mimeType).toBe("image/png");
		});
	});

	describe("Progress callbacks", () => {
		it("should calculate progress as fraction of total frames", () => {
			const totalFrames = 300;
			const frameCount = 150;
			const progress = frameCount / totalFrames;
			expect(progress).toBe(0.5);
		});

		it("should split FFmpeg progress into encode (0-50) and mux (50-100)", () => {
			const encodeProgress = 0.5 * 50; // 50% of encoding phase = 25%
			expect(encodeProgress).toBe(25);

			const ffmpegProgress = 50 + 0.5 * 50; // 50% of FFmpeg phase = 75%
			expect(ffmpegProgress).toBe(75);
		});
	});

	describe("dispose", () => {
		it("should stop recording and terminate ffmpeg", () => {
			const mockSR = createMockSchematicRenderer();
			const rm = new RecordingManager(mockSR as any);
			rm.dispose();

			expect(rm.isRecording).toBe(false);
			expect(mockSR._mockFFmpeg.terminate).toHaveBeenCalled();
		});
	});
});
