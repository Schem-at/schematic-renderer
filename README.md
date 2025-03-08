# Schematic Renderer

A powerful 3D rendering library for Minecraft schematics, with support for resource packs, animations, and interactive features.

![Schematic Renderer Demo](./preview.gif)

## Features

- **High-quality 3D rendering** of Minecraft schematics (.schematic, .schem, .litematic)
- **Resource pack support** with automatic texture loading
- **Interactive controls** for camera navigation and object manipulation
- **Rendering bounds** for slicing through schematics with real-time updates
- **Animation capabilities** for creating smooth camera movements
- **Auto-orbit feature** for automatic camera rotation around schematics
- **Screenshot and video recording** functionality
- **Customizable UI** with easy integration into web applications
- **Robust API** for programmatic control of all features

## Installation

```bash
npm install schematic-renderer
# or
yarn add schematic-renderer
# or
bun add schematic-renderer
```

## Basic Usage

```html
<canvas id="canvas"></canvas>

<script type="module">
  import { SchematicRenderer } from 'schematic-renderer';

  const canvas = document.getElementById('canvas');
  const renderer = new SchematicRenderer(canvas, {}, {}, {
    enableDragAndDrop: true
  });

  // The renderer is now ready to use!
  // You can drag and drop schematic files onto the canvas
</script>
```

## Advanced Usage

### Loading Schematics Programmatically

```javascript
// Load a schematic from a file input
document.getElementById('fileInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  await renderer.schematicManager.loadSchematicFromFile(file);
});

// Load a schematic from a URL
await renderer.schematicManager.loadSchematicFromURL('https://example.com/myschematic.schem', 'MySchematic');

// Load from an ArrayBuffer
const response = await fetch('https://example.com/myschematic.schem');
const arrayBuffer = await response.arrayBuffer();
await renderer.schematicManager.loadSchematic('MySchematic', arrayBuffer);
```

### Working with Blocks

```javascript
// Get a reference to the first schematic
const schematic = renderer.schematicManager.getFirstSchematic();

// Set a single block
await schematic.setBlock([0, 0, 0], 'minecraft:stone');

// Set multiple blocks at once (more efficient)
const blocks = [
  [[0, 1, 0], 'minecraft:oak_log'],
  [[0, 2, 0], 'minecraft:oak_log'],
  [[0, 3, 0], 'minecraft:oak_leaves']
];
await schematic.setBlocks(blocks);

// Create a cube of blocks
await schematic.addCube([5, 0, 5], [3, 3, 3], 'minecraft:diamond_block');

// Replace all instances of one block with another
await schematic.replaceBlock('minecraft:dirt', 'minecraft:grass_block');

// Get block at position
const blockType = schematic.getBlock([1, 2, 3]);
console.log(blockType); // e.g. "minecraft:stone"
```

### Manipulating Schematics

```javascript
// Get a reference to a schematic
const schematic = renderer.schematicManager.getSchematic('MySchematic');

// Change position
schematic.position = new THREE.Vector3(10, 0, 10);
// Or using array
schematic.setPosition([10, 0, 10]);

// Change rotation
schematic.rotation = new THREE.Euler(0, Math.PI/2, 0);
// Or using array (in radians)
schematic.setRotation([0, Math.PI/2, 0]);

// Change scale
schematic.scale = new THREE.Vector3(1.5, 1.5, 1.5);
// Or using array
schematic.setScale([1.5, 1.5, 1.5]);

// Change opacity (0.0 - 1.0)
schematic.opacity = 0.7;

// Hide/Show a schematic
schematic.visible = false;
schematic.visible = true;

// Center in scene
schematic.centerInScene();

// Center in horizontal plane only (keeps Y position)
schematic.centerInScenePlane();
```

### Schematic Slicing with Rendering Bounds

```javascript
// Get a reference to a schematic
const schematic = renderer.schematicManager.getSchematic('MySchematic');

// 1. Using the direct bounds property (most convenient)
// Change min and max bounds with automatic updates
schematic.bounds.minY = 5;  // Only show blocks above Y=5
schematic.bounds.maxX = 10; // Only show blocks with X < 10

// Reset bounds to show the full schematic
schematic.bounds.reset();

// Show/hide the bounds helper visualization
schematic.bounds.showHelper(true);

// 2. Using the setRenderingBounds method
// Set specific bounds with min and max points
schematic.setRenderingBounds(
  [0, 5, 0],     // min X, Y, Z
  [10, 15, 10]   // max X, Y, Z
);

// 3. Using the renderer helper methods
// Get all schematic IDs
const schematicIds = renderer.getLoadedSchematics();

// Set rendering bounds for a specific schematic
renderer.setRenderingBounds(schematicIds[0], [0, 5, 0], [10, 15, 10]);

// Set just one axis
renderer.setRenderingBoundsAxis(schematicIds[0], 'y', 5, 15);

// Get current bounds
const bounds = renderer.getRenderingBounds(schematicIds[0]);
console.log(bounds); // { min: [0, 5, 0], max: [10, 15, 10] }

// Create interactive controls for a specific schematic
const controls = renderer.createBoundsControls(schematicIds[0]);
controls.minY = 5;
controls.maxY = 15;
controls.applyY(); // Apply changes to just the Y axis
```

### Camera Control

```javascript
// Focus camera on all schematics
renderer.cameraManager.focusOnSchematics();

// Set specific camera position and target
renderer.cameraManager.setPosition([10, 20, 30]);
renderer.cameraManager.lookAt([0, 0, 0]);

// Change camera mode
renderer.cameraManager.setPerspectiveCamera(); // Perspective view
renderer.cameraManager.setOrthographicCamera(); // Orthographic view

// Create a camera animation
renderer.cameraManager.cameraPathManager.createCircularPath('myPath', {
  radius: 30,
  height: 15,
  target: [0, 0, 0]
});

// Animate camera along path
renderer.cameraManager.animateCameraAlongPath({
  pathName: 'myPath',
  duration: 10, // seconds
  loop: false,
  onComplete: () => console.log('Animation complete')
});

// Enable auto-orbit around the default camera path
renderer.setAutoOrbit(true);

// Set auto-orbit speed (duration in seconds for a full rotation)
renderer.setAutoOrbitDuration(20);

// Toggle auto-orbit on/off
const isNowEnabled = renderer.toggleAutoOrbit();
```

### Screenshot and Recording

```javascript
// Take a screenshot
renderer.captureScreenshot({
  format: 'image/png',
  quality: 1.0,
  callback: (blob) => {
    // Use the blob, e.g., create a download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'screenshot.png';
    a.click();
  }
});

// Record a video
renderer.cameraManager.recordingManager.startRecording(5, { // 5 seconds
  width: 1280,
  height: 720,
  frameRate: 30,
  onProgress: (progress) => console.log(`Recording: ${progress * 100}%`),
  onComplete: (blob) => {
    // Use the video blob
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'animation.webm';
    a.click();
  }
});
```

### Resource Packs

```javascript
// Load a resource pack from a file
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.zip';
fileInput.onchange = async (event) => {
  const file = event.target.files[0];
  await renderer.addResourcePack(file);
};
fileInput.click();

// List available resource packs
const packs = await renderer.getResourcePacks();
console.log(packs); // [{ name: 'pack1', enabled: true, order: 0 }, ...]

// Enable/disable a resource pack
await renderer.toggleResourcePackEnabled('pack1', true);

// Remove a resource pack
await renderer.removeResourcePack('pack1');
```

## Configuration Options

```javascript
const options = {
  // Appearance options
  showGrid: true,            // Show the grid
  showAxes: false,           // Show coordinate axes
  gamma: 0.45,               // Gamma correction
  hdri: '/path/to/hdri.hdr', // Environment map

  // Behavior options
  enableInteraction: true,   // Enable user interaction
  enableDragAndDrop: true,   // Enable drag & drop for files
  enableGizmos: true,        // Enable transform gizmos
  singleSchematicMode: false,// Only allow one schematic at a time

  // Camera options
  cameraOptions: {
    position: [10, 10, 10],  // Initial camera position
  },
  showCameraPathVisualization: false, // Show camera path visualizations
  enableAutoOrbit: false,    // Enable automatic camera orbit
  autoOrbitDuration: 30,     // Orbit rotation time in seconds

  // Gizmo options
  gizmoOptions: {
    enableRotation: true,    // Allow rotation with gizmos
    enableScaling: true,     // Allow scaling with gizmos
  },

  // Callbacks
  callbacks: {
    onRendererInitialized: () => console.log('Renderer ready'),
    onSchematicLoaded: (id) => console.log(`Loaded: ${id}`),
    onSchematicDropped: (file) => console.log(`Dropped: ${file.name}`),
    onSchematicRendered: (id) => console.log(`Rendered: ${id}`),
    onObjectSelected: (obj) => console.log(`Selected: ${obj.id}`),
    onObjectDeselected: (obj) => console.log(`Deselected: ${obj.id}`),
  }
};

const renderer = new SchematicRenderer(canvas, {}, {}, options);
```

## API Reference

### SchematicRenderer

The main class that orchestrates the entire rendering system.

```javascript
/**
 * Creates a new SchematicRenderer instance
 * @param {HTMLCanvasElement} canvas - The canvas element to render to
 * @param {Object} schematicData - Optional initial schematics to load
 * @param {Object} defaultResourcePacks - Optional default resource packs
 * @param {Object} options - Configuration options
 */
const renderer = new SchematicRenderer(canvas, schematicData, defaultResourcePacks, options);
```

### Manager Classes

The renderer provides access to various manager classes that handle specific functionality:

- `schematicManager` - For loading and manipulating schematics
- `cameraManager` - For controlling the camera
- `sceneManager` - For scene-level operations
- `renderManager` - For controlling rendering settings
- `interactionManager` - For handling user interaction
- `highlightManager` - For highlighting blocks
- `gizmoManager` - For transform gizmos
- `uiManager` - For UI elements

### SchematicObject

Represents a single schematic in the scene.

```javascript
/**
 * Gets a SchematicObject by ID
 * @param {string} id - The schematic ID
 * @returns {SchematicObject|undefined}
 */
const schematic = renderer.schematicManager.getSchematic('mySchematic');
```

Properties:
- `position` - THREE.Vector3 for position
- `rotation` - THREE.Euler for rotation
- `scale` - THREE.Vector3 for scale
- `opacity` - Number (0-1) for transparency
- `visible` - Boolean for visibility
- `bounds` - Object for manipulating rendering bounds

### Rendering Bounds

Control which parts of a schematic are rendered with these methods:

```javascript
// Direct property access (simplest)
schematic.bounds.minX = 5;
schematic.bounds.maxY = 10;

// Manual setting
schematic.setRenderingBounds([0, 0, 0], [10, 10, 10]);

// Reset to full dimensions
schematic.bounds.reset();
```

## Development

```bash
# Clone the repository
git clone https://github.com/schem-at/schematic-renderer.git
cd schematic-renderer

# Install dependencies
bun install

# Start the development server
bun run dev

# Build the library
bun run build
```

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

Under this license:
- You can use, modify, and distribute this software
- You must disclose source code when distributing the software
- Modifications must also be AGPLv3 licensed
- If you run a modified version on a server that users interact with, you must make your modified source code available to those users
- You must state your changes to the original code
- You must retain attribution to the original authors