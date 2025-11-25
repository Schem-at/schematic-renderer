/**
 * Schematic Performance Test
 * 
 * Focused test page for loading and profiling large schematics.
 * Tracks: mesh building, chunk processing, memory, render stats in real-time.
 */

import { SchematicRenderer } from "../../../src/SchematicRenderer";

// Types
interface PerformanceResult {
    schematicName: string;
    blockCount: number;
    meshCount: number;
    chunkCount: number;
    totalTimeMs: number;
    parseTimeMs: number;
    meshBuildTimeMs: number;
    paletteTimeMs: number;
    breakdown: { name: string; duration: number }[];
    memoryDeltaMB: number;
    peakMemoryMB: number;
    triangleCount: number;
    vertexCount: number;
    drawCalls: number;
    options: {
        webgpu: boolean;
        greedy: boolean;
        wasm: boolean;
        buildMode: string;
    };
}

interface TimeSeriesPoint {
    timestamp: number;
    fps: number;
    memory: number;
    drawCalls: number;
    triangles: number;
    meshCount: number;
    vertices: number;
    // Rates (per second)
    meshRate: number;
    triRate: number;
    vertRate: number;
}

interface LoadingStats {
    startTime: number;
    startMemory: number;
    peakMemory: number;
    chunksProcessed: number;
    chunksTotal: number;
    meshesBuilt: number;
    currentPhase: string;
    lastUpdate: number;
    lastSceneOverheadWarning?: number;
}

// State
let renderer: SchematicRenderer | null = null;
let currentSchematic: string | null = null;
let results: PerformanceResult[] = [];
let animationFrameId: number | null = null;
let lastFrameTime = performance.now();
let frameCount = 0;
let fps = 0;
let timeSeries: TimeSeriesPoint[] = [];
let isLoading = false;
let loadStartTime = 0;
let peakMemory = 0;
let loadingStats: LoadingStats | null = null;
let monitoringInterval: number | null = null;
let renderCompleteResolver: ((detail: any) => void) | null = null;

// DOM Elements
const elements = {
    canvas: document.getElementById("canvas") as HTMLCanvasElement,
    schematicSelect: document.getElementById("schematic-select") as HTMLSelectElement,
    dropZone: document.getElementById("drop-zone") as HTMLDivElement,
    btnLoad: document.getElementById("btn-load") as HTMLButtonElement,
    btnReload: document.getElementById("btn-reload") as HTMLButtonElement,
    optWebgpu: document.getElementById("opt-webgpu") as HTMLInputElement,
    optGreedy: document.getElementById("opt-greedy") as HTMLInputElement,
    optWasm: document.getElementById("opt-wasm") as HTMLInputElement,
    optBuildMode: document.getElementById("opt-build-mode") as HTMLSelectElement,
    progressOverlay: document.getElementById("progress-overlay") as HTMLDivElement,
    progressBar: document.getElementById("progress-bar") as HTMLDivElement,
    progressText: document.getElementById("progress-text") as HTMLParagraphElement,
    progressDetail: document.getElementById("progress-detail") as HTMLParagraphElement,
    resultsContainer: document.getElementById("results-container") as HTMLDivElement,
    breakdownContainer: document.getElementById("breakdown-container") as HTMLDivElement,
    breakdownList: document.getElementById("breakdown-list") as HTMLDivElement,
    statFps: document.getElementById("stat-fps") as HTMLSpanElement,
    statDrawcalls: document.getElementById("stat-drawcalls") as HTMLSpanElement,
    statTriangles: document.getElementById("stat-triangles") as HTMLSpanElement,
    statMemory: document.getElementById("stat-memory") as HTMLSpanElement,
    rendererType: document.getElementById("renderer-type") as HTMLSpanElement,
    workerCount: document.getElementById("worker-count") as HTMLSpanElement,
    logContainer: document.getElementById("log-container") as HTMLDivElement,
    btnClearLog: document.getElementById("btn-clear-log") as HTMLButtonElement,
    progressMeshes: document.getElementById("progress-meshes") as HTMLDivElement,
    progressTris: document.getElementById("progress-tris") as HTMLDivElement,
    progressVerts: document.getElementById("progress-verts") as HTMLDivElement,
    progressMem: document.getElementById("progress-mem") as HTMLDivElement,
    progressTime: document.getElementById("progress-time") as HTMLDivElement,
};

// Custom logger that writes to both console and UI
function log(message: string, type: 'info' | 'success' | 'warn' | 'error' | 'perf' = 'info') {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const colors: Record<string, string> = {
        info: 'text-zinc-400',
        success: 'text-emerald-400',
        warn: 'text-yellow-400',
        error: 'text-red-400',
        perf: 'text-blue-400',
    };

    // Console log
    const consoleMsg = `[${timestamp}] ${message}`;
    if (type === 'error') console.error(consoleMsg);
    else if (type === 'warn') console.warn(consoleMsg);
    else console.log(consoleMsg);

    // UI log
    if (elements.logContainer) {
        const line = document.createElement('div');
        line.className = colors[type];
        line.textContent = `[${timestamp}] ${message}`;
        elements.logContainer.appendChild(line);
        elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
    }
}

function clearLog() {
    if (elements.logContainer) {
        elements.logContainer.innerHTML = '<div class="text-zinc-600">Log cleared.</div>';
    }
}

// Count triangles directly from geometry (not from render stats which only update after render)
function countGeometryTriangles(group: any): { triangles: number; vertices: number } {
    let triangles = 0;
    let vertices = 0;

    if (!group) return { triangles, vertices };

    group.traverse((child: any) => {
        if (child.geometry) {
            const geo = child.geometry;
            if (geo.index) {
                triangles += geo.index.count / 3;
            } else if (geo.attributes?.position) {
                triangles += geo.attributes.position.count / 3;
            }
            if (geo.attributes?.position) {
                vertices += geo.attributes.position.count;
            }
        }
    });

    return { triangles: Math.floor(triangles), vertices };
}

// Calculate rates from time series (looking back N samples)
function calculateRates(lookbackSamples: number = 10): { meshRate: number; triRate: number; vertRate: number } {
    if (timeSeries.length < 2) return { meshRate: 0, triRate: 0, vertRate: 0 };

    const recent = timeSeries.slice(-lookbackSamples);
    if (recent.length < 2) return { meshRate: 0, triRate: 0, vertRate: 0 };

    const first = recent[0];
    const last = recent[recent.length - 1];
    const timeDeltaSec = (last.timestamp - first.timestamp) / 1000;

    if (timeDeltaSec <= 0) return { meshRate: 0, triRate: 0, vertRate: 0 };

    return {
        meshRate: (last.meshCount - first.meshCount) / timeDeltaSec,
        triRate: (last.triangles - first.triangles) / timeDeltaSec,
        vertRate: (last.vertices - first.vertices) / timeDeltaSec,
    };
}

// Start real-time monitoring during load
function startLoadingMonitor() {
    if (monitoringInterval) clearInterval(monitoringInterval);

    let lastLoggedMeshCount = 0;
    let lastSlowdownAlert = 0;
    let peakMeshRate = 0;
    let peakTriRate = 0;

    monitoringInterval = window.setInterval(() => {
        if (!renderer || !loadingStats) return;

        const elapsed = performance.now() - loadingStats.startTime;
        const currentMemory = getMemoryUsage();
        loadingStats.peakMemory = Math.max(loadingStats.peakMemory, currentMemory);

        // Get schematic group
        const schematic = renderer.schematicManager?.getSchematic(currentSchematic || "");
        const group = schematic?.group;
        const meshCount = group?.children?.length ?? 0;

        // Count triangles DIRECTLY from geometry (not render stats)
        const geoStats = countGeometryTriangles(group);
        const triangles = geoStats.triangles;
        const vertices = geoStats.vertices;

        // Get render stats (may be stale)
        const info = (renderer.renderManager?.getRenderer() as any)?.info;
        const drawCalls = info?.render?.calls ?? 0;

        // Calculate current rates
        const rates = calculateRates(10);
        peakMeshRate = Math.max(peakMeshRate, rates.meshRate);
        peakTriRate = Math.max(peakTriRate, rates.triRate);

        // Track GC events (memory drops > 50MB)
        if (timeSeries.length > 0) {
            const lastMem = timeSeries[timeSeries.length - 1].memory;
            if (lastMem - currentMemory > 50) {
                log(`🗑️ GC detected: ${lastMem.toFixed(0)} MB → ${currentMemory.toFixed(0)} MB (-${(lastMem - currentMemory).toFixed(0)} MB)`, "warn");
            }
        }

        // Detect significant slowdowns (rate dropped to < 30% of peak)
        if (peakMeshRate > 0.5 && rates.meshRate < peakMeshRate * 0.3 && elapsed - lastSlowdownAlert > 3000) {
            lastSlowdownAlert = elapsed;
            log(`⚠️ SLOWDOWN: ${rates.meshRate.toFixed(2)} meshes/sec (was ${peakMeshRate.toFixed(2)}) | mem: ${currentMemory.toFixed(0)} MB`, "warn");
        }

        // Record time series
        timeSeries.push({
            timestamp: elapsed,
            fps,
            memory: currentMemory,
            drawCalls,
            triangles,
            meshCount,
            vertices,
            meshRate: rates.meshRate,
            triRate: rates.triRate,
            vertRate: rates.vertRate,
        });

        // Update progress panel stats
        if (elements.progressMeshes) elements.progressMeshes.textContent = String(meshCount);
        if (elements.progressTris) elements.progressTris.textContent = formatNumber(triangles);
        if (elements.progressVerts) elements.progressVerts.textContent = formatNumber(vertices);
        if (elements.progressMem) elements.progressMem.textContent = `${currentMemory.toFixed(0)} MB`;
        if (elements.progressTime) elements.progressTime.textContent = formatMs(elapsed);

        // Update progress detail text with rates
        const progressDetail = elements.progressDetail;
        if (progressDetail) {
            progressDetail.innerHTML = `
                <span class="text-emerald-400">${rates.meshRate.toFixed(1)}</span> mesh/s | 
                <span class="text-blue-400">${formatNumber(Math.round(rates.triRate))}</span> tri/s | 
                <span class="text-purple-400">${formatNumber(Math.round(rates.vertRate))}</span> vert/s
            `;
        }

        // Calculate per-mesh stats
        const trisPerMesh = meshCount > 0 ? Math.round(triangles / meshCount) : 0;
        const vertsPerMesh = meshCount > 0 ? Math.round(vertices / meshCount) : 0;

        // Detect if scene overhead is growing (tris/mesh staying constant but rate dropping)
        if (timeSeries.length > 20) {
            const recentPoints = timeSeries.slice(-20);
            const avgRecentTrisPerMesh = recentPoints.reduce((a, p) => a + (p.meshCount > 0 ? p.triangles / p.meshCount : 0), 0) / recentPoints.length;
            const earlyPoints = timeSeries.slice(5, 25);
            const avgEarlyTrisPerMesh = earlyPoints.reduce((a, p) => a + (p.meshCount > 0 ? p.triangles / p.meshCount : 0), 0) / Math.max(1, earlyPoints.length);

            // If tris/mesh is similar but rate dropped, it's scene overhead
            if (Math.abs(avgRecentTrisPerMesh - avgEarlyTrisPerMesh) < avgEarlyTrisPerMesh * 0.3) {
                const earlyRate = earlyPoints.length > 1 ? calculateRatesFromPoints(earlyPoints) : null;
                const recentRate = calculateRatesFromPoints(recentPoints);

                if (earlyRate && earlyRate.meshRate > 2 && recentRate.meshRate < earlyRate.meshRate * 0.3) {
                    // Only log once every 10 seconds for this warning
                    if (!loadingStats.lastSceneOverheadWarning || elapsed - loadingStats.lastSceneOverheadWarning > 10000) {
                        loadingStats.lastSceneOverheadWarning = elapsed;
                        log(`🐌 Scene overhead detected: tris/mesh ~${Math.round(avgRecentTrisPerMesh)} constant, but rate dropped ${earlyRate.meshRate.toFixed(1)} → ${recentRate.meshRate.toFixed(1)} m/s`, "warn");
                    }
                }
            }
        }

        // Log progress when mesh count changes significantly or every 2 seconds
        const meshDelta = meshCount - lastLoggedMeshCount;
        if (meshDelta >= 5 || (elapsed - loadingStats.lastUpdate > 2000 && meshCount > lastLoggedMeshCount)) {
            loadingStats.lastUpdate = elapsed;
            lastLoggedMeshCount = meshCount;
            log(`⏳ ${meshCount} meshes | ${formatNumber(triangles)} tris | ${rates.meshRate.toFixed(1)} m/s | ${trisPerMesh} t/mesh | ${currentMemory.toFixed(0)} MB`, "perf");
        }
    }, 100);
}

// Helper to calculate rates from specific points
function calculateRatesFromPoints(points: TimeSeriesPoint[]): { meshRate: number; triRate: number } {
    if (points.length < 2) return { meshRate: 0, triRate: 0 };
    const first = points[0];
    const last = points[points.length - 1];
    const timeDeltaSec = (last.timestamp - first.timestamp) / 1000;
    if (timeDeltaSec <= 0) return { meshRate: 0, triRate: 0 };
    return {
        meshRate: (last.meshCount - first.meshCount) / timeDeltaSec,
        triRate: (last.triangles - first.triangles) / timeDeltaSec,
    };
}

// Analyze time series data to find bottlenecks
function analyzeTimeSeries(): void {
    if (timeSeries.length < 10) {
        log("📊 Not enough data for analysis", "info");
        return;
    }

    // Find periods of low performance
    const slowPeriods: { start: number; end: number; avgRate: number; reason: string }[] = [];
    let inSlowPeriod = false;
    let slowStart = 0;
    let slowRates: number[] = [];

    // Calculate overall stats
    const allMeshRates = timeSeries.map(p => p.meshRate).filter(r => r > 0);
    const avgMeshRate = allMeshRates.reduce((a, b) => a + b, 0) / allMeshRates.length || 0;
    const peakMeshRate = Math.max(...allMeshRates, 0);
    const minMeshRate = Math.min(...allMeshRates.filter(r => r > 0), Infinity);

    const allTriRates = timeSeries.map(p => p.triRate).filter(r => r > 0);
    const avgTriRate = allTriRates.reduce((a, b) => a + b, 0) / allTriRates.length || 0;
    const peakTriRate = Math.max(...allTriRates, 0);

    // Detect slow periods
    for (let i = 1; i < timeSeries.length; i++) {
        const point = timeSeries[i];
        const prevPoint = timeSeries[i - 1];
        const isSlowNow = point.meshRate < avgMeshRate * 0.5;

        if (isSlowNow && !inSlowPeriod) {
            inSlowPeriod = true;
            slowStart = point.timestamp;
            slowRates = [point.meshRate];
        } else if (isSlowNow && inSlowPeriod) {
            slowRates.push(point.meshRate);
        } else if (!isSlowNow && inSlowPeriod) {
            inSlowPeriod = false;
            const avgSlowRate = slowRates.reduce((a, b) => a + b, 0) / slowRates.length;

            // Determine likely reason
            let reason = "Unknown";
            const memDuringSlowdown = timeSeries.slice(
                timeSeries.findIndex(p => p.timestamp >= slowStart),
                i
            ).map(p => p.memory);
            const maxMemDuringSlowdown = Math.max(...memDuringSlowdown);
            const memDrop = memDuringSlowdown[0] - memDuringSlowdown[memDuringSlowdown.length - 1];

            if (memDrop > 100) {
                reason = "GC pause";
            } else if (maxMemDuringSlowdown > 900) {
                reason = "Memory pressure";
            } else {
                reason = "Complex chunk";
            }

            slowPeriods.push({
                start: slowStart,
                end: point.timestamp,
                avgRate: avgSlowRate,
                reason
            });
        }
    }

    // Log analysis
    log(`═══════════════════════════════════`, "perf");
    log(`📊 RATE ANALYSIS`, "success");
    log(`═══════════════════════════════════`, "perf");
    log(`Mesh Rate: avg ${avgMeshRate.toFixed(2)}/s, peak ${peakMeshRate.toFixed(2)}/s, min ${minMeshRate === Infinity ? 0 : minMeshRate.toFixed(2)}/s`, "info");
    log(`Triangle Rate: avg ${formatNumber(Math.round(avgTriRate))}/s, peak ${formatNumber(Math.round(peakTriRate))}/s`, "info");

    if (slowPeriods.length > 0) {
        log(`\n⚠️ ${slowPeriods.length} slow period(s) detected:`, "warn");
        slowPeriods.slice(0, 5).forEach((period, i) => {
            const duration = period.end - period.start;
            log(`  ${i + 1}. ${formatMs(period.start)}-${formatMs(period.end)} (${formatMs(duration)}): ${period.avgRate.toFixed(2)} m/s - ${period.reason}`, "warn");
        });
    } else {
        log(`✅ No significant slowdowns detected`, "success");
    }

    // Memory analysis
    const memPoints = timeSeries.map(p => p.memory);
    const peakMem = Math.max(...memPoints);
    const gcEvents = timeSeries.filter((p, i) => {
        if (i === 0) return false;
        return timeSeries[i - 1].memory - p.memory > 50;
    }).length;

    log(`\n💾 Memory: peak ${peakMem.toFixed(0)} MB, ${gcEvents} GC events`, "info");

    // Throughput variability
    const rateVariability = allMeshRates.length > 0
        ? Math.sqrt(allMeshRates.map(r => Math.pow(r - avgMeshRate, 2)).reduce((a, b) => a + b, 0) / allMeshRates.length) / avgMeshRate * 100
        : 0;

    if (rateVariability > 50) {
        log(`📉 High rate variability: ${rateVariability.toFixed(0)}% - inconsistent chunk processing`, "warn");
    } else {
        log(`📈 Rate variability: ${rateVariability.toFixed(0)}% - ${rateVariability < 25 ? 'stable' : 'moderate'}`, "info");
    }
}

function stopLoadingMonitor() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
}

// Wait for schematicRenderComplete event
function waitForRenderComplete(timeoutMs: number = 60000): Promise<any> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            window.removeEventListener("schematicRenderComplete", handler);
            reject(new Error("Render complete timeout"));
        }, timeoutMs);

        const handler = (event: CustomEvent) => {
            clearTimeout(timeout);
            window.removeEventListener("schematicRenderComplete", handler);
            resolve(event.detail);
        };

        window.addEventListener("schematicRenderComplete", handler as EventListener);
        renderCompleteResolver = resolve;
    });
}

// Force render to wake up from idle mode
function wakeRenderer() {
    if (renderer) {
        // Force wake from idle by simulating activity
        (renderer as any).isIdle = false;
        (renderer as any).lastInteractionTime = performance.now();
        (renderer as any).frameInterval = 1000 / 60; // 60 FPS

        // Cancel any pending idle timeout
        if ((renderer as any).idleTimeoutId !== null) {
            clearTimeout((renderer as any).idleTimeoutId);
            (renderer as any).idleTimeoutId = null;
        }

        // Force a render
        renderer.renderManager?.render();
    }
}

// Inject timing into mesh building to find bottleneck
function injectMainThreadTiming() {
    if (!renderer?.worldMeshBuilder) return;

    const wmb = renderer.worldMeshBuilder as any;
    const originalGetChunkMesh = wmb.getChunkMesh?.bind(wmb);

    if (originalGetChunkMesh) {
        let callCount = 0;
        let totalTime = 0;
        let maxTime = 0;

        wmb.getChunkMesh = async function (...args: any[]) {
            const start = performance.now();
            const result = await originalGetChunkMesh(...args);
            const elapsed = performance.now() - start;

            callCount++;
            totalTime += elapsed;
            maxTime = Math.max(maxTime, elapsed);

            // Log every 10 calls
            if (callCount % 10 === 0) {
                log(`🔧 getChunkMesh: avg ${(totalTime / callCount).toFixed(0)}ms, max ${maxTime.toFixed(0)}ms, last ${elapsed.toFixed(0)}ms (n=${callCount})`, elapsed > 500 ? "warn" : "info");
            }

            return result;
        };

        log("✅ Main thread timing injected", "success");
    }
}

// Available schematics in the public folder
const SCHEMATICS = [
    { name: "large_schematic", path: "/schematics/large_schematic.schem" },
];

// Initialize
async function init() {
    log("🚀 Schematic Performance Test initializing...", "info");

    // Populate schematic dropdown
    SCHEMATICS.forEach(s => {
        const option = document.createElement("option");
        option.value = s.path;
        option.textContent = s.name;
        elements.schematicSelect.appendChild(option);
    });

    // Setup event listeners
    elements.btnLoad.addEventListener("click", loadSchematic);
    elements.btnReload.addEventListener("click", reloadSchematic);
    elements.schematicSelect.addEventListener("change", () => {
        elements.btnLoad.disabled = !elements.schematicSelect.value;
        if (elements.schematicSelect.value) {
            log(`Selected: ${elements.schematicSelect.value.split('/').pop()}`, "info");
        }
    });

    // Clear log button
    elements.btnClearLog?.addEventListener("click", clearLog);

    // Drag and drop
    setupDragAndDrop();

    // Initialize renderer
    await initRenderer();

    // Start stats loop
    requestAnimationFrame(updateStats);

    log("✅ Initialization complete", "success");
}

async function initRenderer() {
    const options = getOptions();

    log(`🔧 Initializing renderer...`, "info");
    log(`   WebGPU: ${options.webgpu}, WASM: ${options.wasm}, Greedy: ${options.greedy}, Mode: ${options.buildMode}`, "info");
    showProgress("Initializing renderer...", 0);

    // Dispose existing renderer
    if (renderer) {
        renderer.dispose();
        renderer = null;
    }

    renderer = new SchematicRenderer(
        elements.canvas,
        {}, // No initial schematics
        {
            vanillaPack: async () => {
                const response = await fetch("/pack.zip");
                const buffer = await response.arrayBuffer();
                return new Blob([buffer], { type: "application/zip" });
            },
        },
        {
            webgpuOptions: {
                preferWebGPU: options.webgpu,
            },
            wasmMeshBuilderOptions: {
                enabled: options.wasm,
                greedyMeshingEnabled: options.greedy,
            },
            meshBuildingMode: options.buildMode as any,
            debugOptions: {
                enableInspector: false,
            },
            enableProgressBar: false,
            enableDragAndDrop: false,
            singleSchematicMode: true,
            hdri: "/minecraft_day.hdr",
            gamma: 0.45,
            // Disable adaptive FPS for accurate testing
            enableAdaptiveFPS: false,
            targetFPS: 60,
            idleFPS: 60, // Keep running at full speed even when "idle"
            callbacks: {
                onRendererInitialized: (r) => {
                    log("✅ Renderer initialized", "success");
                    hideProgress();
                    updateRendererInfo();
                },
            },
        }
    );

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 500));
    hideProgress();

    // Inject timing to find bottlenecks
    injectMainThreadTiming();
}

function getOptions() {
    return {
        webgpu: elements.optWebgpu.checked,
        greedy: elements.optGreedy.checked,
        wasm: elements.optWasm.checked,
        buildMode: elements.optBuildMode.value,
    };
}

function updateRendererInfo() {
    if (!renderer) return;

    const isWebGPU = renderer.renderManager?.isWebGPU ?? false;
    elements.rendererType.textContent = isWebGPU ? "WebGPU" : "WebGL";
    elements.rendererType.className = isWebGPU ? "text-emerald-400" : "text-blue-400";

    // Worker count
    const workerCount = (renderer.worldMeshBuilder as any)?.workers?.length ?? 0;
    elements.workerCount.textContent = `${workerCount} workers`;
}

async function loadSchematic() {
    const path = elements.schematicSelect.value;
    if (!path || !renderer) return;

    const name = path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "unknown";
    currentSchematic = name;
    isLoading = true;
    timeSeries = [];

    const startMemory = getMemoryUsage();
    loadingStats = {
        startTime: performance.now(),
        startMemory,
        peakMemory: startMemory,
        chunksProcessed: 0,
        chunksTotal: 0,
        meshesBuilt: 0,
        currentPhase: "init",
        lastUpdate: 0,
    };

    log(`📦 Loading schematic: ${name}`, "info");
    log(`📊 Start memory: ${startMemory.toFixed(1)} MB`, "perf");
    showProgress(`Loading ${name}...`, 0);

    const timings = {
        fetchStart: 0,
        fetchEnd: 0,
        parseStart: 0,
        renderComplete: 0,
    };

    try {
        // Clear existing schematics
        if (renderer.schematicManager) {
            for (const [id] of renderer.schematicManager.schematics) {
                renderer.schematicManager.removeSchematic(id);
            }
        }

        // Wake renderer from idle mode
        wakeRenderer();

        // Load schematic file
        showProgress("Fetching schematic file...", 5);
        timings.fetchStart = performance.now();
        const response = await fetch(path);
        const buffer = await response.arrayBuffer();
        timings.fetchEnd = performance.now();
        log(`📁 Fetch: ${(timings.fetchEnd - timings.fetchStart).toFixed(0)}ms (${(buffer.byteLength / 1024).toFixed(0)} KB)`, "perf");

        showProgress("Parsing schematic...", 10);
        loadingStats.currentPhase = "parsing";
        timings.parseStart = performance.now();

        // Start monitoring BEFORE loading
        startLoadingMonitor();

        // Setup the completion promise BEFORE loading
        const renderCompletePromise = waitForRenderComplete(120000); // 2 minute timeout

        // Load into renderer (this starts async mesh building)
        const buildMode = getOptions().buildMode;
        log(`🔨 Starting mesh build (${buildMode} mode)...`, "info");
        loadingStats.currentPhase = "building";

        // Update renderer's build mode to match current selection
        if (renderer.options) {
            renderer.options.meshBuildingMode = buildMode as any;
        }

        await renderer.schematicManager?.loadSchematics({
            [name]: () => Promise.resolve(buffer),
        });

        log(`📝 Schematic loaded, waiting for mesh build to complete...`, "info");
        showProgress("Building meshes...", 20);

        // Wait for actual render completion event
        let renderCompleteData: any = null;
        try {
            renderCompleteData = await renderCompletePromise;
            timings.renderComplete = performance.now();
            log(`✅ Render complete event received`, "success");
        } catch (e) {
            log(`⚠️ Render complete timeout - capturing current state`, "warn");
            timings.renderComplete = performance.now();
        }

        // Stop monitoring
        stopLoadingMonitor();

        // Wake renderer again for accurate stats
        wakeRenderer();
        await new Promise(r => setTimeout(r, 200)); // Let a few frames render

        // Get FINAL performance data
        const endTime = performance.now();
        const endMemory = getMemoryUsage();

        // Extract timing breakdown from schematic object
        const schematic = renderer.schematicManager?.getSchematic(name);
        const breakdown = extractBreakdown(schematic);

        // Get ACCURATE stats from geometry (not render stats)
        const meshCount = schematic?.group?.children?.length ?? renderCompleteData?.meshCount ?? 0;
        const finalGeoStats = countGeometryTriangles(schematic?.group);

        // Also get render stats for comparison
        const info = (renderer.renderManager?.getRenderer() as any)?.info;

        const result: PerformanceResult = {
            schematicName: name,
            blockCount: schematic?.schematicWrapper?.get_block_count() ?? 0,
            meshCount,
            chunkCount: renderCompleteData?.totalChunks ?? 0,
            totalTimeMs: endTime - loadingStats.startTime,
            parseTimeMs: timings.renderComplete - timings.parseStart,
            meshBuildTimeMs: renderCompleteData?.buildTimeMs ?? (timings.renderComplete - timings.parseStart),
            paletteTimeMs: breakdown.find(b => b.name.includes('palette'))?.duration ?? 0,
            breakdown,
            memoryDeltaMB: endMemory - startMemory,
            peakMemoryMB: loadingStats.peakMemory,
            // Use geometry stats (accurate) not render stats (may be stale)
            triangleCount: finalGeoStats.triangles,
            vertexCount: finalGeoStats.vertices,
            drawCalls: info?.render?.calls ?? meshCount, // drawCalls ≈ meshCount if not rendered yet
            options: getOptions(),
        };

        // Log comparison of geo vs render stats
        log(`📐 Geometry: ${formatNumber(finalGeoStats.triangles)} tris, ${formatNumber(finalGeoStats.vertices)} verts`, "info");
        log(`🖼️ Render info: ${formatNumber(info?.render?.triangles ?? 0)} tris, ${info?.render?.calls ?? 0} draws`, "info");

        results.push(result);
        displayResults(result);

        // Log detailed breakdown
        log(`═══════════════════════════════════`, "perf");
        log(`📊 FINAL RESULTS: ${name}`, "success");
        log(`═══════════════════════════════════`, "perf");
        log(`⏱️ Total Time: ${formatMs(result.totalTimeMs)}`, "perf");
        log(`🧱 Blocks: ${formatNumber(result.blockCount)}`, "perf");
        log(`📦 Meshes: ${result.meshCount}`, "perf");
        log(`🔺 Triangles: ${formatNumber(result.triangleCount)}`, "perf");
        log(`🎨 Draw Calls: ${result.drawCalls}`, "perf");
        log(`💾 Memory: +${result.memoryDeltaMB.toFixed(1)} MB (peak: ${result.peakMemoryMB.toFixed(1)} MB)`, "perf");

        const throughput = Math.round(result.blockCount / (result.totalTimeMs / 1000));
        log(`⚡ Throughput: ${formatNumber(throughput)} blocks/sec`, throughput > 50000 ? "success" : throughput > 20000 ? "warn" : "error");

        // Run time series analysis
        analyzeTimeSeries();

        if (breakdown.length > 0) {
            log(`📋 Top timing entries:`, "info");
            breakdown.slice(0, 5).forEach(b => {
                log(`   ${b.name}: ${formatMs(b.duration)}`, "info");
            });
        }

        // Focus camera on schematic
        renderer.cameraManager?.focusOnSchematics();

        hideProgress();
        isLoading = false;
        loadingStats = null;

    } catch (error) {
        stopLoadingMonitor();
        log(`❌ Failed to load schematic: ${error}`, "error");
        hideProgress();
        isLoading = false;
        loadingStats = null;
        showError(`Failed to load: ${error}`);
    }
}

async function reloadSchematic() {
    // Reinitialize with current options
    await initRenderer();

    // Reload current schematic if one was loaded
    if (currentSchematic && elements.schematicSelect.value) {
        await loadSchematic();
    }
}

function extractBreakdown(schematic: any): { name: string; duration: number }[] {
    const breakdown: { name: string; duration: number }[] = [];

    // Try to get timing data from schematic
    if (schematic?.timingData) {
        for (const [name, duration] of Object.entries(schematic.timingData)) {
            breakdown.push({ name, duration: duration as number });
        }
    }

    return breakdown.sort((a, b) => b.duration - a.duration);
}

function displayResults(result: PerformanceResult) {
    const throughput = Math.round(result.blockCount / (result.totalTimeMs / 1000));

    elements.resultsContainer.innerHTML = `
        <div class="perf-card bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
            <h3 class="text-emerald-400 font-semibold mb-3">${result.schematicName}</h3>
            
            <!-- Main Stats Grid -->
            <div class="grid grid-cols-3 gap-2 text-sm">
                <div class="bg-zinc-900/50 rounded p-2">
                    <div class="text-zinc-500 text-xs">Total Time</div>
                    <div class="stat-value text-lg ${result.totalTimeMs > 10000 ? 'text-red-400' : result.totalTimeMs > 5000 ? 'text-yellow-400' : 'text-emerald-400'}">
                        ${formatMs(result.totalTimeMs)}
                    </div>
                </div>
                <div class="bg-zinc-900/50 rounded p-2">
                    <div class="text-zinc-500 text-xs">Blocks</div>
                    <div class="stat-value text-lg">${formatNumber(result.blockCount)}</div>
                </div>
                <div class="bg-zinc-900/50 rounded p-2">
                    <div class="text-zinc-500 text-xs">Meshes</div>
                    <div class="stat-value text-lg">${result.meshCount}</div>
                </div>
                <div class="bg-zinc-900/50 rounded p-2">
                    <div class="text-zinc-500 text-xs">Triangles</div>
                    <div class="stat-value text-lg text-blue-400">${formatNumber(result.triangleCount)}</div>
                </div>
                <div class="bg-zinc-900/50 rounded p-2">
                    <div class="text-zinc-500 text-xs">Vertices</div>
                    <div class="stat-value text-lg text-purple-400">${formatNumber(result.vertexCount)}</div>
                </div>
                <div class="bg-zinc-900/50 rounded p-2">
                    <div class="text-zinc-500 text-xs">Draw Calls</div>
                    <div class="stat-value text-lg ${result.drawCalls > 500 ? 'text-red-400' : result.drawCalls > 200 ? 'text-yellow-400' : 'text-emerald-400'}">${result.drawCalls}</div>
                </div>
                <div class="bg-zinc-900/50 rounded p-2 col-span-2">
                    <div class="text-zinc-500 text-xs">Memory</div>
                    <div class="stat-value text-lg ${result.memoryDeltaMB > 500 ? 'text-red-400' : result.memoryDeltaMB > 200 ? 'text-yellow-400' : 'text-zinc-300'}">
                        +${result.memoryDeltaMB.toFixed(0)} MB (peak: ${result.peakMemoryMB.toFixed(0)} MB)
                    </div>
                </div>
                <div class="bg-zinc-900/50 rounded p-2">
                    <div class="text-zinc-500 text-xs">Chunks</div>
                    <div class="stat-value text-lg">${result.chunkCount}</div>
                </div>
            </div>
            
            <!-- Throughput Banner -->
            <div class="mt-3 p-3 bg-gradient-to-r from-emerald-900/30 to-zinc-900/30 rounded-lg">
                <div class="text-zinc-500 text-xs mb-1">⚡ Throughput</div>
                <div class="stat-value text-2xl text-emerald-400">
                    ${formatNumber(throughput)} <span class="text-sm text-zinc-500">blocks/sec</span>
                </div>
            </div>
            
            <!-- Options Tags -->
            <div class="mt-3 pt-3 border-t border-zinc-700 text-xs text-zinc-500">
                <div class="flex flex-wrap gap-2">
                    <span class="px-2 py-0.5 rounded ${result.options.webgpu ? 'bg-emerald-900/50 text-emerald-400' : 'bg-blue-900/50 text-blue-400'}">
                        ${result.options.webgpu ? 'WebGPU' : 'WebGL'}
                    </span>
                    <span class="px-2 py-0.5 rounded ${result.options.greedy ? 'bg-emerald-900/50 text-emerald-400' : 'bg-zinc-700'}">
                        ${result.options.greedy ? 'Greedy ✓' : 'Standard'}
                    </span>
                    <span class="px-2 py-0.5 rounded ${result.options.wasm ? 'bg-emerald-900/50 text-emerald-400' : 'bg-zinc-700'}">
                        ${result.options.wasm ? 'WASM ✓' : 'JS'}
                    </span>
                    <span class="px-2 py-0.5 rounded bg-zinc-700">${result.options.buildMode}</span>
                </div>
            </div>
        </div>
        
        <!-- Performance Rating -->
        <div class="mt-4 p-3 rounded-lg ${getPerformanceRating(result).bgClass}">
            <div class="flex items-center gap-2">
                <span class="text-2xl">${getPerformanceRating(result).emoji}</span>
                <div>
                    <div class="font-semibold">${getPerformanceRating(result).label}</div>
                    <div class="text-xs opacity-75">${getPerformanceRating(result).description}</div>
                </div>
            </div>
        </div>
        
        <!-- Peak Memory -->
        <div class="mt-4 bg-zinc-800/50 rounded-lg p-3">
            <div class="flex justify-between items-center">
                <div>
                    <div class="text-zinc-500 text-xs">Peak Memory</div>
                    <div class="stat-value text-lg">${result.peakMemoryMB.toFixed(0)} MB</div>
                </div>
                <div class="text-right">
                    <div class="text-zinc-500 text-xs">Memory/Block</div>
                    <div class="stat-value text-lg">${((result.memoryDeltaMB * 1024 * 1024) / result.blockCount).toFixed(1)} B</div>
                </div>
            </div>
        </div>
        
        <!-- Export Buttons -->
        <div class="mt-4 grid grid-cols-2 gap-2">
            <button onclick="window.exportResults()" class="bg-zinc-700 hover:bg-zinc-600 py-2 rounded-lg text-xs transition-colors">
                Export Results
            </button>
            <button onclick="window.exportTimeSeries()" class="bg-blue-900/50 hover:bg-blue-800/50 py-2 rounded-lg text-xs transition-colors">
                Export Timeline
            </button>
        </div>
    `;

    // Display breakdown
    if (result.breakdown.length > 0) {
        elements.breakdownContainer.classList.remove("hidden");
        elements.breakdownList.innerHTML = result.breakdown.slice(0, 15).map(b => {
            const percent = (b.duration / result.totalTimeMs * 100).toFixed(1);
            return `
            <div class="flex justify-between items-center py-1 border-b border-zinc-800">
                <span class="text-zinc-400 truncate flex-1">${b.name}</span>
                <div class="flex items-center gap-2 ml-2">
                    <div class="w-16 h-1.5 bg-zinc-800 rounded overflow-hidden">
                        <div class="h-full bg-emerald-500" style="width: ${Math.min(100, parseFloat(percent))}%"></div>
                    </div>
                    <span class="stat-value text-zinc-300 w-16 text-right">${formatMs(b.duration)}</span>
                </div>
            </div>
        `}).join("");
    }
}

// Export results function
(window as any).exportResults = function () {
    const data = JSON.stringify(results, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schematic-perf-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

// Export time series for detailed analysis
(window as any).exportTimeSeries = function () {
    const data = JSON.stringify({
        schematic: currentSchematic,
        options: getOptions(),
        timeSeries,
        summary: {
            totalPoints: timeSeries.length,
            duration: timeSeries.length > 0 ? timeSeries[timeSeries.length - 1].timestamp : 0,
            peakMeshRate: Math.max(...timeSeries.map(p => p.meshRate), 0),
            avgMeshRate: timeSeries.reduce((a, p) => a + p.meshRate, 0) / timeSeries.length || 0,
            peakTriRate: Math.max(...timeSeries.map(p => p.triRate), 0),
            peakMemory: Math.max(...timeSeries.map(p => p.memory), 0),
            gcEvents: timeSeries.filter((p, i) => i > 0 && timeSeries[i - 1].memory - p.memory > 50).length,
        }
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timeseries-${currentSchematic}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    log(`📊 Exported ${timeSeries.length} data points`, "success");
};

// Make time series available in console for debugging
(window as any).getTimeSeries = () => timeSeries;
(window as any).analyzeTimeSeries = analyzeTimeSeries;

function getPerformanceRating(result: PerformanceResult) {
    const blocksPerSecond = result.blockCount / (result.totalTimeMs / 1000);

    if (blocksPerSecond > 100000) {
        return { emoji: "🚀", label: "Excellent", description: ">100K blocks/sec", bgClass: "bg-emerald-900/30 text-emerald-300" };
    } else if (blocksPerSecond > 50000) {
        return { emoji: "⚡", label: "Good", description: ">50K blocks/sec", bgClass: "bg-blue-900/30 text-blue-300" };
    } else if (blocksPerSecond > 20000) {
        return { emoji: "👍", label: "Acceptable", description: ">20K blocks/sec", bgClass: "bg-yellow-900/30 text-yellow-300" };
    } else if (blocksPerSecond > 10000) {
        return { emoji: "⚠️", label: "Slow", description: ">10K blocks/sec", bgClass: "bg-orange-900/30 text-orange-300" };
    } else {
        return { emoji: "🐢", label: "Very Slow", description: "<10K blocks/sec", bgClass: "bg-red-900/30 text-red-300" };
    }
}

function setupDragAndDrop() {
    elements.dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        elements.dropZone.classList.add("border-emerald-500", "text-emerald-400");
    });

    elements.dropZone.addEventListener("dragleave", () => {
        elements.dropZone.classList.remove("border-emerald-500", "text-emerald-400");
    });

    elements.dropZone.addEventListener("drop", async (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove("border-emerald-500", "text-emerald-400");

        const file = e.dataTransfer?.files[0];
        if (!file) return;

        await loadSchematicFile(file);
    });

    elements.dropZone.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".schem,.litematic,.nbt,.schematic";
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) await loadSchematicFile(file);
        };
        input.click();
    });
}

async function loadSchematicFile(file: File) {
    if (!renderer) return;

    const name = file.name.replace(/\.[^.]+$/, "");
    currentSchematic = name;
    isLoading = true;
    loadStartTime = performance.now();
    peakMemory = getMemoryUsage();
    timeSeries = [];

    log(`📦 Loading file: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`, "info");
    showProgress(`Loading ${file.name}...`, 0);

    const startTime = performance.now();
    const startMemory = getMemoryUsage();

    try {
        // Clear existing
        if (renderer.schematicManager) {
            for (const [id] of renderer.schematicManager.schematics) {
                renderer.schematicManager.removeSchematic(id);
            }
        }

        showProgress("Reading file...", 10);
        const buffer = await file.arrayBuffer();

        // Progress monitoring
        const progressInterval = setInterval(() => {
            const currentMemory = getMemoryUsage();
            peakMemory = Math.max(peakMemory, currentMemory);
            const elapsed = performance.now() - startTime;
            showProgress(`Building meshes... (${formatMs(elapsed)})`, Math.min(90, 20 + elapsed / 100));
        }, 100);

        showProgress("Parsing schematic...", 20);

        await renderer.schematicManager?.loadSchematics({
            [name]: () => Promise.resolve(buffer),
        });

        clearInterval(progressInterval);

        const endTime = performance.now();
        const endMemory = getMemoryUsage();

        const schematic = renderer.schematicManager?.getSchematic(name);
        const breakdown = extractBreakdown(schematic);
        const info = (renderer.renderManager?.getRenderer() as any)?.info;

        // Get accurate geometry stats
        const meshCount = schematic?.group?.children?.length ?? 0;
        const geoStats = countGeometryTriangles(schematic?.group);

        const result: PerformanceResult = {
            schematicName: name,
            blockCount: schematic?.schematicWrapper?.get_block_count() ?? 0,
            meshCount,
            chunkCount: 0,
            totalTimeMs: endTime - startTime,
            parseTimeMs: 0,
            meshBuildTimeMs: endTime - startTime,
            paletteTimeMs: 0,
            breakdown,
            memoryDeltaMB: endMemory - startMemory,
            peakMemoryMB: peakMemory,
            triangleCount: geoStats.triangles,
            vertexCount: geoStats.vertices,
            drawCalls: info?.render?.calls ?? meshCount,
            options: getOptions(),
        };

        results.push(result);
        displayResults(result);

        // Console summary
        log(`═══════════════════════════════════`, "perf");
        log(`📊 PERFORMANCE SUMMARY: ${name}`, "success");
        log(`═══════════════════════════════════`, "perf");
        log(`⏱️ Total Time: ${formatMs(result.totalTimeMs)}`, "perf");
        log(`🧱 Blocks: ${formatNumber(result.blockCount)}`, "perf");
        log(`🔺 Triangles: ${formatNumber(result.triangleCount)}`, "perf");
        log(`💾 Memory: +${result.memoryDeltaMB.toFixed(1)} MB`, "perf");
        const fileThroughput = Math.round(result.blockCount / (result.totalTimeMs / 1000));
        log(`⚡ Throughput: ${formatNumber(fileThroughput)} blocks/sec`, fileThroughput > 50000 ? "success" : fileThroughput > 20000 ? "warn" : "error");

        renderer.cameraManager?.focusOnSchematics();
        hideProgress();
        isLoading = false;

    } catch (error) {
        log(`❌ Failed to load file: ${error}`, "error");
        hideProgress();
        isLoading = false;
        showError(`Failed to load: ${error}`);
    }
}

function showProgress(text: string, percent: number) {
    elements.progressOverlay.classList.remove("hidden");
    elements.progressBar.style.width = `${percent}%`;
    elements.progressText.textContent = text;
}

function hideProgress() {
    elements.progressOverlay.classList.add("hidden");
    // Force reflow to ensure DOM updates immediately
    elements.progressOverlay.offsetHeight;
}

function showError(message: string) {
    elements.resultsContainer.innerHTML = `
        <div class="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
            <div class="font-semibold">Error</div>
            <div class="text-sm mt-1">${message}</div>
        </div>
    `;
}

function updateStats() {
    // FPS calculation
    frameCount++;
    const now = performance.now();
    if (now - lastFrameTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFrameTime = now;
    }

    elements.statFps.textContent = `${fps}`;
    elements.statFps.className = `stat-value ${fps >= 55 ? 'text-emerald-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400'}`;

    // Renderer stats
    if (renderer?.renderManager) {
        const info = (renderer.renderManager.getRenderer() as any)?.info;
        if (info?.render) {
            elements.statDrawcalls.textContent = formatNumber(info.render.calls);
            elements.statTriangles.textContent = formatNumber(info.render.triangles);
        }
    }

    // Memory
    elements.statMemory.textContent = `${getMemoryUsage().toFixed(0)} MB`;

    animationFrameId = requestAnimationFrame(updateStats);
}

function getMemoryUsage(): number {
    // @ts-ignore - performance.memory is Chrome-only
    if (performance.memory) {
        // @ts-ignore
        return performance.memory.usedJSHeapSize / (1024 * 1024);
    }
    return 0;
}

function formatMs(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function formatNumber(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
}

// Expose for debugging
(window as any).renderer = () => renderer;
(window as any).results = results;

// Start
init();
