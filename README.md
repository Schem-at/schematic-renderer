# Schematic Renderer

A powerful, high-performance 3D rendering library for Minecraft schematics (.schematic, .schem, .litematic), built with Three.js and Rust/WASM.

![Schematic Renderer Demo](./preview.gif)

## Features

- **High-Performance Rendering**: Uses Rust/WASM and multi-threaded Web Workers for fast mesh generation.
- **Easy Integration**: Single-file UMD build with bundled WASM and Workers - just drop it in!
- **Zero-Copy Data Transfer**: Utilizes SharedArrayBuffer (when available) for instant data passing between threads.
- **Resource Pack Support**: Load standard Minecraft resource packs (.zip) with automatic texture atlas generation.
- **Interactive Controls**: Orbit, fly, and creative camera modes with smooth transitions.
- **Enhanced Isometric Mode**: True isometric projection with smart framing, customizable angles, and optimized SSAO.
- **Schematic Slicing**: Real-time rendering bounds for inspecting schematic interiors.
- **Simulation**: Optional redstone/mechanism simulation support (powered by Nucleation).
- **Advanced Rendering**: Adaptive SSAO (automatically adjusts for camera mode), SMAA, and Gamma Correction.
- **Customizable UI**: Built-in progress bars and debug tools.

## Installation

### Method 1: Direct Browser Import (Recommended for simplicity)

The easiest way to use the renderer is to include the UMD build directly. This file contains everything you need, including the WASM binary and Web Worker code, so you don't need to configure any build tools or serve extra files.

```html
<!-- Three.js is required -->
<script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>

<!-- Schematic Renderer -->
<script src="dist/schematic-renderer.umd.js"></script>
```

### Method 2: NPM Package

If you are using a bundler like Vite, Webpack, or Rollup:

```bash
npm install schematic-renderer
# or
yarn add schematic-renderer
# or
bun add schematic-renderer
```

## Basic Usage

### Constructor Signature

The `SchematicRenderer` constructor has the following signature:

```typescript
new SchematicRenderer(
  canvas: HTMLCanvasElement,
  schematicData?: { [id: string]: () => Promise<ArrayBuffer> },
  defaultResourcePacks?: Record<string, () => Promise<Blob>>,
  options?: SchematicRendererOptions
)
```

**Parameters:**

- `canvas` - The HTML canvas element to render to
- `schematicData` - (Optional) An object mapping schematic IDs to async functions that return ArrayBuffers. Pass `{}` if not preloading schematics.
- `defaultResourcePacks` - (Optional) An object mapping pack names to async functions that return Blobs. Pass `{}` if not preloading resource packs.
- `options` - (Optional) Configuration options for the renderer

> **Important:** If you want to pass options but not preload schematics or resource packs, you must explicitly pass empty objects `{}` for the second and third parameters.

### HTML Example

```html
<!DOCTYPE html>
<html>
	<head>
		<title>Schematic Renderer</title>
		<style>
			body {
				margin: 0;
				overflow: hidden;
			}
			#canvas {
				width: 100vw;
				height: 100vh;
				display: block;
			}
		</style>
	</head>
	<body>
		<canvas id="canvas"></canvas>

		<!-- Dependencies -->
		<script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
		<script src="dist/schematic-renderer.umd.js"></script>

		<script>
			const canvas = document.getElementById("canvas");

			// Initialize the renderer
			// Note: Pass empty objects {} for schematicData and defaultResourcePacks
			// if you're not preloading any, so options is in the correct position
			const renderer = new SchematicRenderer.SchematicRenderer(
				canvas,
				{}, // schematicData - empty, we'll load via drag & drop
				{}, // defaultResourcePacks - empty
				{
					// Options (4th parameter)
					enableDragAndDrop: true,
					showGrid: true,
					cameraOptions: {
						position: [20, 20, 20],
					},
				}
			);

			// The renderer handles the animation loop automatically.
			// You can now drag and drop .schem files onto the canvas!
		</script>
	</body>
</html>
```

### Preloading Schematics

If you want to preload schematics at initialization:

```javascript
const renderer = new SchematicRenderer.SchematicRenderer(
	canvas,
	{
		// Keys are schematic IDs, values are async functions returning ArrayBuffer
		myHouse: async () => {
			const response = await fetch("/schematics/house.schem");
			return response.arrayBuffer();
		},
		myFarm: async () => {
			const response = await fetch("/schematics/farm.litematic");
			return response.arrayBuffer();
		},
	},
	{}, // No default resource packs
	{
		showGrid: true,
	}
);
```

### Preloading Resource Packs

```javascript
const renderer = new SchematicRenderer.SchematicRenderer(
	canvas,
	{}, // No preloaded schematics
	{
		// Keys are pack names, values are async functions returning Blob
		faithful: async () => {
			const response = await fetch("/packs/faithful.zip");
			return response.blob();
		},
	},
	{
		showGrid: true,
	}
);
```

## Configuration Options

The `SchematicRenderer` constructor accepts an options object to customize behavior.

```javascript
const options = {
    // --- Appearance ---
    backgroundColor: 0x000000,
    showGrid: true,
    showAxes: true,
    showRenderingBoundsHelper: false,

    // --- Performance & Quality ---
    chunkSideLength: 16,        // Size of render chunks (16 recommended)
    meshBuildingMode: 'batched', // 'batched' (fastest), 'incremental', 'immediate'
    targetFPS: 60,              // Target frame rate
    enableAdaptiveFPS: true,    // Reduce FPS when idle to save battery

    // --- Rendering Features ---
    postProcessingOptions: {
        enabled: true,
        enableSSAO: true,       // Screen Space Ambient Occlusion
        enableSMAA: true,       // Anti-aliasing
        enableGamma: true,      // Gamma correction

        // Custom SSAO presets for different camera modes
        // (automatically switches between presets when changing cameras)
        ssaoPresets: {
            perspective: {
                aoRadius: 1.0,
                distanceFalloff: 0.4,
                intensity: 5.0
            },
            isometric: {
                aoRadius: 0.3,        // Smaller radius for orthographic
                distanceFalloff: 0.1, // Less falloff for flatter look
                intensity: 0.8        // Much lower intensity
            }
        }
    },

    // --- Interaction ---
    enableInteraction: true,
    enableDragAndDrop: true,    // Allow dropping schematics/resource packs
    enableGizmos: true,         // Transform controls

    // --- Camera ---
    cameraOptions: {
        position: [10, 10, 10],
        useTightBounds: true,
    },
    enableAutoOrbit: false,     // Orbit camera automatically
    autoOrbitDuration: 20,      // Seconds per rotation

    // --- UI ---
    enableProgressBar: true,
    progressBarOptions: {
        theme: 'dark',
        barColor: '#4CAF50'
    },

    // --- Advanced ---
    wasmMeshBuilderOptions: {
        enabled: true,          // Use Rust/WASM builder (High Performance)
        greedyMeshingEnabled: false // Merge adjacent faces (Experimental)
    },

    // --- Callbacks (See section below) ---
    callbacks: { ... }
};

const renderer = new SchematicRenderer.SchematicRenderer(canvas, {}, {}, options);
```

## Callbacks

The renderer provides extensive callbacks for hooking into lifecycle events, user interactions, and loading states.

```javascript
const options = {
	callbacks: {
		// --- Lifecycle ---
		onRendererInitialized: (renderer) => {
			console.log("Renderer is ready!");
		},

		// --- Loading ---
		onLoadingProgress: (file, progress) => {
			console.log(`Loading ${file.name}: ${progress * 100}%`);
		},
		onInvalidFileType: (file) => {
			alert("Invalid file type! Please drop .schem, .schematic, .litematic, or .zip");
		},

		// --- Schematics ---
		onSchematicLoaded: (id) => {
			console.log(`Schematic '${id}' loaded successfully`);
		},
		onSchematicRendered: (id) => {
			console.log(`Schematic '${id}' meshes created`);
		},
		onSchematicDropped: (file) => {
			console.log("User dropped a schematic file");
		},

		// --- Resource Packs ---
		onResourcePackLoaded: (name) => {
			console.log(`Resource pack '${name}' active`);
		},

		// --- Interaction ---
		onObjectSelected: (object) => {
			console.log("Selected object:", object);
		},
		onObjectDeselected: (object) => {
			console.log("Deselected object");
		},

		// --- Simulation (Redstone) ---
		onSimulationInitialized: (id) => console.log("Sim ready"),
		onSimulationTicked: (tick) => console.log(`Tick: ${tick}`),
		onBlockInteracted: (x, y, z) => console.log(`Clicked block at ${x},${y},${z}`),
	},
};
```

## API Reference

### Core Methods

```javascript
// Load a schematic from URL
await renderer.schematicManager.loadSchematicFromURL("path/to/house.schem", "MyHouse");

// Focus camera on content
renderer.cameraManager.focusOnSchematics();

// Take a screenshot (returns a Promise<Blob>)
const blob = await renderer.takeScreenshot({
	format: "image/png", // or "image/jpeg"
	quality: 0.9, // 0-1, only for jpeg
	width: 1920, // optional, defaults to canvas size
	height: 1080, // optional, defaults to canvas size
});

// Take a screenshot and automatically download it
await renderer.downloadScreenshot("my_screenshot", {
	format: "image/png",
});

// Toggle debug inspector
renderer.toggleInspector();
```

### Rendering Bounds (Slicing)

Control which parts of the schematic are visible. Useful for inspecting interiors.

```javascript
const schematic = renderer.schematicManager.getSchematic("MyHouse");

// Set bounds (minX, minY, minZ, maxX, maxY, maxZ)
// Example: Cut off the top half
schematic.bounds.maxY = 10;

// Reset to full view
schematic.bounds.reset();
```

### Camera Modes

Switch between different camera presets, including isometric view:

```javascript
// Switch to isometric mode
renderer.cameraManager.switchCameraPreset("isometric");

// Switch back to perspective
renderer.cameraManager.switchCameraPreset("perspective");

// Switch to first-person view
renderer.cameraManager.switchCameraPreset("perspective_fpv");

// Or from the console:
canvas.schematicRenderer.cameraManager.switchCameraPreset("isometric");
```

#### Customizing Isometric View

The isometric camera now features improved framing that properly accounts for 3D object projection at viewing angles. You can also customize the viewing angles:

```javascript
// Set custom isometric angles
// pitch: vertical angle (0-90°, default ~35.264° for true isometric)
// yaw: horizontal rotation (default 45°)
renderer.setIsometricAngles(40, 45); // Slightly steeper view

// Common presets:
renderer.setIsometricAngles(35.264, 45); // True isometric (default)
renderer.setIsometricAngles(30, 45); // Flatter, more top-down
renderer.setIsometricAngles(45, 45); // Steeper angle
renderer.setIsometricAngles(35.264, 30); // Different rotation

// Reset to true isometric
renderer.resetIsometricAngles();

// Get current angles
const angles = renderer.getIsometricAngles();
console.log(angles); // { pitch: 35.264, yaw: 45 }

// From console:
canvas.schematicRenderer.setIsometricAngles(40, 60);
```

**Improved Framing:** The isometric camera now calculates the projected bounding box based on the viewing angle, ensuring optimal framing regardless of object orientation. This prevents excessive whitespace and provides tighter, more professional-looking views.

#### SSAO and Isometric Mode

SSAO (Screen Space Ambient Occlusion) automatically adjusts when switching between camera modes. Orthographic cameras (isometric) require different SSAO settings than perspective cameras to avoid overly dark shadows.

**Runtime SSAO Adjustment:**

```javascript
// Customize SSAO for isometric mode
renderer.setSSAOPreset("isometric", {
	aoRadius: 0.3, // Smaller radius for orthographic
	distanceFalloff: 0.1, // Less falloff
	intensity: 0.8, // Lower intensity to prevent darkness
});

// Customize SSAO for perspective mode
renderer.setSSAOPreset("perspective", {
	aoRadius: 1.0,
	distanceFalloff: 0.4,
	intensity: 5.0,
});

// Get current presets
const presets = renderer.getSSAOPresets();
console.log(presets);

// Adjust current SSAO directly (without changing presets)
renderer.setSSAOParameters({
	intensity: 2.0,
	qualityMode: "High",
});
```

**Initialization Options:**

```javascript
const renderer = new SchematicRenderer.SchematicRenderer(
	canvas,
	{},
	{},
	{
		postProcessingOptions: {
			enableSSAO: true,
			ssaoPresets: {
				isometric: {
					aoRadius: 0.3,
					distanceFalloff: 0.1,
					intensity: 0.8,
				},
				perspective: {
					aoRadius: 1.0,
					distanceFalloff: 0.4,
					intensity: 5.0,
				},
			},
		},
		cameraOptions: {
			defaultCameraPreset: "isometric", // Start in isometric mode
		},
	}
);
```

## Development

```bash
# Clone the repository
git clone https://github.com/schem-at/schematic-renderer.git
cd schematic-renderer

# Install dependencies
bun install

# Start development server
bun run dev

# Build for production (outputs to /dist)
bun run build

# Run tests
bun run test

# Run linting
bun run lint
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

This project is licensed under the GNU Affero General Public License v3.0.
