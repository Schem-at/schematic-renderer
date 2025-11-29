# Schematic Renderer

A powerful, high-performance 3D rendering library for Minecraft schematics (.schematic, .schem, .litematic), built with Three.js and Rust/WASM.

![Schematic Renderer Demo](./preview.gif)

## Features

- **High-Performance Rendering**: Uses Rust/WASM and multi-threaded Web Workers for fast mesh generation.
- **Easy Integration**: Single-file UMD build with bundled WASM and Workers - just drop it in!
- **Zero-Copy Data Transfer**: Utilizes SharedArrayBuffer (when available) for instant data passing between threads.
- **Resource Pack Support**: Load standard Minecraft resource packs (.zip) with automatic texture atlas generation.
- **Interactive Controls**: Orbit, fly, and creative camera modes.
- **Schematic Slicing**: Real-time rendering bounds for inspecting schematic interiors.
- **Simulation**: Optional redstone/mechanism simulation support (powered by Nucleation).
- **Advanced Rendering**: Support for SSAO, SMAA, and Gamma Correction.
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
			const renderer = new SchematicRenderer.SchematicRenderer(
				canvas,
				{},
				{},
				{
					// Enable useful features
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
			alert(
				"Invalid file type! Please drop .schem, .schematic, .litematic, or .zip"
			);
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
		onBlockInteracted: (x, y, z) =>
			console.log(`Clicked block at ${x},${y},${z}`),
	},
};
```

## API Reference

### Core Methods

```javascript
// Load a schematic from URL
await renderer.schematicManager.loadSchematicFromURL(
	"path/to/house.schem",
	"MyHouse"
);

// Focus camera on content
renderer.cameraManager.focusOnSchematics();

// Take a screenshot
renderer.captureScreenshot({
	format: "image/png",
	callback: (blob) => {
		/* save blob */
	},
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
```

## License

This project is licensed under the GNU Affero General Public License v3.0.
