// managers/InsignManager.ts
import { EventEmitter } from 'events';
import { SchematicRenderer } from '../SchematicRenderer';
import { InsignRegionHighlight, InsignRegionStyle } from './highlight/InsignRegionHighlight';
import { DslMap, DslEntry } from '../types/insign';

export interface InsignRegionFilter {
  /** Filter by metadata key-value pairs (e.g., { 'io.type': 'i' }) */
  metadata?: Record<string, string>;
  /** Filter by region ID pattern (supports wildcards: 'cpu.*') */
  idPattern?: string;
}

/**
 * Generate a color from a string hash (deterministic)
 */
function hashStringToColor(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate HSL color with good saturation and lightness
  const hue = Math.abs(hash % 360);
  const saturation = 60 + (Math.abs(hash >> 8) % 30); // 60-90%
  const lightness = 50 + (Math.abs(hash >> 16) % 20);  // 50-70%
  
  // Convert HSL to RGB
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/**
 * Manager for Insign regions - provides a high-level API for loading, displaying, and managing
 * Insign region visualizations using the HighlightManager system.
 */
export class InsignManager extends EventEmitter {
  private renderer: SchematicRenderer;
  private insignData: DslMap | null = null;
  private activeHighlights: Map<string, InsignRegionHighlight> = new Map();
  
  // Style presets
  public static readonly STYLE_PRESETS: Record<string, Partial<InsignRegionStyle>> = {
    input: { color: 0x4499ff, opacity: 0.15, filled: true, showLabel: true, showEdges: true, edgeThickness: 0.04 },
    output: { color: 0xff4466, opacity: 0.15, filled: true, showLabel: true, showEdges: true, edgeThickness: 0.04 },
    default: { color: 0x44ff66, opacity: 0.15, filled: true, showLabel: true, showEdges: true, edgeThickness: 0.04 },
    selected: { color: 0xffcc00, opacity: 0.25, filled: true, showLabel: true, showEdges: true, edgeThickness: 0.05 },
    hidden: { visible: false, showLabel: false },
    filled: { filled: true, opacity: 0.2, showLabel: true, showEdges: true, edgeThickness: 0.04 },
    edgesOnly: { filled: false, opacity: 1.0, showLabel: true, showEdges: true, edgeThickness: 0.06 },
  };

  constructor(renderer: SchematicRenderer) {
    super();
    this.renderer = renderer;
  }

  /**
   * Generate a deterministic color from a string (e.g., region ID)
   * Useful for consistent coloring across sessions
   */
  public static generateColorFromString(str: string): number {
    return hashStringToColor(str);
  }

  /**
   * Load Insign data from a schematic
   * @param schematicName - Name of the schematic (optional, uses first schematic if not provided)
   * @returns The compiled Insign data
   */
  public async loadFromSchematic(schematicName?: string): Promise<DslMap | null> {
    if (!this.renderer.schematicManager) {
      console.warn('[InsignManager] SchematicManager not initialized');
      this.insignData = null;
      this.emit('dataLoaded', null);
      return null;
    }

    const schematic = schematicName
      ? this.renderer.schematicManager.getSchematic(schematicName)
      : this.renderer.schematicManager.getAllSchematics()[0];

    if (!schematic) {
      console.warn('[InsignManager] No schematic available');
      this.insignData = null;
      this.emit('dataLoaded', null);
      return null;
    }

    try {
      const compiledData = schematic.compileInsign();
      
      // Handle both Map (from WASM) and plain objects
      const hasData = compiledData && (
        compiledData instanceof Map 
          ? compiledData.size > 0 
          : Object.keys(compiledData).length > 0
      );
      
      if (hasData) {
        // Convert Map to plain object for easier use
        if (compiledData instanceof Map) {
          const obj: DslMap = {};
          compiledData.forEach((value: any, key: string) => {
            // Each value is also a Map, convert it too
            if (value instanceof Map) {
              const entry: any = {};
              value.forEach((v: any, k: string) => {
                // Recursively convert nested Maps (like metadata)
                if (v instanceof Map) {
                  const nested: any = {};
                  v.forEach((nv: any, nk: string) => {
                    nested[nk] = nv;
                  });
                  entry[k] = nested;
                } else {
                  entry[k] = v;
                }
              });
              obj[key] = entry;
            } else {
              obj[key] = value;
            }
          });
          this.insignData = obj;
        } else {
          this.insignData = compiledData;
        }
        
        console.log(`[InsignManager] Loaded Insign data with ${Object.keys(this.insignData!).length} regions`);
        this.emit('dataLoaded', this.insignData);
        return this.insignData;
      } else {
        console.warn('[InsignManager] No Insign data found in schematic');
        this.insignData = null;
        this.emit('dataLoaded', null);
        return null;
      }
    } catch (error) {
      console.error('[InsignManager] Failed to compile Insign data:', error);
      this.insignData = null;
      this.emit('dataLoaded', null);
      return null;
    }
  }

  /**
   * Get the currently loaded Insign data
   */
  public getData(): DslMap | null {
    return this.insignData;
  }

  /**
   * Get all region IDs
   */
  public getAllRegionIds(): string[] {
    return this.insignData ? Object.keys(this.insignData) : [];
  }

  /**
   * Get regions filtered by criteria
   */
  public getFilteredRegions(filter: InsignRegionFilter): Array<{ id: string; entry: DslEntry }> {
    if (!this.insignData) return [];

    let regions = Object.entries(this.insignData).map(([id, entry]) => ({ id, entry }));

    // Filter by metadata
    if (filter.metadata) {
      regions = regions.filter(({ entry }) => {
        return Object.entries(filter.metadata!).every(([key, value]) => {
          return entry.metadata && entry.metadata[key] === value;
        });
      });
    }

    // Filter by ID pattern
    if (filter.idPattern) {
      const pattern = filter.idPattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      regions = regions.filter(({ id }) => regex.test(id));
    }

    return regions;
  }

  /**
   * Get color for a region from metadata or hash
   * Checks for 'vis.color' metadata, then 'doc.color', then generates from ID hash
   */
  private getRegionColor(regionId: string, entry: DslEntry): number {
    // Check for explicit color in metadata
    const visColor = entry.metadata?.['vis.color'];
    if (visColor) {
      // Parse color string (hex or named)
      if (typeof visColor === 'string') {
        if (visColor.startsWith('#')) {
          return parseInt(visColor.slice(1), 16);
        } else if (visColor.startsWith('0x')) {
          return parseInt(visColor.slice(2), 16);
        }
      } else if (typeof visColor === 'number') {
        return visColor;
      }
    }
    
    // Fallback to hash-based color
    return hashStringToColor(regionId);
  }

  /**
   * Show a region with optional custom style
   * @param regionId - The region ID to show
   * @param style - Optional style override
   */
  public showRegion(regionId: string, style?: Partial<InsignRegionStyle>): void {
    if (!this.insignData || !this.insignData[regionId]) {
      console.warn(`[InsignManager] Region '${regionId}' not found in Insign data`);
      return;
    }

    // If already active, just update style
    if (this.activeHighlights.has(regionId)) {
      if (style) {
        this.activeHighlights.get(regionId)!.updateStyle(style);
      }
      return;
    }

    // Determine default style based on metadata
    const entry = this.insignData[regionId];
    const ioType = entry.metadata?.['io.type'];
    
    let defaultStyle;
    if (ioType === 'i') {
      defaultStyle = { ...InsignManager.STYLE_PRESETS.input };
    } else if (ioType === 'o') {
      defaultStyle = { ...InsignManager.STYLE_PRESETS.output };
    } else {
      // For non-IO regions, use hash-based coloring by default
      defaultStyle = { 
        ...InsignManager.STYLE_PRESETS.default,
        color: this.getRegionColor(regionId, entry)
      };
    }
    
    // Allow explicit color override via vis.color metadata for IO types too
    if (!style?.color && entry.metadata?.['vis.color']) {
      defaultStyle.color = this.getRegionColor(regionId, entry);
    }

    // Create and activate highlight
    const highlight = new InsignRegionHighlight(this.renderer, {
      regionId,
      entry,
      style: { ...defaultStyle, ...style },
    });

    highlight.activate();
    this.activeHighlights.set(regionId, highlight);
    
    this.emit('regionShown', regionId);
  }

  /**
   * Show multiple regions at once
   */
  public showRegions(regionIds: string[], style?: Partial<InsignRegionStyle>): void {
    regionIds.forEach((id) => this.showRegion(id, style));
  }

  /**
   * Show regions matching a filter
   */
  public showFilteredRegions(filter: InsignRegionFilter, style?: Partial<InsignRegionStyle>): void {
    const regions = this.getFilteredRegions(filter);
    regions.forEach(({ id }) => this.showRegion(id, style));
  }

  /**
   * Show all regions
   */
  public showAllRegions(style?: Partial<InsignRegionStyle>): void {
    if (!this.insignData) return;
    Object.keys(this.insignData).forEach((id) => this.showRegion(id, style));
  }

  /**
   * Hide a region
   */
  public hideRegion(regionId: string): void {
    const highlight = this.activeHighlights.get(regionId);
    if (!highlight) return;

    highlight.deactivate();
    this.activeHighlights.delete(regionId);
    
    this.emit('regionHidden', regionId);
  }

  /**
   * Hide multiple regions
   */
  public hideRegions(regionIds: string[]): void {
    regionIds.forEach((id) => this.hideRegion(id));
  }

  /**
   * Hide regions matching a filter
   */
  public hideFilteredRegions(filter: InsignRegionFilter): void {
    const regions = this.getFilteredRegions(filter);
    regions.forEach(({ id }) => this.hideRegion(id));
  }

  /**
   * Hide all regions
   */
  public hideAllRegions(): void {
    Array.from(this.activeHighlights.keys()).forEach((id) => this.hideRegion(id));
  }

  /**
   * Toggle a region's visibility
   */
  public toggleRegion(regionId: string, style?: Partial<InsignRegionStyle>): void {
    if (this.activeHighlights.has(regionId)) {
      this.hideRegion(regionId);
    } else {
      this.showRegion(regionId, style);
    }
  }

  /**
   * Update the style of an active region
   */
  public updateRegionStyle(regionId: string, style: Partial<InsignRegionStyle>): void {
    const highlight = this.activeHighlights.get(regionId);
    if (!highlight) {
      console.warn(`[InsignManager] Region '${regionId}' is not currently shown`);
      return;
    }
    highlight.updateStyle(style);
  }

  /**
   * Update the style of multiple regions
   */
  public updateRegionsStyle(regionIds: string[], style: Partial<InsignRegionStyle>): void {
    regionIds.forEach((id) => this.updateRegionStyle(id, style));
  }

  /**
   * Update the style of all active regions matching a filter
   */
  public updateFilteredRegionsStyle(filter: InsignRegionFilter, style: Partial<InsignRegionStyle>): void {
    const regions = this.getFilteredRegions(filter);
    const activeRegions = regions.filter(({ id }) => this.activeHighlights.has(id));
    activeRegions.forEach(({ id }) => this.updateRegionStyle(id, style));
  }

  /**
   * Check if a region is currently visible
   */
  public isRegionVisible(regionId: string): boolean {
    return this.activeHighlights.has(regionId);
  }

  /**
   * Get all currently visible region IDs
   */
  public getVisibleRegionIds(): string[] {
    return Array.from(this.activeHighlights.keys());
  }

  /**
   * Clear all data and hide all regions
   */
  public clear(): void {
    this.hideAllRegions();
    this.insignData = null;
    this.emit('cleared');
  }

  /**
   * Get a region's entry (metadata and bounding boxes)
   */
  public getRegionEntry(regionId: string): DslEntry | null {
    return this.insignData?.[regionId] || null;
  }

  /**
   * Query regions by metadata
   */
  public queryByMetadata(key: string, value?: string): Array<{ id: string; entry: DslEntry }> {
    if (!this.insignData) return [];

    return Object.entries(this.insignData)
      .filter(([_, entry]) => {
        if (!entry.metadata) return false;
        if (value === undefined) {
          return key in entry.metadata;
        }
        return entry.metadata[key] === value;
      })
      .map(([id, entry]) => ({ id, entry }));
  }

  /**
   * Get regions by IO type (input/output)
   */
  public getByIOType(type: 'i' | 'o'): Array<{ id: string; entry: DslEntry }> {
    return this.queryByMetadata('io.type', type);
  }

  /**
   * Helper: Show all inputs
   */
  public showAllInputs(style?: Partial<InsignRegionStyle>): void {
    const inputs = this.getByIOType('i');
    inputs.forEach(({ id }) => this.showRegion(id, style));
  }

  /**
   * Helper: Show all outputs
   */
  public showAllOutputs(style?: Partial<InsignRegionStyle>): void {
    const outputs = this.getByIOType('o');
    outputs.forEach(({ id }) => this.showRegion(id, style));
  }

  /**
   * Helper: Show only IO regions (inputs and outputs)
   */
  public showOnlyIO(style?: Partial<InsignRegionStyle>): void {
    this.hideAllRegions();
    this.showAllInputs(style);
    this.showAllOutputs(style);
  }
}

