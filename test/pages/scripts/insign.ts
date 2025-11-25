import { SchematicRenderer } from "../../../src/SchematicRenderer";
import { InsignManager } from "../../../src/managers/InsignManager";
import * as THREE from "three";

// Type definitions for Insign
type BoxPair = [[number, number, number], [number, number, number]];

interface DslEntry {
  bounding_boxes?: BoxPair[];
  metadata: Record<string, any>;
}

type DslMap = Record<string, DslEntry>;

// Circuit definitions
const CIRCUITS = {
  not_gate: {
    name: "NOT Gate (Buffer)",
    template: `# Base layer
c
c
c

# Logic layer
│
▲
│
`,
    signs: [
      { pos: [0, 2, 2], id: "io.in", type: "input", dataType: "bool" },
      { pos: [0, 2, 0], id: "io.out", type: "output", dataType: "bool" },
    ],
    description: "1x boolean input (in), 1x boolean output (out)"
  },
  xor: {
    name: "XOR Gate",
    template: `# Base layer
cccc
cccc
cccc
cccc

# Logic layer
·│█·
┌▲▲┐
├┴┴┤
│··│
`,
    signs: [
      { pos: [1, 2, 3], id: "io.a", type: "input", dataType: "bool" },
      { pos: [2, 2, 3], id: "io.b", type: "input", dataType: "bool" },
      { pos: [1, 2, 0], id: "io.out", type: "output", dataType: "bool" },
    ],
    description: "2x boolean inputs (a, b), 1x boolean output (out)"
  },
  full_adder: {
    name: "Full Adder",
    template: `# Base layer
·····c····
·····c····
··ccccc···
·ccccccc··
cc··cccccc
·c··c·····
·ccccc····
·cccccc···
···cccc···
···c··c···

# Logic layer
·····│····
·····↑····
··│█←┤█···
·█◀←┬▲▲┐··
──··├┴┴┴←─
·█··↑·····
·▲─←┤█····
·█←┬▲▲┐···
···├┴┴┤···
···│··│···
`,
    signs: [
      { pos: [3, 2, 9], id: "io.a", type: "input", dataType: "bool" },
      { pos: [6, 2, 9], id: "io.b", type: "input", dataType: "bool" },
      { pos: [9, 2, 4], id: "io.carry_in", type: "input", dataType: "bool" },
      { pos: [5, 2, 0], id: "io.sum", type: "output", dataType: "bool" },
      { pos: [0, 2, 4], id: "io.carry_out", type: "output", dataType: "bool" },
    ],
    description: "3x boolean inputs (a, b, carry_in), 2x boolean outputs (sum, carry_out)"
  }
};

type CircuitType = keyof typeof CIRCUITS;
let currentCircuit: CircuitType = "not_gate";

// Helper function to create a test schematic with Insign IO annotations using SchematicBuilder
async function createInsignTestSchematic(renderer: SchematicRenderer, name: string, circuitType: CircuitType = "not_gate"): Promise<void> {
  try {
    const circuit = CIRCUITS[circuitType];
    console.log(`[Insign] Building ${circuit.name} circuit with SchematicBuilder...`);

    const { SchematicBuilderWrapper } = await import("../../../src/nucleationExports");

    // Build the schematic from template
    const builder = SchematicBuilderWrapper.fromTemplate(circuit.template);
    const builtSchematic = builder.build();

    // Load the schematic directly into the manager
    await renderer.schematicManager?.loadSchematic(name, builtSchematic);

    // Get the loaded schematic to add Insign IO annotations
    const schematic = renderer.schematicManager?.getSchematic(name);
    if (!schematic) {
      console.error('[Insign] Failed to get loaded schematic');
      return;
    }

    console.log(`[Insign] Adding Insign IO annotations to ${circuit.name}...`);

    // Add all signs
    for (const sign of circuit.signs) {
      schematic.setBlockWithNbt(sign.pos as [number, number, number], "minecraft:oak_sign[rotation=0]", {
        Text1: `{"text":"@${sign.id}=rc([0,-1,0],[0,-1,0])"}`,
        Text2: `{"text":"#${sign.id}:type=\\"${sign.type}\\""}`,
        Text3: `{"text":"#${sign.id}:data_type=\\"${sign.dataType}\\""}`,
        Text4: '{"text":""}',
      });
    }

    // Rebuild mesh after all blocks are set
    schematic.rebuildMesh();

    console.log(`[Insign] ✓ Created ${circuit.name} circuit with Insign IO annotations`);
    console.log(`[Insign] - ${circuit.description}`);

    currentCircuit = circuitType;
  } catch (error) {
    console.error('[Insign] Failed to create test schematic:', error);
  }
}

// Get DOM elements
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const showRegionsCheckbox = document.getElementById("show-regions") as HTMLInputElement;
const showLabelsCheckbox = document.getElementById("show-labels") as HTMLInputElement;
const overlayMessage = document.getElementById("overlay-message") as HTMLDivElement;
const loadTestBtn = document.getElementById("load-test-btn") as HTMLButtonElement;
const loadPresetBtn = document.getElementById("load-preset-btn") as HTMLButtonElement;
const circuitSelector = document.getElementById("circuit-selector") as HTMLSelectElement;

const summarySection = document.getElementById("summary-section") as HTMLDivElement;
const regionsSection = document.getElementById("regions-section") as HTMLDivElement;
const detailsSection = document.getElementById("details-section") as HTMLDivElement;

const statTotal = document.getElementById("stat-total") as HTMLDivElement;
const statGeometry = document.getElementById("stat-geometry") as HTMLDivElement;
const statIo = document.getElementById("stat-io") as HTMLDivElement;
const statSelected = document.getElementById("stat-selected") as HTMLDivElement;

const regionCount = document.getElementById("region-count") as HTMLSpanElement;
const regionList = document.getElementById("region-list") as HTMLDivElement;

const detailId = document.getElementById("detail-id") as HTMLSpanElement;
const detailMetadata = document.getElementById("detail-metadata") as HTMLPreElement;
const detailBoxes = document.getElementById("detail-boxes") as HTMLPreElement;

// Simulation elements
const simulationSection = document.getElementById("simulation-section") as HTMLDivElement;
const inputControls = document.getElementById("input-controls") as HTMLDivElement;
const outputDisplays = document.getElementById("output-displays") as HTMLDivElement;
const runSimulationBtn = document.getElementById("run-simulation-btn") as HTMLButtonElement;
const liveSyncModeCheckbox = document.getElementById("live-sync-mode") as HTMLInputElement;

// Circuit builder elements
const templateInput = document.getElementById("template-input") as HTMLTextAreaElement;
const buildFromTemplateBtn = document.getElementById("build-from-template-btn") as HTMLButtonElement;
const ioRegionsList = document.getElementById("io-regions-list") as HTMLDivElement;
const addIoBtn = document.getElementById("add-io-btn") as HTMLButtonElement;

// State
let insignData: DslMap | null = null;
let selectedRegion: string | null = null;
let inputValues: Record<string, number> = {}; // Store current input values

// IO Region management
interface IoRegionDef {
  id: string;
  pos: [number, number, number];
  type: "input" | "output";
  dataType: "bool" | "u8" | "u16" | "u32" | "i8" | "i16" | "i32";
}

let ioRegions: IoRegionDef[] = [];

// Create renderer
const renderer = new SchematicRenderer(canvas, {}, {
  vanillaPack: async () => {
    const response = await fetch("/pack.zip");
    const buffer = await response.arrayBuffer();
    return new Blob([buffer], { type: "application/zip" });
  },
}, {
  logFPS: false,
  enableAdaptiveFPS: false,
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
    onRendererInitialized: async (r) => {
      console.log('[Insign] Renderer initialized - creating test schematic');

      console.log('Adding renderer to window for debugging');
      (window as any).renderer = r;

      // Hide empty state overlay
      r.uiManager?.hideEmptyState();

      // Create test schematic with Insign annotations
      await createInsignTestSchematic(r, "insign_test");
      r.cameraManager.focusOnSchematics();

      // Compile Insign after mesh is built
      setTimeout(() => {
        tryCompileInsign();
      }, 200);
    },
  },
});

// Try to compile Insign from current schematic using InsignManager
async function tryCompileInsign(schematicName?: string) {
  try {
    insignData = await renderer.insignManager!.loadFromSchematic(schematicName);

    if (insignData) {
      console.log('[Insign] Compiled data:', insignData);
      updateUI();

      // Also try to load IO regions if available
      if (renderer.insignIoManager) {
        try {
          console.log('[Insign] Attempting to parse IO regions from:', insignData);
          await renderer.insignIoManager.parseFromInsign(insignData);
          const stats = renderer.insignIoManager.getStatistics();
          console.log('[Insign] IO regions parsed:', stats);
          console.log('[Insign] All inputs:', renderer.insignIoManager.getAllInputs());
          console.log('[Insign] All outputs:', renderer.insignIoManager.getAllOutputs());

          // Show IO regions if the checkbox is checked
          if (stats.totalRegions > 0 && showRegionsCheckbox.checked) {
            renderer.insignIoManager.showAllRegions();
            console.log(`[Insign] Showing ${stats.inputs} inputs and ${stats.outputs} outputs`);
          }

          // Build simulation UI
          buildSimulationUI();
        } catch (ioError) {
          console.error('[Insign] Failed to parse IO regions:', ioError);
        }
      } else {
        console.warn('[Insign] No InsignIoManager available');
      }

      // DON'T show regular regions by default - let user toggle them
      // renderer.insignManager!.showAllRegions();

      // Hide overlay
      if (overlayMessage) {
        overlayMessage.style.display = 'none';
      }
    } else {
      console.warn('[Insign] No Insign data found (signs may be empty or invalid)');
      updateUI();
    }
  } catch (e) {
    console.warn('[Insign] Insign compilation failed:', e);
    insignData = null;
    updateUI();
  }
}

// Load schematic from ArrayBuffer
async function loadSchematicFromBuffer(arrayBuffer: ArrayBuffer) {
  try {
    const uint8Array = new Uint8Array(arrayBuffer);
    await renderer.loadSchematic(uint8Array);

    // Wait a bit for schematic to be loaded
    setTimeout(() => {
      tryCompileInsign();
    }, 500);
  } catch (error) {
    console.error('[Insign] Failed to load schematic:', error);
    alert('Failed to load schematic: ' + error);
  }
}

// Load schematic from File
async function loadSchematic(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  await loadSchematicFromBuffer(arrayBuffer);
}

// Load test schematic
async function loadTestSchematic() {
  const selectedCircuit = circuitSelector.value as CircuitType;
  console.log(`[Insign] Creating ${CIRCUITS[selectedCircuit].name} schematic with Insign annotations...`);

  // Clear old IO highlights
  if (renderer.insignIoManager) {
    renderer.insignIoManager.clear();
  }

  // Remove existing schematic if any
  const existingSchematic = renderer.schematicManager?.getSchematic();
  if (existingSchematic) {
    renderer.schematicManager?.removeSchematic(existingSchematic.name);
  }

  // Clear old Insign data
  insignData = null;

  // Create new test schematic with selected circuit
  await createInsignTestSchematic(renderer, "insign_test", selectedCircuit);
  renderer.cameraManager.focusOnSchematics();

  // Compile Insign after a short delay
  setTimeout(() => {
    tryCompileInsign();
  }, 200);
}

// Load preset into circuit builder
function loadPresetIntoBuilder() {
  const selectedCircuit = circuitSelector.value as CircuitType;
  const circuit = CIRCUITS[selectedCircuit];

  // Load template
  templateInput.value = circuit.template;

  // Load IO regions
  ioRegions = circuit.signs.map(sign => ({
    id: sign.id,
    pos: [...sign.pos] as [number, number, number],
    type: sign.type as "input" | "output",
    dataType: sign.dataType as any
  }));

  renderIoRegionsList();

  console.log(`[CircuitBuilder] Loaded ${circuit.name} preset into builder`);
}

// Get regions with geometry
function getRegionsWithGeometry(): Array<{ id: string; entry: DslEntry }> {
  if (!insignData) return [];

  return Object.entries(insignData)
    .filter(([_, entry]) => entry.bounding_boxes && entry.bounding_boxes.length > 0)
    .map(([id, entry]) => ({ id, entry }));
}

// Update UI
function updateUI() {
  if (!insignData) {
    summarySection.style.display = 'none';
    regionsSection.style.display = 'none';
    detailsSection.style.display = 'none';
    return;
  }

  const regions = getRegionsWithGeometry();
  const ioRegionsInInsign = regions.filter(r => r.entry.metadata['io.type']);

  // Update summary
  summarySection.style.display = 'block';
  statTotal.textContent = Object.keys(insignData).length.toString();
  statGeometry.textContent = regions.length.toString();
  statIo.textContent = ioRegionsInInsign.length.toString();
  statSelected.textContent = selectedRegion || '-';

  // Update IO region list from InsignIoManager
  const ioRegions = renderer.insignIoManager ?
    [...renderer.insignIoManager.getAllInputs(), ...renderer.insignIoManager.getAllOutputs()] : [];

  regionsSection.style.display = ioRegions.length > 0 ? 'block' : 'none';
  regionCount.textContent = ioRegions.length.toString();
  regionList.innerHTML = '';

  ioRegions.forEach((region) => {
    const displayName = region.regionId.replace(/^io\./, '');
    const isVisible = renderer.insignIoManager!.isRegionVisible(region.regionId);
    const direction = region.direction;
    const color = direction === 'input' ? '#4499ff' : '#ff4466';

    const item = document.createElement('div');
    item.className = 'region-item';
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      border-left: 3px solid ${color};
    `;

    // Create checkbox for toggling visibility
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isVisible;
    checkbox.style.cssText = 'cursor: pointer; margin: 0;';
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      renderer.insignIoManager!.toggleRegion(region.regionId);
      setTimeout(() => updateUI(), 50);
    });

    // Create content div
    const content = document.createElement('div');
    content.style.cssText = 'flex: 1;';
    content.innerHTML = `
      <div class="region-name">
        <span class="region-color-badge" style="background: ${color};"></span>
        ${displayName}
      </div>
      <div class="region-meta">${direction === 'input' ? '⬇️ Input' : '⬆️ Output'} | ${region.dataType} | ${region.positions.length} bit${region.positions.length > 1 ? 's' : ''}</div>
    `;

    item.appendChild(checkbox);
    item.appendChild(content);
    regionList.appendChild(item);
  });

  // Update details
  if (selectedRegion && insignData[selectedRegion]) {
    updateDetails();
  } else {
    detailsSection.style.display = 'none';
  }
}

// Select region
function selectRegion(regionId: string | null) {
  const previousSelection = selectedRegion;

  // Reset previous selection's style
  if (previousSelection && renderer.insignManager!.isRegionVisible(previousSelection)) {
    // Restore original style based on IO type
    const entry = renderer.insignManager!.getRegionEntry(previousSelection);
    const ioType = entry?.metadata?.['io.type'];
    let style = { ...InsignManager.STYLE_PRESETS.default };
    if (ioType === 'i') style = { ...InsignManager.STYLE_PRESETS.input };
    else if (ioType === 'o') style = { ...InsignManager.STYLE_PRESETS.output };
    renderer.insignManager!.updateRegionStyle(previousSelection, style);
  }

  // Update selection
  selectedRegion = regionId;

  // Highlight new selection
  if (selectedRegion && renderer.insignManager!.isRegionVisible(selectedRegion)) {
    renderer.insignManager!.updateRegionStyle(
      selectedRegion,
      InsignManager.STYLE_PRESETS.selected
    );
  }

  updateUI();
}

// Update details panel
function updateDetails() {
  if (!selectedRegion || !insignData || !insignData[selectedRegion]) {
    detailsSection.style.display = 'none';
    return;
  }

  const entry = insignData[selectedRegion];
  detailsSection.style.display = 'block';

  detailId.textContent = selectedRegion;
  detailMetadata.textContent = JSON.stringify(entry.metadata, null, 2);
  detailBoxes.textContent = JSON.stringify(entry.bounding_boxes, null, 2);
}

// No longer needed - InsignManager handles rendering

// File input handler
fileInput.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    loadSchematic(file);
  }
});

// Drag and drop
canvas.addEventListener('dragover', (e) => {
  e.preventDefault();
});

canvas.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file) {
    loadSchematic(file);
  }
});

// Visualization controls
showRegionsCheckbox.addEventListener('change', () => {
  if (showRegionsCheckbox.checked) {
    // Show all regions (both regular and IO)
    if (insignData) {
      Object.keys(insignData).forEach(id => {
        if (id.startsWith('io.')) {
          // Show IO regions via InsignIoManager
          renderer.insignIoManager?.showRegion(id);
        } else {
          // Show regular regions via InsignManager
          renderer.insignManager!.showRegion(id);
        }
      });
    }
  } else {
    // Hide all regions (both regular and IO)
    renderer.insignManager!.hideAllRegions();
    renderer.insignIoManager?.hideAllRegions();
  }
  // Update UI to reflect checkbox states
  setTimeout(() => updateUI(), 50);
});

showLabelsCheckbox.addEventListener('change', () => {
  // TODO: Implement labels with CSS2DRenderer
  console.log('Labels toggle:', showLabelsCheckbox.checked);
});

// Load test schematic button
if (loadTestBtn) {
  loadTestBtn.addEventListener('click', () => {
    loadTestSchematic();
  });
}

// Load preset into builder button
if (loadPresetBtn) {
  loadPresetBtn.addEventListener('click', () => {
    loadPresetIntoBuilder();
  });
}

// ===== SIMULATION FUNCTIONALITY =====

// Build simulation UI for IO regions
function buildSimulationUI() {
  console.log('[Simulation] buildSimulationUI called');
  if (!renderer.insignIoManager) {
    console.log('[Simulation] No insignIoManager');
    return;
  }

  const inputs = renderer.insignIoManager.getAllInputs();
  const outputs = renderer.insignIoManager.getAllOutputs();
  console.log('[Simulation] Found', inputs.length, 'inputs and', outputs.length, 'outputs');

  if (inputs.length === 0 && outputs.length === 0) {
    simulationSection.style.display = 'none';
    return;
  }

  console.log('[Simulation] Setting simulationSection display to block');
  simulationSection.style.display = 'block';

  // Build input controls
  inputControls.innerHTML = '';
  inputs.forEach(region => {
    const control = createInputControl(region);
    inputControls.appendChild(control);
  });

  // Build output displays
  outputDisplays.innerHTML = '';
  outputs.forEach(region => {
    const display = createOutputDisplay(region);
    outputDisplays.appendChild(display);
  });
}

// Create input control based on data type
function createInputControl(region: any): HTMLElement {
  const control = document.createElement('div');
  control.className = 'input-control';

  const displayName = region.regionId.replace(/^io\./, '');
  const bitCount = region.positions.length;

  // Initialize input value if not set
  if (!(region.regionId in inputValues)) {
    inputValues[region.regionId] = 0;
  }

  control.innerHTML = `
    <div class="input-control-header">
      <span class="input-control-name">${displayName}</span>
      <span class="input-control-type">${region.dataType} (${bitCount} bit${bitCount > 1 ? 's' : ''})</span>
    </div>
  `;

  const valueContainer = document.createElement('div');
  valueContainer.className = 'input-control-value';

  if (region.dataType === 'bool' || bitCount === 1) {
    // Boolean input - checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = inputValues[region.regionId] > 0;
    checkbox.addEventListener('change', () => {
      inputValues[region.regionId] = checkbox.checked ? 1 : 0;
    });
    valueContainer.appendChild(checkbox);
    valueContainer.appendChild(document.createTextNode(' ' + (checkbox.checked ? 'ON' : 'OFF')));
  } else {
    // Multi-bit input - number input + bit toggles
    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.value = inputValues[region.regionId].toString();
    numberInput.min = region.dataType === 'signed' ? (-(2 ** (bitCount - 1))).toString() : '0';
    numberInput.max = region.dataType === 'signed' ? ((2 ** (bitCount - 1)) - 1).toString() : ((2 ** bitCount) - 1).toString();
    numberInput.addEventListener('input', () => {
      const val = parseInt(numberInput.value) || 0;
      inputValues[region.regionId] = val;
      updateBitToggles();
    });
    valueContainer.appendChild(numberInput);

    // Bit toggles
    const bitGroup = document.createElement('div');
    bitGroup.className = 'bit-toggle-group';
    for (let i = bitCount - 1; i >= 0; i--) {
      const bitToggle = document.createElement('div');
      bitToggle.className = 'bit-toggle';
      bitToggle.textContent = i.toString();
      bitToggle.dataset.bit = i.toString();
      bitToggle.dataset.regionId = region.regionId;

      const isSet = (inputValues[region.regionId] & (1 << i)) !== 0;
      if (isSet) bitToggle.classList.add('active');

      bitToggle.addEventListener('click', () => {
        inputValues[region.regionId] ^= (1 << i);
        numberInput.value = inputValues[region.regionId].toString();
        updateBitToggles();
      });

      bitGroup.appendChild(bitToggle);
    }
    valueContainer.appendChild(bitGroup);
  }

  control.appendChild(valueContainer);
  return control;
}

function updateBitToggles() {
  document.querySelectorAll('.bit-toggle').forEach(toggle => {
    const bit = parseInt((toggle as HTMLElement).dataset.bit || '0');
    const regionId = (toggle as HTMLElement).dataset.regionId || '';
    const isSet = (inputValues[regionId] & (1 << bit)) !== 0;
    toggle.classList.toggle('active', isSet);
  });
}

// Create output display
function createOutputDisplay(region: any): HTMLElement {
  const display = document.createElement('div');
  display.className = 'output-display';
  display.dataset.regionId = region.regionId;

  const displayName = region.regionId.replace(/^io\./, '');
  const bitCount = region.positions.length;

  display.innerHTML = `
    <div class="output-display-header">
      <span class="output-display-name">${displayName}</span>
      <span class="output-display-type">${region.dataType} (${bitCount} bit${bitCount > 1 ? 's' : ''})</span>
    </div>
    <div class="output-display-value">-</div>
  `;

  // Add bit displays for multi-bit outputs
  if (bitCount > 1) {
    const bitContainer = document.createElement('div');
    bitContainer.className = 'output-display-bits';
    for (let i = bitCount - 1; i >= 0; i--) {
      const bitDisplay = document.createElement('div');
      bitDisplay.className = 'bit-display';
      bitDisplay.textContent = i.toString();
      bitDisplay.dataset.bit = i.toString();
      bitContainer.appendChild(bitDisplay);
    }
    display.appendChild(bitContainer);
  }

  return display;
}

// Run simulation
async function runSimulation() {
  try {
    runSimulationBtn.disabled = true;
    runSimulationBtn.textContent = '⏳ Running...';

    const liveSync = liveSyncModeCheckbox.checked;

    // Get the schematic (get first available schematic)
    const schematics = renderer.schematicManager?.getAllSchematics();
    const schematic = schematics && schematics.length > 0 ? schematics[0] : null;
    if (!schematic) {
      alert('No schematic loaded');
      console.error('[Simulation] No schematic found. Available schematics:', schematics);
      return;
    }
    console.log('[Simulation] Using schematic:', schematic.name);

    // Import TypedCircuitExecutor and ExecutionMode from nucleation
    const { TypedCircuitExecutorWrapper, ExecutionModeWrapper } = await import('../../../src/nucleationExports');

    // Debug: Check if signs can be extracted
    const signs = schematic.schematicWrapper.extractSigns();
    console.log('[Simulation] Extracted signs:', signs);
    console.log('[Simulation] Sign details:');
    for (const sign of signs) {
      console.log(`  [${sign.pos[0]}, ${sign.pos[1]}, ${sign.pos[2]}]: ${sign.text.replace(/\n/g, ' | ')}`);
    }

    if (!signs || signs.length === 0) {
      alert('No signs found in schematic. Cannot create executor.');
      return;
    }

    // Debug: Check what the InsignIoManager found
    console.log('[Simulation] InsignIoManager inputs:');
    renderer.insignIoManager!.getAllInputs().forEach(region => {
      console.log(`  ${region.regionId}: ${region.positions.length} positions`, region.positions);
    });
    console.log('[Simulation] InsignIoManager outputs:');
    renderer.insignIoManager!.getAllOutputs().forEach(region => {
      console.log(`  ${region.regionId}: ${region.positions.length} positions`, region.positions);
    });

    // Create executor from Insign (it extracts the Insign data from the schematic)
    console.log('[Simulation] Creating TypedCircuitExecutor from Insign...');
    let executor;
    try {
      executor = TypedCircuitExecutorWrapper.fromInsign(schematic.schematicWrapper);
      console.log('[Simulation] Created TypedCircuitExecutor from Insign');
    } catch (err) {
      console.error('[Simulation] fromInsign error:', err);
      alert('Failed to create executor from Insign: ' + (err instanceof Error ? err.message : String(err)));
      return;
    }

    // Prepare inputs with correct types
    const inputs: Record<string, any> = {};
    renderer.insignIoManager!.getAllInputs().forEach(region => {
      const name = region.regionId.replace(/^io\./, '');
      const value = inputValues[region.regionId] || 0;

      // Convert to boolean for bool data types
      if (region.dataType === 'bool') {
        inputs[name] = value !== 0;
      } else {
        inputs[name] = value;
      }
    });

    console.log('[Simulation] Inputs:', inputs);

    // Create execution mode (run for fixed number of ticks with generous headroom)
    // Using a high tick count to ensure full propagation
    const executionMode = ExecutionModeWrapper.fixedTicks(50);
    console.log('[Simulation] Using fixedTicks execution mode (50 ticks)');

    // Execute - pass inputs as object and execution mode
    const executionResult = executor.execute(inputs, executionMode);
    const outputs = executionResult.outputs;

    console.log('[Simulation] Execution completed');
    console.log('[Simulation] Outputs:', outputs);
    console.log('[Simulation] Execution result:', executionResult);

    // Update output displays
    renderer.insignIoManager!.getAllOutputs().forEach(region => {
      const name = region.regionId.replace(/^io\./, '');
      const value = outputs[name];

      const displayEl = document.querySelector(`.output-display[data-region-id="${region.regionId}"]`) as HTMLElement;
      if (displayEl) {
        const valueEl = displayEl.querySelector('.output-display-value') as HTMLElement;
        valueEl.textContent = value !== undefined ? value.toString() : '-';

        // Update bit displays
        const bitDisplays = displayEl.querySelectorAll('.bit-display');
        bitDisplays.forEach((bitEl, idx) => {
          const bit = parseInt((bitEl as HTMLElement).dataset.bit || '0');
          const isSet = (value & (1 << bit)) !== 0;
          bitEl.classList.toggle('active', isSet);
        });
      }
    });

    // If live sync mode, update the renderer with the simulation state
    if (liveSync) {
      console.log('[Simulation] Syncing simulation state to renderer...');

      // Debug: Check a sample block state BEFORE syncing
      const dimensions = schematic.schematicWrapper.get_dimensions();
      console.log('[Simulation] Schematic dimensions:', dimensions);

      // Sample a few blocks to see their state before sync
      console.log('[Simulation] Block states BEFORE sync:');
      for (let y = 0; y < Math.min(5, dimensions[1]); y++) {
        for (let z = 0; z < Math.min(5, dimensions[2]); z++) {
          for (let x = 0; x < Math.min(5, dimensions[0]); x++) {
            const blockString = schematic.schematicWrapper.get_block_string(x, y, z);
            if (blockString && !blockString.includes('air')) {
              console.log(`  [${x},${y},${z}] = ${blockString}`);
            }
          }
        }
      }

      // Get the updated schematic from the executor (includes all block state changes)
      console.log('[Simulation] Calling syncToSchematic()...');
      const updatedSchematic = executor.syncToSchematic();
      console.log('[Simulation] syncToSchematic() returned');

      // Debug: Check block states AFTER syncing
      console.log('[Simulation] Block states AFTER sync:');
      for (let y = 0; y < Math.min(5, dimensions[1]); y++) {
        for (let z = 0; z < Math.min(5, dimensions[2]); z++) {
          for (let x = 0; x < Math.min(5, dimensions[0]); x++) {
            const blockString = updatedSchematic.get_block_string(x, y, z);
            if (blockString && !blockString.includes('air')) {
              console.log(`  [${x},${y},${z}] = ${blockString}`);
            }
          }
        }
      }

      // Replace the schematic's internal data with the updated one
      schematic.schematicWrapper = updatedSchematic;

      // Rebuild the mesh to show the updated state
      console.log('[Simulation] Rebuilding mesh...');
      await schematic.rebuildMesh();

      console.log('[Simulation] ✓ Renderer synced with simulation state');
    }

  } catch (error) {
    console.error('[Simulation] Error:', error);
    alert('Simulation failed: ' + error);
  } finally {
    runSimulationBtn.disabled = false;
    runSimulationBtn.textContent = '▶️ Run Simulation';
  }
}

// Event listeners for simulation
if (runSimulationBtn) {
  runSimulationBtn.addEventListener('click', runSimulation);
}

// ===== CIRCUIT BUILDER FUNCTIONALITY =====

// Render IO regions list
function renderIoRegionsList() {
  ioRegionsList.innerHTML = '';

  if (ioRegions.length === 0) {
    ioRegionsList.innerHTML = '<div style="color: #666; font-size: 0.85em; padding: 8px;">No IO regions defined</div>';
    return;
  }

  ioRegions.forEach((region, index) => {
    const item = document.createElement('div');
    item.className = 'io-region-item';

    const typeColor = region.type === 'input' ? '#4499ff' : '#ff4466';

    item.innerHTML = `
      <div class="io-region-header">
        <span class="io-region-name" style="color: ${typeColor}">${region.id}</span>
        <button class="delete-btn" data-index="${index}">🗑️ Delete</button>
      </div>
      
      <label>Type</label>
      <select data-index="${index}" data-field="type">
        <option value="input" ${region.type === 'input' ? 'selected' : ''}>Input</option>
        <option value="output" ${region.type === 'output' ? 'selected' : ''}>Output</option>
      </select>
      
      <label>Data Type</label>
      <select data-index="${index}" data-field="dataType">
        <option value="bool" ${region.dataType === 'bool' ? 'selected' : ''}>bool</option>
        <option value="u8" ${region.dataType === 'u8' ? 'selected' : ''}>u8</option>
        <option value="u16" ${region.dataType === 'u16' ? 'selected' : ''}>u16</option>
        <option value="u32" ${region.dataType === 'u32' ? 'selected' : ''}>u32</option>
        <option value="i8" ${region.dataType === 'i8' ? 'selected' : ''}>i8</option>
        <option value="i16" ${region.dataType === 'i16' ? 'selected' : ''}>i16</option>
        <option value="i32" ${region.dataType === 'i32' ? 'selected' : ''}>i32</option>
      </select>
      
      <label>Position [x, y, z]</label>
      <div class="coord-input-group">
        <input type="number" data-index="${index}" data-field="pos" data-coord="0" value="${region.pos[0]}" placeholder="X">
        <input type="number" data-index="${index}" data-field="pos" data-coord="1" value="${region.pos[1]}" placeholder="Y">
        <input type="number" data-index="${index}" data-field="pos" data-coord="2" value="${region.pos[2]}" placeholder="Z">
      </div>
      
      <label>Region ID</label>
      <input type="text" data-index="${index}" data-field="id" value="${region.id}" placeholder="io.name">
    `;

    ioRegionsList.appendChild(item);
  });

  // Add event listeners for changes
  ioRegionsList.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement;
      const index = parseInt(target.dataset.index || '0');
      const field = target.dataset.field as keyof IoRegionDef;

      if (field === 'pos') {
        const coord = parseInt(target.dataset.coord || '0');
        ioRegions[index].pos[coord] = parseInt((target as HTMLInputElement).value) || 0;
      } else if (field === 'type' || field === 'dataType') {
        ioRegions[index][field] = target.value as any;
      } else if (field === 'id') {
        ioRegions[index][field] = target.value;
      }

      // Re-render to update colors if type changed
      if (field === 'type') {
        renderIoRegionsList();
      }
    });
  });

  // Add event listeners for delete buttons
  ioRegionsList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt((e.target as HTMLButtonElement).dataset.index || '0');
      ioRegions.splice(index, 1);
      renderIoRegionsList();
    });
  });
}

// Add new IO region
function addIoRegion() {
  ioRegions.push({
    id: `io.region_${ioRegions.length + 1}`,
    pos: [0, 2, 0],
    type: 'input',
    dataType: 'bool'
  });
  renderIoRegionsList();
}

// Build circuit from template
async function buildFromTemplate() {
  const template = templateInput.value.trim();

  if (!template) {
    alert('Please enter a template');
    return;
  }

  try {
    console.log('[CircuitBuilder] Building circuit from template...');
    buildFromTemplateBtn.disabled = true;
    buildFromTemplateBtn.textContent = '⏳ Building...';

    const { SchematicBuilderWrapper } = await import("../../../src/nucleationExports");

    // Build the schematic from template
    const builder = SchematicBuilderWrapper.fromTemplate(template);
    const builtSchematic = builder.build();

    // Clear old IO highlights
    if (renderer.insignIoManager) {
      renderer.insignIoManager.clear();
    }

    // Remove existing schematic if any
    const existingSchematic = renderer.schematicManager?.getSchematic();
    if (existingSchematic) {
      renderer.schematicManager?.removeSchematic(existingSchematic.name);
    }

    // Clear old Insign data
    insignData = null;

    // Load the schematic
    await renderer.schematicManager?.loadSchematic("custom_circuit", builtSchematic);

    // Get the loaded schematic to add IO annotations
    const schematic = renderer.schematicManager?.getSchematic("custom_circuit");
    if (!schematic) {
      throw new Error('Failed to get loaded schematic');
    }

    console.log('[CircuitBuilder] Adding IO annotations...');

    // Add all IO regions as signs
    for (const region of ioRegions) {
      schematic.setBlockWithNbt(region.pos, "minecraft:oak_sign[rotation=0]", {
        Text1: `{"text":"@${region.id}=rc([0,-1,0],[0,-1,0])"}`,
        Text2: `{"text":"#${region.id}:type=\\"${region.type}\\""}`,
        Text3: `{"text":"#${region.id}:data_type=\\"${region.dataType}\\""}`,
        Text4: '{"text":""}',
      });
    }

    // Rebuild mesh
    schematic.rebuildMesh();

    // Focus camera
    renderer.cameraManager.focusOnSchematics();

    console.log('[CircuitBuilder] ✓ Circuit built successfully');

    // Compile Insign after a short delay
    setTimeout(() => {
      tryCompileInsign();
    }, 200);

  } catch (error) {
    console.error('[CircuitBuilder] Error:', error);
    alert('Failed to build circuit: ' + error);
  } finally {
    buildFromTemplateBtn.disabled = false;
    buildFromTemplateBtn.textContent = '🏗️ Build Circuit';
  }
}

// Event listeners for circuit builder
if (addIoBtn) {
  addIoBtn.addEventListener('click', addIoRegion);
}

if (buildFromTemplateBtn) {
  buildFromTemplateBtn.addEventListener('click', buildFromTemplate);
}

// Initialize IO regions list
renderIoRegionsList();

// Update the updateUI function to also build simulation UI
const originalUpdateUI = updateUI;
updateUI = function () {
  originalUpdateUI();
  buildSimulationUI();
};

console.log('[Insign] Test page initialized');

