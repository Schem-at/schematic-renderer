import { TextureInfo, PackedTexture, AtlasNode } from "./types";

// IndexedDB-based atlas cache for better performance
const ATLAS_CACHE_DB_NAME = "cubane-atlas-cache";
const ATLAS_CACHE_STORE_NAME = "atlases";
const ATLAS_CACHE_VERSION = 1;

let atlasCacheDb: IDBDatabase | null = null;

async function openAtlasCacheDb(): Promise<IDBDatabase> {
	if (atlasCacheDb) return atlasCacheDb;

	return new Promise((resolve, reject) => {
		const request = indexedDB.open(ATLAS_CACHE_DB_NAME, ATLAS_CACHE_VERSION);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			atlasCacheDb = request.result;
			resolve(atlasCacheDb);
		};

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(ATLAS_CACHE_STORE_NAME)) {
				db.createObjectStore(ATLAS_CACHE_STORE_NAME, { keyPath: "cacheKey" });
			}
		};
	});
}

export interface AtlasCacheData {
	cacheKey: string;
	// Store raw ImageData instead of base64 PNG for speed
	imageData: Uint8ClampedArray;
	width: number;
	height: number;
	uvMap: Record<string, { u: number; v: number; width: number; height: number }>;
	packingEfficiency: number;
	timestamp: number;
	textureCount: number;
}

// Legacy localStorage cache interface (for migration)
export interface AtlasCache {
	atlasImageData: string; // Base64 encoded image data
	uvMap: Record<string, { u: number; v: number; width: number; height: number }>;
	packingEfficiency: number;
	timestamp: number;
	resourcePackHash: string;
	textureCount: number;
}

export class AtlasBuilder {
	private atlasSize: number;
	private padding: number;

	constructor(atlasSize: number = 2048, padding: number = 1) {
		this.atlasSize = atlasSize;
		this.padding = padding;
	}

	/**
	 * Build texture atlas with caching support
	 */
	public async buildAtlas(
		textures: { path: string; image: HTMLImageElement | ImageBitmap }[],
		cacheKey?: string
	): Promise<{
		atlas: HTMLCanvasElement;
		uvMap: Map<string, { u: number; v: number; width: number; height: number }>;
		packingEfficiency: number;
		fromCache: boolean;
	}> {
		console.log(`🔧 Starting atlas building with ${textures.length} textures`);

		// Try to load from cache first if cache key provided
		if (cacheKey) {
			const cachedResult = await this.loadFromCache(cacheKey, textures.length);
			if (cachedResult) {
				console.log(`✅ Loaded atlas from cache`);
				return { ...cachedResult, fromCache: true };
			}
		}

		// If no textures provided and no cache hit, this was just a cache check
		if (textures.length === 0) {
			throw new Error("No cache found and no textures provided");
		}

		// Build new atlas
		const result = await this.buildNewAtlas(textures);

		// Save to cache if cache key provided (don't await - do it in background)
		if (cacheKey) {
			this.saveToCache(cacheKey, result, textures.length)
				.then(() => {
					console.log(`💾 Saved atlas to cache`);
				})
				.catch((err) => {
					console.warn(`⚠️ Failed to save atlas to cache:`, err);
				});
		}

		return { ...result, fromCache: false };
	}

	/**
	 * Try to load atlas from IndexedDB cache (fast path)
	 */
	private async loadFromCache(
		cacheKey: string,
		expectedTextureCount: number
	): Promise<{
		atlas: HTMLCanvasElement;
		uvMap: Map<string, { u: number; v: number; width: number; height: number }>;
		packingEfficiency: number;
	} | null> {
		const startTime = performance.now();

		try {
			// Try IndexedDB first (fast path)
			const db = await openAtlasCacheDb();
			const cacheData = await new Promise<AtlasCacheData | null>((resolve) => {
				const transaction = db.transaction(ATLAS_CACHE_STORE_NAME, "readonly");
				const store = transaction.objectStore(ATLAS_CACHE_STORE_NAME);
				const request = store.get(cacheKey);

				request.onsuccess = () => resolve(request.result || null);
				request.onerror = () => resolve(null);
			});

			if (cacheData) {
				// Validate cache
				if (expectedTextureCount > 0 && cacheData.textureCount !== expectedTextureCount) {
					console.log(
						`⚠️ Cache texture count mismatch: expected ${expectedTextureCount}, got ${cacheData.textureCount}`
					);
					return null;
				}

				// Check if cache is too old (1 week)
				const maxAge = 7 * 24 * 60 * 60 * 1000;
				if (Date.now() - cacheData.timestamp > maxAge) {
					console.log(`⚠️ Cache expired`);
					await this.deleteFromCache(cacheKey);
					return null;
				}

				// Fast reconstruction from raw ImageData
				const canvas = document.createElement("canvas");
				canvas.width = cacheData.width;
				canvas.height = cacheData.height;
				const ctx = canvas.getContext("2d")!;

				const imageData = new ImageData(
					new Uint8ClampedArray(cacheData.imageData),
					cacheData.width,
					cacheData.height
				);
				ctx.putImageData(imageData, 0, 0);

				// Reconstruct UV map
				const uvMap = new Map<string, { u: number; v: number; width: number; height: number }>();
				Object.entries(cacheData.uvMap).forEach(([path, uv]) => {
					uvMap.set(path, uv);
				});

				const loadTime = performance.now() - startTime;
				console.log(
					`📊 IndexedDB cache hit: ${uvMap.size} textures, ${cacheData.packingEfficiency.toFixed(1)}% efficiency (${loadTime.toFixed(0)}ms)`
				);

				return {
					atlas: canvas,
					uvMap,
					packingEfficiency: cacheData.packingEfficiency,
				};
			}

			// Fallback: try localStorage (legacy cache migration)
			const legacyResult = await this.loadFromLocalStorage(cacheKey, expectedTextureCount);
			if (legacyResult) {
				// Migrate to IndexedDB in background
				this.migrateToIndexedDB(cacheKey, legacyResult).catch(() => {});
				return legacyResult;
			}

			return null;
		} catch (error) {
			console.warn(`⚠️ Failed to load from cache:`, error);
			return null;
		}
	}

	/**
	 * Legacy localStorage loader (for migration)
	 */
	private async loadFromLocalStorage(
		cacheKey: string,
		expectedTextureCount: number
	): Promise<{
		atlas: HTMLCanvasElement;
		uvMap: Map<string, { u: number; v: number; width: number; height: number }>;
		packingEfficiency: number;
		textureCount: number;
	} | null> {
		try {
			const cached = localStorage.getItem(`atlas_${cacheKey}`);
			if (!cached) return null;

			const cacheData: AtlasCache = JSON.parse(cached);

			if (expectedTextureCount > 0 && cacheData.textureCount !== expectedTextureCount) {
				return null;
			}

			const maxAge = 7 * 24 * 60 * 60 * 1000;
			if (Date.now() - cacheData.timestamp > maxAge) {
				localStorage.removeItem(`atlas_${cacheKey}`);
				return null;
			}

			// Load via Image (slower path)
			const canvas = document.createElement("canvas");
			canvas.width = this.atlasSize;
			canvas.height = this.atlasSize;
			const ctx = canvas.getContext("2d")!;

			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error("Failed to load cached image"));
				img.src = cacheData.atlasImageData;
			});

			ctx.drawImage(img, 0, 0);

			const uvMap = new Map<string, { u: number; v: number; width: number; height: number }>();
			Object.entries(cacheData.uvMap).forEach(([path, uv]) => {
				uvMap.set(path, uv);
			});

			console.log(`📊 localStorage cache hit (legacy): ${uvMap.size} textures`);

			return {
				atlas: canvas,
				uvMap,
				packingEfficiency: cacheData.packingEfficiency,
				textureCount: cacheData.textureCount,
			};
		} catch (error) {
			localStorage.removeItem(`atlas_${cacheKey}`);
			return null;
		}
	}

	/**
	 * Migrate legacy localStorage cache to IndexedDB
	 */
	private async migrateToIndexedDB(
		cacheKey: string,
		result: {
			atlas: HTMLCanvasElement;
			uvMap: Map<string, { u: number; v: number; width: number; height: number }>;
			packingEfficiency: number;
			textureCount: number;
		}
	): Promise<void> {
		await this.saveToCache(cacheKey, result, result.textureCount);
		// Remove legacy cache after successful migration
		localStorage.removeItem(`atlas_${cacheKey}`);
		console.log(`🔄 Migrated atlas cache to IndexedDB`);
	}

	/**
	 * Save atlas to IndexedDB cache (fast)
	 */
	private async saveToCache(
		cacheKey: string,
		result: {
			atlas: HTMLCanvasElement;
			uvMap: Map<string, { u: number; v: number; width: number; height: number }>;
			packingEfficiency: number;
		},
		textureCount: number
	): Promise<void> {
		try {
			const ctx = result.atlas.getContext("2d")!;
			const imageData = ctx.getImageData(0, 0, result.atlas.width, result.atlas.height);

			// Convert map to plain object
			const uvMapObject: Record<string, { u: number; v: number; width: number; height: number }> =
				{};
			result.uvMap.forEach((value, key) => {
				uvMapObject[key] = value;
			});

			const cacheData: AtlasCacheData = {
				cacheKey,
				imageData: imageData.data,
				width: result.atlas.width,
				height: result.atlas.height,
				uvMap: uvMapObject,
				packingEfficiency: result.packingEfficiency,
				timestamp: Date.now(),
				textureCount,
			};

			const db = await openAtlasCacheDb();
			await new Promise<void>((resolve, reject) => {
				const transaction = db.transaction(ATLAS_CACHE_STORE_NAME, "readwrite");
				const store = transaction.objectStore(ATLAS_CACHE_STORE_NAME);
				const request = store.put(cacheData);

				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});

			const sizeEstimate = imageData.data.length + JSON.stringify(uvMapObject).length;
			console.log(`💾 Cached atlas to IndexedDB: ~${(sizeEstimate / 1024 / 1024).toFixed(1)}MB`);
		} catch (error) {
			console.warn(`⚠️ Failed to save to IndexedDB cache:`, error);
		}
	}

	/**
	 * Delete from IndexedDB cache
	 */
	private async deleteFromCache(cacheKey: string): Promise<void> {
		try {
			const db = await openAtlasCacheDb();
			await new Promise<void>((resolve) => {
				const transaction = db.transaction(ATLAS_CACHE_STORE_NAME, "readwrite");
				const store = transaction.objectStore(ATLAS_CACHE_STORE_NAME);
				store.delete(cacheKey);
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => resolve();
			});
		} catch {
			// Ignore errors
		}
	}

	/**
	 * Build a new atlas (original logic)
	 * Supports both HTMLImageElement and ImageBitmap for flexibility
	 */
	private async buildNewAtlas(
		textures: { path: string; image: HTMLImageElement | ImageBitmap }[]
	): Promise<{
		atlas: HTMLCanvasElement;
		uvMap: Map<string, { u: number; v: number; width: number; height: number }>;
		packingEfficiency: number;
	}> {
		// Prepare texture info with dimensions
		const textureInfos: TextureInfo[] = textures.map(({ path, image }) => ({
			path,
			image: image as HTMLImageElement, // Cast for compatibility with existing types
			width: image.width,
			height: image.height,
			area: image.width * image.height,
		}));

		// Sort textures for packing
		const sortedTextures = this.sortTexturesForPacking(textureInfos);

		// Try different packing strategies and pick the best one
		const packingResults = await Promise.all([
			this.packWithStrategy(sortedTextures, "largest-first"),
			this.packWithStrategy(sortedTextures, "area-first"),
			this.packWithStrategy(sortedTextures, "height-first"),
			this.packWithStrategy(sortedTextures, "width-first"),
			this.packWithStrategy(sortedTextures, "perimeter-first"),
		]);

		// Select the best packing result
		const bestResult = packingResults.reduce((best, current) =>
			current.efficiency > best.efficiency ? current : best
		);

		console.log(
			`📊 Best packing strategy: ${bestResult.strategy} with ${bestResult.efficiency.toFixed(1)}% efficiency`
		);
		console.log(`📦 Packed ${bestResult.packedTextures.length}/${textures.length} textures`);

		// Create the final atlas
		const { canvas, uvMap } = this.createAtlasCanvas(bestResult.packedTextures);

		return {
			atlas: canvas,
			uvMap,
			packingEfficiency: bestResult.efficiency,
		};
	}

	/**
	 * Clear all atlas caches (both IndexedDB and localStorage)
	 */
	public static async clearAllCaches(): Promise<void> {
		// Clear IndexedDB
		try {
			const db = await openAtlasCacheDb();
			await new Promise<void>((resolve) => {
				const transaction = db.transaction(ATLAS_CACHE_STORE_NAME, "readwrite");
				const store = transaction.objectStore(ATLAS_CACHE_STORE_NAME);
				store.clear();
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => resolve();
			});
			console.log(`🗑️ Cleared IndexedDB atlas cache`);
		} catch (error) {
			console.warn(`⚠️ Failed to clear IndexedDB cache:`, error);
		}

		// Also clear legacy localStorage
		const keys = Object.keys(localStorage);
		const atlasKeys = keys.filter((key) => key.startsWith("atlas_"));
		atlasKeys.forEach((key) => {
			localStorage.removeItem(key);
		});

		if (atlasKeys.length > 0) {
			console.log(`🗑️ Cleared ${atlasKeys.length} legacy localStorage caches`);
		}
	}

	/**
	 * Get cache info for debugging
	 */
	public static async getCacheInfo(): Promise<
		{ key: string; size: string; age: string; textureCount: number; storage: string }[]
	> {
		const results: {
			key: string;
			size: string;
			age: string;
			textureCount: number;
			storage: string;
		}[] = [];

		// Get IndexedDB entries
		try {
			const db = await openAtlasCacheDb();
			const entries = await new Promise<AtlasCacheData[]>((resolve) => {
				const transaction = db.transaction(ATLAS_CACHE_STORE_NAME, "readonly");
				const store = transaction.objectStore(ATLAS_CACHE_STORE_NAME);
				const request = store.getAll();

				request.onsuccess = () => resolve(request.result || []);
				request.onerror = () => resolve([]);
			});

			for (const entry of entries) {
				const size = entry.imageData.length + JSON.stringify(entry.uvMap).length;
				const age = Math.round((Date.now() - entry.timestamp) / (1000 * 60 * 60));
				results.push({
					key: entry.cacheKey,
					size: `${(size / 1024 / 1024).toFixed(1)}MB`,
					age: `${age}h`,
					textureCount: entry.textureCount,
					storage: "IndexedDB",
				});
			}
		} catch {
			// Ignore IndexedDB errors
		}

		// Also check legacy localStorage
		const keys = Object.keys(localStorage);
		const atlasKeys = keys.filter((key) => key.startsWith("atlas_"));

		for (const key of atlasKeys) {
			try {
				const data = JSON.parse(localStorage.getItem(key) || "{}");
				const size = localStorage.getItem(key)?.length || 0;
				const age = Math.round((Date.now() - (data.timestamp || 0)) / (1000 * 60 * 60));

				results.push({
					key: key.replace("atlas_", ""),
					size: `${(size / 1024).toFixed(1)}KB`,
					age: `${age}h`,
					textureCount: data.textureCount || 0,
					storage: "localStorage (legacy)",
				});
			} catch {
				results.push({
					key: key.replace("atlas_", ""),
					size: "corrupted",
					age: "unknown",
					textureCount: 0,
					storage: "localStorage (legacy)",
				});
			}
		}

		return results;
	}

	// Rest of the original methods remain the same...
	private sortTexturesForPacking(textures: TextureInfo[]): Record<string, TextureInfo[]> {
		return {
			"largest-first": [...textures].sort((a, b) => {
				const aMax = Math.max(a.width, a.height);
				const bMax = Math.max(b.width, b.height);
				if (bMax !== aMax) return bMax - aMax;
				return b.area - a.area;
			}),
			"area-first": [...textures].sort((a, b) => b.area - a.area),
			"height-first": [...textures].sort((a, b) => {
				if (b.height !== a.height) return b.height - a.height;
				return b.width - a.width;
			}),
			"width-first": [...textures].sort((a, b) => {
				if (b.width !== a.width) return b.width - a.width;
				return b.height - a.height;
			}),
			"perimeter-first": [...textures].sort((a, b) => b.width + b.height - (a.width + a.height)),
		};
	}

	private async packWithStrategy(
		sortedTextures: Record<string, TextureInfo[]>,
		strategy: string
	): Promise<{
		strategy: string;
		packedTextures: PackedTexture[];
		efficiency: number;
	}> {
		const textures = sortedTextures[strategy];
		const packedTextures = this.packTextures(textures);
		const efficiency = this.calculatePackingEfficiency(packedTextures);

		return {
			strategy,
			packedTextures,
			efficiency,
		};
	}

	private packTextures(textures: TextureInfo[]): PackedTexture[] {
		const root: AtlasNode = {
			x: 0,
			y: 0,
			width: this.atlasSize,
			height: this.atlasSize,
			used: false,
		};

		const packedTextures: PackedTexture[] = [];

		for (const texture of textures) {
			const node = this.findNode(root, texture.width + this.padding, texture.height + this.padding);

			if (node) {
				const fit = this.splitNode(
					node,
					texture.width + this.padding,
					texture.height + this.padding
				);
				packedTextures.push({
					...texture,
					x: fit.x,
					y: fit.y,
				});
			} else {
				console.warn(
					`❌ Could not fit texture: ${texture.path} (${texture.width}x${texture.height})`
				);
			}
		}

		return packedTextures;
	}

	private findNode(root: AtlasNode, width: number, height: number): AtlasNode | null {
		if (root.used) {
			return this.findNode(root.right!, width, height) || this.findNode(root.down!, width, height);
		} else if (width <= root.width && height <= root.height) {
			return root;
		} else {
			return null;
		}
	}

	private splitNode(node: AtlasNode, width: number, height: number): AtlasNode {
		node.used = true;

		node.down = {
			x: node.x,
			y: node.y + height,
			width: node.width,
			height: node.height - height,
			used: false,
		};

		node.right = {
			x: node.x + width,
			y: node.y,
			width: node.width - width,
			height: height,
			used: false,
		};

		return node;
	}

	private calculatePackingEfficiency(packedTextures: PackedTexture[]): number {
		const totalTextureArea = packedTextures.reduce((sum, tex) => sum + tex.area, 0);
		const atlasArea = this.atlasSize * this.atlasSize;
		return (totalTextureArea / atlasArea) * 100;
	}

	private createAtlasCanvas(packedTextures: PackedTexture[]): {
		canvas: HTMLCanvasElement;
		uvMap: Map<string, { u: number; v: number; width: number; height: number }>;
	} {
		const canvas = document.createElement("canvas");
		canvas.width = this.atlasSize;
		canvas.height = this.atlasSize;

		const ctx = canvas.getContext("2d")!;
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, this.atlasSize, this.atlasSize);

		const uvMap = new Map<string, { u: number; v: number; width: number; height: number }>();

		for (const texture of packedTextures) {
			ctx.drawImage(texture.image, texture.x, texture.y);

			const u = texture.x / this.atlasSize;
			const v = texture.y / this.atlasSize;
			const width = texture.width / this.atlasSize;
			const height = texture.height / this.atlasSize;

			uvMap.set(texture.path, { u, v, width, height });
		}

		return { canvas, uvMap };
	}

	public visualizePacking(packedTextures: PackedTexture[]): HTMLCanvasElement {
		const canvas = document.createElement("canvas");
		canvas.width = this.atlasSize;
		canvas.height = this.atlasSize;

		const ctx = canvas.getContext("2d")!;
		ctx.fillStyle = "rgba(200, 200, 200, 0.3)";
		ctx.fillRect(0, 0, this.atlasSize, this.atlasSize);

		packedTextures.forEach((texture, index) => {
			const hue = (index * 137.508) % 360;
			ctx.strokeStyle = `hsl(${hue}, 70%, 50%)`;
			ctx.lineWidth = 1;
			ctx.strokeRect(texture.x, texture.y, texture.width, texture.height);

			if (texture.width > 50 && texture.height > 20) {
				ctx.fillStyle = `hsl(${hue}, 70%, 30%)`;
				ctx.font = "10px monospace";
				ctx.fillText(texture.path.split("/").pop() || texture.path, texture.x + 2, texture.y + 12);
			}
		});

		return canvas;
	}
}
