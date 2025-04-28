// workers/ResourcePack.ts
import JSZip from "jszip";

export class ResourcePack {
	private zip!: JSZip;
	private jsonCache = new Map<string, any>();
	private texCache = new Map<string, ArrayBuffer>();

	async init(buffer: ArrayBuffer) {
		this.zip = await JSZip.loadAsync(buffer);
	}

	async getJSON<T>(path: string): Promise<T> {
		if (this.jsonCache.has(path)) return this.jsonCache.get(path);
		const txt = await this.zip.file(`assets/minecraft/${path}`)!.async("text");
		const j = JSON.parse(txt) as T;
		this.jsonCache.set(path, j);
		return j;
	}

	async getBinary(path: string): Promise<ArrayBuffer> {
		if (this.texCache.has(path)) return this.texCache.get(path)!;
		const buf = await this.zip
			.file(`assets/minecraft/${path}`)!
			.async("arraybuffer");
		this.texCache.set(path, buf);
		return buf;
	}
}
