/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const init: () => void;
export const __wbg_paletteentry_free: (a: number, b: number) => void;
export const paletteentry_new: (
	a: number,
	b: number,
	c: any,
	d: any,
	e: any,
	f: any,
	g: number
) => number;
export const __wbg_meshbuilder_free: (a: number, b: number) => void;
export const meshbuilder_new: () => number;
export const meshbuilder_set_voxel_ao: (a: number, b: number) => void;
export const meshbuilder_start_batch: (a: number) => void;
export const meshbuilder_finish_batch: (a: number) => [number, number, number];
export const meshbuilder_clear_batch: (a: number) => void;
export const meshbuilder_is_batch_mode: (a: number) => number;
export const meshbuilder_update_palette: (a: number, b: any) => void;
export const meshbuilder_build_chunk: (
	a: number,
	b: any,
	c: number,
	d: number,
	e: number
) => [number, number, number];
export const meshbuilder_build_chunk_greedy: (
	a: number,
	b: any,
	c: number,
	d: number,
	e: number
) => [number, number, number];
export const get_version: () => [number, number];
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_start: () => void;
