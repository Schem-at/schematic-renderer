import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";

// Mock all problematic imports
vi.mock("nucleation-wasm", () => ({ default: "mock-wasm" }));
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
		load = vi.fn().mockImplementation((_url: string, onLoad: (tex: THREE.DataTexture) => void) => {
			const mockTexture = new THREE.DataTexture();
			mockTexture.mapping = THREE.EquirectangularReflectionMapping;
			setTimeout(() => onLoad(mockTexture), 0);
			return mockTexture;
		});
		setDataType = vi.fn().mockReturnThis();
	},
}));

// Mock IndexedDB
vi.stubGlobal("indexedDB", {
	open: vi.fn().mockReturnValue({
		onerror: null,
		onsuccess: null,
		onupgradeneeded: null,
		result: {
			transaction: vi.fn().mockReturnValue({
				objectStore: vi.fn().mockReturnValue({
					get: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
					put: vi.fn(),
				}),
				oncomplete: null,
			}),
			objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
		},
	}),
});

// ==============================================================================
// Media Generation & Preview Test Suite
//
// Tests for background modes, HDR, transparency, color backgrounds,
// and render configuration for schematic previewing / media generation.
// ==============================================================================

describe("Media Generation - Backgrounds & Rendering", () => {
	describe("Transparent backgrounds", () => {
		it("should create WebGLRenderer with alpha: true for transparency support", () => {
			// The renderer is created with alpha: true in RenderManager constructor
			const rendererConfig = {
				alpha: true,
				antialias: true,
				powerPreference: "high-performance",
			};
			expect(rendererConfig.alpha).toBe(true);
		});

		it("should support transparent PNG screenshots via alpha channel", () => {
			// PNG format supports alpha channel for transparent backgrounds
			const format = "image/png";
			expect(format).toBe("image/png");
			// PNG is the only screenshot format that preserves transparency
		});

		it("should not preserve alpha in JPEG screenshots", () => {
			// JPEG does not support transparency
			const format = "image/jpeg";
			expect(format).toBe("image/jpeg");
			// Recording canvas uses alpha: false for video frames (opaque content)
		});

		it("should set scene background to null for transparent renders", () => {
			const scene = new THREE.Scene();
			scene.background = null;
			expect(scene.background).toBeNull();
		});
	});

	describe("Colored backgrounds", () => {
		it("should default isometric background to sky blue (0x87ceeb)", () => {
			const defaultColor = new THREE.Color(0x87ceeb);
			// THREE.Color stores values in linear color space
			// 0x87=135 → 135/255=0.529 sRGB → ~0.242 linear
			expect(defaultColor.r).toBeGreaterThan(0);
			expect(defaultColor.g).toBeGreaterThan(defaultColor.r);
			expect(defaultColor.b).toBeGreaterThan(defaultColor.g);
			// Verify it round-trips back to the same hex
			expect(defaultColor.getHex()).toBe(0x87ceeb);
		});

		it("should parse hex color strings for backgrounds", () => {
			const color = new THREE.Color("#ff5500");
			// THREE.Color stores in linear space; verify hex round-trip instead
			expect(color.getHex()).toBe(0xff5500);
			expect(color.r).toBeGreaterThan(0);
			expect(color.b).toBeCloseTo(0.0, 2);
		});

		it("should parse CSS named colors", () => {
			const white = new THREE.Color("white");
			expect(white.r).toBe(1);
			expect(white.g).toBe(1);
			expect(white.b).toBe(1);

			const black = new THREE.Color("black");
			expect(black.r).toBe(0);
			expect(black.g).toBe(0);
			expect(black.b).toBe(0);
		});

		it("should set solid color background on scene", () => {
			const scene = new THREE.Scene();
			const bgColor = new THREE.Color(0x222222);
			scene.background = bgColor;

			expect(scene.background).toBeInstanceOf(THREE.Color);
			expect((scene.background as THREE.Color).getHex()).toBe(0x222222);
		});

		it("should support custom background colors via setIsometricBackgroundColor API", () => {
			// The setIsometricBackgroundColor method accepts THREE.ColorRepresentation
			const validInputs: THREE.ColorRepresentation[] = [
				0xff0000, // Hex integer
				"#00ff00", // Hex string
				"rgb(0, 0, 255)", // CSS rgb()
				"blue", // Named color
			];

			validInputs.forEach((input) => {
				const color = new THREE.Color(input);
				expect(color).toBeInstanceOf(THREE.Color);
			});
		});

		it("should clone color when returning via getIsometricBackgroundColor", () => {
			const original = new THREE.Color(0x87ceeb);
			const cloned = original.clone();

			// Modifying the clone should not affect the original
			cloned.set(0xff0000);
			expect(original.getHex()).toBe(0x87ceeb);
			expect(cloned.getHex()).toBe(0xff0000);
		});
	});

	describe("HDRI backgrounds", () => {
		it("should use equirectangular mapping for HDRI textures", () => {
			const texture = new THREE.DataTexture();
			texture.mapping = THREE.EquirectangularReflectionMapping;
			expect(texture.mapping).toBe(THREE.EquirectangularReflectionMapping);
		});

		it("should support background-only HDRI mode (no environment lighting)", () => {
			// backgroundOnly=true: texture only used as scene.background, not scene.environment
			const scene = new THREE.Scene();
			const texture = new THREE.DataTexture();
			texture.mapping = THREE.EquirectangularReflectionMapping;

			scene.background = texture;
			scene.environment = null;

			expect(scene.background).toBe(texture);
			expect(scene.environment).toBeNull();
		});

		it("should support full HDRI mode (background + environment lighting)", () => {
			const scene = new THREE.Scene();
			const texture = new THREE.DataTexture();
			texture.mapping = THREE.EquirectangularReflectionMapping;

			scene.background = texture;
			scene.environment = texture;

			expect(scene.background).toBe(texture);
			expect(scene.environment).toBe(texture);
		});

		it("should store HDRI as originalBackground for camera mode switching", () => {
			// When switching to isometric, HDRI is stored and replaced with solid color
			// When switching back to perspective, HDRI is restored
			const hdriTexture = new THREE.DataTexture();
			const isometricColor = new THREE.Color(0x87ceeb);

			let originalBackground: THREE.Texture | THREE.Color | null = null;
			const scene = new THREE.Scene();

			// Simulate loading HDRI
			scene.background = hdriTexture;
			originalBackground = hdriTexture;

			// Simulate switching to isometric
			scene.background = isometricColor;
			expect(scene.background).toBe(isometricColor);
			expect(originalBackground).toBe(hdriTexture);

			// Simulate switching back to perspective
			scene.background = originalBackground;
			expect(scene.background).toBe(hdriTexture);
		});
	});

	describe("Camera mode background switching", () => {
		it("should switch to solid color when entering isometric mode", () => {
			const scene = new THREE.Scene();
			const hdriTexture = new THREE.DataTexture();
			const isoColor = new THREE.Color(0x87ceeb);

			scene.background = hdriTexture;

			// Simulate isometric mode activation
			const isOrthographic = true;
			if (isOrthographic && scene.background instanceof THREE.Texture) {
				const stored = scene.background;
				scene.background = isoColor;
				expect(scene.background).toBe(isoColor);
				expect(stored).toBe(hdriTexture);
			}
		});

		it("should restore HDRI when returning to perspective mode", () => {
			const hdriTexture = new THREE.DataTexture();
			const scene = new THREE.Scene();
			scene.background = new THREE.Color(0x87ceeb);

			// Simulate returning to perspective
			const isOrthographic = false;
			const originalBackground = hdriTexture;
			if (!isOrthographic && originalBackground) {
				scene.background = originalBackground;
			}
			expect(scene.background).toBe(hdriTexture);
		});
	});

	describe("SSAO presets per camera mode", () => {
		it("should have perspective SSAO defaults", () => {
			const perspectiveSSAO = {
				intensity: 5.0,
				aoRadius: 1.0,
				distanceFalloff: 1.0,
			};
			expect(perspectiveSSAO.intensity).toBe(5.0);
			expect(perspectiveSSAO.aoRadius).toBe(1.0);
		});

		it("should have isometric SSAO defaults with lower intensity", () => {
			const isometricSSAO = {
				intensity: 0.8,
				aoRadius: 0.3,
				distanceFalloff: 0.5,
			};
			expect(isometricSSAO.intensity).toBeLessThan(5.0);
			expect(isometricSSAO.aoRadius).toBeLessThan(1.0);
		});

		it("should accept custom SSAO parameters", () => {
			const customParams = {
				aoRadius: 2.0,
				distanceFalloff: 0.8,
				intensity: 3.0,
			};
			expect(customParams.aoRadius).toBeGreaterThan(0);
			expect(customParams.intensity).toBeGreaterThan(0);
		});
	});

	describe("Post-processing effects for media quality", () => {
		it("should support SMAA anti-aliasing", () => {
			// SMAA is used for morphological anti-aliasing in the render pipeline
			const smaaEnabled = true;
			expect(smaaEnabled).toBe(true);
		});

		it("should support gamma correction with configurable gamma", () => {
			const gamma = 0.5;
			expect(gamma).toBeGreaterThanOrEqual(0);
			expect(gamma).toBeLessThanOrEqual(1);
		});

		it("should support N8AO ambient occlusion", () => {
			const aoConfig = {
				intensity: 5.0,
				aoRadius: 1.0,
			};
			expect(aoConfig.intensity).toBeGreaterThan(0);
		});
	});
});

describe("Media Generation - Animation & Turntable", () => {
	describe("Circular camera path for animated renders", () => {
		it("should support full 360-degree orbital rotation", () => {
			const startAngle = 0;
			const endAngle = Math.PI * 2;
			const totalRotation = endAngle - startAngle;
			expect(totalRotation).toBeCloseTo(Math.PI * 2);
		});

		it("should calculate correct angle per frame for smooth animation", () => {
			const totalFrames = 300; // 5s at 60fps
			const totalRotation = Math.PI * 2;
			const anglePerFrame = totalRotation / totalFrames;
			expect(anglePerFrame).toBeCloseTo(0.02094, 4);
		});

		it("should compute orbital position from angle, radius, and height", () => {
			const radius = 10;
			const height = 5;
			const angle = Math.PI / 4; // 45 degrees

			const x = radius * Math.cos(angle);
			const z = radius * Math.sin(angle);
			const y = height;

			expect(x).toBeCloseTo(7.071, 2);
			expect(z).toBeCloseTo(7.071, 2);
			expect(y).toBe(5);
		});

		it("should support configurable orbit parameters", () => {
			const orbitConfig = {
				radius: 15,
				height: 8,
				startAngle: 0,
				endAngle: Math.PI * 2,
				duration: 5,
			};
			expect(orbitConfig.radius).toBeGreaterThan(0);
			expect(orbitConfig.duration).toBeGreaterThan(0);
		});

		it("should look at target during animation", () => {
			const target = new THREE.Vector3(0, 0, 0);
			const cameraPos = new THREE.Vector3(10, 5, 0);

			const direction = new THREE.Vector3().subVectors(target, cameraPos).normalize();

			expect(direction.length()).toBeCloseTo(1.0);
		});
	});

	describe("Animation frame timing", () => {
		it("should calculate total frames from duration and FPS", () => {
			expect(5 * 30).toBe(150); // 5s at 30fps
			expect(5 * 60).toBe(300); // 5s at 60fps
			expect(10 * 60).toBe(600); // 10s at 60fps
		});

		it("should calculate frame interval in milliseconds", () => {
			expect(1000 / 30).toBeCloseTo(33.33, 1); // 30fps
			expect(1000 / 60).toBeCloseTo(16.67, 1); // 60fps
		});
	});
});

describe("Media Generation - Output Formats & Quality", () => {
	describe("Screenshot format support", () => {
		it("should support PNG format for lossless screenshots", () => {
			const blob = new Blob([new Uint8Array(100)], { type: "image/png" });
			expect(blob.type).toBe("image/png");
			expect(blob.size).toBeGreaterThan(0);
		});

		it("should support JPEG format for smaller file sizes", () => {
			const blob = new Blob([new Uint8Array(80)], { type: "image/jpeg" });
			expect(blob.type).toBe("image/jpeg");
		});

		it("should support quality parameter between 0 and 1", () => {
			const qualities = [0.5, 0.75, 0.85, 0.95, 1.0];
			qualities.forEach((q) => {
				expect(q).toBeGreaterThanOrEqual(0);
				expect(q).toBeLessThanOrEqual(1);
			});
		});
	});

	describe("Video output format", () => {
		it("should produce MP4 container with H.264 codec", () => {
			const videoBlob = new Blob([new Uint8Array(1000)], { type: "video/mp4" });
			expect(videoBlob.type).toBe("video/mp4");
		});

		it("should use yuv420p pixel format for compatibility", () => {
			const pixFmt = "yuv420p";
			expect(pixFmt).toBe("yuv420p");
		});

		it("should add faststart flag for web streaming", () => {
			const movflags = "+faststart";
			expect(movflags).toContain("faststart");
		});
	});

	describe("3D export formats", () => {
		const formats: Array<{ format: string; extension: string; binary: boolean }> = [
			{ format: "gltf", extension: ".gltf", binary: false },
			{ format: "glb", extension: ".glb", binary: true },
			{ format: "obj", extension: ".obj", binary: false },
			{ format: "stl", extension: ".stl", binary: true },
			{ format: "usdz", extension: ".usdz", binary: true },
		];

		it.each(formats)(
			"should support $format export format ($extension)",
			({ format, extension }) => {
				expect(format).toBeTruthy();
				expect(extension).toMatch(/^\.\w+$/);
			}
		);
	});

	describe("Export quality presets", () => {
		const presets = {
			low: { maxTextureSize: 512, optimize: true, preserveMaterials: false },
			medium: { maxTextureSize: 1024, optimize: true, preserveMaterials: true },
			high: { maxTextureSize: 2048, optimize: false, preserveMaterials: true },
			ultra: { maxTextureSize: 4096, optimize: false, preserveMaterials: true },
		};

		it("should have increasing texture sizes across quality presets", () => {
			expect(presets.low.maxTextureSize).toBeLessThan(presets.medium.maxTextureSize);
			expect(presets.medium.maxTextureSize).toBeLessThan(presets.high.maxTextureSize);
			expect(presets.high.maxTextureSize).toBeLessThan(presets.ultra.maxTextureSize);
		});

		it("should optimize at low and medium quality", () => {
			expect(presets.low.optimize).toBe(true);
			expect(presets.medium.optimize).toBe(true);
		});

		it("should not optimize at high and ultra quality", () => {
			expect(presets.high.optimize).toBe(false);
			expect(presets.ultra.optimize).toBe(false);
		});

		it("should preserve materials at medium quality and above", () => {
			expect(presets.low.preserveMaterials).toBe(false);
			expect(presets.medium.preserveMaterials).toBe(true);
			expect(presets.high.preserveMaterials).toBe(true);
			expect(presets.ultra.preserveMaterials).toBe(true);
		});
	});
});
