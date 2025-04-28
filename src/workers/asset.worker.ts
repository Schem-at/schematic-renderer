/// <reference lib="webworker" />
/*
  asset.worker.ts – simple multi‑pack loader (no enable/disable/priority)
  ----------------------------------------------------------------------
  • Uses the same IndexedDB location as the legacy ResourceLoader
      DB="SchematicRendererAssets"   store="resources"
  • The only management message is **initPack**.
      { type:'initPack', requestId, id, zip:ArrayBuffer }
    Call it once per ZIP you want to use. In practice the higher‑level
    code will call initPack for every pack found in user settings.
  • When resolving a path we just iterate over packs in *insertion order*
    (last initPack wins if multiple packs contain the same file).
  • Data messages:
      getModel   { requestId, path:"block/rail" }
      getTexture { requestId, path:"block/rail" }
  • PNGs are decoded to ImageBitmap (transferable) and cached in IndexedDB.
*/

import JSZip from "jszip";

// ─── message shapes ──────────────────────────────────────────────
interface MsgBase {
	requestId: string;
}
interface InitPackMsg extends MsgBase {
	type: "initPack";
	id: string;
	zip: ArrayBuffer;
}
interface GetModelMsg extends MsgBase {
	type: "getModel";
	path: string;
}
interface GetTexMsg extends MsgBase {
	type: "getTexture";
	path: string;
}
interface CacheMsg extends MsgBase {
	type: "cacheResource";
	path: string;
	data: ArrayBuffer;
}

// union
type Msg = InitPackMsg | GetModelMsg | GetTexMsg | CacheMsg;

// ─── IndexedDB (same store name) ─────────────────────────────────
const DB = "SchematicRendererAssets";
const STORE = "resources";
let db: IDBDatabase | null = null;
const dbReady = new Promise<void>((ok, err) => {
	const r = indexedDB.open(DB, 1);
	r.onupgradeneeded = () =>
		r.result.createObjectStore(STORE, { keyPath: "path" });
	r.onsuccess = () => {
		db = r.result;
		ok();
	};
	r.onerror = () => err(r.error);
});
const idb = (mode: "readonly" | "readwrite"): IDBObjectStore => {
	if (!db) throw new Error("db");
	return db.transaction(STORE, mode).objectStore(STORE);
};
const getCache = (p: string) =>
	dbReady.then(
		() =>
			new Promise<ArrayBuffer | null>((res) => {
				const r = idb("readonly").get(p);
				r.onsuccess = () => res(r.result?.data ?? null);
				r.onerror = () => res(null);
			})
	);
const putCache = (p: string, d: ArrayBuffer) =>
	dbReady.then(
		() =>
			new Promise<void>(
				(res) =>
					(idb("readwrite").put({ path: p, data: d }).onsuccess = () => res())
			)
	);

// ─── ResourcePack helper ────────────────────────────────────────
class ResourcePack {
	private zip!: JSZip;
	private j = new Map<string, any>();
	private b = new Map<string, ArrayBuffer>();
	constructor(buf: ArrayBuffer) {
		this.init(buf);
	}
	async init(buf: ArrayBuffer) {
		this.zip = await JSZip.loadAsync(buf);
	}
	private full(p: string) {
		return `assets/minecraft/${p}`;
	}
	async txt(p: string) {
		return this.zip.file(this.full(p))?.async("text");
	}
	async bin(p: string) {
		return this.zip.file(this.full(p))?.async("arraybuffer");
	}
	async json<T>(p: string) {
		if (this.j.has(p)) return this.j.get(p);
		const t = await this.txt(p);
		if (!t) return undefined;
		const j = JSON.parse(t) as T;
		this.j.set(p, j);
		return j;
	}
}

// packs stored in insertion order (Map preserves order)
const packs = new Map<string, ResourcePack>();

// ─── lookup helpers ─────────────────────────────────────────────
async function getJSON<T>(mcPath: string): Promise<T | undefined> {
	for (const p of packs.values()) {
		const j = await p.json<T>(mcPath);
		if (j) return j;
	}
	return undefined;
}
async function getBinary(mcPath: string): Promise<ArrayBuffer | undefined> {
	const cacheKey = `assets/minecraft/${mcPath}`;
	const cached = await getCache(cacheKey);
	if (cached) return cached;
	for (const p of packs.values()) {
		const b = await p.bin(mcPath);
		if (b) {
			await putCache(cacheKey, b);
			return b;
		}
	}
	return undefined;
}

// ─── message handler ────────────────────────────────────────────
self.addEventListener("message", async (e: MessageEvent<Msg>) => {
	const m = e.data;
	const id = m.requestId;
	try {
		switch (m.type) {
			case "initPack":
				packs.set(m.id, new ResourcePack(m.zip));
				return ok(true);
			case "getModel": {
				const j = await getJSON<any>(`models/${m.path}.json`);
				if (!j) throw new Error(`model ${m.path} not found in any pack`);
				return ok(j);
			}
			case "getTexture": {
				const bin = await getBinary(`textures/${m.path}.png`);
				if (!bin) throw new Error(`texture ${m.path} not found`);
				const bmp = await createImageBitmap(new Blob([bin]));
				return ok(bmp, [bmp]);
			}
			case "cacheResource":
				await putCache(m.path, m.data);
				return ok(true);
		}
	} catch (err: any) {
		errMsg(err);
	}

	function ok(payload: any, tx: Transferable[] = []) {
		self.postMessage({ requestId: id, payload }, tx);
	}
	function errMsg(err: any) {
		self.postMessage({ requestId: id, error: err.message || String(err) });
	}
});

export {};
