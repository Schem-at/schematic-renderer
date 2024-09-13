/* tslint:disable */
/* eslint-disable */
/**
*/
export function start(): void;
/**
* @param {SchematicWrapper} schematic
* @returns {string}
*/
export function debug_schematic(schematic: SchematicWrapper): string;
/**
* @param {SchematicWrapper} schematic
* @returns {string}
*/
export function debug_json_schematic(schematic: SchematicWrapper): string;
/**
*/
export class BlockPosition {
  free(): void;
/**
* @param {number} x
* @param {number} y
* @param {number} z
*/
  constructor(x: number, y: number, z: number);
/**
*/
  x: number;
/**
*/
  y: number;
/**
*/
  z: number;
}
/**
*/
export class BlockStateWrapper {
  free(): void;
/**
* @param {string} name
*/
  constructor(name: string);
/**
* @param {string} key
* @param {string} value
*/
  with_property(key: string, value: string): void;
/**
* @returns {string}
*/
  name(): string;
/**
* @returns {any}
*/
  properties(): any;
}
/**
*/
export class SchematicWrapper {
  free(): void;
/**
*/
  constructor();
/**
* @param {Uint8Array} data
*/
  from_data(data: Uint8Array): void;
/**
* @param {Uint8Array} data
*/
  from_litematic(data: Uint8Array): void;
/**
* @returns {Uint8Array}
*/
  to_litematic(): Uint8Array;
/**
* @param {Uint8Array} data
*/
  from_schematic(data: Uint8Array): void;
/**
* @returns {Uint8Array}
*/
  to_schematic(): Uint8Array;
/**
* @param {number} x
* @param {number} y
* @param {number} z
* @param {string} block_name
*/
  set_block(x: number, y: number, z: number, block_name: string): void;
/**
* @param {number} x
* @param {number} y
* @param {number} z
* @returns {string | undefined}
*/
  get_block(x: number, y: number, z: number): string | undefined;
/**
* @param {number} x
* @param {number} y
* @param {number} z
* @returns {BlockStateWrapper | undefined}
*/
  get_block_with_properties(x: number, y: number, z: number): BlockStateWrapper | undefined;
/**
* @param {number} x
* @param {number} y
* @param {number} z
* @returns {any}
*/
  get_block_entity(x: number, y: number, z: number): any;
/**
* @returns {any}
*/
  get_all_block_entities(): any;
/**
* @returns {string}
*/
  print_schematic(): string;
/**
* @returns {string}
*/
  debug_info(): string;
/**
* @returns {Int32Array}
*/
  get_dimensions(): Int32Array;
/**
* @returns {number}
*/
  get_block_count(): number;
/**
* @returns {number}
*/
  get_volume(): number;
/**
* @returns {(string)[]}
*/
  get_region_names(): (string)[];
/**
* @returns {Array<any>}
*/
  blocks(): Array<any>;
/**
* @param {number} chunk_width
* @param {number} chunk_height
* @param {number} chunk_length
* @returns {Array<any>}
*/
  chunks(chunk_width: number, chunk_height: number, chunk_length: number): Array<any>;
/**
* @param {number} offset_x
* @param {number} offset_y
* @param {number} offset_z
* @param {number} width
* @param {number} height
* @param {number} length
* @returns {Array<any>}
*/
  get_chunk_blocks(offset_x: number, offset_y: number, offset_z: number, width: number, height: number, length: number): Array<any>;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_blockposition_free: (a: number, b: number) => void;
  readonly __wbg_get_blockposition_x: (a: number) => number;
  readonly __wbg_set_blockposition_x: (a: number, b: number) => void;
  readonly __wbg_get_blockposition_y: (a: number) => number;
  readonly __wbg_set_blockposition_y: (a: number, b: number) => void;
  readonly __wbg_get_blockposition_z: (a: number) => number;
  readonly __wbg_set_blockposition_z: (a: number, b: number) => void;
  readonly blockposition_new: (a: number, b: number, c: number) => number;
  readonly __wbg_schematicwrapper_free: (a: number, b: number) => void;
  readonly schematicwrapper_new: () => number;
  readonly schematicwrapper_from_data: (a: number, b: number, c: number, d: number) => void;
  readonly schematicwrapper_from_litematic: (a: number, b: number, c: number, d: number) => void;
  readonly schematicwrapper_to_litematic: (a: number, b: number) => void;
  readonly schematicwrapper_from_schematic: (a: number, b: number, c: number, d: number) => void;
  readonly schematicwrapper_to_schematic: (a: number, b: number) => void;
  readonly schematicwrapper_set_block: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly schematicwrapper_get_block: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly schematicwrapper_get_block_with_properties: (a: number, b: number, c: number, d: number) => number;
  readonly schematicwrapper_get_block_entity: (a: number, b: number, c: number, d: number) => number;
  readonly schematicwrapper_get_all_block_entities: (a: number) => number;
  readonly schematicwrapper_print_schematic: (a: number, b: number) => void;
  readonly schematicwrapper_debug_info: (a: number, b: number) => void;
  readonly schematicwrapper_get_dimensions: (a: number, b: number) => void;
  readonly schematicwrapper_get_block_count: (a: number) => number;
  readonly schematicwrapper_get_volume: (a: number) => number;
  readonly schematicwrapper_get_region_names: (a: number, b: number) => void;
  readonly schematicwrapper_blocks: (a: number) => number;
  readonly schematicwrapper_chunks: (a: number, b: number, c: number, d: number) => number;
  readonly schematicwrapper_get_chunk_blocks: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
  readonly __wbg_blockstatewrapper_free: (a: number, b: number) => void;
  readonly blockstatewrapper_new: (a: number, b: number) => number;
  readonly blockstatewrapper_with_property: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly blockstatewrapper_name: (a: number, b: number) => void;
  readonly blockstatewrapper_properties: (a: number) => number;
  readonly debug_schematic: (a: number, b: number) => void;
  readonly debug_json_schematic: (a: number, b: number) => void;
  readonly start: () => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
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
