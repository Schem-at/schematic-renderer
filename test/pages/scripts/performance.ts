
import { SchematicRenderer } from '../../../src/SchematicRenderer';
import { PerformanceVisualizer } from '../../../src/performance/PerformanceVisualizer';
import { performanceMonitor } from '../../../src/performance/PerformanceMonitor';
import * as THREE from 'three';
// We might need SimplexNoise for terrain generation
import { createNoise3D } from 'simplex-noise';

// Get canvas element
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

// Initialize the renderer
const renderer = new SchematicRenderer(
    canvas,
    {}, // No initial schematics
    { // Default resource packs
        vanillaPack: async () => {
            const response = await fetch('/pack.zip');
            const buffer = await response.arrayBuffer();
            return new Blob([buffer], { type: 'application/zip' });
        },
    },
    { // Renderer options
        // GPU compute is disabled - it's ~6x slower than workers due to GPU→CPU readback
        // gpuComputeOptions: { enabled: true }, // DON'T USE - slower!
        enableInteraction: true,
        enableDragAndDrop: false,
        enableAdaptiveFPS: false,
        enableGizmos: false,
        singleSchematicMode: true,
        enableProgressBar: false, // We handle our own progress bar in UI
        callbacks: {
            onRendererInitialized: (renderer: SchematicRenderer) => {
                console.log('Performance test renderer fully initialized');

                if (renderer.renderManager?.renderer) {
                    performanceMonitor.setRenderer(renderer.renderManager.renderer);
                }

                // Store renderer instance on canvas
                (canvas as any).schematicRenderer = renderer;

                // Dispatch event
                const event = new CustomEvent('rendererInitialized', { detail: { renderer } });
                canvas.dispatchEvent(event);
            }
        }
    }
);

// Make globally accessible
(window as any).renderer = renderer;
(window as any).performanceMonitor = performanceMonitor;

// --- Test Generation Logic ---

const noise3D = createNoise3D();

async function generateTestSchematic(renderer: SchematicRenderer, config: any) {
    const sizeMap = {
        small: { x: 16, y: 16, z: 16 },
        medium: { x: 32, y: 32, z: 32 },
        large: { x: 64, y: 64, z: 64 },
        huge: { x: 128, y: 128, z: 128 },
        massive: { x: 256, y: 64, z: 256 }
    };

    const densityMap = {
        sparse: 0.25,
        medium: 0.5,
        dense: 0.75,
        solid: 1.0
    };

    const size = sizeMap[config.schematicSize];
    const density = densityMap[config.blockDensity];

    // Clear existing
    await renderer.schematicManager?.removeAllSchematics();

    const schematicName = `Perf_${config.schematicType}_${config.schematicSize}`;
    // Create invisible initially to prevent auto-build race condition
    const schematic = renderer.schematicManager?.createEmptySchematic(schematicName, { visible: false });

    if (!schematic) throw new Error("Failed to create schematic");

    let blockCount = 0;
    const blocks = []; // Batch updates

    // Block Palette
    const palettes = {
        random: ['minecraft:stone', 'minecraft:dirt', 'minecraft:grass_block', 'minecraft:cobblestone', 'minecraft:oak_planks'],
        complex: ['minecraft:oak_stairs[facing=east]', 'minecraft:oak_fence', 'minecraft:cobblestone_wall', 'minecraft:torch', 'minecraft:flower_pot'],
        transparent: ['minecraft:glass', 'minecraft:white_stained_glass', 'minecraft:water', 'minecraft:ice', 'minecraft:slime_block'],
        stress: ['minecraft:oak_leaves[persistent=true]', 'minecraft:glass', 'minecraft:oak_stairs', 'minecraft:redstone_wire', 'minecraft:hopper']
    };

    const activePalette = palettes[config.schematicType === 'terrain' ? 'random' : config.schematicType] || palettes.random;

    console.log(`Generating ${config.schematicType} schematic (${size.x}x${size.y}x${size.z})...`);

    if (config.schematicType === 'terrain') {
        // Terrain Generation (Simplex Noise)
        let lastLog = 0;
        for (let x = 0; x < size.x; x++) {
            for (let z = 0; z < size.z; z++) {
                // Simple heightmap
                const nx = x / 50.0;
                const nz = z / 50.0;
                const heightVal = (noise3D(nx, nz, 0) + 1) * 0.5; // 0..1
                const height = Math.floor(heightVal * size.y);

                for (let y = 0; y < Math.min(height, size.y); y++) {
                    // Only fill based on density to allow caves? 
                    // For pure terrain, density usually implies "caves".
                    // Let's use 3D noise for caves if not solid.

                    let place = true;
                    if (config.blockDensity < 1.0) {
                        const caveNoise = noise3D(x / 20, y / 20, z / 20);
                        if (caveNoise < (config.blockDensity - 0.5) * 2) place = false;
                    }

                    if (place) {
                        let type = 'minecraft:stone';
                        if (y === height - 1) type = 'minecraft:grass_block';
                        else if (y > height - 4) type = 'minecraft:dirt';
                        else if (y === 0) type = 'minecraft:bedrock';

                        schematic.setBlockNoRebuild([x, y, z], type);
                        blockCount++;
                    }
                }
            }
            // Log progress occasionally
            if (Date.now() - lastLog > 1000) {
                console.log(`Generating terrain: ${(x / size.x * 100).toFixed(0)}%`);
                lastLog = Date.now();
            }
        }
    } else {
        // Random / Standard Generation
        let lastLog = 0;
        let i = 0;
        const totalIterations = size.x * size.y * size.z;

        for (let x = 0; x < size.x; x++) {
            for (let y = 0; y < size.y; y++) {
                for (let z = 0; z < size.z; z++) {
                    if (Math.random() < density) {
                        const blockType = activePalette[Math.floor(Math.random() * activePalette.length)];
                        schematic.setBlockNoRebuild([x, y, z], blockType);
                        blockCount++;
                    }
                    i++;
                }
            }
            // Log progress occasionally
            if (Date.now() - lastLog > 1000) {
                console.log(`Generating random blocks: ${(i / totalIterations * 100).toFixed(0)}%`);
                lastLog = Date.now();
            }
        }
    }

    return { schematic, blockCount };
}

// --- Global Helper Functions for Alpine.js ---

(window as any).runSingleIteration = async (runNumber: number, config: any, renderer: SchematicRenderer, onProgress: (msg: string, pct: number) => void) => {
    // Log run start with ACTUAL performance mode
    const gpuActuallyUsed = renderer.worldMeshBuilder?.isUsingGPUCompute() ?? false;
    const wasmUsed = (renderer.worldMeshBuilder as any)?.isUsingWasmMeshBuilder?.() ?? false;
    const sharedMemUsed = (renderer.worldMeshBuilder as any)?.isUsingSharedMemory?.() ?? false;
    const gpuOptionEnabled = renderer.options.gpuComputeOptions?.enabled ?? false;

    let perfMode: string;
    if (gpuActuallyUsed) {
        perfMode = '🟠 GPU Compute (Active - not recommended)';
    } else if (wasmUsed && sharedMemUsed) {
        perfMode = '🟢 WASM + SharedArrayBuffer (zero-copy)';
    } else if (wasmUsed) {
        perfMode = '🟡 WASM Workers (no SharedArrayBuffer)';
    } else if (gpuOptionEnabled) {
        perfMode = '🟡 GPU Requested but Fallback';
    } else {
        perfMode = '🔵 JavaScript Workers';
    }
    console.log(`⚡ Run ${runNumber}: Starting [${perfMode}]`);

    const timings = {
        start: performance.now(),
        generation: 0,
        build: 0,
        end: 0
    };

    const startMemory = (performance as any).memory?.usedJSHeapSize || 0;

    // 1. Generate
    onProgress("Generating Schematic...", 0.1);
    const genStart = performance.now();
    const { schematic, blockCount } = await generateTestSchematic(renderer, config);
    timings.generation = performance.now() - genStart;

    // 2. Build Meshes
    onProgress("Building Meshes...", 0.3);
    const buildStart = performance.now();

    // Make visible now that we are ready to build
    schematic.visible = true;
    schematic.group.visible = true; // Force THREE.js group visibility immediately

    // We call the mesh builder directly via SchematicObject
    // Ensure we use the configured mode (pass undefined for default chunk dimensions)
    const { meshes, chunkMap } = await schematic.buildSchematicMeshes(
        schematic,
        undefined, // Use default chunk dimensions (16x16x16)
        config.meshBuildingMode
    );

    timings.build = performance.now() - buildStart;

    // 3. Finalize
    onProgress("Finalizing...", 0.9);

    // Force scene update
    renderer.sceneManager.scene.updateMatrixWorld(true);

    timings.end = performance.now();
    const totalTime = timings.end - timings.start;

    const endMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryUsedMB = (endMemory - startMemory) / 1024 / 1024;
    const peakMemoryMB = endMemory / 1024 / 1024;

    // Re-check state at end
    const gpuUsedAtEnd = renderer.worldMeshBuilder?.isUsingGPUCompute() ?? false;
    const wasmUsedAtEnd = (renderer.worldMeshBuilder as any)?.isUsingWasmMeshBuilder?.() ?? false;
    const sharedMemAtEnd = (renderer.worldMeshBuilder as any)?.isUsingSharedMemory?.() ?? false;

    let endPerfMode: string;
    if (gpuUsedAtEnd) {
        endPerfMode = '🟠 GPU Compute';
    } else if (wasmUsedAtEnd && sharedMemAtEnd) {
        endPerfMode = '🟢 WASM+SAB';
    } else if (wasmUsedAtEnd) {
        endPerfMode = '🟡 WASM';
    } else {
        endPerfMode = '🔵 JS Workers';
    }

    console.log(`[Test] Run ${runNumber} Summary [${endPerfMode}]:`);
    console.log(`  Total Time: ${Math.round(totalTime)}ms`);
    console.log(`  Generation: ${Math.round(timings.generation)}ms`);
    console.log(`  Mesh Build: ${Math.round(timings.build)}ms`);
    console.log(`  Memory Used: ${Math.round(memoryUsedMB * 100) / 100}MB`);

    return {
        runNumber,
        buildTime: Math.round(totalTime),
        meshBuildTime: Math.round(timings.build), // Explicit mesh build time
        timingBreakdown: {
            generation: Math.round(timings.generation),
            meshBuilding: Math.round(timings.build)
        },
        memoryUsed: Math.max(0, Math.round(memoryUsedMB * 100) / 100),
        peakMemory: Math.round(peakMemoryMB * 100) / 100,
        blockCount: blockCount,
        schematicSize: config.schematicSize
    };
};

(window as any).calculateMultiRunStatistics = (multiRunResults: any) => {
    if (multiRunResults.runs.length === 0) return;

    const runs = multiRunResults.runs;
    const n = runs.length;

    const avgBuildTime = runs.reduce((sum, r) => sum + r.buildTime, 0) / n;
    const avgMemory = runs.reduce((sum, r) => sum + r.memoryUsed, 0) / n;
    const avgPeak = runs.reduce((sum, r) => sum + r.peakMemory, 0) / n;

    multiRunResults.averages = {
        buildTime: Math.round(avgBuildTime),
        memoryUsage: Math.round(avgMemory * 100) / 100,
        peakMemory: Math.round(avgPeak * 100) / 100
    };

    // Simple min/max
    const times = runs.map(r => r.buildTime);
    multiRunResults.statistics = {
        minBuildTime: Math.min(...times),
        maxBuildTime: Math.max(...times)
    };
};
