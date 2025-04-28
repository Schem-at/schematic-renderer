// managers/AssetWorkerManager.ts
import { BaseWorkerManager, WorkerManagerOptions } from "./BaseWorkerManager";

export class AssetWorkerManager extends BaseWorkerManager {
	constructor(options: WorkerManagerOptions = {}) {
		super(options);
	}

	protected createInlineWorker(): Worker {
		const workerUrl = new URL(
			"../workers/asset.worker.ts?worker&inline", // add &inline if you want ONE file
			import.meta.url
		);
		const worker = new Worker(workerUrl, { type: "module" });

		return worker;
	}

	public async loadTexture(
		path: string
	): Promise<ImageBitmap | HTMLImageElement> {
		if (this.usingWorkers) {
			try {
				return await this.sendWorkerMessage<ImageBitmap>("loadTexture", {
					path,
				});
			} catch (error) {
				console.warn(
					"Worker texture loading failed, falling back to main thread:",
					error
				);
				return this.loadTextureMainThread(path);
			}
		} else {
			return this.loadTextureMainThread(path);
		}
	}

	private async loadTextureMainThread(path: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error(`Failed to load texture: ${path}`));
			img.src = path;
		});
	}

	public async loadJson<T>(path: string): Promise<T> {
		if (this.usingWorkers) {
			try {
				return await this.sendWorkerMessage<T>("loadJson", { path });
			} catch (error) {
				console.warn(
					"Worker JSON loading failed, falling back to main thread:",
					error
				);
				return this.loadJsonMainThread(path);
			}
		} else {
			return this.loadJsonMainThread(path);
		}
	}

	private async loadJsonMainThread<T>(path: string): Promise<T> {
		const response = await fetch(path);
		return await response.json();
	}
}
