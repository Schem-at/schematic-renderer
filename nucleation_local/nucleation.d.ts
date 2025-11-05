/* tslint:disable */
/* eslint-disable */
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
  optimize: boolean;
  io_only: boolean;
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
  readonly schematicwrapper_get_block: (a: number, b: number, c: number, d: number) => [number, number];
  readonly schematicwrapper_get_block_string: (a: number, b: number, c: number, d: number) => [number, number];
  readonly schematicwrapper_get_block_with_properties: (a: number, b: number, c: number, d: number) => number;
  readonly schematicwrapper_get_block_entity: (a: number, b: number, c: number, d: number) => any;
  readonly schematicwrapper_get_all_block_entities: (a: number) => any;
  readonly schematicwrapper_print_schematic: (a: number) => [number, number];
  readonly schematicwrapper_debug_info: (a: number) => [number, number];
  readonly schematicwrapper_get_dimensions: (a: number) => [number, number];
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
  readonly __wbg_simulationoptionswrapper_free: (a: number, b: number) => void;
  readonly simulationoptionswrapper_new: () => number;
  readonly simulationoptionswrapper_optimize: (a: number) => number;
  readonly simulationoptionswrapper_set_optimize: (a: number, b: number) => void;
  readonly simulationoptionswrapper_io_only: (a: number) => number;
  readonly simulationoptionswrapper_set_io_only: (a: number, b: number) => void;
  readonly __wbg_mchprsworldwrapper_free: (a: number, b: number) => void;
  readonly mchprsworldwrapper_new: (a: number) => [number, number, number];
  readonly mchprsworldwrapper_with_options: (a: number, b: number) => [number, number, number];
  readonly mchprsworldwrapper_on_use_block: (a: number, b: number, c: number, d: number) => void;
  readonly mchprsworldwrapper_tick: (a: number, b: number) => void;
  readonly mchprsworldwrapper_flush: (a: number) => void;
  readonly mchprsworldwrapper_is_lit: (a: number, b: number, c: number, d: number) => number;
  readonly mchprsworldwrapper_get_lever_power: (a: number, b: number, c: number, d: number) => number;
  readonly mchprsworldwrapper_get_redstone_power: (a: number, b: number, c: number, d: number) => number;
  readonly mchprsworldwrapper_get_truth_table: (a: number) => any;
  readonly mchprsworldwrapper_sync_to_schematic: (a: number) => void;
  readonly mchprsworldwrapper_get_schematic: (a: number) => number;
  readonly mchprsworldwrapper_into_schematic: (a: number) => number;
  readonly schematicwrapper_create_simulation_world: (a: number) => [number, number, number];
  readonly start: () => void;
  readonly schematicwrapper_create_simulation_world_with_options: (a: number, b: number) => [number, number, number];
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
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
