import { vi } from "vitest";

// Mock WebGL context for Three.js
const mockWebGLContext = {
	getParameter: vi.fn().mockReturnValue(16384),
	getExtension: vi.fn().mockReturnValue({}),
	createShader: vi.fn().mockReturnValue({}),
	shaderSource: vi.fn(),
	compileShader: vi.fn(),
	getShaderParameter: vi.fn().mockReturnValue(true),
	createProgram: vi.fn().mockReturnValue({}),
	attachShader: vi.fn(),
	linkProgram: vi.fn(),
	getProgramParameter: vi.fn().mockReturnValue(true),
	useProgram: vi.fn(),
	createBuffer: vi.fn().mockReturnValue({}),
	bindBuffer: vi.fn(),
	bufferData: vi.fn(),
	enable: vi.fn(),
	disable: vi.fn(),
	blendFunc: vi.fn(),
	clearColor: vi.fn(),
	clear: vi.fn(),
	viewport: vi.fn(),
	drawArrays: vi.fn(),
	drawElements: vi.fn(),
	createTexture: vi.fn().mockReturnValue({}),
	bindTexture: vi.fn(),
	texImage2D: vi.fn(),
	texParameteri: vi.fn(),
	activeTexture: vi.fn(),
	getUniformLocation: vi.fn().mockReturnValue({}),
	getAttribLocation: vi.fn().mockReturnValue(0),
	enableVertexAttribArray: vi.fn(),
	vertexAttribPointer: vi.fn(),
	uniform1i: vi.fn(),
	uniform1f: vi.fn(),
	uniform2f: vi.fn(),
	uniform3f: vi.fn(),
	uniform4f: vi.fn(),
	uniformMatrix4fv: vi.fn(),
	createFramebuffer: vi.fn().mockReturnValue({}),
	bindFramebuffer: vi.fn(),
	framebufferTexture2D: vi.fn(),
	checkFramebufferStatus: vi.fn().mockReturnValue(36053), // FRAMEBUFFER_COMPLETE
	deleteTexture: vi.fn(),
	deleteBuffer: vi.fn(),
	deleteProgram: vi.fn(),
	deleteShader: vi.fn(),
	deleteFramebuffer: vi.fn(),
	isContextLost: vi.fn().mockReturnValue(false),
	getShaderInfoLog: vi.fn().mockReturnValue(""),
	getProgramInfoLog: vi.fn().mockReturnValue(""),
	pixelStorei: vi.fn(),
	scissor: vi.fn(),
	depthFunc: vi.fn(),
	depthMask: vi.fn(),
	cullFace: vi.fn(),
	frontFace: vi.fn(),
	polygonOffset: vi.fn(),
	lineWidth: vi.fn(),
	generateMipmap: vi.fn(),
	getSupportedExtensions: vi.fn().mockReturnValue([]),
};

// Mock canvas getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextType: string) => {
	if (contextType === "webgl" || contextType === "webgl2" || contextType === "experimental-webgl") {
		return mockWebGLContext;
	}
	return null;
});

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn().mockImplementation((callback) => {
	return setTimeout(callback, 16);
});

global.cancelAnimationFrame = vi.fn().mockImplementation((id) => {
	clearTimeout(id);
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn(),
}));

// Mock Worker
class MockWorker {
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;

	postMessage = vi.fn();
	terminate = vi.fn();
	addEventListener = vi.fn();
	removeEventListener = vi.fn();
}

global.Worker = MockWorker as unknown as typeof Worker;

// Mock WASM modules
vi.mock("nucleation-wasm", () => ({ default: "mock-wasm" }));
vi.mock("nucleation", () => ({
	default: vi.fn().mockResolvedValue(undefined),
	SchematicWrapper: class MockSchematicWrapper {
		from_data = vi.fn();
		get_dimensions = vi.fn().mockReturnValue([16, 16, 16]);
		get_block = vi.fn();
		set_block = vi.fn();
	},
}));
