import { performanceMonitor } from "../performance/PerformanceMonitor";

export class PerformanceDashboard {
	private container: HTMLElement;
	private isVisible: boolean = false;
	private updateInterval: number | null = null;

	constructor() {
		this.container = this.createDashboard();
		this.setupEventListeners();
	}

	private createDashboard(): HTMLElement {
		const dashboard = document.createElement("div");
		dashboard.id = "performance-dashboard";
		dashboard.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 300px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            z-index: 10000;
            display: none;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;

		dashboard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3 style="margin: 0; color: #00ff00;">🎯 Performance Monitor</h3>
                <button id="close-dashboard" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px;">&times;</button>
            </div>
            <div id="performance-content">
                <div id="current-stats"></div>
                <div id="session-stats"></div>
                <div id="chunk-stats"></div>
                <div id="memory-stats"></div>
            </div>
        `;

		document.body.appendChild(dashboard);
		return dashboard;
	}

	private setupEventListeners(): void {
		const closeBtn = this.container.querySelector("#close-dashboard");
		closeBtn?.addEventListener("click", () => this.hide());

		// Toggle with Ctrl+P
		document.addEventListener("keydown", (e) => {
			if (e.ctrlKey && e.key === "p") {
				e.preventDefault();
				this.toggle();
			}
		});
	}

	public show(): void {
		this.isVisible = true;
		this.container.style.display = "block";
		this.startUpdating();
	}

	public hide(): void {
		this.isVisible = false;
		this.container.style.display = "none";
		this.stopUpdating();
	}

	public toggle(): void {
		if (this.isVisible) {
			this.hide();
		} else {
			this.show();
		}
	}

	public isShowing(): boolean {
		return this.isVisible;
	}

	private startUpdating(): void {
		if (this.updateInterval) return;

		this.updateInterval = window.setInterval(() => {
			this.updateContent();
		}, 1000); // Update every second

		this.updateContent(); // Initial update
	}

	private stopUpdating(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	private updateContent(): void {
		const currentSession = performanceMonitor.getCurrentSession();
		const currentFPS = performanceMonitor.getCurrentFPS();
		const avgFPS = performanceMonitor.getAverageFPS();

		const currentStatsEl = this.container.querySelector("#current-stats");
		const sessionStatsEl = this.container.querySelector("#session-stats");
		const chunkStatsEl = this.container.querySelector("#chunk-stats");
		const memoryStatsEl = this.container.querySelector("#memory-stats");

		// Current Stats
		if (currentStatsEl) {
			currentStatsEl.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <strong>📊 Current Performance:</strong><br>
                    FPS: ${currentFPS.toFixed(1)} | Avg: ${avgFPS.toFixed(1)}
                </div>
            `;
		}

		// Session Stats
		if (sessionStatsEl && currentSession) {
			const elapsed = performance.now() - currentSession.startTime;
			sessionStatsEl.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <strong>🚀 Session (${currentSession.renderMode}):</strong><br>
                    Duration: ${(elapsed / 1000).toFixed(1)}s<br>
                    Operations: ${currentSession.timingData.length}
                </div>
            `;
		}

		// Chunk Stats
		if (chunkStatsEl && currentSession) {
			const chunkData = currentSession.chunkProcessingData;
			const totalBlocks = chunkData.reduce((sum, chunk) => sum + chunk.blockCount, 0);
			const totalVertices = chunkData.reduce((sum, chunk) => sum + chunk.totalVertices, 0);

			chunkStatsEl.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <strong>🗂️ Chunks:</strong><br>
                    Processed: ${chunkData.length}<br>
                    Blocks: ${totalBlocks.toLocaleString()}<br>
                    Vertices: ${totalVertices.toLocaleString()}
                </div>
            `;
		}

		// Memory Stats
		if (memoryStatsEl && currentSession) {
			const peakMemory = (currentSession.peakMemoryUsage / 1024 / 1024).toFixed(1);
			const currentMemory = (performance as any).memory
				? ((performance as any).memory.usedJSHeapSize / 1024 / 1024).toFixed(1)
				: "N/A";

			memoryStatsEl.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <strong>💾 Memory:</strong><br>
                    Current: ${currentMemory}MB<br>
                    Peak: ${peakMemory}MB<br>
                    Hotspots: ${currentSession.memoryHotspots.length}
                </div>
            `;
		}
	}

	public showSessionSummary(sessionData: any): void {
		const summaryEl = document.createElement("div");
		summaryEl.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 10px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            z-index: 10001;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            border: 2px solid #00ff00;
        `;

		summaryEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h2 style="margin: 0; color: #00ff00;">🎯 Session Complete</h2>
                <button id="close-summary" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px;">&times;</button>
            </div>
            <div style="line-height: 1.4;">
                <strong>📊 Build Mode:</strong> ${sessionData.renderMode}<br>
                <strong>⏱️ Duration:</strong> ${sessionData.totalDuration?.toFixed(2)}ms<br>
                <strong>💾 Peak Memory:</strong> ${(sessionData.peakMemoryUsage / 1024 / 1024).toFixed(2)}MB<br>
                <strong>🎥 Average FPS:</strong> ${sessionData.averageFPS.toFixed(2)}<br>
                <strong>🗂️ Chunks:</strong> ${sessionData.chunkProcessingData.length}<br>
                <strong>🧱 Blocks:</strong> ${sessionData.chunkProcessingData.reduce((sum: number, chunk: any) => sum + chunk.blockCount, 0).toLocaleString()}<br>
                <strong>📐 Vertices:</strong> ${sessionData.chunkProcessingData.reduce((sum: number, chunk: any) => sum + chunk.totalVertices, 0).toLocaleString()}<br>
            </div>
        `;

		document.body.appendChild(summaryEl);

		const closeBtn = summaryEl.querySelector("#close-summary");
		closeBtn?.addEventListener("click", () => {
			document.body.removeChild(summaryEl);
		});

		// Auto-close after 5 seconds
		setTimeout(() => {
			if (document.body.contains(summaryEl)) {
				document.body.removeChild(summaryEl);
			}
		}, 5000);
	}
}

// Global instance
export const performanceDashboard = new PerformanceDashboard();
