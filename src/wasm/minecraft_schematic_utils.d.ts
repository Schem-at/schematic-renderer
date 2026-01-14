/* tslint:disable */
/* eslint-disable */
export function start(): void;
export function debug_schematic(schematic: SchematicWrapper): string;
export function debug_json_schematic(schematic: SchematicWrapper): string;
export class BlockPosition {
	free(): void;
	constructor(x: number, y: number, z: number);
	x: number;
	y: number;
	z: number;
}
export class BlockStateWrapper {
	free(): void;
	constructor(name: string);
	with_property(key: string, value: string): void;
	name(): string;
	properties(): any;
}
export class JsChunksIterator {
	free(): void;
	constructor(
		schematic_wrapper: SchematicWrapper,
		chunk_width: number,
		chunk_height: number,
		chunk_length: number
	);
	next(): any;
	countNonEmptyChunks(): number;
}
export class MchprsWorldWrapper {
	free(): void;
	constructor(schematic: SchematicWrapper);
	on_use_block(x: number, y: number, z: number): void;
	tick(number_of_ticks: number): void;
	flush(): void;
	is_lit(x: number, y: number, z: number): boolean;
	get_lever_power(x: number, y: number, z: number): boolean;
	get_redstone_power(x: number, y: number, z: number): number;
	get_truth_table(): any;
}
export class SchematicWrapper {
	free(): void;
	constructor();
	create_simulation_world(): MchprsWorldWrapper;
	from_data(data: Uint8Array): void;
	from_litematic(data: Uint8Array): void;
	to_litematic(): Uint8Array;
	from_schematic(data: Uint8Array): void;
	to_schematic(): Uint8Array;
	set_block(x: number, y: number, z: number, block_name: string): void;
	set_block_from_string(x: number, y: number, z: number, block_string: string): void;
	copy_region(
		from_schematic: SchematicWrapper,
		min_x: number,
		min_y: number,
		min_z: number,
		max_x: number,
		max_y: number,
		max_z: number,
		target_x: number,
		target_y: number,
		target_z: number,
		excluded_blocks: any
	): void;
	set_block_with_properties(
		x: number,
		y: number,
		z: number,
		block_name: string,
		properties: any
	): void;
	get_block(x: number, y: number, z: number): string | undefined;
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
	chunks(chunk_width: number, chunk_height: number, chunk_length: number): any;
	chunks_with_strategy(
		chunk_width: number,
		chunk_height: number,
		chunk_length: number,
		strategy: string,
		camera_x: number,
		camera_y: number,
		camera_z: number
	): Array<any>;
	get_chunk_blocks(
		offset_x: number,
		offset_y: number,
		offset_z: number,
		width: number,
		height: number,
		length: number
	): Array<any>;
	get_block_palette(): Array<any>;
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
	readonly __wbg_mchprsworldwrapper_free: (a: number, b: number) => void;
	readonly __wbg_blockstatewrapper_free: (a: number, b: number) => void;
	readonly __wbg_jschunksiterator_free: (a: number, b: number) => void;
	readonly jschunksiterator_new: (a: number, b: number, c: number, d: number) => number;
	readonly jschunksiterator_next: (a: number) => any;
	readonly jschunksiterator_countNonEmptyChunks: (a: number) => number;
	readonly schematicwrapper_new: () => number;
	readonly schematicwrapper_create_simulation_world: (a: number) => number;
	readonly schematicwrapper_from_data: (a: number, b: number, c: number) => [number, number];
	readonly schematicwrapper_from_litematic: (a: number, b: number, c: number) => [number, number];
	readonly schematicwrapper_to_litematic: (a: number) => [number, number, number, number];
	readonly schematicwrapper_from_schematic: (a: number, b: number, c: number) => [number, number];
	readonly schematicwrapper_to_schematic: (a: number) => [number, number, number, number];
	readonly schematicwrapper_set_block: (
		a: number,
		b: number,
		c: number,
		d: number,
		e: number,
		f: number
	) => void;
	readonly schematicwrapper_set_block_from_string: (
		a: number,
		b: number,
		c: number,
		d: number,
		e: number,
		f: number
	) => [number, number];
	readonly schematicwrapper_copy_region: (
		a: number,
		b: number,
		c: number,
		d: number,
		e: number,
		f: number,
		g: number,
		h: number,
		i: number,
		j: number,
		k: number,
		l: any
	) => [number, number];
	readonly schematicwrapper_set_block_with_properties: (
		a: number,
		b: number,
		c: number,
		d: number,
		e: number,
		f: number,
		g: any
	) => [number, number];
	readonly schematicwrapper_get_block: (
		a: number,
		b: number,
		c: number,
		d: number
	) => [number, number];
	readonly schematicwrapper_get_block_with_properties: (
		a: number,
		b: number,
		c: number,
		d: number
	) => number;
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
	readonly schematicwrapper_chunks_with_strategy: (
		a: number,
		b: number,
		c: number,
		d: number,
		e: number,
		f: number,
		g: number,
		h: number,
		i: number
	) => any;
	readonly schematicwrapper_get_chunk_blocks: (
		a: number,
		b: number,
		c: number,
		d: number,
		e: number,
		f: number,
		g: number
	) => any;
	readonly schematicwrapper_get_block_palette: (a: number) => any;
	readonly mchprsworldwrapper_new: (a: number) => [number, number, number];
	readonly mchprsworldwrapper_on_use_block: (a: number, b: number, c: number, d: number) => void;
	readonly mchprsworldwrapper_tick: (a: number, b: number) => void;
	readonly mchprsworldwrapper_flush: (a: number) => void;
	readonly mchprsworldwrapper_is_lit: (a: number, b: number, c: number, d: number) => number;
	readonly mchprsworldwrapper_get_lever_power: (
		a: number,
		b: number,
		c: number,
		d: number
	) => number;
	readonly mchprsworldwrapper_get_redstone_power: (
		a: number,
		b: number,
		c: number,
		d: number
	) => number;
	readonly mchprsworldwrapper_get_truth_table: (a: number) => any;
	readonly blockstatewrapper_new: (a: number, b: number) => number;
	readonly blockstatewrapper_with_property: (
		a: number,
		b: number,
		c: number,
		d: number,
		e: number
	) => void;
	readonly blockstatewrapper_name: (a: number) => [number, number];
	readonly blockstatewrapper_properties: (a: number) => any;
	readonly debug_schematic: (a: number) => [number, number];
	readonly debug_json_schematic: (a: number) => [number, number];
	readonly start: () => void;
	readonly __wbindgen_exn_store: (a: number) => void;
	readonly __externref_table_alloc: () => number;
	readonly __wbindgen_export_2: WebAssembly.Table;
	readonly __wbindgen_malloc: (a: number, b: number) => number;
	readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
export default function __wbg_init(
	module_or_path?:
		| { module_or_path: InitInput | Promise<InitInput> }
		| InitInput
		| Promise<InitInput>
): Promise<InitOutput>;
