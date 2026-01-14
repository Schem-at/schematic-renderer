import * as THREE from "three";

export interface MemorySnapshot {
	timestamp: number;
	jsHeapSize: number;
	jsHeapSizeLimit: number;
	usedJSHeapSize: number;
	// Custom memory tracking
	geometryCount: number;
	textureCount: number;
	materialCount: number;
	vertexCount: number;
	indexCount: number;
	bufferMemoryEstimate: number;
	customData?: Record<string, any>;
}

export interface TimingData {
	name: string;
	startTime: number;
	endTime?: number;
	duration?: number;
	parentOperation?: string;
	metadata?: Record<string, any>;
}

export interface BlockProcessingData {
	blockType: string;
	position: [number, number, number];
	processingTime: number;
	geometryVertices: number;
	memoryUsed: number;
	chunkId: string;
}

export interface ChunkRenderingPhase {
	name: string;
	startTime: number;
	endTime?: number;
	duration?: number;
	memoryBefore: number;
	memoryAfter?: number;
	metadata?: Record<string, any>;
}

export interface ChunkProcessingData {
	chunkId: string;
	chunkCoords: [number, number, number];
	blockCount: number;
	processingTime: number;
	meshCount: number;
	totalVertices: number;
	totalIndices: number;
	memoryUsed: number;
	materialGroups: number;
	blockTypes: string[];

	// Detailed rendering phases
	renderingPhases: ChunkRenderingPhase[];

	// Block-level timing breakdown
	blockTypeTimings: Map<
		string,
		{
			count: number;
			totalTime: number;
			avgTime: number;
			maxTime: number;
		}
	>;

	// Geometry generation details
	geometryStats: {
		facesCulled: number;
		facesGenerated: number;
		cullingEfficiency: number;
		averageVerticesPerBlock: number;
		textureAtlasUsage: string[];
	};

	// Memory breakdown
	memoryBreakdown: {
		vertexBuffers: number;
		indexBuffers: number;
		materials: number;
		textures: number;
		other: number;
	};
}

export interface RendererStats {
	timestamp: number;
	drawCalls: number;
	triangles: number;
	points: number;
	lines: number;
	geometries: number;
	textures: number;
	programs: number;
}

export interface FrameData {
	timestamp: number;
	duration: number; // ms
	fps: number;
}

export interface MeshBuildingSession {
	sessionId: string;
	schematicId: string;
	startTime: number;
	endTime?: number;
	totalDuration?: number;
	renderMode: "immediate" | "incremental" | "instanced";

	// Memory tracking
	memorySnapshots: MemorySnapshot[];
	peakMemoryUsage: number;
	memoryLeaks: number;

	// Timing data
	timingData: TimingData[];

	// Block/chunk processing
	blockProcessingData: BlockProcessingData[];
	chunkProcessingData: ChunkProcessingData[];

	// Performance metrics
	averageBlockProcessingTime: number;
	averageChunkProcessingTime: number;
	slowestOperations: TimingData[];
	memoryHotspots: string[];
	breakdown?: { operationId: string; duration: number; memoryDelta: number }[]; // Add breakdown field

	// Three.js renderer stats
	rendererStats?: {
		drawCalls: number;
		triangles: number;
		points: number;
		lines: number;
		geometries: number;
		textures: number;
		programs: number;
	};

	// Detailed History
	rendererStatsHistory: RendererStats[];
	frameHistory: FrameData[]; // Frame time tracking

	// FPS tracking (legacy summary)
	fpsHistory: number[];
	averageFPS: number;
}

export class PerformanceMonitor {
	private static instance: PerformanceMonitor;
	private sessions: Map<string, MeshBuildingSession> = new Map();
	private currentSession: MeshBuildingSession | null = null;
	private renderer: THREE.WebGLRenderer | null = null;

	// Memory tracking
	private memoryCheckInterval: number = 100; // ms
	private memoryIntervalId: number | null = null;
	private baselineMemory: MemorySnapshot | null = null;

	// FPS tracking variables
	private frameCount: number = 0;
	private lastTime: number = performance.now();
	private fpsIntervalId: number | null = null;
	private frameId: number | null = null;

	// Continuous Monitoring State (for runtime outside sessions)
	private isMonitoring: boolean = false;
	private latestFrameTime: number = 0;
	private latestFPS: number = 0;

	// Timing stack for nested operations
	private timingStack: TimingData[] = [];

	private constructor() {}

	public static getInstance(): PerformanceMonitor {
		if (!PerformanceMonitor.instance) {
			PerformanceMonitor.instance = new PerformanceMonitor();
		}
		return PerformanceMonitor.instance;
	}

	public setRenderer(renderer: THREE.WebGLRenderer): void {
		this.renderer = renderer;
	}

	public startSession(
		schematicId: string,
		renderMode: "immediate" | "incremental" | "instanced" | "batched"
	): string {
		const sessionId = `${schematicId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		this.currentSession = {
			sessionId,
			schematicId,
			startTime: performance.now(),
			renderMode: renderMode as "immediate" | "incremental" | "instanced",
			memorySnapshots: [],
			peakMemoryUsage: 0,
			memoryLeaks: 0,
			timingData: [],
			blockProcessingData: [],
			chunkProcessingData: [],
			averageBlockProcessingTime: 0,
			averageChunkProcessingTime: 0,
			slowestOperations: [],
			memoryHotspots: [],
			fpsHistory: [],
			averageFPS: 0,
			rendererStatsHistory: [],
			frameHistory: [],
		};

		this.sessions.set(sessionId, this.currentSession!);

		// Take baseline memory snapshot
		this.baselineMemory = this.takeMemorySnapshot("session_start");
		this.currentSession!.memorySnapshots.push(this.baselineMemory);

		// Start continuous memory monitoring
		this.startMemoryMonitoring();

		// Start FPS monitoring
		this.startMonitoringLoop();

		// console.log(`🚀 Performance monitoring session started: ${sessionId}`);
		return sessionId;
	}

	public endSession(sessionId?: string): MeshBuildingSession | null {
		const session = sessionId ? this.sessions.get(sessionId) : this.currentSession;
		if (!session) return null;

		session.endTime = performance.now();
		session.totalDuration = session.endTime - session.startTime;

		// Stop specific session monitoring (but keep global loop if needed?)
		// For now, we stop everything to save resources if not explicitly in runtime mode
		this.stopMemoryMonitoring();

		// Take final memory snapshot
		const finalSnapshot = this.takeMemorySnapshot("session_end");
		session.memorySnapshots.push(finalSnapshot);

		// Calculate performance metrics
		this.calculateSessionMetrics(session);

		// Capture final renderer stats summary
		if (this.renderer && this.renderer.info) {
			session.rendererStats = {
				drawCalls: this.renderer.info.render.calls,
				triangles: this.renderer.info.render.triangles,
				points: this.renderer.info.render.points,
				lines: this.renderer.info.render.lines,
				geometries: this.renderer.info.memory.geometries,
				textures: this.renderer.info.memory.textures,
				programs: this.renderer.info.programs?.length || 0,
			};
		}

		this.currentSession = null;

		// Don't stop the monitoring loop immediately if we want to track runtime lag
		// But for consistency with previous behavior:
		this.stopMonitoringLoop();

		return session;
	}

	// Start background monitoring without a formal "Mesh Building" session
	// Useful for tracking runtime performance
	public startBackgroundMonitoring(): void {
		this.startMonitoringLoop();
	}

	public stopBackgroundMonitoring(): void {
		this.stopMonitoringLoop();
	}

	// Enhanced memory leak tracking
	private trackMemoryLeaks(session: MeshBuildingSession): void {
		if (session.memorySnapshots.length >= 2) {
			const initialMemory = session.memorySnapshots[0].usedJSHeapSize;
			const finalMemory =
				session.memorySnapshots[session.memorySnapshots.length - 1].usedJSHeapSize;
			session.memoryLeaks = finalMemory - initialMemory;
			const leakThreshold = 300 * 1024 * 1024; // 300MB threshold
			if (session.memoryLeaks > leakThreshold) {
				console.warn(`Significant memory leak detected: ${session.memoryLeaks / (1024 * 1024)} MB`);
			}
		}
	}

	private identifyUnreleasedObjects(session: MeshBuildingSession): string[] {
		const unreleased: string[] = [];
		session.memorySnapshots.forEach((snapshot, idx) => {
			if (idx === 0) return; // Skip first
			const prev = session.memorySnapshots[idx - 1];
			const delta = snapshot.usedJSHeapSize - prev.usedJSHeapSize;
			if (delta > 0) {
				unreleased.push(`Potential leak after ${prev.customData?.label || "unknown"}`);
			}
		});
		return unreleased;
	}

	public logMemoryAnalysis(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		this.trackMemoryLeaks(session);
		const unreleasedObjects = this.identifyUnreleasedObjects(session);
		console.log("Memory Analysis Results:", {
			totalLeak: session.memoryLeaks,
			unreleasedObjects,
		});
	}

	public startOperation(name: string, metadata?: Record<string, any>): void {
		const operation: TimingData = {
			name,
			startTime: performance.now(),
			parentOperation:
				this.timingStack.length > 0
					? this.timingStack[this.timingStack.length - 1].name
					: undefined,
			metadata,
		};

		this.timingStack.push(operation);

		if (this.currentSession) {
			this.currentSession.timingData.push(operation);
		}
	}

	public endOperation(name: string): void {
		const operationIndex = this.timingStack.findIndex((op) => op.name === name);
		if (operationIndex === -1) {
			console.warn(`⚠️ No matching start operation found for: ${name}`);
			return;
		}

		const operation = this.timingStack[operationIndex];
		operation.endTime = performance.now();
		operation.duration = operation.endTime - operation.startTime;

		// Debug log for major operations
		// if (name.includes("schematic-build") || name.includes("Process")) {
		//    console.log(`[PerfMonitor] Finished ${name}: ${operation.duration.toFixed(2)}ms`);
		// }

		// Remove from stack
		this.timingStack.splice(operationIndex, 1);

		// Take memory snapshot for significant operations
		if (operation.duration > 50) {
			// Operations taking more than 50ms
			this.takeMemorySnapshot(name);
		}
	}

	public recordOperationDetails(operationName: string, details: Record<string, any>) {
		if (!this.currentSession) return;

		// If detailed operation data is needed, store it
		this.currentSession.timingData.push({
			name: operationName,
			startTime: performance.now(),
			metadata: details,
		});
	}

	public recordBlockProcessing(data: BlockProcessingData): void {
		if (!this.currentSession) return;

		this.currentSession.blockProcessingData.push(data);

		// Update memory snapshot if significant processing time
		if (data.processingTime > 10) {
			this.takeMemorySnapshot(`block_${data.blockType}_${data.chunkId}`);
		}
	}

	public recordChunkProcessing(data: ChunkProcessingData): void {
		if (!this.currentSession) return;

		this.currentSession.chunkProcessingData.push(data);
		this.takeMemorySnapshot(`chunk_${data.chunkId}`);
	}

	public takeMemorySnapshot(label: string): MemorySnapshot {
		const snapshot: MemorySnapshot = {
			timestamp: performance.now(),
			jsHeapSize: 0,
			jsHeapSizeLimit: 0,
			usedJSHeapSize: 0,
			geometryCount: 0,
			textureCount: 0,
			materialCount: 0,
			vertexCount: 0,
			indexCount: 0,
			bufferMemoryEstimate: 0,
			customData: { label },
		};

		// Get browser memory info if available
		if ((performance as any).memory) {
			snapshot.jsHeapSize = (performance as any).memory.jsHeapSize;
			snapshot.jsHeapSizeLimit = (performance as any).memory.jsHeapSizeLimit;
			snapshot.usedJSHeapSize = (performance as any).memory.usedJSHeapSize;
		}

		// Get Three.js renderer memory info
		if (this.renderer && this.renderer.info) {
			snapshot.geometryCount = this.renderer.info.memory.geometries;
			snapshot.textureCount = this.renderer.info.memory.textures;
		}

		// Calculate custom memory estimates
		snapshot.bufferMemoryEstimate = this.estimateBufferMemory();

		// Update peak memory usage
		if (this.currentSession && snapshot.usedJSHeapSize > this.currentSession.peakMemoryUsage) {
			this.currentSession.peakMemoryUsage = snapshot.usedJSHeapSize;
		}

		return snapshot;
	}

	private estimateBufferMemory(): number {
		// This is a rough estimate based on typical WebGL buffer sizes
		if (!this.renderer || !this.renderer.info) return 0;

		const info = this.renderer.info;
		const estimatedVertexBufferSize = info.render.triangles * 3 * 3 * 4; // triangles * vertices * coordinates * float32
		const estimatedIndexBufferSize = info.render.triangles * 3 * 2; // triangles * indices * uint16

		return estimatedVertexBufferSize + estimatedIndexBufferSize;
	}

	private startMemoryMonitoring(): void {
		if (this.memoryIntervalId) return;

		this.memoryIntervalId = window.setInterval(() => {
			if (this.currentSession) {
				const snapshot = this.takeMemorySnapshot("continuous_monitoring");
				this.currentSession.memorySnapshots.push(snapshot);
			}
		}, this.memoryCheckInterval);
	}

	private stopMemoryMonitoring(): void {
		if (this.memoryIntervalId) {
			clearInterval(this.memoryIntervalId);
			this.memoryIntervalId = null;
		}
	}

	private calculateSessionMetrics(session: MeshBuildingSession): void {
		// Calculate average processing times
		if (session.blockProcessingData.length > 0) {
			const totalBlockTime = session.blockProcessingData.reduce(
				(sum, data) => sum + data.processingTime,
				0
			);
			session.averageBlockProcessingTime = totalBlockTime / session.blockProcessingData.length;
		}

		if (session.chunkProcessingData.length > 0) {
			const totalChunkTime = session.chunkProcessingData.reduce(
				(sum, data) => sum + data.processingTime,
				0
			);
			session.averageChunkProcessingTime = totalChunkTime / session.chunkProcessingData.length;
		}

		// Find slowest operations
		session.slowestOperations = session.timingData
			.filter((op) => op.duration !== undefined)
			.sort((a, b) => (b.duration || 0) - (a.duration || 0))
			.slice(0, 10);

		// Identify memory hotspots
		session.memoryHotspots = this.identifyMemoryHotspots(session);

		// Detect memory leaks
		if (session.memorySnapshots.length >= 2) {
			const initialMemory = session.memorySnapshots[0].usedJSHeapSize;
			const finalMemory =
				session.memorySnapshots[session.memorySnapshots.length - 1].usedJSHeapSize;
			session.memoryLeaks = finalMemory - initialMemory;
		}

		// Generate breakdown from timing data
		session.breakdown = session.timingData
			.filter((op) => op.duration !== undefined) // Include all completed operations
			.sort((a, b) => (b.duration || 0) - (a.duration || 0)) // Sort by duration
			.map((op) => {
				// Find memory delta if possible (this is rough as we don't snapshot for every op)
				// But we can check if there are snapshots with matching customData labels?
				// For now, just 0 or estimate
				return {
					operationId: op.name,
					duration: op.duration || 0,
					memoryDelta: 0, // Placeholder, would need precise snapshots to calculate
				};
			});
	}

	private identifyMemoryHotspots(session: MeshBuildingSession): string[] {
		const hotspots: string[] = [];

		// Look for operations that caused significant memory increases
		for (let i = 1; i < session.memorySnapshots.length; i++) {
			const prev = session.memorySnapshots[i - 1];
			const current = session.memorySnapshots[i];
			const memoryIncrease = current.usedJSHeapSize - prev.usedJSHeapSize;

			if (memoryIncrease > 5 * 1024 * 1024) {
				// 5MB increase
				hotspots.push(current.customData?.label || `snapshot_${i}`);
			}
		}

		return hotspots;
	}

	// Public API for retrieving data
	public getSession(sessionId: string): MeshBuildingSession | null {
		return this.sessions.get(sessionId) || null;
	}

	public getAllSessions(): MeshBuildingSession[] {
		return Array.from(this.sessions.values());
	}

	public getCurrentSession(): MeshBuildingSession | null {
		return this.currentSession;
	}

	public exportSessionData(sessionId: string): string {
		const session = this.sessions.get(sessionId);
		if (!session) return "";

		return JSON.stringify(session, null, 2);
	}

	public clearSessions(): void {
		this.sessions.clear();
		this.currentSession = null;
	}

	/**
	 * Clear all sessions and reset all performance monitoring data
	 */
	public clearAllSessions(): void {
		// Stop any ongoing monitoring
		this.stopMemoryMonitoring();
		this.stopMonitoringLoop();

		// Clear all sessions data
		this.sessions.clear();
		this.currentSession = null;

		// Reset tracking state
		this.timingStack = [];
		this.baselineMemory = null;
		this.frameCount = 0;
		this.lastTime = performance.now();
		this.latestFPS = 0;
		this.latestFrameTime = 0;

		console.log("[PerformanceMonitor] Cleared all sessions and reset monitoring state.");
	}

	// Utility methods for analysis
	public getMemoryUsageOverTime(sessionId: string): { time: number; memory: number }[] {
		const session = this.sessions.get(sessionId);
		if (!session) return [];

		return session.memorySnapshots.map((snapshot) => ({
			time: snapshot.timestamp - session.startTime,
			memory: snapshot.usedJSHeapSize,
		}));
	}

	public getOperationTimings(
		sessionId: string
	): { name: string; duration: number; count: number }[] {
		const session = this.sessions.get(sessionId);
		if (!session) return [];

		const timingMap = new Map<string, { total: number; count: number }>();

		session.timingData.forEach((timing) => {
			if (timing.duration !== undefined) {
				const existing = timingMap.get(timing.name) || { total: 0, count: 0 };
				existing.total += timing.duration;
				existing.count += 1;
				timingMap.set(timing.name, existing);
			}
		});

		return Array.from(timingMap.entries()).map(([name, data]) => ({
			name,
			duration: data.total / data.count,
			count: data.count,
		}));
	}

	public getBlockProcessingStats(
		sessionId: string
	): { blockType: string; averageTime: number; count: number }[] {
		const session = this.sessions.get(sessionId);
		if (!session) return [];

		const blockMap = new Map<string, { total: number; count: number }>();

		session.blockProcessingData.forEach((data) => {
			const existing = blockMap.get(data.blockType) || { total: 0, count: 0 };
			existing.total += data.processingTime;
			existing.count += 1;
			blockMap.set(data.blockType, existing);
		});

		return Array.from(blockMap.entries()).map(([blockType, data]) => ({
			blockType,
			averageTime: data.total / data.count,
			count: data.count,
		}));
	}

	// Enhanced Monitoring Loop (FPS + Frame Time + Renderer Stats)
	private startMonitoringLoop(): void {
		if (this.isMonitoring) return;
		this.isMonitoring = true;

		this.frameCount = 0;
		this.lastTime = performance.now();

		const loop = () => {
			if (!this.isMonitoring) return;

			const now = performance.now();
			const delta = now - this.lastTime;

			this.frameCount++;
			this.latestFrameTime = delta; // Frame duration in ms

			// Track frame data if in session
			if (this.currentSession) {
				// Track high-res frame history for jitter analysis
				// Only keep last 1000 frames to save memory
				if (this.currentSession.frameHistory.length < 1000) {
					this.currentSession.frameHistory.push({
						timestamp: now,
						duration: delta,
						fps: 1000 / delta,
					});
				}
			}

			// Update FPS every second
			// Note: calculating fps based on delta is instantaneous fps
			// Aggregate fps is better for smoothing
			if (this.frameCount % 60 === 0) {
				// update roughly every 60 frames
				// or keep the interval approach?
				// Let's stick to interval for average FPS, but use this loop for Frame Time
			}

			// Collect Renderer Stats if available
			if (this.renderer && this.renderer.info && this.currentSession) {
				// Sample every 10 frames to avoid overhead
				if (this.frameCount % 10 === 0) {
					this.currentSession.rendererStatsHistory.push({
						timestamp: now,
						drawCalls: this.renderer.info.render.calls,
						triangles: this.renderer.info.render.triangles,
						points: this.renderer.info.render.points,
						lines: this.renderer.info.render.lines,
						geometries: this.renderer.info.memory.geometries,
						textures: this.renderer.info.memory.textures,
						programs: this.renderer.info.programs?.length || 0,
					});
				}
			}

			this.lastTime = now;
			this.frameId = requestAnimationFrame(loop);
		};

		this.frameId = requestAnimationFrame(loop);

		// Parallel interval for FPS averages
		if (!this.fpsIntervalId) {
			let lastFpsTime = performance.now();
			let lastFpsFrameCount = 0;

			this.fpsIntervalId = window.setInterval(() => {
				const now = performance.now();
				const elapsed = now - lastFpsTime;
				const frames = this.frameCount - lastFpsFrameCount;

				if (elapsed >= 1000) {
					const fps = (frames * 1000) / elapsed;
					this.latestFPS = fps;

					if (this.currentSession) {
						this.currentSession.fpsHistory.push(fps);
						if (this.currentSession.fpsHistory.length > 60) this.currentSession.fpsHistory.shift();
						this.currentSession.averageFPS =
							this.currentSession.fpsHistory.reduce((a, b) => a + b, 0) /
							this.currentSession.fpsHistory.length;
					}

					lastFpsTime = now;
					lastFpsFrameCount = this.frameCount;
				}
			}, 1000);
		}
	}

	private stopMonitoringLoop(): void {
		this.isMonitoring = false;
		if (this.frameId !== null) {
			cancelAnimationFrame(this.frameId);
			this.frameId = null;
		}
		if (this.fpsIntervalId !== null) {
			clearInterval(this.fpsIntervalId);
			this.fpsIntervalId = null;
		}
	}

	public getCurrentFPS(): number {
		return this.latestFPS;
	}

	public getCurrentFrameTime(): number {
		return this.latestFrameTime;
	}

	public getAverageFPS(): number {
		if (!this.currentSession) return 0;
		return this.currentSession.averageFPS;
	}

	public getFPSHistory(sessionId?: string): number[] {
		const session = sessionId ? this.sessions.get(sessionId) : this.currentSession;
		if (!session) return [];
		return [...session.fpsHistory];
	}
}

// Global instance
export const performanceMonitor = PerformanceMonitor.getInstance();
