import { SchematicRenderer } from "../../../src/SchematicRenderer";
import { SimulationLogger } from "../../../src/utils/SimulationLogger";

// Base64 encoded schematic with redstone (XOR gate from main.ts)
const xor =
	"H4sIAAAAAAAA/21RX0vDMBC/NW3XdezZV1Ef++CLL0IRREHEOVFQocgI7bUNdslITqd+epO2dBssELjc/f7cXWIAD4I3UVANjMH4FbURSoJNTyC6lSRIoAF3puC/iD+0Edu5vgfhA8rK8n0G0xtOfNAIrqYQLsrSIPXo4VjWHYqqJucaP/EGiXDOf2wpHMPkulH5p9Oy77ORN2IOxnzw7TsYBSELByUWOOEYojkSLywlAv+RrxCi98XzccUJYQKzVnBvnBjGvS2Do5WQmGte0mWl+e8yVzLXSO2sDC621Qa/UWdrtUGNRVryxmBS8hzTDW8aFwlZpUZ9Uf3hdsPgZMu1DENK4rLhq3XWCOr4DugxmG2BXOh2sF3jgeyMlqR0Xme9nVSa6mRPz+7r/hBXaMxaeGpEgUk7R3qetA13KeSGumiDfeQE7Y5PDwh2fexZ24/5BzyRvq9UAgAA";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binaryString = atob(base64);
	const len = binaryString.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}

const canvas = document.getElementById("canvas") as HTMLCanvasElement;

// UI Elements
const initBtn = document.getElementById("initBtn") as HTMLButtonElement;
const tickBtn = document.getElementById("tickBtn") as HTMLButtonElement;
const tick10Btn = document.getElementById("tick10Btn") as HTMLButtonElement;
const autoTickBtn = document.getElementById("autoTickBtn") as HTMLButtonElement;
const syncBtn = document.getElementById("syncBtn") as HTMLButtonElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const tickSpeed = document.getElementById("tickSpeed") as HTMLInputElement;
const tickSpeedValue = document.getElementById("tickSpeedValue") as HTMLSpanElement;
const simStatus = document.getElementById("simStatus") as HTMLSpanElement;
const simStatusText = document.getElementById("simStatusText") as HTMLSpanElement;
const tickCount = document.getElementById("tickCount") as HTMLSpanElement;
const autoTickStatus = document.getElementById("autoTickStatus") as HTMLSpanElement;

let currentTicks = 0;
let autoTickActive = false;
let autoSyncEnabled = false;

// Get additional UI elements
const autoSyncCheckbox = document.getElementById("autoSyncCheckbox") as HTMLInputElement;
const ioOnlyCheckbox = document.getElementById("ioOnlyCheckbox") as HTMLInputElement;

// Create renderer with simulation enabled and drag & drop
const renderer = new SchematicRenderer(
	canvas,
	{
		xor: () => Promise.resolve(base64ToArrayBuffer(xor)),
	},
	{
		vanillaPack: async () => {
			const response = await fetch("/pack.zip");
			const buffer = await response.arrayBuffer();
			return new Blob([buffer], { type: "application/zip" });
		},
	},
	{
		enableAdaptiveFPS: false,
		cameraOptions: {
			enableZoomInOnLoad: true,
		},
		gamma: 0.45,
		enableInteraction: true,
		enableGizmos: true, // Enable gizmos for region editing
		interactionOptions: {
			enableSelection: false,
		},
		singleSchematicMode: true,
		hdri: "/minecraft_day.hdr",
		enableDragAndDrop: true,
		// Enable simulation
		simulationOptions: {
			enableSimulation: true,
			autoInitialize: false,
			autoSync: false,
			autoTickSpeed: 10,
		},
		callbacks: {
			onRendererInitialized: async (r) => {
				SimulationLogger.info("Renderer initialized - starting auto-init");
				// Auto-initialize simulation after a short delay
				setTimeout(async () => {
					const success = await r.initializeSimulation();
					if (success) {
						initBtn.textContent = "Initialized ✓";
						initBtn.disabled = true;
					}
				}, 1000);
			},
			onSimulationInitialized: (schematicName: string) => {
				updateSimulationStatus(true);
				enableControls(true);

				// Tick 10 times initially to let MCHPRS correct any invalid initial states
				renderer.tickSimulation(10);
				renderer.syncSimulation();
			},
			onSimulationTicked: (ticks: number) => {
				currentTicks = ticks;
				tickCount.textContent = ticks.toString();
				// Auto-sync if enabled
				if (autoSyncEnabled) {
					renderer.syncSimulation();
				}
			},
			onSimulationSynced: () => {
				// Silent sync
			},
			onSchematicLoaded: async (schematicName: string) => {
				console.log(`New schematic loaded: ${schematicName}`);
				// Auto-initialize simulation for new schematic
				if (renderer.simulationManager) {
					const success = await renderer.initializeSimulation();
					if (success) {
						initBtn.textContent = "Initialized ✓";
						initBtn.disabled = true;
					}
				}
			},
			onSimulationError: (error: Error) => {
				console.error("Simulation error:", error);
				alert(`Simulation error: ${error.message}`);
			},
			onBlockInteracted: (x: number, y: number, z: number) => {
				// Logged by SimulationLogger in SimulationManager
			},
		},
	}
);

// Update UI based on simulation state
function updateSimulationStatus(active: boolean) {
	if (active) {
		simStatus.classList.remove("status-inactive");
		simStatus.classList.add("status-active");
		simStatusText.textContent = "Active";
	} else {
		simStatus.classList.remove("status-active");
		simStatus.classList.add("status-inactive");
		simStatusText.textContent = "Inactive";
	}
}

// Enable/disable control buttons
function enableControls(enabled: boolean) {
	tickBtn.disabled = !enabled;
	tick10Btn.disabled = !enabled;
	autoTickBtn.disabled = !enabled;
	syncBtn.disabled = !enabled;
	resetBtn.disabled = !enabled;
}

// Initialize simulation button
initBtn.addEventListener("click", async () => {
	initBtn.disabled = true;
	initBtn.textContent = "Initializing...";

	const success = await renderer.initializeSimulation();

	if (success) {
		console.log("Simulation initialized successfully");
		initBtn.textContent = "Initialized ✓";
	} else {
		console.error("Failed to initialize simulation");
		initBtn.textContent = "Failed to Initialize";
		initBtn.disabled = false;
	}
});

// Tick once button
tickBtn.addEventListener("click", () => {
	renderer.tickSimulation(1);
});

// Tick 10x button
tick10Btn.addEventListener("click", () => {
	renderer.tickSimulation(10);
});

// Auto-tick toggle button
autoTickBtn.addEventListener("click", () => {
	autoTickActive = !autoTickActive;

	if (autoTickActive) {
		renderer.startAutoTick();
		autoTickStatus.textContent = "On";
		autoTickBtn.classList.remove("btn-accent");
		autoTickBtn.classList.add("btn-error");
	} else {
		renderer.stopAutoTick();
		autoTickStatus.textContent = "Off";
		autoTickBtn.classList.remove("btn-error");
		autoTickBtn.classList.add("btn-accent");
	}
});

// Sync button
syncBtn.addEventListener("click", () => {
	renderer.syncSimulation();
	console.log("Manual sync triggered");
});

// Reset button
resetBtn.addEventListener("click", async () => {
	resetBtn.disabled = true;
	resetBtn.textContent = "Resetting...";

	// Stop auto-tick if active
	if (autoTickActive) {
		autoTickActive = false;
		renderer.stopAutoTick();
		autoTickStatus.textContent = "Off";
		autoTickBtn.classList.remove("btn-error");
		autoTickBtn.classList.add("btn-accent");
	}

	const success = await renderer.resetSimulation();

	if (success) {
		currentTicks = 0;
		tickCount.textContent = "0";
		resetBtn.textContent = "Reset Simulation";
		resetBtn.disabled = false;
	} else {
		resetBtn.textContent = "Failed to Reset";
		setTimeout(() => {
			resetBtn.textContent = "Reset Simulation";
			resetBtn.disabled = false;
		}, 2000);
	}
});

// Tick speed slider
tickSpeed.addEventListener("input", (e) => {
	const value = parseInt((e.target as HTMLInputElement).value);
	tickSpeedValue.textContent = value.toString();
	if (renderer.simulationManager) {
		renderer.simulationManager.setTickSpeed(value);
	}
});

// Auto-sync checkbox
autoSyncCheckbox.addEventListener("change", (e) => {
	autoSyncEnabled = (e.target as HTMLInputElement).checked;
	console.log(`Auto-sync: ${autoSyncEnabled ? "enabled" : "disabled"}`);
});

// IO Only checkbox
ioOnlyCheckbox.addEventListener("change", async (e) => {
	const ioOnly = (e.target as HTMLInputElement).checked;
	console.log(`IO Only mode: ${ioOnly ? "enabled" : "disabled"}`);
	alert(`IO Only setting will apply on next simulation initialization.\nCurrent: ${ioOnly ? "ON (faster, no wire states)" : "OFF (slower, shows wire power)"}`);
	// Note: io_only requires re-initialization to take effect
});

// Expose renderer globally for debugging
(window as any).renderer = renderer;

console.log("Simulation demo loaded. Drag & drop a schematic or initialize the default one.");
