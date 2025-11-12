/**
 * TypeScript type definitions for Insign integration
 * Based on Nucleation v0.1.92 Insign support
 */

/**
 * A 3D bounding box defined by two corners (min and max)
 * Both corners are inclusive
 * Format: [[x1, y1, z1], [x2, y2, z2]]
 * 
 * Note: All coordinates are ABSOLUTE (relative coords are resolved during compilation)
 */
export type BoxPair = [[number, number, number], [number, number, number]];

/**
 * Entry in the Insign compilation output
 * Contains bounding boxes and metadata for a single region
 */
export interface DslEntry {
  /**
   * Optional array of bounding boxes defining this region's geometry
   * Undefined for special entries like $global
   * All coordinates are ABSOLUTE (relative coords resolved during compilation)
   * 
   * Each box is [[x1,y1,z1], [x2,y2,z2]] where:
   * - Both corners are inclusive
   * - Boxes are normalized (min <= max per axis)
   */
  bounding_boxes?: BoxPair[];
  
  /**
   * Metadata key-value pairs attached to this region
   * Keys are namespaced (e.g., "io.type", "doc.label", "logic.clock_hz")
   * Values can be any JSON-serializable type
   */
  metadata: Record<string, any>;
}

/**
 * Complete Insign compilation output
 * Maps region IDs to their entries
 * Keys are ordered deterministically (BTreeMap from Rust)
 * 
 * Special key formats:
 * - "$global": Global metadata applying to all regions
 * - "prefix.*": Wildcard metadata (e.g., "cpu.*" applies to "cpu.core", "cpu.alu", etc.)
 * - "__anon:{tuple}:{stmt}": Anonymous regions (e.g., "__anon:0:0")
 * - Regular IDs: Named regions (e.g., "cpu.core", "dataloop.alu", "input_a")
 */
export type DslMap = Record<string, DslEntry>;

/**
 * Sign input data extracted from schematic
 * Used as intermediate format before Insign compilation
 */
export interface SignInput {
  /** Absolute position of the sign in the schematic [x, y, z] */
  pos: [number, number, number];
  
  /** Raw text content from the sign (may contain multiple lines) */
  text: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a region is an IO region
 */
export function isIoRegion(entry: DslEntry): boolean {
  const ioType = entry.metadata['io.type'];
  return ioType === 'i' || ioType === 'o';
}

/**
 * Check if a region is an input
 */
export function isInputRegion(entry: DslEntry): boolean {
  return entry.metadata['io.type'] === 'i';
}

/**
 * Check if a region is an output
 */
export function isOutputRegion(entry: DslEntry): boolean {
  return entry.metadata['io.type'] === 'o';
}

/**
 * Get all positions within a bounding box
 */
export function* iterateBoxPositions(box: BoxPair): Generator<[number, number, number]> {
  const [[x1, y1, z1], [x2, y2, z2]] = box;
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      for (let z = z1; z <= z2; z++) {
        yield [x, y, z];
      }
    }
  }
}

/**
 * Get the center point of a bounding box
 */
export function getBoxCenter(box: BoxPair): [number, number, number] {
  const [[x1, y1, z1], [x2, y2, z2]] = box;
  return [
    (x1 + x2) / 2,
    (y1 + y2) / 2,
    (z1 + z2) / 2
  ];
}

/**
 * Get the dimensions of a bounding box
 */
export function getBoxDimensions(box: BoxPair): [number, number, number] {
  const [[x1, y1, z1], [x2, y2, z2]] = box;
  return [
    Math.abs(x2 - x1) + 1,
    Math.abs(y2 - y1) + 1,
    Math.abs(z2 - z1) + 1
  ];
}

/**
 * Check if a region is anonymous
 */
export function isAnonymousRegion(regionId: string): boolean {
  return regionId.startsWith('__anon:');
}

/**
 * Check if a region is a wildcard
 */
export function isWildcardRegion(regionId: string): boolean {
  return regionId.endsWith('.*');
}

/**
 * Check if a region is global
 */
export function isGlobalRegion(regionId: string): boolean {
  return regionId === '$global';
}

/**
 * Check if a region is a named region (not special)
 */
export function isNamedRegion(regionId: string): boolean {
  return !isAnonymousRegion(regionId) &&
         !isWildcardRegion(regionId) &&
         !isGlobalRegion(regionId);
}

