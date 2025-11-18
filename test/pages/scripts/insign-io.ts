import { SchematicRenderer } from "../../../src/SchematicRenderer";
import { InsignIoManager, InsignIoRegion } from "../../../src/managers/InsignIoManager";

// Helper function to create a test schematic with Insign IO annotations
function createInsignIoTestSchematic(renderer: SchematicRenderer, name: string): void {
	const schematic = renderer.schematicManager?.createEmptySchematic(name);
	if (!schematic) return;

	// Create a simple 4-bit adder circuit with IO annotations
	// Input A (4 bits) - redstone wires at Y=0
	for (let i = 0; i < 4; i++) {
		schematic.setBlockNoRebuild([i, 0, 0], "minecraft:redstone_wire[power=0]");
	}

	// Input B (4 bits) - redstone wires at Y=0
	for (let i = 0; i < 4; i++) {
		schematic.setBlockNoRebuild([i, 0, 2], "minecraft:redstone_wire[power=0]");
	}

	// Output (4 bits) - redstone lamps at Y=0
	for (let i = 0; i < 4; i++) {
		schematic.setBlockNoRebuild([i, 0, 4], "minecraft:redstone_lamp[lit=false]");
	}

	// Carry input (1 bit) - redstone wire
	schematic.setBlockNoRebuild([5, 0, 1], "minecraft:redstone_wire[power=0]");

	// Carry output (1 bit) - redstone lamp
	schematic.setBlockNoRebuild([5, 0, 3], "minecraft:redstone_lamp[lit=false]");

	// Add signs with Insign IO annotations
	// Sign 1: Define input A (4-bit unsigned)
	schematic.setBlockWithNbt([0, 1, 0], "minecraft:oak_sign[rotation=0]", {
		Text1: '{"text":"@io.a=rc([0,-1,0],[3,-1,0])"}',
		Text2: '{"text":"#io.a:type=\\"input\\""}',
		Text3: '{"text":"#io.a:data_type=\\"unsigned\\""}',
		Text4: '{"text":""}',
	});

	// Sign 2: Define input B (4-bit unsigned)
	schematic.setBlockWithNbt([0, 1, 2], "minecraft:oak_sign[rotation=0]", {
		Text1: '{"text":"@io.b=rc([0,-1,0],[3,-1,0])"}',
		Text2: '{"text":"#io.b:type=\\"input\\""}',
		Text3: '{"text":"#io.b:data_type=\\"unsigned\\""}',
		Text4: '{"text":""}',
	});

	// Sign 3: Define output (4-bit unsigned)
	schematic.setBlockWithNbt([0, 1, 4], "minecraft:oak_sign[rotation=0]", {
		Text1: '{"text":"@io.result=rc([0,-1,0],[3,-1,0])"}',
		Text2: '{"text":"#io.result:type=\\"output\\""}',
		Text3: '{"text":"#io.result:data_type=\\"unsigned\\""}',
		Text4: '{"text":""}',
	});

	// Sign 4: Define carry input (1-bit boolean)
	schematic.setBlockWithNbt([5, 1, 1], "minecraft:oak_sign[rotation=0]", {
		Text1: '{"text":"@io.carry_in=rc([0,-1,0],[0,-1,0])"}',
		Text2: '{"text":"#io.carry_in:type=\\"input\\""}',
		Text3: '{"text":"#io.carry_in:data_type=\\"bool\\""}',
		Text4: '{"text":""}',
	});

	// Sign 5: Define carry output (1-bit boolean)
	schematic.setBlockWithNbt([5, 1, 3], "minecraft:oak_sign[rotation=0]", {
		Text1: '{"text":"@io.carry_out=rc([0,-1,0],[0,-1,0])"}',
		Text2: '{"text":"#io.carry_out:type=\\"output\\""}',
		Text3: '{"text":"#io.carry_out:data_type=\\"bool\\""}',
		Text4: '{"text":""}',
	});

	// Rebuild mesh after all blocks are set
	schematic.rebuildMesh();

	console.log("[InsignIO] Created test schematic with Insign IO annotations");
}

// Get DOM elements
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const loadFileBtn = document.getElementById("load-file-btn") as HTMLButtonElement;
const loadTestBtn = document.getElementById("load-test-btn") as HTMLButtonElement;
const showAllInputsCheckbox = document.getElementById("show-all-inputs") as HTMLInputElement;
const showAllOutputsCheckbox = document.getElementById("show-all-outputs") as HTMLInputElement;
const showBitNumbersCheckbox = document.getElementById("show-bit-numbers") as HTMLInputElement;
const showDataTypesCheckbox = document.getElementById("show-data-types") as HTMLInputElement;
const overlayMessage = document.getElementById("overlay-message") as HTMLDivElement;

const statInputs = document.getElementById("stat-inputs") as HTMLDivElement;
const statOutputs = document.getElementById("stat-outputs") as HTMLDivElement;
const statInputBits = document.getElementById("stat-input-bits") as HTMLDivElement;
const statOutputBits = document.getElementById("stat-output-bits") as HTMLDivElement;
const ioRegionsList = document.getElementById("io-regions-list") as HTMLDivElement;

// Create renderer
const renderer = new SchematicRenderer(
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
		cameraOptions: {
			enableZoomInOnLoad: true,
		},
		gamma: 0.45,
		enableInteraction: true,
		interactionOptions: {
			enableSelection: false,
		},
		singleSchematicMode: true,
		hdri: "/minecraft_day.hdr",
		enableDragAndDrop: true,
		callbacks: {
			onRendererInitialized: (r) => {
				console.log("[InsignIO] Renderer initialized");

				// Expose renderer for debugging
				(window as any).renderer = r;
				(window as any).insignIoManager = r.insignIoManager;

				// Hide empty state overlay
				r.uiManager?.hideEmptyState();

				// Create test schematic with Insign IO annotations
				createInsignIoTestSchematic(r, "insign_io_test");
				r.cameraManager.focusOnSchematics();

				// Load and visualize IO after a short delay
				setTimeout(() => {
					loadAndVisualizeIO();
				}, 300);
			},
		},
	}
);

// Load and visualize IO regions
async function loadAndVisualizeIO() {
	try {
		// Load Insign data first
		await renderer.insignManager!.loadFromSchematic();

		// Parse IO regions
		const dslMap = renderer.insignManager!.getData();
		if (dslMap) {
			await renderer.insignIoManager!.parseFromInsign(dslMap);

			// Show all IO regions by default
			renderer.insignIoManager!.showAllRegions();

			// Update UI
			updateUI();

			// Hide overlay
			overlayMessage.classList.add("hidden");

			console.log("[InsignIO] IO regions loaded and visualized");
		} else {
			console.warn("[InsignIO] No Insign data found");
			overlayMessage.innerHTML = "<h2>No IO Data</h2><p>No Insign IO annotations found in schematic</p>";
		}
	} catch (e) {
		console.error("[InsignIO] Failed to load IO regions:", e);
		overlayMessage.innerHTML = `<h2>Error</h2><p>${e}</p>`;
	}
}

// Update UI with IO region information
function updateUI() {
	const stats = renderer.insignIoManager!.getStatistics();

	// Update stats
	statInputs.textContent = stats.inputs.toString();
	statOutputs.textContent = stats.outputs.toString();
	statInputBits.textContent = stats.totalInputBits.toString();
	statOutputBits.textContent = stats.totalOutputBits.toString();

	// Update IO regions list
	ioRegionsList.innerHTML = "";

	const inputs = renderer.insignIoManager!.getAllInputs();
	const outputs = renderer.insignIoManager!.getAllOutputs();

	// Add inputs
	if (inputs.length > 0) {
		const inputsHeader = document.createElement("div");
		inputsHeader.style.cssText = "font-size: 12px; color: #4499ff; font-weight: 600; margin: 8px 0 4px 0;";
		inputsHeader.textContent = "INPUTS";
		ioRegionsList.appendChild(inputsHeader);

		inputs.forEach((region) => {
			ioRegionsList.appendChild(createRegionItem(region, "input"));
		});
	}

	// Add outputs
	if (outputs.length > 0) {
		const outputsHeader = document.createElement("div");
		outputsHeader.style.cssText = "font-size: 12px; color: #ff4466; font-weight: 600; margin: 16px 0 4px 0;";
		outputsHeader.textContent = "OUTPUTS";
		ioRegionsList.appendChild(outputsHeader);

		outputs.forEach((region) => {
			ioRegionsList.appendChild(createRegionItem(region, "output"));
		});
	}
}

// Create a region list item
function createRegionItem(region: InsignIoRegion, type: "input" | "output"): HTMLElement {
	const item = document.createElement("div");
	item.className = `io-region-item ${type}`;

	const isVisible = renderer.insignIoManager!.isRegionVisible(region.regionId);
	if (isVisible) {
		item.classList.add("visible");
	}

	// Extract region name (remove 'io.' prefix)
	const displayName = region.regionId.replace(/^io\./, "");

	item.innerHTML = `
        <div class="io-region-name">${displayName}</div>
        <div class="io-region-meta">
            <span>📊 ${region.dataType}</span>
            <span>🔢 ${region.positions.length} bits</span>
            <span>${type === "input" ? "⬇️" : "⬆️"} ${type}</span>
        </div>
    `;

	// Toggle visibility on click
	item.addEventListener("click", () => {
		renderer.insignIoManager!.toggleRegion(region.regionId);
		updateUI();
	});

	return item;
}

// Load schematic from File
async function loadSchematic(file: File) {
	try {
		const arrayBuffer = await file.arrayBuffer();
		const uint8Array = new Uint8Array(arrayBuffer);
		await renderer.loadSchematic(uint8Array);

		// Wait for schematic to load, then visualize IO
		setTimeout(() => {
			loadAndVisualizeIO();
		}, 500);
	} catch (error) {
		console.error("[InsignIO] Failed to load schematic:", error);
		alert("Failed to load schematic: " + error);
	}
}

// Load test schematic
function loadTestSchematic() {
	console.log("[InsignIO] Creating test schematic...");

	// Remove existing schematic if any
	const existingSchematic = renderer.schematicManager?.getSchematic();
	if (existingSchematic) {
		renderer.schematicManager?.removeSchematic(existingSchematic.name);
	}

	// Clear existing IO regions
	renderer.insignIoManager!.clear();

	// Create new test schematic
	createInsignIoTestSchematic(renderer, "insign_io_test");
	renderer.cameraManager.focusOnSchematics();

	// Load and visualize IO
	setTimeout(() => {
		loadAndVisualizeIO();
	}, 300);
}

// Event listeners
loadFileBtn.addEventListener("click", () => {
	fileInput.click();
});

fileInput.addEventListener("change", (e) => {
	const file = (e.target as HTMLInputElement).files?.[0];
	if (file) {
		loadSchematic(file);
	}
});

loadTestBtn.addEventListener("click", () => {
	loadTestSchematic();
});

showAllInputsCheckbox.addEventListener("change", () => {
	if (showAllInputsCheckbox.checked) {
		renderer.insignIoManager!.showAllInputs();
	} else {
		renderer.insignIoManager!.hideFilteredRegions({ direction: "input" });
	}
	updateUI();
});

showAllOutputsCheckbox.addEventListener("change", () => {
	if (showAllOutputsCheckbox.checked) {
		renderer.insignIoManager!.showAllOutputs();
	} else {
		renderer.insignIoManager!.hideFilteredRegions({ direction: "output" });
	}
	updateUI();
});

showBitNumbersCheckbox.addEventListener("change", () => {
	const showBitNumbers = showBitNumbersCheckbox.checked;
	const visibleRegions = renderer.insignIoManager!.getVisibleRegionIds();

	visibleRegions.forEach((regionId) => {
		renderer.insignIoManager!.updateRegionStyle(regionId, {
			showBitNumbers,
		});
	});
});

showDataTypesCheckbox.addEventListener("change", () => {
	const showDataType = showDataTypesCheckbox.checked;
	const visibleRegions = renderer.insignIoManager!.getVisibleRegionIds();

	visibleRegions.forEach((regionId) => {
		renderer.insignIoManager!.updateRegionStyle(regionId, {
			showDataType,
		});
	});
});

console.log("[InsignIO] Demo page initialized");

