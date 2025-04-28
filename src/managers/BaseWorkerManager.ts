// BaseWorkerManager.ts
export interface WorkerManagerOptions {
	disableWorkers?: boolean;
	workerPath?: string;
	createWorker?: () => Worker;
}

export abstract class BaseWorkerManager {
	protected worker: Worker | null = null;
	protected usingWorkers: boolean;
	protected requestMap = new Map<
		string,
		{ resolve: Function; reject: Function }
	>();
	protected nextRequestId = 1;

	constructor(options: WorkerManagerOptions = {}) {
		// Check if workers are supported and not disabled
		this.usingWorkers = !options.disableWorkers && this.detectWorkerSupport();

		if (this.usingWorkers) {
			try {
				if (options.createWorker) {
					this.worker = options.createWorker();
				} else if (options.workerPath) {
					this.worker = new Worker(options.workerPath);
				} else {
					this.worker = this.createInlineWorker();
				}

				this.setupWorkerCommunication();
			} catch (e) {
				console.warn(
					"Worker initialization failed, falling back to main thread:",
					e
				);
				this.usingWorkers = false;
				this.worker = null;
			}
		}
	}

	// Check if Workers are supported in this environment
	private detectWorkerSupport(): boolean {
		try {
			// Simple feature detection
			return typeof Worker !== "undefined";
		} catch (e) {
			return false;
		}
	}

	protected abstract createInlineWorker(): Worker;

	protected setupWorkerCommunication() {
		if (!this.worker) return;

		this.worker.onmessage = (event) => {
			const { requestId, data, error } = event.data;

			const pendingRequest = this.requestMap.get(requestId);
			if (!pendingRequest) return;

			if (error) {
				pendingRequest.reject(new Error(error));
			} else {
				pendingRequest.resolve(data);
			}

			this.requestMap.delete(requestId);
		};
	}

	protected async sendWorkerMessage<T>(
		type: string,
		data: any,
		transferables?: Transferable[]
	): Promise<T> {
		if (!this.usingWorkers || !this.worker) {
			throw new Error("Workers are not available");
		}

		const requestId = `${type}_${this.nextRequestId++}`;

		return new Promise<T>((resolve, reject) => {
			this.requestMap.set(requestId, { resolve, reject });

			this.worker!.postMessage(
				{
					type,
					requestId,
					...data,
				},
				transferables || []
			);
		});
	}

	public isUsingWorkers(): boolean {
		return this.usingWorkers;
	}

	public dispose() {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		this.requestMap.clear();
	}
}
