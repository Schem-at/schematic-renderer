// managers/highlight/InsignRegionHighlight.ts
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Highlight } from './Highlight';
import { SchematicRenderer } from '../../SchematicRenderer';
import { DslEntry } from '../../types/insign';

export type BoxPair = [[number, number, number], [number, number, number]];

export interface InsignRegionStyle {
  color: THREE.Color | number;
  opacity: number;
  linewidth: number;
  filled: boolean; // If true, render as semi-transparent box instead of just edges
  visible: boolean;
  showLabel: boolean; // If true, show a label with the region name
  showEdges: boolean; // If true, show thick border edges around the region
  edgeThickness: number; // Thickness of the border edges (0.02 - 0.1)
}

export interface InsignRegionOptions {
  regionId: string;
  entry: DslEntry;
  style?: Partial<InsignRegionStyle>;
}

const DEFAULT_STYLE: InsignRegionStyle = {
  color: 0x00ff00,
  opacity: 0.15,  // More subtle to avoid z-fighting
  linewidth: 2,
  filled: true,   // Use filled boxes by default for better appearance
  visible: true,
  showLabel: true,
  showEdges: true,  // Show thick border edges by default
  edgeThickness: 0.04,  // 4% of block size
};

/**
 * Highlight system for Insign regions - renders bounding boxes with various styles
 */
export class InsignRegionHighlight implements Highlight {
  private renderer: SchematicRenderer;
  private regionId: string;
  private entry: DslEntry;
  private style: InsignRegionStyle;
  private meshes: THREE.Object3D[] = [];
  private labels: CSS2DObject[] = [];
  private isActive: boolean = false;

  constructor(renderer: SchematicRenderer, options: InsignRegionOptions) {
    this.renderer = renderer;
    this.regionId = options.regionId;
    this.entry = options.entry;
    this.style = { ...DEFAULT_STYLE, ...options.style };
  }

  getName(): string {
    return `insign_region_${this.regionId}`;
  }

  /**
   * Activate the highlight - create and add meshes to the scene
   */
  activate(): void {
    if (this.isActive) return;
    this.isActive = true;
    if (!this.entry.bounding_boxes || this.entry.bounding_boxes.length === 0) {
      console.warn(`[InsignRegionHighlight] No bounding boxes for region: ${this.regionId}`);
      return;
    }

    // Create meshes for each bounding box in the region
    for (const box of this.entry.bounding_boxes) {
      const mesh = this.createBoxMesh(box as BoxPair);
      if (mesh) {
        this.meshes.push(mesh);
        this.renderer.sceneManager.scene.add(mesh);
        console.log(`[InsignRegionHighlight] Added mesh for ${this.regionId} at position:`, mesh.position, 'box:', box);
        
        // Create label for this box if enabled
        if (this.style.showLabel) {
          const label = this.createLabel(mesh.position);
          if (label) {
            this.labels.push(label);
            this.renderer.sceneManager.scene.add(label);
          }
        }
      }
    }

    console.log(`[InsignRegionHighlight] Activated region '${this.regionId}' with ${this.meshes.length} boxes and ${this.labels.length} labels`);
  }

  /**
   * Deactivate the highlight - remove and dispose all meshes
   */
  deactivate(): void {
    if (!this.isActive) return;
    this.isActive = false;
    
    for (const object of this.meshes) {
      this.renderer.sceneManager.scene.remove(object);
      
      // Handle both single meshes and groups
      if (object instanceof THREE.Group) {
        object.children.forEach((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((mat) => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      } else if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((mat) => mat.dispose());
        } else {
          object.material.dispose();
        }
      }
    }
    this.meshes = [];
    
    // Remove labels
    for (const label of this.labels) {
      this.renderer.sceneManager.scene.remove(label);
      label.element.remove(); // Remove the HTML element
    }
    this.labels = [];
    
    console.log(`[InsignRegionHighlight] Deactivated region '${this.regionId}'`);
  }

  /**
   * Update method required by Highlight interface
   * @param _deltaTime - Time since last frame (unused for static regions)
   */
  update(_deltaTime: number): void {
    // Static regions don't need per-frame updates
    // This method is here to satisfy the Highlight interface
  }

  /**
   * Update the style of this region (color, opacity, etc.)
   */
  public updateStyle(newStyle: Partial<InsignRegionStyle>): void {
    this.style = { ...this.style, ...newStyle };

    // Update existing meshes (handle both single objects and groups)
    for (const object of this.meshes) {
      const objectsToUpdate: THREE.Object3D[] = object instanceof THREE.Group 
        ? object.children 
        : [object];
      
      for (const mesh of objectsToUpdate) {
        if (mesh instanceof THREE.LineSegments) {
          const material = mesh.material as THREE.LineBasicMaterial;
          material.color.set(this.style.color);
          material.opacity = this.style.opacity;
          material.visible = this.style.visible;
        } else if (mesh instanceof THREE.Mesh) {
          const material = mesh.material as THREE.MeshBasicMaterial;
          material.color.set(this.style.color);
          material.opacity = this.style.opacity;
          material.visible = this.style.visible;
        }
      }
    }
  }

  /**
   * Get the region ID
   */
  public getRegionId(): string {
    return this.regionId;
  }

  /**
   * Get the region entry (metadata and bounding boxes)
   */
  public getEntry(): DslEntry {
    return this.entry;
  }

  /**
   * Create a CSS2D label for a region
   */
  private createLabel(position: THREE.Vector3): CSS2DObject | null {
    // Get display name from metadata or use region ID
    const displayName = this.entry.metadata?.['doc.label'] || this.regionId;
    const ioType = this.entry.metadata?.['io.type'];
    
    // Create label HTML element
    const div = document.createElement('div');
    div.style.cssText = `
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      font-weight: 500;
      pointer-events: none;
      user-select: none;
      white-space: nowrap;
      border: 1px solid ${ioType === 'i' ? '#4444ff' : ioType === 'o' ? '#ff4444' : '#44ff44'};
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    div.textContent = displayName;
    
    // Create CSS2D object
    const label = new CSS2DObject(div);
    label.position.copy(position);
    label.position.y += 1; // Offset above the box
    
    return label;
  }

  /**
   * Create thick border edges for a bounding box
   */
  private createThickEdges(width: number, height: number, depth: number): THREE.Group {
    const group = new THREE.Group();
    const thickness = this.style.edgeThickness;
    
    // Create slightly brighter version of the color for edges
    const color = new THREE.Color(this.style.color);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    
    // Increase lightness by 15% for edges (brighter outline)
    const edgeColor = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1.0, hsl.l + 0.15));
    
    const edgeMaterial = new THREE.MeshBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: Math.min(1.0, this.style.opacity + 0.5), // Edges more opaque than fill
      depthTest: true,
      depthWrite: false,
    });
    
    // Helper to create a cylindrical edge
    const createEdge = (length: number, position: THREE.Vector3, rotation: THREE.Euler) => {
      const geometry = new THREE.CylinderGeometry(thickness, thickness, length, 8);
      const mesh = new THREE.Mesh(geometry, edgeMaterial.clone());
      mesh.position.copy(position);
      mesh.rotation.copy(rotation);
      mesh.renderOrder = 1000; // Render on top
      return mesh;
    };
    
    const hw = width / 2;
    const hh = height / 2;
    const hd = depth / 2;
    
    // 4 vertical edges (along Y axis) - default cylinder orientation
    group.add(createEdge(height, new THREE.Vector3(-hw, 0, -hd), new THREE.Euler(0, 0, 0)));
    group.add(createEdge(height, new THREE.Vector3(hw, 0, -hd), new THREE.Euler(0, 0, 0)));
    group.add(createEdge(height, new THREE.Vector3(-hw, 0, hd), new THREE.Euler(0, 0, 0)));
    group.add(createEdge(height, new THREE.Vector3(hw, 0, hd), new THREE.Euler(0, 0, 0)));
    
    // 4 horizontal edges along X axis - rotate 90° around Z
    // Bottom edges
    group.add(createEdge(width, new THREE.Vector3(0, -hh, -hd), new THREE.Euler(0, 0, Math.PI / 2)));
    group.add(createEdge(width, new THREE.Vector3(0, -hh, hd), new THREE.Euler(0, 0, Math.PI / 2)));
    // Top edges
    group.add(createEdge(width, new THREE.Vector3(0, hh, -hd), new THREE.Euler(0, 0, Math.PI / 2)));
    group.add(createEdge(width, new THREE.Vector3(0, hh, hd), new THREE.Euler(0, 0, Math.PI / 2)));
    
    // 4 horizontal edges along Z axis - rotate 90° around X
    // Bottom edges
    group.add(createEdge(depth, new THREE.Vector3(-hw, -hh, 0), new THREE.Euler(Math.PI / 2, 0, 0)));
    group.add(createEdge(depth, new THREE.Vector3(hw, -hh, 0), new THREE.Euler(Math.PI / 2, 0, 0)));
    // Top edges
    group.add(createEdge(depth, new THREE.Vector3(-hw, hh, 0), new THREE.Euler(Math.PI / 2, 0, 0)));
    group.add(createEdge(depth, new THREE.Vector3(hw, hh, 0), new THREE.Euler(Math.PI / 2, 0, 0)));
    
    return group;
  }

  /**
   * Create a mesh for a single bounding box
   */
  private createBoxMesh(box: BoxPair): THREE.Object3D | null {
    const [[x1, y1, z1], [x2, y2, z2]] = box;

    const width = Math.abs(x2 - x1) + 1;
    const height = Math.abs(y2 - y1) + 1;
    const depth = Math.abs(z2 - z1) + 1;

    // Get schematic offset (same as CustomIoHighlight)
    const schematics = this.renderer.schematicManager?.getAllSchematics();
    let schematicOffset = new THREE.Vector3(0, 0, 0);
    
    if (schematics && schematics.length > 0) {
      const firstSchematic = schematics[0];
      schematicOffset.copy(firstSchematic.position);
    }

    // Calculate center with schematic offset
    const centerX = (x1 + x2) / 2 + schematicOffset.x;
    const centerY = (y1 + y2) / 2 + schematicOffset.y;
    const centerZ = (z1 + z2) / 2 + schematicOffset.z;

    const geometry = new THREE.BoxGeometry(width, height, depth);

    // Create semi-transparent filled box with offset to prevent z-fighting
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: this.style.color,
      opacity: this.style.opacity,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const fillMesh = new THREE.Mesh(geometry, fillMaterial);
    fillMesh.renderOrder = 999; // Render after schematic but before UI
    
    // Create a group to hold all meshes
    const group = new THREE.Group();
    
    if (this.style.filled) {
      group.add(fillMesh);
    }
    
    // Add thick border edges if enabled
    if (this.style.showEdges) {
      const edgeGroup = this.createThickEdges(width, height, depth);
      group.add(edgeGroup);
    }
    
    group.position.set(centerX, centerY, centerZ);
    group.userData = { regionId: this.regionId, entry: this.entry, box };
    
    return group;
  }
}

