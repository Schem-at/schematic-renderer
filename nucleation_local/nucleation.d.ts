/* tslint:disable */
/* eslint-disable */
/**
 * Initialize WASM module with panic hook for better error messages
 */
export function start(): void;
export function debug_schematic(schematic: SchematicWrapper): string;
export function debug_json_schematic(schematic: SchematicWrapper): string;
export class BlockPosition {
  free(): void;
  [Symbol.dispose](): void;
  constructor(x: number, y: number, z: number);
  x: number;
  y: number;
  z: number;
}
export class BlockStateWrapper {
  free(): void;
  [Symbol.dispose](): void;
  constructor(name: string);
  with_property(key: string, value: string): void;
  name(): string;
  properties(): any;
}
/**
 * ExecutionMode for circuit execution
 */
export class ExecutionModeWrapper {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Run for a fixed number of ticks
   */
  static fixedTicks(ticks: number): ExecutionModeWrapper;
  /**
   * Run until an output meets a condition
   */
  static untilCondition(output_name: string, condition: OutputConditionWrapper, max_ticks: number, check_interval: number): ExecutionModeWrapper;
  /**
   * Run until any output changes
   */
  static untilChange(max_ticks: number, check_interval: number): ExecutionModeWrapper;
  /**
   * Run until outputs are stable
   */
  static untilStable(stable_ticks: number, max_ticks: number): ExecutionModeWrapper;
}
/**
 * IoLayoutBuilder for JavaScript
 */
export class IoLayoutBuilderWrapper {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Create a new IO layout builder
   */
  constructor();
  /**
   * Add an input
   */
  addInput(name: string, io_type: IoTypeWrapper, layout: LayoutFunctionWrapper, positions: any[]): IoLayoutBuilderWrapper;
  /**
   * Add an output
   */
  addOutput(name: string, io_type: IoTypeWrapper, layout: LayoutFunctionWrapper, positions: any[]): IoLayoutBuilderWrapper;
  /**
   * Add an input with automatic layout inference
   */
  addInputAuto(name: string, io_type: IoTypeWrapper, positions: any[]): IoLayoutBuilderWrapper;
  /**
   * Add an output with automatic layout inference
   */
  addOutputAuto(name: string, io_type: IoTypeWrapper, positions: any[]): IoLayoutBuilderWrapper;
  /**
   * Build the IO layout
   */
  build(): IoLayoutWrapper;
}
/**
 * IoLayout wrapper for JavaScript
 */
export class IoLayoutWrapper {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get input names
   */
  inputNames(): string[];
  /**
   * Get output names
   */
  outputNames(): string[];
}
/**
 * IoType builder for JavaScript
 */
export class IoTypeWrapper {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Create an unsigned integer type
   */
  static unsignedInt(bits: number): IoTypeWrapper;
  /**
   * Create a signed integer type
   */
  static signedInt(bits: number): IoTypeWrapper;
  /**
   * Create a Float32 type
   */
  static float32(): IoTypeWrapper;
  /**
   * Create a Boolean type
   */
  static boolean(): IoTypeWrapper;
  /**
   * Create an ASCII string type
   */
  static ascii(chars: number): IoTypeWrapper;
}
/**
 * LayoutFunction builder for JavaScript
 */
export class LayoutFunctionWrapper {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * One bit per position (0 or 15)
   */
  static oneToOne(): LayoutFunctionWrapper;
  /**
   * Four bits per position (0-15)
   */
  static packed4(): LayoutFunctionWrapper;
  /**
   * Custom bit-to-position mapping
   */
  static custom(mapping: Uint32Array): LayoutFunctionWrapper;
  /**
   * Row-major 2D layout
   */
  static rowMajor(rows: number, cols: number, bits_per_element: number): LayoutFunctionWrapper;
  /**
   * Column-major 2D layout
   */
  static columnMajor(rows: number, cols: number, bits_per_element: number): LayoutFunctionWrapper;
  /**
   * Scanline layout for screens
   */
  static scanline(width: number, height: number, bits_per_pixel: number): LayoutFunctionWrapper;
}
export class LazyChunkIterator {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get the next chunk on-demand (generates it fresh, doesn't store it)
   */
  next(): any;
  has_next(): boolean;
  total_chunks(): number;
  current_position(): number;
  reset(): void;
  skip_to(index: number): void;
}
export class MchprsWorldWrapper {
  free(): void;
  [Symbol.dispose](): void;
  constructor(schematic: SchematicWrapper);
  /**
   * Creates a simulation world with custom options
   */
  static with_options(schematic: SchematicWrapper, options: SimulationOptionsWrapper): MchprsWorldWrapper;
  /**
   * Simulates a right-click on a block (typically a lever)
   */
  on_use_block(x: number, y: number, z: number): void;
  /**
   * Advances the simulation by the specified number of ticks
   */
  tick(number_of_ticks: number): void;
  /**
   * Flushes pending changes from the compiler to the world
   */
  flush(): void;
  /**
   * Checks if a redstone lamp is lit at the given position
   */
  is_lit(x: number, y: number, z: number): boolean;
  /**
   * Gets the power state of a lever
   */
  get_lever_power(x: number, y: number, z: number): boolean;
  /**
   * Gets the redstone power level at a position
   */
  get_redstone_power(x: number, y: number, z: number): number;
  /**
   * Sets the signal strength at a specific block position (for custom IO nodes)
   */
  setSignalStrength(x: number, y: number, z: number, strength: number): void;
  /**
   * Gets the signal strength at a specific block position (for custom IO nodes)
   */
  getSignalStrength(x: number, y: number, z: number): number;
  /**
   * Check for custom IO state changes and queue them
   * Call this after tick() or setSignalStrength() to detect changes
   */
  checkCustomIoChanges(): void;
  /**
   * Get and clear all custom IO changes since last poll
   * Returns an array of change objects with {x, y, z, oldPower, newPower}
   */
  pollCustomIoChanges(): any;
  /**
   * Get custom IO changes without clearing the queue
   */
  peekCustomIoChanges(): any;
  /**
   * Clear all queued custom IO changes
   */
  clearCustomIoChanges(): void;
  /**
   * Generates a truth table for the circuit
   *
   * Returns an array of objects with keys like "Input 0", "Output 0", etc.
   */
  get_truth_table(): any;
  /**
   * Syncs the current simulation state back to the underlying schematic
   *
   * Call this after running simulation to update block states (redstone power, lever states, etc.)
   */
  sync_to_schematic(): void;
  /**
   * Gets a copy of the underlying schematic
   *
   * Note: Call sync_to_schematic() first if you want the latest simulation state
   */
  get_schematic(): SchematicWrapper;
  /**
   * Consumes the simulation world and returns the schematic with simulation state
   *
   * This automatically syncs before returning
   */
  into_schematic(): SchematicWrapper;
}
/**
 * OutputCondition for conditional execution
 */
export class OutputConditionWrapper {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Output equals a value
   */
  static equals(value: ValueWrapper): OutputConditionWrapper;
  /**
   * Output not equals a value
   */
  static notEquals(value: ValueWrapper): OutputConditionWrapper;
  /**
   * Output greater than a value
   */
  static greaterThan(value: ValueWrapper): OutputConditionWrapper;
  /**
   * Output less than a value
   */
  static lessThan(value: ValueWrapper): OutputConditionWrapper;
  /**
   * Bitwise AND with mask
   */
  static bitwiseAnd(mask: number): OutputConditionWrapper;
}
/**
 * SchematicBuilder for creating schematics from ASCII art
 */
export class SchematicBuilderWrapper {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Create a new schematic builder with standard palette
   */
  constructor();
  /**
   * Set the name of the schematic
   */
  name(name: string): SchematicBuilderWrapper;
  /**
   * Map a character to a block string
   */
  map(ch: string, block: string): SchematicBuilderWrapper;
  /**
   * Build the schematic
   */
  build(): SchematicWrapper;
  /**
   * Create from template string
   */
  static fromTemplate(template: string): SchematicBuilderWrapper;
}
export class SchematicWrapper {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  from_data(data: Uint8Array): void;
  from_litematic(data: Uint8Array): void;
  to_litematic(): Uint8Array;
  from_schematic(data: Uint8Array): void;
  to_schematic(): Uint8Array;
  to_schematic_version(version: string): Uint8Array;
  get_available_schematic_versions(): Array<any>;
  get_palette(): any;
  get_default_region_palette(): any;
  get_palette_from_region(region_name: string): any;
  get_bounding_box(): any;
  get_region_bounding_box(region_name: string): any;
  set_block(x: number, y: number, z: number, block_name: string): void;
  copy_region(from_schematic: SchematicWrapper, min_x: number, min_y: number, min_z: number, max_x: number, max_y: number, max_z: number, target_x: number, target_y: number, target_z: number, excluded_blocks: any): void;
  set_block_with_properties(x: number, y: number, z: number, block_name: string, properties: any): void;
  setBlockWithNbt(x: number, y: number, z: number, block_name: string, nbt_data: any): void;
  get_block(x: number, y: number, z: number): string | undefined;
  /**
   * Get block as formatted string with properties (e.g., "minecraft:lever[powered=true,facing=north]")
   */
  get_block_string(x: number, y: number, z: number): string | undefined;
  get_block_with_properties(x: number, y: number, z: number): BlockStateWrapper | undefined;
  get_block_entity(x: number, y: number, z: number): any;
  get_all_block_entities(): any;
  print_schematic(): string;
  debug_info(): string;
  get_dimensions(): Int32Array;
  /**
   * Get the allocated dimensions (full buffer size including pre-allocated space)
   * Use this if you need to know the internal buffer size
   */
  get_allocated_dimensions(): Int32Array;
  /**
   * Get the tight dimensions of actual block content (excluding pre-allocated space)
   * Returns [width, height, length] or [0, 0, 0] if no non-air blocks exist
   */
  get_tight_dimensions(): Int32Array;
  /**
   * Get the tight bounding box min coordinates [x, y, z]
   * Returns null if no non-air blocks have been placed
   */
  get_tight_bounds_min(): Int32Array | undefined;
  /**
   * Get the tight bounding box max coordinates [x, y, z]
   * Returns null if no non-air blocks have been placed
   */
  get_tight_bounds_max(): Int32Array | undefined;
  get_block_count(): number;
  get_volume(): number;
  get_region_names(): string[];
  blocks(): Array<any>;
  chunks(chunk_width: number, chunk_height: number, chunk_length: number): Array<any>;
  chunks_with_strategy(chunk_width: number, chunk_height: number, chunk_length: number, strategy: string, camera_x: number, camera_y: number, camera_z: number): Array<any>;
  get_chunk_blocks(offset_x: number, offset_y: number, offset_z: number, width: number, height: number, length: number): Array<any>;
  /**
   * Get all palettes once - eliminates repeated string transfers
   * Returns: { default: [BlockState], regions: { regionName: [BlockState] } }
   */
  get_all_palettes(): any;
  /**
   * Optimized chunks iterator that returns palette indices instead of full block data
   * Returns array of: { chunk_x, chunk_y, chunk_z, blocks: [[x,y,z,palette_index],...] }
   */
  chunks_indices(chunk_width: number, chunk_height: number, chunk_length: number): Array<any>;
  /**
   * Optimized chunks with strategy - returns palette indices
   */
  chunks_indices_with_strategy(chunk_width: number, chunk_height: number, chunk_length: number, strategy: string, camera_x: number, camera_y: number, camera_z: number): Array<any>;
  /**
   * Get specific chunk blocks as palette indices (for lazy loading individual chunks)
   * Returns array of [x, y, z, palette_index]
   */
  get_chunk_blocks_indices(offset_x: number, offset_y: number, offset_z: number, width: number, height: number, length: number): Array<any>;
  /**
   * All blocks as palette indices - for when you need everything at once but efficiently
   * Returns array of [x, y, z, palette_index]
   */
  blocks_indices(): Array<any>;
  /**
   * Get optimization stats
   */
  get_optimization_info(): any;
  create_lazy_chunk_iterator(chunk_width: number, chunk_height: number, chunk_length: number, strategy: string, camera_x: number, camera_y: number, camera_z: number): LazyChunkIterator;
  /**
   * Flip the schematic along the X axis
   */
  flip_x(): void;
  /**
   * Flip the schematic along the Y axis
   */
  flip_y(): void;
  /**
   * Flip the schematic along the Z axis
   */
  flip_z(): void;
  /**
   * Rotate the schematic around the Y axis (horizontal plane)
   * Degrees must be 90, 180, or 270
   */
  rotate_y(degrees: number): void;
  /**
   * Rotate the schematic around the X axis
   * Degrees must be 90, 180, or 270
   */
  rotate_x(degrees: number): void;
  /**
   * Rotate the schematic around the Z axis
   * Degrees must be 90, 180, or 270
   */
  rotate_z(degrees: number): void;
  /**
   * Flip a specific region along the X axis
   */
  flip_region_x(region_name: string): void;
  /**
   * Flip a specific region along the Y axis
   */
  flip_region_y(region_name: string): void;
  /**
   * Flip a specific region along the Z axis
   */
  flip_region_z(region_name: string): void;
  /**
   * Rotate a specific region around the Y axis
   */
  rotate_region_y(region_name: string, degrees: number): void;
  /**
   * Rotate a specific region around the X axis
   */
  rotate_region_x(region_name: string, degrees: number): void;
  /**
   * Rotate a specific region around the Z axis
   */
  rotate_region_z(region_name: string, degrees: number): void;
  /**
   * Extract all sign text from the schematic
   * Returns a JavaScript array of objects: [{pos: [x,y,z], text: "..."}]
   */
  extractSigns(): any;
  /**
   * Compile Insign annotations from the schematic's signs
   * Returns a JavaScript object with compiled region metadata
   * This returns raw Insign data - interpretation is up to the consumer
   */
  compileInsign(): any;
  /**
   * Creates a simulation world for this schematic with default options
   *
   * This allows you to simulate redstone circuits and interact with them.
   */
  create_simulation_world(): MchprsWorldWrapper;
  /**
   * Creates a simulation world for this schematic with custom options
   *
   * This allows you to configure simulation behavior like wire state tracking.
   */
  create_simulation_world_with_options(options: SimulationOptionsWrapper): MchprsWorldWrapper;
}
export class SimulationOptionsWrapper {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  /**
   * Adds a position to the custom IO list
   */
  addCustomIo(x: number, y: number, z: number): void;
  /**
   * Clears the custom IO list
   */
  clearCustomIo(): void;
  optimize: boolean;
  io_only: boolean;
}
/**
 * TypedCircuitExecutor wrapper for JavaScript
 */
export class TypedCircuitExecutorWrapper {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Create executor from world and layout
   */
  static fromLayout(world: MchprsWorldWrapper, layout: IoLayoutWrapper): TypedCircuitExecutorWrapper;
  /**
   * Create executor from world, layout, and options
   */
  static fromLayoutWithOptions(world: MchprsWorldWrapper, layout: IoLayoutWrapper, options: SimulationOptionsWrapper): TypedCircuitExecutorWrapper;
  /**
   * Create executor from Insign annotations in schematic
   */
  static fromInsign(schematic: SchematicWrapper): TypedCircuitExecutorWrapper;
  /**
   * Create executor from Insign annotations with custom simulation options
   */
  static fromInsignWithOptions(schematic: SchematicWrapper, options: SimulationOptionsWrapper): TypedCircuitExecutorWrapper;
  /**
   * Set state mode
   */
  setStateMode(mode: string): void;
  /**
   * Reset the simulation
   */
  reset(): void;
  /**
   * Execute the circuit
   */
  execute(inputs: any, mode: ExecutionModeWrapper): any;
  /**
   * Sync the simulation state back to the schematic
   *
   * Call this after execute() to update the schematic with the current simulation state.
   * Returns the updated schematic.
   */
  syncToSchematic(): SchematicWrapper;
}
/**
 * JavaScript-compatible Value wrapper
 */
export class ValueWrapper {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Create a U32 value
   */
  static fromU32(value: number): ValueWrapper;
  /**
   * Create an I32 value
   */
  static fromI32(value: number): ValueWrapper;
  /**
   * Create an F32 value
   */
  static fromF32(value: number): ValueWrapper;
  /**
   * Create a Bool value
   */
  static fromBool(value: boolean): ValueWrapper;
  /**
   * Create a String value
   */
  static fromString(value: string): ValueWrapper;
  /**
   * Convert to JavaScript value
   */
  toJs(): any;
  /**
   * Get type name
   */
  typeName(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_lazychunkiterator_free: (a: number, b: number) => void;
  readonly __wbg_schematicwrapper_free: (a: number, b: number) => void;
  readonly __wbg_blockstatewrapper_free: (a: number, b: number) => void;
  readonly schematicwrapper_new: () => number;
  readonly schematicwrapper_from_data: (a: number, b: number, c: number) => [number, number];
  readonly schematicwrapper_from_litematic: (a: number, b: number, c: number) => [number, number];
  readonly schematicwrapper_to_litematic: (a: number) => [number, number, number, number];
  readonly schematicwrapper_from_schematic: (a: number, b: number, c: number) => [number, number];
  readonly schematicwrapper_to_schematic: (a: number) => [number, number, number, number];
  readonly schematicwrapper_to_schematic_version: (a: number, b: number, c: number) => [number, number, number, number];
  readonly schematicwrapper_get_available_schematic_versions: (a: number) => any;
  readonly schematicwrapper_get_palette: (a: number) => any;
  readonly schematicwrapper_get_default_region_palette: (a: number) => any;
  readonly schematicwrapper_get_palette_from_region: (a: number, b: number, c: number) => any;
  readonly schematicwrapper_get_bounding_box: (a: number) => any;
  readonly schematicwrapper_get_region_bounding_box: (a: number, b: number, c: number) => any;
  readonly schematicwrapper_set_block: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly schematicwrapper_copy_region: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: any) => [number, number];
  readonly schematicwrapper_set_block_with_properties: (a: number, b: number, c: number, d: number, e: number, f: number, g: any) => [number, number];
  readonly schematicwrapper_setBlockWithNbt: (a: number, b: number, c: number, d: number, e: number, f: number, g: any) => [number, number];
  readonly schematicwrapper_get_block: (a: number, b: number, c: number, d: number) => [number, number];
  readonly schematicwrapper_get_block_string: (a: number, b: number, c: number, d: number) => [number, number];
  readonly schematicwrapper_get_block_with_properties: (a: number, b: number, c: number, d: number) => number;
  readonly schematicwrapper_get_block_entity: (a: number, b: number, c: number, d: number) => any;
  readonly schematicwrapper_get_all_block_entities: (a: number) => any;
  readonly schematicwrapper_print_schematic: (a: number) => [number, number];
  readonly schematicwrapper_debug_info: (a: number) => [number, number];
  readonly schematicwrapper_get_dimensions: (a: number) => [number, number];
  readonly schematicwrapper_get_allocated_dimensions: (a: number) => [number, number];
  readonly schematicwrapper_get_tight_dimensions: (a: number) => [number, number];
  readonly schematicwrapper_get_tight_bounds_min: (a: number) => [number, number];
  readonly schematicwrapper_get_tight_bounds_max: (a: number) => [number, number];
  readonly schematicwrapper_get_block_count: (a: number) => number;
  readonly schematicwrapper_get_volume: (a: number) => number;
  readonly schematicwrapper_get_region_names: (a: number) => [number, number];
  readonly schematicwrapper_blocks: (a: number) => any;
  readonly schematicwrapper_chunks: (a: number, b: number, c: number, d: number) => any;
  readonly schematicwrapper_chunks_with_strategy: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => any;
  readonly schematicwrapper_get_chunk_blocks: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly schematicwrapper_get_all_palettes: (a: number) => any;
  readonly schematicwrapper_chunks_indices: (a: number, b: number, c: number, d: number) => any;
  readonly schematicwrapper_chunks_indices_with_strategy: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => any;
  readonly schematicwrapper_get_chunk_blocks_indices: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly schematicwrapper_blocks_indices: (a: number) => any;
  readonly schematicwrapper_get_optimization_info: (a: number) => any;
  readonly schematicwrapper_create_lazy_chunk_iterator: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
  readonly schematicwrapper_flip_x: (a: number) => void;
  readonly schematicwrapper_flip_y: (a: number) => void;
  readonly schematicwrapper_flip_z: (a: number) => void;
  readonly schematicwrapper_rotate_y: (a: number, b: number) => void;
  readonly schematicwrapper_rotate_x: (a: number, b: number) => void;
  readonly schematicwrapper_rotate_z: (a: number, b: number) => void;
  readonly schematicwrapper_flip_region_x: (a: number, b: number, c: number) => [number, number];
  readonly schematicwrapper_flip_region_y: (a: number, b: number, c: number) => [number, number];
  readonly schematicwrapper_flip_region_z: (a: number, b: number, c: number) => [number, number];
  readonly schematicwrapper_rotate_region_y: (a: number, b: number, c: number, d: number) => [number, number];
  readonly schematicwrapper_rotate_region_x: (a: number, b: number, c: number, d: number) => [number, number];
  readonly schematicwrapper_rotate_region_z: (a: number, b: number, c: number, d: number) => [number, number];
  readonly lazychunkiterator_next: (a: number) => any;
  readonly lazychunkiterator_has_next: (a: number) => number;
  readonly lazychunkiterator_total_chunks: (a: number) => number;
  readonly lazychunkiterator_current_position: (a: number) => number;
  readonly lazychunkiterator_reset: (a: number) => void;
  readonly lazychunkiterator_skip_to: (a: number, b: number) => void;
  readonly blockstatewrapper_new: (a: number, b: number) => number;
  readonly blockstatewrapper_with_property: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly blockstatewrapper_name: (a: number) => [number, number];
  readonly blockstatewrapper_properties: (a: number) => any;
  readonly debug_schematic: (a: number) => [number, number];
  readonly debug_json_schematic: (a: number) => [number, number];
  readonly schematicwrapper_extractSigns: (a: number) => any;
  readonly schematicwrapper_compileInsign: (a: number) => [number, number, number];
  readonly __wbg_simulationoptionswrapper_free: (a: number, b: number) => void;
  readonly simulationoptionswrapper_new: () => number;
  readonly simulationoptionswrapper_optimize: (a: number) => number;
  readonly simulationoptionswrapper_set_optimize: (a: number, b: number) => void;
  readonly simulationoptionswrapper_io_only: (a: number) => number;
  readonly simulationoptionswrapper_set_io_only: (a: number, b: number) => void;
  readonly simulationoptionswrapper_addCustomIo: (a: number, b: number, c: number, d: number) => void;
  readonly simulationoptionswrapper_clearCustomIo: (a: number) => void;
  readonly __wbg_mchprsworldwrapper_free: (a: number, b: number) => void;
  readonly mchprsworldwrapper_new: (a: number) => [number, number, number];
  readonly mchprsworldwrapper_with_options: (a: number, b: number) => [number, number, number];
  readonly mchprsworldwrapper_on_use_block: (a: number, b: number, c: number, d: number) => void;
  readonly mchprsworldwrapper_tick: (a: number, b: number) => void;
  readonly mchprsworldwrapper_flush: (a: number) => void;
  readonly mchprsworldwrapper_is_lit: (a: number, b: number, c: number, d: number) => number;
  readonly mchprsworldwrapper_get_lever_power: (a: number, b: number, c: number, d: number) => number;
  readonly mchprsworldwrapper_get_redstone_power: (a: number, b: number, c: number, d: number) => number;
  readonly mchprsworldwrapper_setSignalStrength: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly mchprsworldwrapper_getSignalStrength: (a: number, b: number, c: number, d: number) => number;
  readonly mchprsworldwrapper_checkCustomIoChanges: (a: number) => void;
  readonly mchprsworldwrapper_pollCustomIoChanges: (a: number) => any;
  readonly mchprsworldwrapper_peekCustomIoChanges: (a: number) => any;
  readonly mchprsworldwrapper_clearCustomIoChanges: (a: number) => void;
  readonly mchprsworldwrapper_get_truth_table: (a: number) => any;
  readonly mchprsworldwrapper_sync_to_schematic: (a: number) => void;
  readonly mchprsworldwrapper_get_schematic: (a: number) => number;
  readonly mchprsworldwrapper_into_schematic: (a: number) => number;
  readonly __wbg_valuewrapper_free: (a: number, b: number) => void;
  readonly valuewrapper_fromU32: (a: number) => number;
  readonly valuewrapper_fromI32: (a: number) => number;
  readonly valuewrapper_fromF32: (a: number) => number;
  readonly valuewrapper_fromBool: (a: number) => number;
  readonly valuewrapper_fromString: (a: number, b: number) => number;
  readonly valuewrapper_toJs: (a: number) => any;
  readonly valuewrapper_typeName: (a: number) => [number, number];
  readonly __wbg_iotypewrapper_free: (a: number, b: number) => void;
  readonly iotypewrapper_unsignedInt: (a: number) => number;
  readonly iotypewrapper_signedInt: (a: number) => number;
  readonly iotypewrapper_float32: () => number;
  readonly iotypewrapper_boolean: () => number;
  readonly iotypewrapper_ascii: (a: number) => number;
  readonly __wbg_layoutfunctionwrapper_free: (a: number, b: number) => void;
  readonly layoutfunctionwrapper_oneToOne: () => number;
  readonly layoutfunctionwrapper_packed4: () => number;
  readonly layoutfunctionwrapper_custom: (a: number, b: number) => number;
  readonly layoutfunctionwrapper_rowMajor: (a: number, b: number, c: number) => number;
  readonly layoutfunctionwrapper_columnMajor: (a: number, b: number, c: number) => number;
  readonly layoutfunctionwrapper_scanline: (a: number, b: number, c: number) => number;
  readonly __wbg_outputconditionwrapper_free: (a: number, b: number) => void;
  readonly outputconditionwrapper_equals: (a: number) => number;
  readonly outputconditionwrapper_notEquals: (a: number) => number;
  readonly outputconditionwrapper_greaterThan: (a: number) => number;
  readonly outputconditionwrapper_lessThan: (a: number) => number;
  readonly outputconditionwrapper_bitwiseAnd: (a: number) => number;
  readonly __wbg_executionmodewrapper_free: (a: number, b: number) => void;
  readonly executionmodewrapper_fixedTicks: (a: number) => number;
  readonly executionmodewrapper_untilCondition: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly executionmodewrapper_untilChange: (a: number, b: number) => number;
  readonly executionmodewrapper_untilStable: (a: number, b: number) => number;
  readonly __wbg_iolayoutbuilderwrapper_free: (a: number, b: number) => void;
  readonly iolayoutbuilderwrapper_new: () => number;
  readonly iolayoutbuilderwrapper_addInput: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
  readonly iolayoutbuilderwrapper_addOutput: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
  readonly iolayoutbuilderwrapper_addInputAuto: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly iolayoutbuilderwrapper_addOutputAuto: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly iolayoutbuilderwrapper_build: (a: number) => number;
  readonly __wbg_iolayoutwrapper_free: (a: number, b: number) => void;
  readonly iolayoutwrapper_inputNames: (a: number) => [number, number];
  readonly iolayoutwrapper_outputNames: (a: number) => [number, number];
  readonly __wbg_typedcircuitexecutorwrapper_free: (a: number, b: number) => void;
  readonly typedcircuitexecutorwrapper_fromLayout: (a: number, b: number) => [number, number, number];
  readonly typedcircuitexecutorwrapper_fromLayoutWithOptions: (a: number, b: number, c: number) => [number, number, number];
  readonly typedcircuitexecutorwrapper_fromInsign: (a: number) => [number, number, number];
  readonly typedcircuitexecutorwrapper_fromInsignWithOptions: (a: number, b: number) => [number, number, number];
  readonly typedcircuitexecutorwrapper_setStateMode: (a: number, b: number, c: number) => [number, number];
  readonly typedcircuitexecutorwrapper_reset: (a: number) => [number, number];
  readonly typedcircuitexecutorwrapper_execute: (a: number, b: any, c: number) => [number, number, number];
  readonly typedcircuitexecutorwrapper_syncToSchematic: (a: number) => number;
  readonly __wbg_schematicbuilderwrapper_free: (a: number, b: number) => void;
  readonly schematicbuilderwrapper_new: () => number;
  readonly schematicbuilderwrapper_name: (a: number, b: number, c: number) => number;
  readonly schematicbuilderwrapper_map: (a: number, b: number, c: number, d: number) => number;
  readonly schematicbuilderwrapper_build: (a: number) => [number, number, number];
  readonly schematicbuilderwrapper_fromTemplate: (a: number, b: number) => [number, number, number];
  readonly schematicwrapper_create_simulation_world: (a: number) => [number, number, number];
  readonly schematicwrapper_create_simulation_world_with_options: (a: number, b: number) => [number, number, number];
  readonly start: () => void;
  readonly __wbg_blockposition_free: (a: number, b: number) => void;
  readonly __wbg_get_blockposition_x: (a: number) => number;
  readonly __wbg_set_blockposition_x: (a: number, b: number) => void;
  readonly __wbg_get_blockposition_y: (a: number) => number;
  readonly __wbg_set_blockposition_y: (a: number, b: number) => void;
  readonly __wbg_get_blockposition_z: (a: number) => number;
  readonly __wbg_set_blockposition_z: (a: number, b: number) => void;
  readonly blockposition_new: (a: number, b: number, c: number) => number;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __externref_drop_slice: (a: number, b: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
