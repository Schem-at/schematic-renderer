import { SchematicRenderer } from "../../../src/SchematicRenderer";
import { performanceMonitor } from "../../../src/performance/PerformanceMonitor";
import { createNoise3D } from "simplex-noise";
import * as THREE from "three";

// Types
interface GenConfig {
	type: "random" | "complex" | "transparent" | "stress";
	size: "small" | "medium" | "large" | "huge";
	mode: "batched" | "incremental" | "immediate";
}

// State
let renderer: SchematicRenderer;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const noise3D = createNoise3D();

// --- Initialization ---
async function init() {
	console.log("🚀 Initializing Runtime Performance Monitor...");

	// Initialize Renderer
	renderer = new SchematicRenderer(
		canvas,
		{},
		{
			vanillaPack: async () => {
				const response = await fetch("/pack.zip");
				const buffer = await response.arrayBuffer();
				return new Blob([buffer], { type: "application/zip" });
			},
		},
		{
			enableInteraction: true,
			enableDragAndDrop: false,
			enableAdaptiveFPS: false, // Disable for accurate perf testing
			targetFPS: 0, // Uncapped
			enableGizmos: true,
			singleSchematicMode: true,
			meshBuildingMode: "batched", // Default, will be overridden
			callbacks: {
				onRendererInitialized: (r) => {
					console.log("✅ Renderer Ready");
					(window as any).renderer = r;
					window.dispatchEvent(new Event("rendererReady"));
				},
			},
		}
	);

	// Expose to window for Alpine.js
	(window as any).renderer = renderer;
	(window as any).performanceMonitor = performanceMonitor;
	(window as any).generateScene = generateScene;

	// Start FPS Loop
	startFPSLoop();
}

// --- FPS Loop ---
function startFPSLoop() {
	let lastTime = performance.now();
	let frames = 0;

	function loop() {
		frames++;
		const now = performance.now();
		if (now - lastTime >= 1000) {
			(window as any).currentFPS = frames;
			frames = 0;
			lastTime = now;
		}
		requestAnimationFrame(loop);
	}
	loop();
}

// --- Generation Logic ---
async function generateScene(config: GenConfig) {
	console.log(`🔨 Generating scene: ${config.type} / ${config.size} / ${config.mode}`);

	// 1. Clear existing
	if (renderer.schematicManager) {
		await renderer.schematicManager.removeAllSchematics();
	}

	// 2. Configure Renderer Mode
	// We need to update the options dynamically
	if (renderer.worldMeshBuilder) {
		// This is a bit hacky but effective for runtime switching
		(renderer.options as any).meshBuildingMode = config.mode;
	}

	// 3. Define Size
	const sizeMap = {
		small: { x: 16, y: 16, z: 16 },
		medium: { x: 32, y: 32, z: 32 },
		large: { x: 64, y: 64, z: 64 },
		huge: { x: 128, y: 128, z: 128 },
	};
	const size = sizeMap[config.size];

	// 4. Create Empty Schematic
	const name = `perf_${config.type}_${config.size}`;
	const schematic = renderer.schematicManager?.createEmptySchematic(name, {
		visible: false, // Hide during build
	});

	if (!schematic) {
		console.error("Failed to create schematic");
		return;
	}

	// 5. Fill with Blocks
	const palettes = {
		random: [
			"minecraft:stone",
			"minecraft:dirt",
			"minecraft:grass_block",
			"minecraft:cobblestone",
			"minecraft:oak_planks",
		],
		complex: [
			"minecraft:oak_stairs[facing=east]",
			"minecraft:oak_fence",
			"minecraft:cobblestone_wall",
			"minecraft:torch",
			"minecraft:flower_pot",
			"minecraft:ladder[facing=north]",
			"minecraft:vine",
		],
		transparent: [
			"minecraft:glass",
			"minecraft:white_stained_glass",
			"minecraft:water",
			"minecraft:ice",
			"minecraft:slime_block",
		],
		stress: [
			"minecraft:oak_leaves[persistent=true]",
			"minecraft:glass",
			"minecraft:oak_stairs",
			"minecraft:redstone_wire",
			"minecraft:hopper",
			"minecraft:acacia_fence_gate",
		],
	};

	const palette = palettes[config.type] || palettes.random;
	const isComplex = config.type === "complex" || config.type === "stress";

	// Checkerboard pattern for "complex" to prevent greedy meshing from hiding geometry
	// Noise for others
	let count = 0;

	for (let x = 0; x < size.x; x++) {
		for (let y = 0; y < size.y; y++) {
			for (let z = 0; z < size.z; z++) {
				let shouldPlace = false;
				let block = palette[0];

				if (isComplex) {
					// 3D Checkerboard - worst case for greedy meshing
					if ((x + y + z) % 2 === 0) {
						shouldPlace = true;
						block = palette[(x + y + z) % palette.length];
					}
				} else {
					// Simplex noise density
					const n = noise3D(x / 20, y / 20, z / 20);
					if (n > 0) {
						shouldPlace = true;
						block = palette[Math.floor(Math.random() * palette.length)];
					}
				}

				if (shouldPlace) {
					schematic.setBlockNoRebuild([x, y, z], block);
					count++;
				}
			}
		}
	}

	console.log(`🧱 Placed ${count} blocks. Building meshes...`);

	// 6. Build
	schematic.visible = true;
	if (schematic.group) schematic.group.visible = true;

	// Use specific build mode
	await schematic.buildSchematicMeshes(
		schematic,
		undefined,
		config.mode
	);

	// 7. Center Camera
	renderer.cameraManager.focusOnSchematics();
	if (config.mode !== "immediate") {
		// Immediate mode might not need this, but good practice
		renderer.setAutoOrbit(true);
	}
	
	console.log("✨ Scene generation complete");
}

// Start
init();
