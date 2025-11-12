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

// Helper function to create a test schematic with Insign annotations
function createInsignTestSchematic(renderer: SchematicRenderer, name: string): void {
  const schematic = renderer.schematicManager?.createEmptySchematic(name);
  if (!schematic) return;

  // Create a simple AND gate structure
  // Input A (redstone torch on block)
  schematic.setBlockNoRebuild([0, 0, 0], "minecraft:lever[face=wall,facing=north,powered=false]");
  schematic.setBlockNoRebuild([2, 0, 0], "minecraft:lever[face=wall,facing=north,powered=false]");

  schematic.setBlockNoRebuild([0, 0, 1], "minecraft:stone");
  schematic.setBlockNoRebuild([0, 1, 1], "minecraft:redstone_torch[lit=true]");
  
  // Input B (redstone torch on block)
  schematic.setBlockNoRebuild([2, 0, 1], "minecraft:stone");
  schematic.setBlockNoRebuild([2, 1, 1], "minecraft:redstone_torch[lit=true]");
  
  // Wire from inputs
  schematic.setBlockNoRebuild([1, 0, 1], "minecraft:stone");
  schematic.setBlockNoRebuild([1, 1, 1], "minecraft:redstone_wire[power=15,north=none,east=side,south=none,west=side]");
  schematic.setBlockNoRebuild([1, 0, 2], "minecraft:redstone_wall_torch[lit=false, facing=south]");
  
  // Output (redstone lamp)
  schematic.setBlockNoRebuild([1, 0, 3], "minecraft:redstone_lamp[lit=false]");
  
  // Add signs with Insign annotations using the new NBT API
  
  // Sign for Input A region (torch at [0,1,0], sign at [0,2,0], so relative is [0,-1,0])
  schematic.setBlockWithNbt([1, 0, 0], "minecraft:oak_wall_sign[facing=south]", {
    Text1: '{"text":"@input_a=rc([-1,0,0],[-1,0,0])"}',
    Text2: '{"text":"#input_a.io.type=\\"i\\""}',
    Text3: '{"text":"@input_b=rc([1,0,0],[1,0,0])"}',
    Text4: '{"text":"#input_b.io.type=\\"i\\""}',
  });


  schematic.setBlockWithNbt([1, 1, 3], "minecraft:oak_sign[rotation=8]", {
    Text1: '{"text":"@output=rc([0,-1,0],[0,-1,0])"}',
    Text2: '{"text":"#output.io.type=\\"o\\""}',
    Text3: '{"text":"@and_gate=rc([-1,-1,-3],[1,0,0])"}',
    Text4: '{"text":"#and_gate.doc.label=\\"AND Gate\\""}',
  });

  // Rebuild mesh after all blocks are set
  schematic.rebuildMesh();

  console.log('[Insign] Created test schematic with Insign annotations');
  
  // Debug: Check if signs were created and try to compile
  console.log('[Insign Debug] Attempting to extract signs from schematic...');
  try {
    const signs = schematic.schematicWrapper.extractSigns();
    console.log('[Insign Debug] Extracted signs:', signs);
    
    // Try compiling directly
    console.log('[Insign Debug] Attempting to compile Insign...');
    const compiled = schematic.schematicWrapper.compileInsign();
    console.log('[Insign Debug] Compiled result:', compiled);
    console.log('[Insign Debug] Result type:', compiled instanceof Map ? 'Map' : typeof compiled);
    console.log('[Insign Debug] Result size:', compiled instanceof Map ? compiled.size : Object.keys(compiled || {}).length);
    
    if (!compiled || (compiled instanceof Map ? compiled.size === 0 : Object.keys(compiled).length === 0)) {
      console.warn('[Insign Debug] Compilation returned empty or null');
    }
  } catch (e) {
    console.error('[Insign Debug] Failed to extract/compile signs:', e);
  }
}

// Get DOM elements
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const showRegionsCheckbox = document.getElementById("show-regions") as HTMLInputElement;
const showLabelsCheckbox = document.getElementById("show-labels") as HTMLInputElement;
const overlayMessage = document.getElementById("overlay-message") as HTMLDivElement;
const loadTestBtn = document.getElementById("load-test-btn") as HTMLButtonElement;

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

// State
let insignData: DslMap | null = null;
let selectedRegion: string | null = null;

// Create renderer
const renderer = new SchematicRenderer(canvas, {}, {
  vanillaPack: async () => {
    const response = await fetch("/pack.zip");
    const buffer = await response.arrayBuffer();
    return new Blob([buffer], { type: "application/zip" });
  },
}, {
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
      console.log('[Insign] Renderer initialized - creating test schematic');

      console.log('Adding renderer to window for debugging');
      (window as any).renderer = r;
      
      // Hide empty state overlay
      r.uiManager?.hideEmptyState();
      
      // Create test schematic with Insign annotations
      createInsignTestSchematic(r, "insign_test");
      r.cameraManager.focusOnSchematics();
      
      // Compile Insign after mesh is built
      setTimeout(() => {
        tryCompileInsign("insign_test");
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
      
      // DON'T show regions by default - let user toggle them
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
function loadTestSchematic() {
  console.log('[Insign] Creating test schematic with Insign annotations...');
  
  // Remove existing schematic if any
  const existingSchematic = renderer.schematicManager.getSchematic();
  if (existingSchematic) {
    renderer.schematicManager.removeSchematic(existingSchematic.name);
  }
  
  // Create new test schematic
  createInsignTestSchematic(renderer, "insign_test");
  renderer.cameraManager.focusOnSchematics();
  
  // Compile Insign after a short delay
  setTimeout(() => {
    tryCompileInsign("insign_test");
  }, 200);
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
  const ioRegions = regions.filter(r => r.entry.metadata['io.type']);
  
  // Update summary
  summarySection.style.display = 'block';
  statTotal.textContent = Object.keys(insignData).length.toString();
  statGeometry.textContent = regions.length.toString();
  statIo.textContent = ioRegions.length.toString();
  statSelected.textContent = selectedRegion || '-';
  
  // Update region list
  regionsSection.style.display = 'block';
  regionCount.textContent = regions.length.toString();
  regionList.innerHTML = '';
  
  regions.forEach(({ id, entry }) => {
    const ioType = entry.metadata['io.type'];
    const label = entry.metadata['doc.label'] || id;
    const isSelected = selectedRegion === id;
    const isVisible = renderer.insignManager!.isRegionVisible(id);
    
    // Get the actual color from hash
    const colorNum = (renderer.insignManager!.constructor as any).generateColorFromString(id);
    const color = '#' + colorNum.toString(16).padStart(6, '0');
    
    const item = document.createElement('div');
    item.className = 'region-item' + (isSelected ? ' selected' : '');
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    // Create checkbox for toggling visibility
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isVisible;
    checkbox.style.cssText = 'cursor: pointer; margin: 0;';
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        renderer.insignManager!.showRegion(id);
      } else {
        renderer.insignManager!.hideRegion(id);
      }
      // Re-render to update checkboxes
      setTimeout(() => updateUI(), 50);
    });
    
    // Create content div
    const content = document.createElement('div');
    content.style.cssText = 'flex: 1; cursor: pointer;';
    content.innerHTML = `
      <div class="region-name">
        <span class="region-color-badge" style="background: ${color};"></span>
        ${label}
      </div>
      ${id !== label ? `<div class="region-meta">ID: ${id}</div>` : ''}
      ${ioType ? `<div class="region-meta">IO: ${ioType === 'i' ? 'Input' : 'Output'}</div>` : ''}
      <div class="region-meta">Boxes: ${entry.bounding_boxes?.length || 0}</div>
    `;
    content.addEventListener('click', () => {
      selectRegion(isSelected ? null : id);
    });
    
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
    // Show all regions
    if (insignData) {
      Object.keys(insignData).forEach(id => {
        renderer.insignManager!.showRegion(id);
      });
    }
  } else {
    // Hide all regions
    renderer.insignManager!.hideAllRegions();
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

console.log('[Insign] Test page initialized');

