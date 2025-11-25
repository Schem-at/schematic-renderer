/**
 * GPUCapabilityManager
 * 
 * Handles WebGPU detection, initialization, and capability management.
 * Provides a singleton interface for GPU resource access throughout the application.
 */

export interface GPUCapabilities {
	webgpu: boolean;
	maxStorageBufferBindingSize: number;
	maxComputeWorkgroupsPerDimension: number;
	maxComputeInvocationsPerWorkgroup: number;
	maxComputeWorkgroupSizeX: number;
	maxComputeWorkgroupSizeY: number;
	maxComputeWorkgroupSizeZ: number;
}

export class GPUCapabilityManager {
	private static instance: GPUCapabilityManager | null = null;

	private _adapter: GPUAdapter | null = null;
	private _device: GPUDevice | null = null;
	private _capabilities: GPUCapabilities | null = null;
	private _initPromise: Promise<boolean> | null = null;
	private _initialized: boolean = false;

	private constructor() { }

	public static getInstance(): GPUCapabilityManager {
		if (!GPUCapabilityManager.instance) {
			GPUCapabilityManager.instance = new GPUCapabilityManager();
		}
		return GPUCapabilityManager.instance;
	}

	/**
	 * Check if WebGPU is available in this browser
	 */
	public static async isWebGPUAvailable(): Promise<boolean> {
		if (typeof navigator === 'undefined') return false;
		if (!('gpu' in navigator)) return false;

		try {
			const adapter = await navigator.gpu.requestAdapter();
			return adapter !== null;
		} catch {
			return false;
		}
	}

	/**
	 * Initialize WebGPU adapter and device
	 * Returns true if successful, false otherwise
	 */
	public async initialize(): Promise<boolean> {
		// Return cached promise if already initializing
		if (this._initPromise) {
			return this._initPromise;
		}

		this._initPromise = this._doInitialize();
		return this._initPromise;
	}

	private async _doInitialize(): Promise<boolean> {
		if (this._initialized) {
			return this._device !== null;
		}

		try {
			// Check for WebGPU support
			if (!navigator.gpu) {
				console.warn('[GPUCapabilityManager] WebGPU not supported in this browser');
				this._initialized = true;
				return false;
			}

			// Request adapter
			this._adapter = await navigator.gpu.requestAdapter({
				powerPreference: 'high-performance'
			});

			if (!this._adapter) {
				console.warn('[GPUCapabilityManager] Failed to get GPU adapter');
				this._initialized = true;
				return false;
			}

			// Request device with required features
			const requiredLimits: Record<string, number> = {};

			// Request maximum storage buffer size for large geometry data
			const adapterLimits = this._adapter.limits;
			requiredLimits.maxStorageBufferBindingSize = adapterLimits.maxStorageBufferBindingSize;
			requiredLimits.maxComputeWorkgroupsPerDimension = adapterLimits.maxComputeWorkgroupsPerDimension;

			this._device = await this._adapter.requestDevice({
				requiredLimits
			});

			if (!this._device) {
				console.warn('[GPUCapabilityManager] Failed to get GPU device');
				this._initialized = true;
				return false;
			}

			// Set up device lost handler
			this._device.lost.then((info) => {
				console.error('[GPUCapabilityManager] GPU device lost:', info.message);
				this._device = null;
				this._initialized = false;
				this._initPromise = null;
			});

			// Cache capabilities
			this._capabilities = {
				webgpu: true,
				maxStorageBufferBindingSize: this._device.limits.maxStorageBufferBindingSize,
				maxComputeWorkgroupsPerDimension: this._device.limits.maxComputeWorkgroupsPerDimension,
				maxComputeInvocationsPerWorkgroup: this._device.limits.maxComputeInvocationsPerWorkgroup,
				maxComputeWorkgroupSizeX: this._device.limits.maxComputeWorkgroupSizeX,
				maxComputeWorkgroupSizeY: this._device.limits.maxComputeWorkgroupSizeY,
				maxComputeWorkgroupSizeZ: this._device.limits.maxComputeWorkgroupSizeZ,
			};

			console.log('[GPUCapabilityManager] WebGPU initialized successfully');
			console.log('[GPUCapabilityManager] Device limits:', {
				maxStorageBufferBindingSize: `${(this._capabilities.maxStorageBufferBindingSize / 1024 / 1024).toFixed(1)} MB`,
				maxComputeWorkgroupsPerDimension: this._capabilities.maxComputeWorkgroupsPerDimension,
				maxComputeInvocationsPerWorkgroup: this._capabilities.maxComputeInvocationsPerWorkgroup,
			});

			this._initialized = true;
			return true;

		} catch (error) {
			console.error('[GPUCapabilityManager] WebGPU initialization failed:', error);
			this._initialized = true;
			return false;
		}
	}

	/**
	 * Get the GPU adapter (requires initialization)
	 */
	public get adapter(): GPUAdapter | null {
		return this._adapter;
	}

	/**
	 * Get the GPU device (requires initialization)
	 */
	public get device(): GPUDevice | null {
		return this._device;
	}

	/**
	 * Get cached GPU capabilities
	 */
	public get capabilities(): GPUCapabilities | null {
		return this._capabilities;
	}

	/**
	 * Check if WebGPU is ready to use
	 */
	public get isReady(): boolean {
		return this._initialized && this._device !== null;
	}

	/**
	 * Create a GPU buffer
	 */
	public createBuffer(
		size: number,
		usage: GPUBufferUsageFlags,
		label?: string
	): GPUBuffer | null {
		if (!this._device) {
			console.warn('[GPUCapabilityManager] Cannot create buffer: device not initialized');
			return null;
		}

		return this._device.createBuffer({
			size,
			usage,
			label,
			mappedAtCreation: false
		});
	}

	/**
	 * Create a storage buffer with initial data
	 */
	public createStorageBuffer(
		data: ArrayBuffer | ArrayBufferView,
		label?: string
	): GPUBuffer | null {
		if (!this._device) {
			console.warn('[GPUCapabilityManager] Cannot create storage buffer: device not initialized');
			return null;
		}

		const buffer = this._device.createBuffer({
			size: data.byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
			label,
			mappedAtCreation: true
		});

		const mappedRange = buffer.getMappedRange();
		if (data instanceof ArrayBuffer) {
			new Uint8Array(mappedRange).set(new Uint8Array(data));
		} else {
			new Uint8Array(mappedRange).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
		}
		buffer.unmap();

		return buffer;
	}

	/**
	 * Write data to an existing buffer
	 */
	public writeBuffer(buffer: GPUBuffer, data: BufferSource | SharedArrayBuffer, offset: number = 0): void {
		if (!this._device) {
			console.warn('[GPUCapabilityManager] Cannot write buffer: device not initialized');
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this._device.queue.writeBuffer(buffer, offset, data as any);
	}

	/**
	 * Read data from a GPU buffer back to CPU
	 */
	public async readBuffer(buffer: GPUBuffer, size?: number): Promise<ArrayBuffer> {
		if (!this._device) {
			throw new Error('[GPUCapabilityManager] Cannot read buffer: device not initialized');
		}

		const readSize = size ?? buffer.size;

		// Create a staging buffer for reading
		const stagingBuffer = this._device.createBuffer({
			size: readSize,
			usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
			label: 'staging-read-buffer'
		});

		// Copy from source to staging
		const commandEncoder = this._device.createCommandEncoder();
		commandEncoder.copyBufferToBuffer(buffer, 0, stagingBuffer, 0, readSize);
		this._device.queue.submit([commandEncoder.finish()]);

		// Map and read
		await stagingBuffer.mapAsync(GPUMapMode.READ);
		const copyArrayBuffer = stagingBuffer.getMappedRange().slice(0);
		stagingBuffer.unmap();
		stagingBuffer.destroy();

		return copyArrayBuffer;
	}

	/**
	 * Dispose of GPU resources
	 */
	public dispose(): void {
		if (this._device) {
			this._device.destroy();
			this._device = null;
		}
		this._adapter = null;
		this._capabilities = null;
		this._initialized = false;
		this._initPromise = null;

		console.log('[GPUCapabilityManager] Disposed');
	}
}

// Export singleton instance
export const gpuCapabilityManager = GPUCapabilityManager.getInstance();
