/* tslint:disable */
/* eslint-disable */
/**
 * Initialize the WASM module with better panic messages
 */
export function init(): void;
/**
 * Get the version of the mesh builder
 */
export function get_version(): string;
/**
 * Main mesh builder that holds palette data and performs chunk building
 */
export class MeshBuilder {
	free(): void;
	[Symbol.dispose](): void;
	constructor();
	/**
	 * Enable or disable voxel-based ambient occlusion (Minecraft-style smooth lighting)
	 */
	set_voxel_ao(enabled: boolean): void;
	/**
	 * Enable batch mode - chunks will be accumulated instead of returned immediately
	 */
	start_batch(): void;
	/**
	 * Disable batch mode and return all accumulated geometry
	 */
	finish_batch(): any;
	/**
	 * Clear accumulators without returning data
	 */
	clear_batch(): void;
	/**
	 * Get batch mode status
	 */
	is_batch_mode(): boolean;
	/**
	 * Update palette with geometry data from JavaScript
	 * palette_data is an array of objects with: { index, occlusionFlags, category, geometries: [...] }
	 */
	update_palette(palette_data: Array<any>): void;
	/**
	 * Build a chunk mesh from block data
	 *
	 * blocks: Int32Array with [x, y, z, paletteIndex] for each block
	 * chunk_origin: [originX, originY, originZ]
	 *
	 * Returns a JavaScript object with the merged mesh data
	 */
	build_chunk(blocks: Int32Array, origin_x: number, origin_y: number, origin_z: number): any;
	/**
	 * Build a chunk mesh with greedy meshing optimization
	 *
	 * This merges coplanar faces of the same material into larger quads,
	 * dramatically reducing vertex count for large flat surfaces.
	 */
	build_chunk_greedy(blocks: Int32Array, origin_x: number, origin_y: number, origin_z: number): any;
}
/**
 * Palette geometry entry - stores precomputed geometry for a block type
 */
export class PaletteEntry {
	free(): void;
	[Symbol.dispose](): void;
	constructor(
		index: number,
		occlusion_flags: number,
		positions: Float32Array,
		normals: Float32Array,
		uvs: Float32Array,
		indices: Uint32Array,
		material_index: number
	);
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
	readonly memory: WebAssembly.Memory;
	readonly init: () => void;
	readonly __wbg_paletteentry_free: (a: number, b: number) => void;
	readonly paletteentry_new: (
		a: number,
		b: number,
		c: any,
		d: any,
		e: any,
		f: any,
		g: number
	) => number;
	readonly __wbg_meshbuilder_free: (a: number, b: number) => void;
	readonly meshbuilder_new: () => number;
	readonly meshbuilder_set_voxel_ao: (a: number, b: number) => void;
	readonly meshbuilder_start_batch: (a: number) => void;
	readonly meshbuilder_finish_batch: (a: number) => [number, number, number];
	readonly meshbuilder_clear_batch: (a: number) => void;
	readonly meshbuilder_is_batch_mode: (a: number) => number;
	readonly meshbuilder_update_palette: (a: number, b: any) => void;
	readonly meshbuilder_build_chunk: (
		a: number,
		b: any,
		c: number,
		d: number,
		e: number
	) => [number, number, number];
	readonly meshbuilder_build_chunk_greedy: (
		a: number,
		b: any,
		c: number,
		d: number,
		e: number
	) => [number, number, number];
	readonly get_version: () => [number, number];
	readonly __wbindgen_malloc: (a: number, b: number) => number;
	readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
	readonly __wbindgen_free: (a: number, b: number, c: number) => void;
	readonly __wbindgen_exn_store: (a: number) => void;
	readonly __externref_table_alloc: () => number;
	readonly __wbindgen_externrefs: WebAssembly.Table;
	readonly __externref_table_dealloc: (a: number) => void;
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
export default function __wbg_init(
	module_or_path?:
		| { module_or_path: InitInput | Promise<InitInput> }
		| InitInput
		| Promise<InitInput>
): Promise<InitOutput>;
