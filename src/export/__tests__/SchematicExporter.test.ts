import { describe, it, expect, vi, beforeEach } from "vitest";
import * as THREE from "three";

// Mock all problematic imports
vi.mock("nucleation-wasm", () => ({ default: "mock-wasm" }));
vi.mock("nucleation", () => ({
	default: vi.fn().mockResolvedValue(undefined),
	SchematicWrapper: class {},
}));

// Mock GLTFExporter
vi.mock("three/examples/jsm/exporters/GLTFExporter.js", () => ({
	GLTFExporter: class MockGLTFExporter {
		parse = vi
			.fn()
			.mockImplementation(
				(_input: any, onComplete: (result: ArrayBuffer) => void, _onError: any, options: any) => {
					if (options?.binary) {
						onComplete(new ArrayBuffer(256));
					} else {
						onComplete({ asset: { version: "2.0" } } as any);
					}
				}
			);
	},
}));

// Mock OBJExporter
vi.mock("three/examples/jsm/exporters/OBJExporter.js", () => ({
	OBJExporter: class MockOBJExporter {
		parse = vi.fn().mockReturnValue("# OBJ file\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n");
	},
}));

// Mock STLExporter
vi.mock("three/examples/jsm/exporters/STLExporter.js", () => ({
	STLExporter: class MockSTLExporter {
		parse = vi.fn().mockReturnValue(new ArrayBuffer(84));
	},
}));

// Mock USDZExporter
vi.mock("three/examples/jsm/exporters/USDZExporter.js", () => ({
	USDZExporter: class MockUSDZExporter {
		parse = vi.fn().mockResolvedValue(new ArrayBuffer(512));
		parseAsync = vi.fn().mockResolvedValue(new ArrayBuffer(512));
	},
}));

import { SchematicExporter } from "../../export/SchematicExporter";

function createTestMesh(): THREE.Mesh {
	const geometry = new THREE.BoxGeometry(1, 1, 1);
	const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
	return new THREE.Mesh(geometry, material);
}

function createTestGroup(): THREE.Group {
	const group = new THREE.Group();
	group.add(createTestMesh());
	group.add(createTestMesh());
	return group;
}

describe("SchematicExporter", () => {
	let exporter: SchematicExporter;

	beforeEach(() => {
		exporter = new SchematicExporter();
	});

	describe("Constructor and initialization", () => {
		it("should create exporter instance", () => {
			expect(exporter).toBeInstanceOf(SchematicExporter);
		});
	});

	describe("Event system", () => {
		it("should subscribe to events and return unsubscribe function", () => {
			const handler = vi.fn();
			const unsubscribe = exporter.on("exportStarted", handler);
			expect(typeof unsubscribe).toBe("function");
		});

		it("should unsubscribe from events", () => {
			const handler = vi.fn();
			exporter.on("exportComplete", handler);
			exporter.off("exportComplete", handler);
			// No error thrown = success
		});

		it("should support all event types", () => {
			const events = [
				"exportStarted",
				"exportProgress",
				"exportComplete",
				"exportError",
				"exportCancelled",
			] as const;

			events.forEach((event) => {
				const handler = vi.fn();
				const unsub = exporter.on(event, handler);
				expect(typeof unsub).toBe("function");
				unsub();
			});
		});
	});

	describe("Static utility methods", () => {
		it("should return available export formats", () => {
			const formats = SchematicExporter.getAvailableFormats();
			expect(formats).toContain("gltf");
			expect(formats).toContain("glb");
			expect(formats).toContain("obj");
			expect(formats).toContain("stl");
			expect(formats).toContain("usdz");
		});

		it("should return format descriptions", () => {
			const desc = SchematicExporter.getFormatDescription("glb");
			expect(typeof desc).toBe("string");
			expect(desc.length).toBeGreaterThan(0);
		});

		it("should return correct file extensions", () => {
			expect(SchematicExporter.getFormatExtension("gltf")).toBe(".gltf");
			expect(SchematicExporter.getFormatExtension("glb")).toBe(".glb");
			expect(SchematicExporter.getFormatExtension("obj")).toBe(".obj");
			expect(SchematicExporter.getFormatExtension("stl")).toBe(".stl");
			expect(SchematicExporter.getFormatExtension("usdz")).toBe(".usdz");
		});

		it("should return quality presets", () => {
			const low = SchematicExporter.getQualityPreset("low");
			const ultra = SchematicExporter.getQualityPreset("ultra");

			expect(low.maxTextureSize).toBe(512);
			expect(ultra.maxTextureSize).toBe(4096);
		});
	});

	describe("Export to GLB (binary GLTF)", () => {
		it("should export a mesh to GLB format", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, {
				format: "glb",
				filename: "test-export",
			});

			expect(result.success).toBe(true);
			expect(result.format).toBe("glb");
			expect(result.filename).toContain("test-export");
			expect(result.size).toBeGreaterThan(0);
		});

		it("should export a group to GLB format", async () => {
			const group = createTestGroup();
			const result = await exporter.export(group, { format: "glb" });

			expect(result.success).toBe(true);
			expect(result.format).toBe("glb");
		});

		it("should default to GLB format when no format specified", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh);

			expect(result.format).toBe("glb");
		});
	});

	describe("Export to GLTF (JSON)", () => {
		it("should export to GLTF format", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, { format: "gltf" });

			expect(result.success).toBe(true);
			expect(result.format).toBe("gltf");
		});
	});

	describe("Export to OBJ", () => {
		it("should export to OBJ format", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, { format: "obj" });

			expect(result.success).toBe(true);
			expect(result.format).toBe("obj");
		});
	});

	describe("Export to STL", () => {
		it("should export to STL format (binary)", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, { format: "stl" });

			expect(result.success).toBe(true);
			expect(result.format).toBe("stl");
		});
	});

	describe("Export to USDZ", () => {
		it("should export to USDZ format", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, { format: "usdz" });

			expect(result.success).toBe(true);
			expect(result.format).toBe("usdz");
		});
	});

	describe("Export options", () => {
		it("should apply quality preset to export", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, {
				format: "glb",
				quality: "ultra",
			});

			expect(result.success).toBe(true);
		});

		it("should support custom filename", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, {
				format: "glb",
				filename: "my-schematic",
			});

			expect(result.filename).toContain("my-schematic");
		});

		it("should support center-at-origin option", async () => {
			const mesh = createTestMesh();
			mesh.position.set(10, 20, 30);

			const result = await exporter.export(mesh, {
				format: "glb",
				centerAtOrigin: true,
			});

			expect(result.success).toBe(true);
		});

		it("should support scale option", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, {
				format: "glb",
				scale: 2.0,
			});

			expect(result.success).toBe(true);
		});

		it("should support visible-only export", async () => {
			const group = createTestGroup();
			group.children[1].visible = false;

			const result = await exporter.export(group, {
				format: "glb",
				visibleOnly: true,
			});

			expect(result.success).toBe(true);
		});

		it("should support forceOpaque option", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, {
				format: "glb",
				forceOpaque: true,
			});

			expect(result.success).toBe(true);
		});
	});

	describe("Normal modes", () => {
		const normalModes = ["default", "flip", "recompute", "double-sided"] as const;

		it.each(normalModes)("should support '%s' normal mode", async (mode) => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, {
				format: "glb",
				normalMode: mode,
			});

			expect(result.success).toBe(true);
		});
	});

	describe("Progress events", () => {
		it("should emit exportProgress events during export", async () => {
			const onProgress = vi.fn();
			const mesh = createTestMesh();

			// Progress is emitted via event system, not options callback
			exporter.on("exportProgress", onProgress);
			await exporter.export(mesh, { format: "glb" });

			expect(onProgress).toHaveBeenCalled();
			const call = onProgress.mock.calls[0][0];
			expect(call).toHaveProperty("phase");
			expect(call).toHaveProperty("progress");
			expect(call).toHaveProperty("message");
		});

		it("should emit exportComplete event when export finishes", async () => {
			const onComplete = vi.fn();
			const mesh = createTestMesh();

			exporter.on("exportComplete", onComplete);
			await exporter.export(mesh, { format: "glb" });

			expect(onComplete).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					format: "glb",
				})
			);
		});

		it("should emit exportStarted event at beginning of export", async () => {
			const onStarted = vi.fn();
			const mesh = createTestMesh();

			exporter.on("exportStarted", onStarted);
			await exporter.export(mesh, { format: "glb", filename: "my-model" });

			expect(onStarted).toHaveBeenCalledWith(
				expect.objectContaining({
					format: "glb",
				})
			);
		});
	});

	describe("Export cancellation", () => {
		it("should support cancelling an export", () => {
			exporter.cancel();
			// Should not throw
		});
	});

	describe("Export result", () => {
		it("should include all required result fields", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, { format: "glb" });

			expect(result).toHaveProperty("success");
			expect(result).toHaveProperty("filename");
			expect(result).toHaveProperty("format");
			expect(result).toHaveProperty("size");
			expect(result).toHaveProperty("duration");
			expect(result).toHaveProperty("data");
		});

		it("should report duration in milliseconds", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, { format: "glb" });

			expect(result.duration).toBeGreaterThanOrEqual(0);
		});

		it("should report size in bytes", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, { format: "glb" });

			expect(result.size).toBeGreaterThan(0);
		});
	});

	describe("Download and URL management", () => {
		it("should trigger download without throwing", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, { format: "glb" });

			// Mock createElement and click for download
			const mockLink = {
				href: "",
				download: "",
				click: vi.fn(),
				style: {},
			};
			vi.spyOn(document, "createElement").mockReturnValueOnce(mockLink as any);
			vi.spyOn(document.body, "appendChild").mockImplementation((el) => el);
			vi.spyOn(document.body, "removeChild").mockImplementation((el) => el);

			expect(() => exporter.download(result)).not.toThrow();
		});

		it("should revoke object URL without throwing", async () => {
			const mesh = createTestMesh();
			const result = await exporter.export(mesh, { format: "glb" });

			// Should not throw even without a downloadUrl
			expect(() => exporter.revokeUrl(result)).not.toThrow();
		});
	});
});
