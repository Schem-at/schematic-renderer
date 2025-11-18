let wasm;

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
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

let WASM_VECTOR_LEN = 0;

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
/**
 * Initialize WASM module with panic hook for better error messages
 */
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

let cachedUint32ArrayMemory0 = null;

function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    for (let i = 0; i < array.length; i++) {
        const add = addToExternrefTable0(array[i]);
        getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}

function _assertChar(c) {
    if (typeof(c) === 'number' && (c >= 0x110000 || (c >= 0xD800 && c < 0xE000))) throw new Error(`expected a valid Unicode scalar value, found ${c}`);
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

const ExecutionModeWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_executionmodewrapper_free(ptr >>> 0, 1));
/**
 * ExecutionMode for circuit execution
 */
export class ExecutionModeWrapper {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ExecutionModeWrapper.prototype);
        obj.__wbg_ptr = ptr;
        ExecutionModeWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ExecutionModeWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_executionmodewrapper_free(ptr, 0);
    }
    /**
     * Run for a fixed number of ticks
     * @param {number} ticks
     * @returns {ExecutionModeWrapper}
     */
    static fixedTicks(ticks) {
        const ret = wasm.executionmodewrapper_fixedTicks(ticks);
        return ExecutionModeWrapper.__wrap(ret);
    }
    /**
     * Run until an output meets a condition
     * @param {string} output_name
     * @param {OutputConditionWrapper} condition
     * @param {number} max_ticks
     * @param {number} check_interval
     * @returns {ExecutionModeWrapper}
     */
    static untilCondition(output_name, condition, max_ticks, check_interval) {
        const ptr0 = passStringToWasm0(output_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(condition, OutputConditionWrapper);
        const ret = wasm.executionmodewrapper_untilCondition(ptr0, len0, condition.__wbg_ptr, max_ticks, check_interval);
        return ExecutionModeWrapper.__wrap(ret);
    }
    /**
     * Run until any output changes
     * @param {number} max_ticks
     * @param {number} check_interval
     * @returns {ExecutionModeWrapper}
     */
    static untilChange(max_ticks, check_interval) {
        const ret = wasm.executionmodewrapper_untilChange(max_ticks, check_interval);
        return ExecutionModeWrapper.__wrap(ret);
    }
    /**
     * Run until outputs are stable
     * @param {number} stable_ticks
     * @param {number} max_ticks
     * @returns {ExecutionModeWrapper}
     */
    static untilStable(stable_ticks, max_ticks) {
        const ret = wasm.executionmodewrapper_untilStable(stable_ticks, max_ticks);
        return ExecutionModeWrapper.__wrap(ret);
    }
}
if (Symbol.dispose) ExecutionModeWrapper.prototype[Symbol.dispose] = ExecutionModeWrapper.prototype.free;

const IoLayoutBuilderWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_iolayoutbuilderwrapper_free(ptr >>> 0, 1));
/**
 * IoLayoutBuilder for JavaScript
 */
export class IoLayoutBuilderWrapper {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(IoLayoutBuilderWrapper.prototype);
        obj.__wbg_ptr = ptr;
        IoLayoutBuilderWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IoLayoutBuilderWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_iolayoutbuilderwrapper_free(ptr, 0);
    }
    /**
     * Create a new IO layout builder
     */
    constructor() {
        const ret = wasm.iolayoutbuilderwrapper_new();
        this.__wbg_ptr = ret >>> 0;
        IoLayoutBuilderWrapperFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Add an input
     * @param {string} name
     * @param {IoTypeWrapper} io_type
     * @param {LayoutFunctionWrapper} layout
     * @param {any[]} positions
     * @returns {IoLayoutBuilderWrapper}
     */
    addInput(name, io_type, layout, positions) {
        const ptr = this.__destroy_into_raw();
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(io_type, IoTypeWrapper);
        _assertClass(layout, LayoutFunctionWrapper);
        const ptr1 = passArrayJsValueToWasm0(positions, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.iolayoutbuilderwrapper_addInput(ptr, ptr0, len0, io_type.__wbg_ptr, layout.__wbg_ptr, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return IoLayoutBuilderWrapper.__wrap(ret[0]);
    }
    /**
     * Add an output
     * @param {string} name
     * @param {IoTypeWrapper} io_type
     * @param {LayoutFunctionWrapper} layout
     * @param {any[]} positions
     * @returns {IoLayoutBuilderWrapper}
     */
    addOutput(name, io_type, layout, positions) {
        const ptr = this.__destroy_into_raw();
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(io_type, IoTypeWrapper);
        _assertClass(layout, LayoutFunctionWrapper);
        const ptr1 = passArrayJsValueToWasm0(positions, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.iolayoutbuilderwrapper_addOutput(ptr, ptr0, len0, io_type.__wbg_ptr, layout.__wbg_ptr, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return IoLayoutBuilderWrapper.__wrap(ret[0]);
    }
    /**
     * Add an input with automatic layout inference
     * @param {string} name
     * @param {IoTypeWrapper} io_type
     * @param {any[]} positions
     * @returns {IoLayoutBuilderWrapper}
     */
    addInputAuto(name, io_type, positions) {
        const ptr = this.__destroy_into_raw();
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(io_type, IoTypeWrapper);
        const ptr1 = passArrayJsValueToWasm0(positions, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.iolayoutbuilderwrapper_addInputAuto(ptr, ptr0, len0, io_type.__wbg_ptr, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return IoLayoutBuilderWrapper.__wrap(ret[0]);
    }
    /**
     * Add an output with automatic layout inference
     * @param {string} name
     * @param {IoTypeWrapper} io_type
     * @param {any[]} positions
     * @returns {IoLayoutBuilderWrapper}
     */
    addOutputAuto(name, io_type, positions) {
        const ptr = this.__destroy_into_raw();
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(io_type, IoTypeWrapper);
        const ptr1 = passArrayJsValueToWasm0(positions, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.iolayoutbuilderwrapper_addOutputAuto(ptr, ptr0, len0, io_type.__wbg_ptr, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return IoLayoutBuilderWrapper.__wrap(ret[0]);
    }
    /**
     * Build the IO layout
     * @returns {IoLayoutWrapper}
     */
    build() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.iolayoutbuilderwrapper_build(ptr);
        return IoLayoutWrapper.__wrap(ret);
    }
}
if (Symbol.dispose) IoLayoutBuilderWrapper.prototype[Symbol.dispose] = IoLayoutBuilderWrapper.prototype.free;

const IoLayoutWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_iolayoutwrapper_free(ptr >>> 0, 1));
/**
 * IoLayout wrapper for JavaScript
 */
export class IoLayoutWrapper {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(IoLayoutWrapper.prototype);
        obj.__wbg_ptr = ptr;
        IoLayoutWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IoLayoutWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_iolayoutwrapper_free(ptr, 0);
    }
    /**
     * Get input names
     * @returns {string[]}
     */
    inputNames() {
        const ret = wasm.iolayoutwrapper_inputNames(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Get output names
     * @returns {string[]}
     */
    outputNames() {
        const ret = wasm.iolayoutwrapper_outputNames(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}
if (Symbol.dispose) IoLayoutWrapper.prototype[Symbol.dispose] = IoLayoutWrapper.prototype.free;

const IoTypeWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_iotypewrapper_free(ptr >>> 0, 1));
/**
 * IoType builder for JavaScript
 */
export class IoTypeWrapper {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(IoTypeWrapper.prototype);
        obj.__wbg_ptr = ptr;
        IoTypeWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IoTypeWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_iotypewrapper_free(ptr, 0);
    }
    /**
     * Create an unsigned integer type
     * @param {number} bits
     * @returns {IoTypeWrapper}
     */
    static unsignedInt(bits) {
        const ret = wasm.iotypewrapper_unsignedInt(bits);
        return IoTypeWrapper.__wrap(ret);
    }
    /**
     * Create a signed integer type
     * @param {number} bits
     * @returns {IoTypeWrapper}
     */
    static signedInt(bits) {
        const ret = wasm.iotypewrapper_signedInt(bits);
        return IoTypeWrapper.__wrap(ret);
    }
    /**
     * Create a Float32 type
     * @returns {IoTypeWrapper}
     */
    static float32() {
        const ret = wasm.iotypewrapper_float32();
        return IoTypeWrapper.__wrap(ret);
    }
    /**
     * Create a Boolean type
     * @returns {IoTypeWrapper}
     */
    static boolean() {
        const ret = wasm.iotypewrapper_boolean();
        return IoTypeWrapper.__wrap(ret);
    }
    /**
     * Create an ASCII string type
     * @param {number} chars
     * @returns {IoTypeWrapper}
     */
    static ascii(chars) {
        const ret = wasm.iotypewrapper_ascii(chars);
        return IoTypeWrapper.__wrap(ret);
    }
}
if (Symbol.dispose) IoTypeWrapper.prototype[Symbol.dispose] = IoTypeWrapper.prototype.free;

const LayoutFunctionWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_layoutfunctionwrapper_free(ptr >>> 0, 1));
/**
 * LayoutFunction builder for JavaScript
 */
export class LayoutFunctionWrapper {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(LayoutFunctionWrapper.prototype);
        obj.__wbg_ptr = ptr;
        LayoutFunctionWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LayoutFunctionWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_layoutfunctionwrapper_free(ptr, 0);
    }
    /**
     * One bit per position (0 or 15)
     * @returns {LayoutFunctionWrapper}
     */
    static oneToOne() {
        const ret = wasm.layoutfunctionwrapper_oneToOne();
        return LayoutFunctionWrapper.__wrap(ret);
    }
    /**
     * Four bits per position (0-15)
     * @returns {LayoutFunctionWrapper}
     */
    static packed4() {
        const ret = wasm.layoutfunctionwrapper_packed4();
        return LayoutFunctionWrapper.__wrap(ret);
    }
    /**
     * Custom bit-to-position mapping
     * @param {Uint32Array} mapping
     * @returns {LayoutFunctionWrapper}
     */
    static custom(mapping) {
        const ptr0 = passArray32ToWasm0(mapping, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.layoutfunctionwrapper_custom(ptr0, len0);
        return LayoutFunctionWrapper.__wrap(ret);
    }
    /**
     * Row-major 2D layout
     * @param {number} rows
     * @param {number} cols
     * @param {number} bits_per_element
     * @returns {LayoutFunctionWrapper}
     */
    static rowMajor(rows, cols, bits_per_element) {
        const ret = wasm.layoutfunctionwrapper_rowMajor(rows, cols, bits_per_element);
        return LayoutFunctionWrapper.__wrap(ret);
    }
    /**
     * Column-major 2D layout
     * @param {number} rows
     * @param {number} cols
     * @param {number} bits_per_element
     * @returns {LayoutFunctionWrapper}
     */
    static columnMajor(rows, cols, bits_per_element) {
        const ret = wasm.layoutfunctionwrapper_columnMajor(rows, cols, bits_per_element);
        return LayoutFunctionWrapper.__wrap(ret);
    }
    /**
     * Scanline layout for screens
     * @param {number} width
     * @param {number} height
     * @param {number} bits_per_pixel
     * @returns {LayoutFunctionWrapper}
     */
    static scanline(width, height, bits_per_pixel) {
        const ret = wasm.layoutfunctionwrapper_scanline(width, height, bits_per_pixel);
        return LayoutFunctionWrapper.__wrap(ret);
    }
}
if (Symbol.dispose) LayoutFunctionWrapper.prototype[Symbol.dispose] = LayoutFunctionWrapper.prototype.free;

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
     * Sets the signal strength at a specific block position (for custom IO nodes)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} strength
     */
    setSignalStrength(x, y, z, strength) {
        wasm.mchprsworldwrapper_setSignalStrength(this.__wbg_ptr, x, y, z, strength);
    }
    /**
     * Gets the signal strength at a specific block position (for custom IO nodes)
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {number}
     */
    getSignalStrength(x, y, z) {
        const ret = wasm.mchprsworldwrapper_getSignalStrength(this.__wbg_ptr, x, y, z);
        return ret;
    }
    /**
     * Check for custom IO state changes and queue them
     * Call this after tick() or setSignalStrength() to detect changes
     */
    checkCustomIoChanges() {
        wasm.mchprsworldwrapper_checkCustomIoChanges(this.__wbg_ptr);
    }
    /**
     * Get and clear all custom IO changes since last poll
     * Returns an array of change objects with {x, y, z, oldPower, newPower}
     * @returns {any}
     */
    pollCustomIoChanges() {
        const ret = wasm.mchprsworldwrapper_pollCustomIoChanges(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get custom IO changes without clearing the queue
     * @returns {any}
     */
    peekCustomIoChanges() {
        const ret = wasm.mchprsworldwrapper_peekCustomIoChanges(this.__wbg_ptr);
        return ret;
    }
    /**
     * Clear all queued custom IO changes
     */
    clearCustomIoChanges() {
        wasm.mchprsworldwrapper_clearCustomIoChanges(this.__wbg_ptr);
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

const OutputConditionWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_outputconditionwrapper_free(ptr >>> 0, 1));
/**
 * OutputCondition for conditional execution
 */
export class OutputConditionWrapper {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(OutputConditionWrapper.prototype);
        obj.__wbg_ptr = ptr;
        OutputConditionWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        OutputConditionWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_outputconditionwrapper_free(ptr, 0);
    }
    /**
     * Output equals a value
     * @param {ValueWrapper} value
     * @returns {OutputConditionWrapper}
     */
    static equals(value) {
        _assertClass(value, ValueWrapper);
        const ret = wasm.outputconditionwrapper_equals(value.__wbg_ptr);
        return OutputConditionWrapper.__wrap(ret);
    }
    /**
     * Output not equals a value
     * @param {ValueWrapper} value
     * @returns {OutputConditionWrapper}
     */
    static notEquals(value) {
        _assertClass(value, ValueWrapper);
        const ret = wasm.outputconditionwrapper_notEquals(value.__wbg_ptr);
        return OutputConditionWrapper.__wrap(ret);
    }
    /**
     * Output greater than a value
     * @param {ValueWrapper} value
     * @returns {OutputConditionWrapper}
     */
    static greaterThan(value) {
        _assertClass(value, ValueWrapper);
        const ret = wasm.outputconditionwrapper_greaterThan(value.__wbg_ptr);
        return OutputConditionWrapper.__wrap(ret);
    }
    /**
     * Output less than a value
     * @param {ValueWrapper} value
     * @returns {OutputConditionWrapper}
     */
    static lessThan(value) {
        _assertClass(value, ValueWrapper);
        const ret = wasm.outputconditionwrapper_lessThan(value.__wbg_ptr);
        return OutputConditionWrapper.__wrap(ret);
    }
    /**
     * Bitwise AND with mask
     * @param {number} mask
     * @returns {OutputConditionWrapper}
     */
    static bitwiseAnd(mask) {
        const ret = wasm.outputconditionwrapper_bitwiseAnd(mask);
        return OutputConditionWrapper.__wrap(ret);
    }
}
if (Symbol.dispose) OutputConditionWrapper.prototype[Symbol.dispose] = OutputConditionWrapper.prototype.free;

const SchematicBuilderWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_schematicbuilderwrapper_free(ptr >>> 0, 1));
/**
 * SchematicBuilder for creating schematics from ASCII art
 */
export class SchematicBuilderWrapper {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(SchematicBuilderWrapper.prototype);
        obj.__wbg_ptr = ptr;
        SchematicBuilderWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SchematicBuilderWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_schematicbuilderwrapper_free(ptr, 0);
    }
    /**
     * Create a new schematic builder with standard palette
     */
    constructor() {
        const ret = wasm.schematicbuilderwrapper_new();
        this.__wbg_ptr = ret >>> 0;
        SchematicBuilderWrapperFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Set the name of the schematic
     * @param {string} name
     * @returns {SchematicBuilderWrapper}
     */
    name(name) {
        const ptr = this.__destroy_into_raw();
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicbuilderwrapper_name(ptr, ptr0, len0);
        return SchematicBuilderWrapper.__wrap(ret);
    }
    /**
     * Map a character to a block string
     * @param {string} ch
     * @param {string} block
     * @returns {SchematicBuilderWrapper}
     */
    map(ch, block) {
        const ptr = this.__destroy_into_raw();
        const char0 = ch.codePointAt(0);
        _assertChar(char0);
        const ptr1 = passStringToWasm0(block, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.schematicbuilderwrapper_map(ptr, char0, ptr1, len1);
        return SchematicBuilderWrapper.__wrap(ret);
    }
    /**
     * Build the schematic
     * @returns {SchematicWrapper}
     */
    build() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.schematicbuilderwrapper_build(ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return SchematicWrapper.__wrap(ret[0]);
    }
    /**
     * Create from template string
     * @param {string} template
     * @returns {SchematicBuilderWrapper}
     */
    static fromTemplate(template) {
        const ptr0 = passStringToWasm0(template, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicbuilderwrapper_fromTemplate(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return SchematicBuilderWrapper.__wrap(ret[0]);
    }
}
if (Symbol.dispose) SchematicBuilderWrapper.prototype[Symbol.dispose] = SchematicBuilderWrapper.prototype.free;

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
     * @param {string} block_name
     * @param {any} nbt_data
     */
    setBlockWithNbt(x, y, z, block_name, nbt_data) {
        const ptr0 = passStringToWasm0(block_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_setBlockWithNbt(this.__wbg_ptr, x, y, z, ptr0, len0, nbt_data);
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
     * Get the allocated dimensions (full buffer size including pre-allocated space)
     * Use this if you need to know the internal buffer size
     * @returns {Int32Array}
     */
    get_allocated_dimensions() {
        const ret = wasm.schematicwrapper_get_allocated_dimensions(this.__wbg_ptr);
        var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Get the tight dimensions of actual block content (excluding pre-allocated space)
     * Returns [width, height, length] or [0, 0, 0] if no non-air blocks exist
     * @returns {Int32Array}
     */
    get_tight_dimensions() {
        const ret = wasm.schematicwrapper_get_tight_dimensions(this.__wbg_ptr);
        var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Get the tight bounding box min coordinates [x, y, z]
     * Returns null if no non-air blocks have been placed
     * @returns {Int32Array | undefined}
     */
    get_tight_bounds_min() {
        const ret = wasm.schematicwrapper_get_tight_bounds_min(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        }
        return v1;
    }
    /**
     * Get the tight bounding box max coordinates [x, y, z]
     * Returns null if no non-air blocks have been placed
     * @returns {Int32Array | undefined}
     */
    get_tight_bounds_max() {
        const ret = wasm.schematicwrapper_get_tight_bounds_max(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        }
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
     * Flip the schematic along the X axis
     */
    flip_x() {
        wasm.schematicwrapper_flip_x(this.__wbg_ptr);
    }
    /**
     * Flip the schematic along the Y axis
     */
    flip_y() {
        wasm.schematicwrapper_flip_y(this.__wbg_ptr);
    }
    /**
     * Flip the schematic along the Z axis
     */
    flip_z() {
        wasm.schematicwrapper_flip_z(this.__wbg_ptr);
    }
    /**
     * Rotate the schematic around the Y axis (horizontal plane)
     * Degrees must be 90, 180, or 270
     * @param {number} degrees
     */
    rotate_y(degrees) {
        wasm.schematicwrapper_rotate_y(this.__wbg_ptr, degrees);
    }
    /**
     * Rotate the schematic around the X axis
     * Degrees must be 90, 180, or 270
     * @param {number} degrees
     */
    rotate_x(degrees) {
        wasm.schematicwrapper_rotate_x(this.__wbg_ptr, degrees);
    }
    /**
     * Rotate the schematic around the Z axis
     * Degrees must be 90, 180, or 270
     * @param {number} degrees
     */
    rotate_z(degrees) {
        wasm.schematicwrapper_rotate_z(this.__wbg_ptr, degrees);
    }
    /**
     * Flip a specific region along the X axis
     * @param {string} region_name
     */
    flip_region_x(region_name) {
        const ptr0 = passStringToWasm0(region_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_flip_region_x(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Flip a specific region along the Y axis
     * @param {string} region_name
     */
    flip_region_y(region_name) {
        const ptr0 = passStringToWasm0(region_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_flip_region_y(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Flip a specific region along the Z axis
     * @param {string} region_name
     */
    flip_region_z(region_name) {
        const ptr0 = passStringToWasm0(region_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_flip_region_z(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Rotate a specific region around the Y axis
     * @param {string} region_name
     * @param {number} degrees
     */
    rotate_region_y(region_name, degrees) {
        const ptr0 = passStringToWasm0(region_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_rotate_region_y(this.__wbg_ptr, ptr0, len0, degrees);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Rotate a specific region around the X axis
     * @param {string} region_name
     * @param {number} degrees
     */
    rotate_region_x(region_name, degrees) {
        const ptr0 = passStringToWasm0(region_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_rotate_region_x(this.__wbg_ptr, ptr0, len0, degrees);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Rotate a specific region around the Z axis
     * @param {string} region_name
     * @param {number} degrees
     */
    rotate_region_z(region_name, degrees) {
        const ptr0 = passStringToWasm0(region_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.schematicwrapper_rotate_region_z(this.__wbg_ptr, ptr0, len0, degrees);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Extract all sign text from the schematic
     * Returns a JavaScript array of objects: [{pos: [x,y,z], text: "..."}]
     * @returns {any}
     */
    extractSigns() {
        const ret = wasm.schematicwrapper_extractSigns(this.__wbg_ptr);
        return ret;
    }
    /**
     * Compile Insign annotations from the schematic's signs
     * Returns a JavaScript object with compiled region metadata
     * This returns raw Insign data - interpretation is up to the consumer
     * @returns {any}
     */
    compileInsign() {
        const ret = wasm.schematicwrapper_compileInsign(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
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
    /**
     * Adds a position to the custom IO list
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    addCustomIo(x, y, z) {
        wasm.simulationoptionswrapper_addCustomIo(this.__wbg_ptr, x, y, z);
    }
    /**
     * Clears the custom IO list
     */
    clearCustomIo() {
        wasm.simulationoptionswrapper_clearCustomIo(this.__wbg_ptr);
    }
}
if (Symbol.dispose) SimulationOptionsWrapper.prototype[Symbol.dispose] = SimulationOptionsWrapper.prototype.free;

const TypedCircuitExecutorWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_typedcircuitexecutorwrapper_free(ptr >>> 0, 1));
/**
 * TypedCircuitExecutor wrapper for JavaScript
 */
export class TypedCircuitExecutorWrapper {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(TypedCircuitExecutorWrapper.prototype);
        obj.__wbg_ptr = ptr;
        TypedCircuitExecutorWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypedCircuitExecutorWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_typedcircuitexecutorwrapper_free(ptr, 0);
    }
    /**
     * Create executor from world and layout
     * @param {MchprsWorldWrapper} world
     * @param {IoLayoutWrapper} layout
     * @returns {TypedCircuitExecutorWrapper}
     */
    static fromLayout(world, layout) {
        _assertClass(world, MchprsWorldWrapper);
        var ptr0 = world.__destroy_into_raw();
        _assertClass(layout, IoLayoutWrapper);
        var ptr1 = layout.__destroy_into_raw();
        const ret = wasm.typedcircuitexecutorwrapper_fromLayout(ptr0, ptr1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return TypedCircuitExecutorWrapper.__wrap(ret[0]);
    }
    /**
     * Create executor from world, layout, and options
     * @param {MchprsWorldWrapper} world
     * @param {IoLayoutWrapper} layout
     * @param {SimulationOptionsWrapper} options
     * @returns {TypedCircuitExecutorWrapper}
     */
    static fromLayoutWithOptions(world, layout, options) {
        _assertClass(world, MchprsWorldWrapper);
        var ptr0 = world.__destroy_into_raw();
        _assertClass(layout, IoLayoutWrapper);
        var ptr1 = layout.__destroy_into_raw();
        _assertClass(options, SimulationOptionsWrapper);
        const ret = wasm.typedcircuitexecutorwrapper_fromLayoutWithOptions(ptr0, ptr1, options.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return TypedCircuitExecutorWrapper.__wrap(ret[0]);
    }
    /**
     * Create executor from Insign annotations in schematic
     * @param {SchematicWrapper} schematic
     * @returns {TypedCircuitExecutorWrapper}
     */
    static fromInsign(schematic) {
        _assertClass(schematic, SchematicWrapper);
        const ret = wasm.typedcircuitexecutorwrapper_fromInsign(schematic.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return TypedCircuitExecutorWrapper.__wrap(ret[0]);
    }
    /**
     * Create executor from Insign annotations with custom simulation options
     * @param {SchematicWrapper} schematic
     * @param {SimulationOptionsWrapper} options
     * @returns {TypedCircuitExecutorWrapper}
     */
    static fromInsignWithOptions(schematic, options) {
        _assertClass(schematic, SchematicWrapper);
        _assertClass(options, SimulationOptionsWrapper);
        const ret = wasm.typedcircuitexecutorwrapper_fromInsignWithOptions(schematic.__wbg_ptr, options.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return TypedCircuitExecutorWrapper.__wrap(ret[0]);
    }
    /**
     * Set state mode
     * @param {string} mode
     */
    setStateMode(mode) {
        const ptr0 = passStringToWasm0(mode, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.typedcircuitexecutorwrapper_setStateMode(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Reset the simulation
     */
    reset() {
        const ret = wasm.typedcircuitexecutorwrapper_reset(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Execute the circuit
     * @param {any} inputs
     * @param {ExecutionModeWrapper} mode
     * @returns {any}
     */
    execute(inputs, mode) {
        _assertClass(mode, ExecutionModeWrapper);
        const ret = wasm.typedcircuitexecutorwrapper_execute(this.__wbg_ptr, inputs, mode.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Sync the simulation state back to the schematic
     *
     * Call this after execute() to update the schematic with the current simulation state.
     * Returns the updated schematic.
     * @returns {SchematicWrapper}
     */
    syncToSchematic() {
        const ret = wasm.typedcircuitexecutorwrapper_syncToSchematic(this.__wbg_ptr);
        return SchematicWrapper.__wrap(ret);
    }
}
if (Symbol.dispose) TypedCircuitExecutorWrapper.prototype[Symbol.dispose] = TypedCircuitExecutorWrapper.prototype.free;

const ValueWrapperFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_valuewrapper_free(ptr >>> 0, 1));
/**
 * JavaScript-compatible Value wrapper
 */
export class ValueWrapper {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ValueWrapper.prototype);
        obj.__wbg_ptr = ptr;
        ValueWrapperFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ValueWrapperFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_valuewrapper_free(ptr, 0);
    }
    /**
     * Create a U32 value
     * @param {number} value
     * @returns {ValueWrapper}
     */
    static fromU32(value) {
        const ret = wasm.valuewrapper_fromU32(value);
        return ValueWrapper.__wrap(ret);
    }
    /**
     * Create an I32 value
     * @param {number} value
     * @returns {ValueWrapper}
     */
    static fromI32(value) {
        const ret = wasm.valuewrapper_fromI32(value);
        return ValueWrapper.__wrap(ret);
    }
    /**
     * Create an F32 value
     * @param {number} value
     * @returns {ValueWrapper}
     */
    static fromF32(value) {
        const ret = wasm.valuewrapper_fromF32(value);
        return ValueWrapper.__wrap(ret);
    }
    /**
     * Create a Bool value
     * @param {boolean} value
     * @returns {ValueWrapper}
     */
    static fromBool(value) {
        const ret = wasm.valuewrapper_fromBool(value);
        return ValueWrapper.__wrap(ret);
    }
    /**
     * Create a String value
     * @param {string} value
     * @returns {ValueWrapper}
     */
    static fromString(value) {
        const ptr0 = passStringToWasm0(value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.valuewrapper_fromString(ptr0, len0);
        return ValueWrapper.__wrap(ret);
    }
    /**
     * Convert to JavaScript value
     * @returns {any}
     */
    toJs() {
        const ret = wasm.valuewrapper_toJs(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get type name
     * @returns {string}
     */
    typeName() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.valuewrapper_typeName(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) ValueWrapper.prototype[Symbol.dispose] = ValueWrapper.prototype.free;

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
    imports.wbg.__wbg_Error_e83987f665cf5504 = function(arg0, arg1) {
        const ret = Error(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbg_String_fed4d24b68977888 = function(arg0, arg1) {
        const ret = String(arg1);
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg___wbindgen_boolean_get_6d5a1ee65bab5f68 = function(arg0) {
        const v = arg0;
        const ret = typeof(v) === 'boolean' ? v : undefined;
        return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
    };
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
    imports.wbg.__wbg___wbindgen_is_string_fbb76cb2940daafd = function(arg0) {
        const ret = typeof(arg0) === 'string';
        return ret;
    };
    imports.wbg.__wbg___wbindgen_is_undefined_2d472862bd29a478 = function(arg0) {
        const ret = arg0 === undefined;
        return ret;
    };
    imports.wbg.__wbg___wbindgen_number_get_a20bf9b85341449d = function(arg0, arg1) {
        const obj = arg1;
        const ret = typeof(obj) === 'number' ? obj : undefined;
        getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
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
    imports.wbg.__wbg_entries_e171b586f8f6bdbf = function(arg0) {
        const ret = Object.entries(arg0);
        return ret;
    };
    imports.wbg.__wbg_error_7534b8e9a36f1ab4 = function(arg0, arg1) {
        let deferred0_0;
        let deferred0_1;
        try {
            deferred0_0 = arg0;
            deferred0_1 = arg1;
            console.error(getStringFromWasm0(arg0, arg1));
        } finally {
            wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
        }
    };
    imports.wbg.__wbg_error_a7f8fbb0523dae15 = function(arg0) {
        console.error(arg0);
    };
    imports.wbg.__wbg_from_a4ad7cbddd0d7135 = function(arg0) {
        const ret = Array.from(arg0);
        return ret;
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
    imports.wbg.__wbg_new_68651c719dcda04e = function() {
        const ret = new Map();
        return ret;
    };
    imports.wbg.__wbg_new_8a6f238a6ece86ea = function() {
        const ret = new Error();
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
    imports.wbg.__wbg_set_3fda3bac07393de4 = function(arg0, arg1, arg2) {
        arg0[arg1] = arg2;
    };
    imports.wbg.__wbg_set_907fb406c34a251d = function(arg0, arg1, arg2) {
        const ret = arg0.set(arg1, arg2);
        return ret;
    };
    imports.wbg.__wbg_set_c213c871859d6500 = function(arg0, arg1, arg2) {
        arg0[arg1 >>> 0] = arg2;
    };
    imports.wbg.__wbg_set_c2abbebe8b9ebee1 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = Reflect.set(arg0, arg1, arg2);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_stack_0ed75d68575b0f3c = function(arg0, arg1) {
        const ret = arg1.stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg_warn_1d74dddbe2fd1dbb = function(arg0) {
        console.warn(arg0);
    };
    imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
        // Cast intrinsic for `Ref(String) -> Externref`.
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_cast_4625c577ab2ec9ee = function(arg0) {
        // Cast intrinsic for `U64 -> Externref`.
        const ret = BigInt.asUintN(64, arg0);
        return ret;
    };
    imports.wbg.__wbindgen_cast_9ae0607507abb057 = function(arg0) {
        // Cast intrinsic for `I64 -> Externref`.
        const ret = arg0;
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
    cachedUint32ArrayMemory0 = null;
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
