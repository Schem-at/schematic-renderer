let wasm;

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

let WASM_VECTOR_LEN = 0;

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    }
}

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

export function start() {
    wasm.start();
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

let cachedInt32ArrayMemory0 = null;

function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}
/**
 * @param {SchematicWrapper} schematic
 * @returns {string}
 */
export function debug_schematic(schematic) {
    let deferred1_0;
    let deferred1_1;
    try {
        _assertClass(schematic, SchematicWrapper);
        const ret = wasm.debug_schematic(schematic.__wbg_ptr);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {SchematicWrapper} schematic
 * @returns {string}
 */
export function debug_json_schematic(schematic) {
    let deferred1_0;
    let deferred1_1;
    try {
        _assertClass(schematic, SchematicWrapper);
        const ret = wasm.debug_json_schematic(schematic.__wbg_ptr);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

const BlockPositionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_blockposition_free(ptr >>> 0, 1));

export class BlockPosition {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BlockPositionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_blockposition_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get x() {
        const ret = wasm.__wbg_get_blockposition_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set x(arg0) {
        wasm.__wbg_set_blockposition_x(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get y() {
        const ret = wasm.__wbg_get_blockposition_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set y(arg0) {
        wasm.__wbg_set_blockposition_y(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get z() {
        const ret = wasm.__wbg_get_blockposition_z(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set z(arg0) {
        wasm.__wbg_set_blockposition_z(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    constructor(x, y, z) {
        const ret = wasm.blockposition_new(x, y, z);
        this.__wbg_ptr = ret >>> 0;
        BlockPositionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) BlockPosition.prototype[Symbol.dispose] = BlockPosition.prototype.free;

const BlockStateWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_blockstatewrapper_free(ptr >>> 0, 1));

export class BlockStateWrapper {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BlockStateWrapper.prototype);
        obj.__wbg_ptr = ptr;
        BlockStateWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BlockStateWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_blockstatewrapper_free(ptr, 0);
    }
    /**
     * @param {string} name
     */
    constructor(name) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.blockstatewrapper_new(ptr0, len0);
        this.__wbg_ptr = ret >>> 0;
        BlockStateWrapperFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} key
     * @param {string} value
     */
    with_property(key, value) {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.blockstatewrapper_with_property(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * @returns {string}
     */
    name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.blockstatewrapper_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {any}
     */
    properties() {
        const ret = wasm.blockstatewrapper_properties(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) BlockStateWrapper.prototype[Symbol.dispose] = BlockStateWrapper.prototype.free;

const LazyChunkIteratorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_lazychunkiterator_free(ptr >>> 0, 1));

export class LazyChunkIterator {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(LazyChunkIterator.prototype);
        obj.__wbg_ptr = ptr;
        LazyChunkIteratorFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LazyChunkIteratorFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_lazychunkiterator_free(ptr, 0);
    }
    /**
     * Get the next chunk on-demand (generates it fresh, doesn't store it)
     * @returns {any}
     */
    next() {
        const ret = wasm.lazychunkiterator_next(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    has_next() {
        const ret = wasm.lazychunkiterator_has_next(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    total_chunks() {
        const ret = wasm.lazychunkiterator_total_chunks(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    current_position() {
        const ret = wasm.lazychunkiterator_current_position(this.__wbg_ptr);
        return ret >>> 0;
    }
    reset() {
        wasm.lazychunkiterator_reset(this.__wbg_ptr);
    }
    /**
     * @param {number} index
     */
    skip_to(index) {
        wasm.lazychunkiterator_skip_to(this.__wbg_ptr, index);
    }
}
if (Symbol.dispose) LazyChunkIterator.prototype[Symbol.dispose] = LazyChunkIterator.prototype.free;

const MchprsWorldWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_mchprsworldwrapper_free(ptr >>> 0, 1));

export class MchprsWorldWrapper {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(MchprsWorldWrapper.prototype);
        obj.__wbg_ptr = ptr;
        MchprsWorldWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MchprsWorldWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_mchprsworldwrapper_free(ptr, 0);
    }
    /**
     * @param {SchematicWrapper} schematic
     */
    constructor(schematic) {
        _assertClass(schematic, SchematicWrapper);
        const ret = wasm.mchprsworldwrapper_new(schematic.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        MchprsWorldWrapperFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Creates a simulation world with custom options
     * @param {SchematicWrapper} schematic
     * @param {SimulationOptionsWrapper} options
     * @returns {MchprsWorldWrapper}
     */
    static with_options(schematic, options) {
        _assertClass(schematic, SchematicWrapper);
        _assertClass(options, SimulationOptionsWrapper);
        const ret = wasm.mchprsworldwrapper_with_options(schematic.__wbg_ptr, options.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return MchprsWorldWrapper.__wrap(ret[0]);
    }
    /**
     * Simulates a right-click on a block (typically a lever)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    on_use_block(x, y, z) {
        wasm.mchprsworldwrapper_on_use_block(this.__wbg_ptr, x, y, z);
    }
    /**
     * Advances the simulation by the specified number of ticks
     * @param {number} number_of_ticks
     */
    tick(number_of_ticks) {
        wasm.mchprsworldwrapper_tick(this.__wbg_ptr, number_of_ticks);
    }
    /**
     * Flushes pending changes from the compiler to the world
     */
    flush() {
        wasm.mchprsworldwrapper_flush(this.__wbg_ptr);
    }
    /**
     * Checks if a redstone lamp is lit at the given position
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {boolean}
     */
    is_lit(x, y, z) {
        const ret = wasm.mchprsworldwrapper_is_lit(this.__wbg_ptr, x, y, z);
        return ret !== 0;
    }
    /**
     * Gets the power state of a lever
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {boolean}
     */
    get_lever_power(x, y, z) {
        const ret = wasm.mchprsworldwrapper_get_lever_power(this.__wbg_ptr, x, y, z);
        return ret !== 0;
    }
    /**
     * Gets the redstone power level at a position
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {number}
     */
    get_redstone_power(x, y, z) {
        const ret = wasm.mchprsworldwrapper_get_redstone_power(this.__wbg_ptr, x, y, z);
        return ret;
    }
    /**
     * Generates a truth table for the circuit
     *
     * Returns an array of objects with keys like "Input 0", "Output 0", etc.
     * @returns {any}
     */
    get_truth_table() {
        const ret = wasm.mchprsworldwrapper_get_truth_table(this.__wbg_ptr);
        return ret;
    }
    /**
     * Syncs the current simulation state back to the underlying schematic
     *
     * Call this after running simulation to update block states (redstone power, lever states, etc.)
     */
    sync_to_schematic() {
        wasm.mchprsworldwrapper_sync_to_schematic(this.__wbg_ptr);
    }
    /**
     * Gets a copy of the underlying schematic
     *
     * Note: Call sync_to_schematic() first if you want the latest simulation state
     * @returns {SchematicWrapper}
     */
    get_schematic() {
        const ret = wasm.mchprsworldwrapper_get_schematic(this.__wbg_ptr);
        return SchematicWrapper.__wrap(ret);
    }
    /**
     * Consumes the simulation world and returns the schematic with simulation state
     *
     * This automatically syncs before returning
     * @returns {SchematicWrapper}
     */
    into_schematic() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.mchprsworldwrapper_into_schematic(ptr);
        return SchematicWrapper.__wrap(ret);
    }
}
if (Symbol.dispose) MchprsWorldWrapper.prototype[Symbol.dispose] = MchprsWorldWrapper.prototype.free;

const SchematicWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_schematicwrapper_free(ptr >>> 0, 1));

export class SchematicWrapper {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(SchematicWrapper.prototype);
        obj.__wbg_ptr = ptr;
        SchematicWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SchematicWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_schematicwrapper_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.schematicwrapper_new();
        this.__wbg_ptr = ret >>> 0;
        SchematicWrapperFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {Uint8Array} data
     */
    from_data(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_from_data(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {Uint8Array} data
     */
    from_litematic(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_from_litematic(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    to_litematic() {
        const ret = wasm.schematicwrapper_to_litematic(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {Uint8Array} data
     */
    from_schematic(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_from_schematic(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    to_schematic() {
        const ret = wasm.schematicwrapper_to_schematic(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {string} version
     * @returns {Uint8Array}
     */
    to_schematic_version(version) {
        const ptr0 = passStringToWasm0(version, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_to_schematic_version(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * @returns {Array<any>}
     */
    get_available_schematic_versions() {
        const ret = wasm.schematicwrapper_get_available_schematic_versions(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {any}
     */
    get_palette() {
        const ret = wasm.schematicwrapper_get_palette(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {any}
     */
    get_default_region_palette() {
        const ret = wasm.schematicwrapper_get_default_region_palette(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} region_name
     * @returns {any}
     */
    get_palette_from_region(region_name) {
        const ptr0 = passStringToWasm0(region_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_get_palette_from_region(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @returns {any}
     */
    get_bounding_box() {
        const ret = wasm.schematicwrapper_get_bounding_box(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} region_name
     * @returns {any}
     */
    get_region_bounding_box(region_name) {
        const ptr0 = passStringToWasm0(region_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_get_region_bounding_box(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {string} block_name
     */
    set_block(x, y, z, block_name) {
        const ptr0 = passStringToWasm0(block_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.schematicwrapper_set_block(this.__wbg_ptr, x, y, z, ptr0, len0);
    }
    /**
     * @param {SchematicWrapper} from_schematic
     * @param {number} min_x
     * @param {number} min_y
     * @param {number} min_z
     * @param {number} max_x
     * @param {number} max_y
     * @param {number} max_z
     * @param {number} target_x
     * @param {number} target_y
     * @param {number} target_z
     * @param {any} excluded_blocks
     */
    copy_region(from_schematic, min_x, min_y, min_z, max_x, max_y, max_z, target_x, target_y, target_z, excluded_blocks) {
        _assertClass(from_schematic, SchematicWrapper);
        const ret = wasm.schematicwrapper_copy_region(this.__wbg_ptr, from_schematic.__wbg_ptr, min_x, min_y, min_z, max_x, max_y, max_z, target_x, target_y, target_z, excluded_blocks);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {string} block_name
     * @param {any} properties
     */
    set_block_with_properties(x, y, z, block_name, properties) {
        const ptr0 = passStringToWasm0(block_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_set_block_with_properties(this.__wbg_ptr, x, y, z, ptr0, len0, properties);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {string | undefined}
     */
    get_block(x, y, z) {
        const ret = wasm.schematicwrapper_get_block(this.__wbg_ptr, x, y, z);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Get block as formatted string with properties (e.g., "minecraft:lever[powered=true,facing=north]")
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {string | undefined}
     */
    get_block_string(x, y, z) {
        const ret = wasm.schematicwrapper_get_block_string(this.__wbg_ptr, x, y, z);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {BlockStateWrapper | undefined}
     */
    get_block_with_properties(x, y, z) {
        const ret = wasm.schematicwrapper_get_block_with_properties(this.__wbg_ptr, x, y, z);
        return ret === 0 ? undefined : BlockStateWrapper.__wrap(ret);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {any}
     */
    get_block_entity(x, y, z) {
        const ret = wasm.schematicwrapper_get_block_entity(this.__wbg_ptr, x, y, z);
        return ret;
    }
    /**
     * @returns {any}
     */
    get_all_block_entities() {
        const ret = wasm.schematicwrapper_get_all_block_entities(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    print_schematic() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.schematicwrapper_print_schematic(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    debug_info() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.schematicwrapper_debug_info(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Int32Array}
     */
    get_dimensions() {
        const ret = wasm.schematicwrapper_get_dimensions(this.__wbg_ptr);
        var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    get_block_count() {
        const ret = wasm.schematicwrapper_get_block_count(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get_volume() {
        const ret = wasm.schematicwrapper_get_volume(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string[]}
     */
    get_region_names() {
        const ret = wasm.schematicwrapper_get_region_names(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Array<any>}
     */
    blocks() {
        const ret = wasm.schematicwrapper_blocks(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} chunk_width
     * @param {number} chunk_height
     * @param {number} chunk_length
     * @returns {Array<any>}
     */
    chunks(chunk_width, chunk_height, chunk_length) {
        const ret = wasm.schematicwrapper_chunks(this.__wbg_ptr, chunk_width, chunk_height, chunk_length);
        return ret;
    }
    /**
     * @param {number} chunk_width
     * @param {number} chunk_height
     * @param {number} chunk_length
     * @param {string} strategy
     * @param {number} camera_x
     * @param {number} camera_y
     * @param {number} camera_z
     * @returns {Array<any>}
     */
    chunks_with_strategy(chunk_width, chunk_height, chunk_length, strategy, camera_x, camera_y, camera_z) {
        const ptr0 = passStringToWasm0(strategy, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_chunks_with_strategy(this.__wbg_ptr, chunk_width, chunk_height, chunk_length, ptr0, len0, camera_x, camera_y, camera_z);
        return ret;
    }
    /**
     * @param {number} offset_x
     * @param {number} offset_y
     * @param {number} offset_z
     * @param {number} width
     * @param {number} height
     * @param {number} length
     * @returns {Array<any>}
     */
    get_chunk_blocks(offset_x, offset_y, offset_z, width, height, length) {
        const ret = wasm.schematicwrapper_get_chunk_blocks(this.__wbg_ptr, offset_x, offset_y, offset_z, width, height, length);
        return ret;
    }
    /**
     * Get all palettes once - eliminates repeated string transfers
     * Returns: { default: [BlockState], regions: { regionName: [BlockState] } }
     * @returns {any}
     */
    get_all_palettes() {
        const ret = wasm.schematicwrapper_get_all_palettes(this.__wbg_ptr);
        return ret;
    }
    /**
     * Optimized chunks iterator that returns palette indices instead of full block data
     * Returns array of: { chunk_x, chunk_y, chunk_z, blocks: [[x,y,z,palette_index],...] }
     * @param {number} chunk_width
     * @param {number} chunk_height
     * @param {number} chunk_length
     * @returns {Array<any>}
     */
    chunks_indices(chunk_width, chunk_height, chunk_length) {
        const ret = wasm.schematicwrapper_chunks_indices(this.__wbg_ptr, chunk_width, chunk_height, chunk_length);
        return ret;
    }
    /**
     * Optimized chunks with strategy - returns palette indices
     * @param {number} chunk_width
     * @param {number} chunk_height
     * @param {number} chunk_length
     * @param {string} strategy
     * @param {number} camera_x
     * @param {number} camera_y
     * @param {number} camera_z
     * @returns {Array<any>}
     */
    chunks_indices_with_strategy(chunk_width, chunk_height, chunk_length, strategy, camera_x, camera_y, camera_z) {
        const ptr0 = passStringToWasm0(strategy, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_chunks_indices_with_strategy(this.__wbg_ptr, chunk_width, chunk_height, chunk_length, ptr0, len0, camera_x, camera_y, camera_z);
        return ret;
    }
    /**
     * Get specific chunk blocks as palette indices (for lazy loading individual chunks)
     * Returns array of [x, y, z, palette_index]
     * @param {number} offset_x
     * @param {number} offset_y
     * @param {number} offset_z
     * @param {number} width
     * @param {number} height
     * @param {number} length
     * @returns {Array<any>}
     */
    get_chunk_blocks_indices(offset_x, offset_y, offset_z, width, height, length) {
        const ret = wasm.schematicwrapper_get_chunk_blocks_indices(this.__wbg_ptr, offset_x, offset_y, offset_z, width, height, length);
        return ret;
    }
    /**
     * All blocks as palette indices - for when you need everything at once but efficiently
     * Returns array of [x, y, z, palette_index]
     * @returns {Array<any>}
     */
    blocks_indices() {
        const ret = wasm.schematicwrapper_blocks_indices(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get optimization stats
     * @returns {any}
     */
    get_optimization_info() {
        const ret = wasm.schematicwrapper_get_optimization_info(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} chunk_width
     * @param {number} chunk_height
     * @param {number} chunk_length
     * @param {string} strategy
     * @param {number} camera_x
     * @param {number} camera_y
     * @param {number} camera_z
     * @returns {LazyChunkIterator}
     */
    create_lazy_chunk_iterator(chunk_width, chunk_height, chunk_length, strategy, camera_x, camera_y, camera_z) {
        const ptr0 = passStringToWasm0(strategy, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_create_lazy_chunk_iterator(this.__wbg_ptr, chunk_width, chunk_height, chunk_length, ptr0, len0, camera_x, camera_y, camera_z);
        return LazyChunkIterator.__wrap(ret);
    }
    /**
     * Creates a simulation world for this schematic with default options
     *
     * This allows you to simulate redstone circuits and interact with them.
     * @returns {MchprsWorldWrapper}
     */
    create_simulation_world() {
        const ret = wasm.schematicwrapper_create_simulation_world(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return MchprsWorldWrapper.__wrap(ret[0]);
    }
    /**
     * Creates a simulation world for this schematic with custom options
     *
     * This allows you to configure simulation behavior like wire state tracking.
     * @param {SimulationOptionsWrapper} options
     * @returns {MchprsWorldWrapper}
     */
    create_simulation_world_with_options(options) {
        _assertClass(options, SimulationOptionsWrapper);
        const ret = wasm.schematicwrapper_create_simulation_world_with_options(this.__wbg_ptr, options.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return MchprsWorldWrapper.__wrap(ret[0]);
    }
}
if (Symbol.dispose) SchematicWrapper.prototype[Symbol.dispose] = SchematicWrapper.prototype.free;

const SimulationOptionsWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_simulationoptionswrapper_free(ptr >>> 0, 1));

export class SimulationOptionsWrapper {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SimulationOptionsWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_simulationoptionswrapper_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.simulationoptionswrapper_new();
        this.__wbg_ptr = ret >>> 0;
        SimulationOptionsWrapperFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {boolean}
     */
    get optimize() {
        const ret = wasm.simulationoptionswrapper_optimize(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} value
     */
    set optimize(value) {
        wasm.simulationoptionswrapper_set_optimize(this.__wbg_ptr, value);
    }
    /**
     * @returns {boolean}
     */
    get io_only() {
        const ret = wasm.simulationoptionswrapper_io_only(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} value
     */
    set io_only(value) {
        wasm.simulationoptionswrapper_set_io_only(this.__wbg_ptr, value);
    }
}
if (Symbol.dispose) SimulationOptionsWrapper.prototype[Symbol.dispose] = SimulationOptionsWrapper.prototype.free;

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg___wbindgen_debug_string_df47ffb5e35e6763 = function(arg0, arg1) {
        const ret = debugString(arg1);
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg___wbindgen_is_null_5e69f72e906cc57c = function(arg0) {
        const ret = arg0 === null;
        return ret;
    };
    imports.wbg.__wbg___wbindgen_is_undefined_2d472862bd29a478 = function(arg0) {
        const ret = arg0 === undefined;
        return ret;
    };
    imports.wbg.__wbg___wbindgen_string_get_e4f06c90489ad01b = function(arg0, arg1) {
        const obj = arg1;
        const ret = typeof(obj) === 'string' ? obj : undefined;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg___wbindgen_throw_b855445ff6a94295 = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_error_a7f8fbb0523dae15 = function(arg0) {
        console.error(arg0);
    };
    imports.wbg.__wbg_get_7bed016f185add81 = function(arg0, arg1) {
        const ret = arg0[arg1 >>> 0];
        return ret;
    };
    imports.wbg.__wbg_get_efcb449f58ec27c2 = function() { return handleError(function (arg0, arg1) {
        const ret = Reflect.get(arg0, arg1);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_instanceof_Object_10bb762262230c68 = function(arg0) {
        let result;
        try {
            result = arg0 instanceof Object;
        } catch (_) {
            result = false;
        }
        const ret = result;
        return ret;
    };
    imports.wbg.__wbg_isArray_96e0af9891d0945d = function(arg0) {
        const ret = Array.isArray(arg0);
        return ret;
    };
    imports.wbg.__wbg_keys_b4d27b02ad14f4be = function(arg0) {
        const ret = Object.keys(arg0);
        return ret;
    };
    imports.wbg.__wbg_length_cdd215e10d9dd507 = function(arg0) {
        const ret = arg0.length;
        return ret;
    };
    imports.wbg.__wbg_log_8cec76766b8c0e33 = function(arg0) {
        console.log(arg0);
    };
    imports.wbg.__wbg_new_1acc0b6eea89d040 = function() {
        const ret = new Object();
        return ret;
    };
    imports.wbg.__wbg_new_e17d9f43105b08be = function() {
        const ret = new Array();
        return ret;
    };
    imports.wbg.__wbg_now_793306c526e2e3b6 = function() {
        const ret = Date.now();
        return ret;
    };
    imports.wbg.__wbg_of_3192b3b018b8f660 = function(arg0, arg1, arg2) {
        const ret = Array.of(arg0, arg1, arg2);
        return ret;
    };
    imports.wbg.__wbg_push_df81a39d04db858c = function(arg0, arg1) {
        const ret = arg0.push(arg1);
        return ret;
    };
    imports.wbg.__wbg_set_c2abbebe8b9ebee1 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = Reflect.set(arg0, arg1, arg2);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_warn_1d74dddbe2fd1dbb = function(arg0) {
        console.warn(arg0);
    };
    imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
        // Cast intrinsic for `Ref(String) -> Externref`.
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_cast_d6cd19b81560fd6e = function(arg0) {
        // Cast intrinsic for `F64 -> Externref`.
        const ret = arg0;
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedInt32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('nucleation_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
