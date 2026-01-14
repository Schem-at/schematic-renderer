import * as d3 from "d3";
import { ChunkRenderingPhase } from "./PerformanceMonitor";

export interface ChunkAnalysisData {
	chunkId: string;
	chunkCoords: [number, number, number];
	totalTime: number;
	blockCount: number;
	phases: ChunkRenderingPhase[];
	geometryStats: {
		facesCulled: number;
		facesGenerated: number;
		cullingEfficiency: number;
		averageVerticesPerBlock: number;
	};
	memoryBreakdown: {
		vertexBuffers: number;
		indexBuffers: number;
		materials: number;
		textures: number;
		other: number;
	};
}

export class ChunkRenderingChart {
	private container: HTMLElement;
	private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
	private tooltip!: d3.Selection<HTMLDivElement, unknown, null, undefined>;
	private theme: "light" | "dark";
	private width: number = 800;
	private height: number = 400;
	private margin = { top: 40, right: 30, bottom: 120, left: 80 };

	constructor(container: HTMLElement, theme: "light" | "dark" = "dark") {
		this.container = container;
		this.theme = theme;
		this.setupContainer();
		this.createTooltip();
	}

	private setupContainer(): void {
		this.container.innerHTML = "";
		this.container.style.cssText = `
            background: ${this.theme === "dark" ? "#2a2a2a" : "#f5f5f5"};
            border-radius: 8px;
            padding: 20px;
            border: 1px solid ${this.theme === "dark" ? "#444" : "#ddd"};
            position: relative;
        `;

		const title = document.createElement("h3");
		title.textContent = "Chunk Rendering Analysis";
		title.style.cssText = `
            margin: 0 0 20px 0;
            color: ${this.theme === "dark" ? "#fff" : "#333"};
            font-size: 18px;
            text-align: center;
        `;
		this.container.appendChild(title);

		this.svg = d3
			.select(this.container)
			.append("svg")
			.attr("width", this.width)
			.attr("height", this.height);
	}

	private createTooltip(): void {
		this.tooltip = d3
			.select("body")
			.append("div")
			.attr("class", "chunk-analysis-tooltip")
			.style("position", "absolute")
			.style("padding", "15px")
			.style(
				"background",
				this.theme === "dark" ? "rgba(0, 0, 0, 0.95)" : "rgba(255, 255, 255, 0.95)"
			)
			.style("color", this.theme === "dark" ? "#fff" : "#333")
			.style("border", `2px solid ${this.theme === "dark" ? "#666" : "#ccc"}`)
			.style("border-radius", "8px")
			.style("font-size", "12px")
			.style("font-family", "monospace")
			.style("pointer-events", "none")
			.style("opacity", 0)
			.style("z-index", "10000")
			.style("max-width", "400px")
			.style("box-shadow", "0 4px 12px rgba(0,0,0,0.3)") as unknown as d3.Selection<
			HTMLDivElement,
			unknown,
			null,
			undefined
		>;
	}

	public updateData(chunkData: ChunkAnalysisData[]): void {
		this.svg.selectAll("*").remove();

		if (!chunkData.length) {
			this.showNoDataMessage();
			return;
		}

		this.renderTimelineChart(chunkData);
	}

	private showNoDataMessage(): void {
		this.svg
			.append("text")
			.attr("x", this.width / 2)
			.attr("y", this.height / 2)
			.attr("text-anchor", "middle")
			.attr("fill", this.theme === "dark" ? "#888" : "#666")
			.attr("font-size", "16px")
			.text("No chunk data available");
	}

	private renderTimelineChart(chunkData: ChunkAnalysisData[]): void {
		// Sort chunks by processing time
		const sortedData = [...chunkData].sort((a, b) => b.totalTime - a.totalTime);

		// Take top 20 slowest chunks for visualization
		const displayData = sortedData.slice(0, 20);

		// Create scales
		const xScale = d3
			.scaleBand()
			.domain(displayData.map((d) => `[${d.chunkCoords.join(",")}]`))
			.range([this.margin.left, this.width - this.margin.right])
			.padding(0.1);

		const yScale = d3
			.scaleLinear()
			.domain([0, d3.max(displayData, (d) => d.totalTime) || 100])
			.nice()
			.range([this.height - this.margin.bottom, this.margin.top]);

		// Create phase color scale
		const phaseColors = d3
			.scaleOrdinal()
			.domain([
				"block_processing",
				"geometry_generation",
				"buffer_creation",
				"material_binding",
				"gpu_upload",
			])
			.range(["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"]);

		// Add axes
		this.svg
			.append("g")
			.attr("transform", `translate(0,${this.height - this.margin.bottom})`)
			.call(d3.axisBottom(xScale))
			.selectAll("text")
			.attr("transform", "rotate(-45)")
			.style("text-anchor", "end")
			.attr("fill", this.theme === "dark" ? "#fff" : "#333");

		this.svg
			.append("g")
			.attr("transform", `translate(${this.margin.left},0)`)
			.call(d3.axisLeft(yScale).tickFormat((d) => `${d}ms`))
			.selectAll("text")
			.attr("fill", this.theme === "dark" ? "#fff" : "#333");

		// Add axis labels
		this.svg
			.append("text")
			.attr("transform", "rotate(-90)")
			.attr("y", 0 - this.margin.left + 40)
			.attr("x", 0 - this.height / 2)
			.attr("dy", "1em")
			.style("text-anchor", "middle")
			.attr("fill", this.theme === "dark" ? "#fff" : "#333")
			.text("Processing Time (ms)");

		this.svg
			.append("text")
			.attr("transform", `translate(${this.width / 2}, ${this.height - 10})`)
			.style("text-anchor", "middle")
			.attr("fill", this.theme === "dark" ? "#fff" : "#333")
			.text("Chunk Coordinates (Top 20 Slowest)");

		// Create stacked bars for rendering phases
		displayData.forEach((chunk) => {
			const chunkGroup = this.svg
				.append("g")
				.attr("class", "chunk-group")
				.attr("data-chunk-id", chunk.chunkId);

			let currentY = yScale(0);
			const barWidth = xScale.bandwidth();
			const barX = xScale(`[${chunk.chunkCoords.join(",")}]`)!;

			// Calculate phase proportions based on timing

			chunk.phases.forEach((phase) => {
				if (!phase.duration) return;

				const phaseHeight =
					(phase.duration / chunk.totalTime) * (yScale(0) - yScale(chunk.totalTime));
				const nextY = currentY - phaseHeight;

				const rect = chunkGroup
					.append("rect")
					.attr("x", barX)
					.attr("y", nextY)
					.attr("width", barWidth)
					.attr("height", phaseHeight)
					.attr("fill", phaseColors(phase.name) as string)
					.attr("stroke", this.theme === "dark" ? "#333" : "#fff")
					.attr("stroke-width", 1)
					.style("cursor", "pointer");

				// Add phase interaction
				rect
					.on("mouseover", (event: MouseEvent) => {
						this.showPhaseTooltip(event, chunk, phase);
					})
					.on("mouseout", () => {
						this.hideTooltip();
					});

				currentY = nextY;
			});

			// Add chunk-level interaction for overall stats
			chunkGroup
				.append("rect")
				.attr("x", barX)
				.attr("y", yScale(chunk.totalTime))
				.attr("width", barWidth)
				.attr("height", yScale(0) - yScale(chunk.totalTime))
				.attr("fill", "transparent")
				.style("cursor", "pointer")
				.on("mouseover", (event: MouseEvent) => {
					this.showChunkTooltip(event, chunk);
				})
				.on("mouseout", () => {
					this.hideTooltip();
				});
		});

		// Add legend
		this.addLegend();
	}

	private addLegend(): void {
		const legendData = [
			{ name: "Block Processing", color: "#FF6B6B" },
			{ name: "Geometry Generation", color: "#4ECDC4" },
			{ name: "Buffer Creation", color: "#45B7D1" },
			{ name: "Material Binding", color: "#96CEB4" },
			{ name: "GPU Upload", color: "#FFEAA7" },
		];

		const legend = this.svg
			.append("g")
			.attr("class", "legend")
			.attr("transform", `translate(${this.width - 200}, 50)`);

		const legendItems = legend
			.selectAll(".legend-item")
			.data(legendData)
			.enter()
			.append("g")
			.attr("class", "legend-item")
			.attr("transform", (_d, i) => `translate(0, ${i * 20})`);

		legendItems
			.append("rect")
			.attr("width", 15)
			.attr("height", 15)
			.attr("fill", (d) => d.color);

		legendItems
			.append("text")
			.attr("x", 20)
			.attr("y", 12)
			.attr("fill", this.theme === "dark" ? "#fff" : "#333")
			.attr("font-size", "12px")
			.text((d) => d.name);
	}

	private showChunkTooltip(event: MouseEvent, chunk: ChunkAnalysisData): void {
		const coords = `[${chunk.chunkCoords.join(", ")}]`;
		const efficiency = (chunk.geometryStats.cullingEfficiency * 100).toFixed(1);
		const avgVertices = chunk.geometryStats.averageVerticesPerBlock.toFixed(1);

		const vertexMB = (chunk.memoryBreakdown.vertexBuffers / 1024 / 1024).toFixed(2);
		const indexMB = (chunk.memoryBreakdown.indexBuffers / 1024 / 1024).toFixed(2);

		const tooltipContent = `
            <div style="border-bottom: 1px solid #666; padding-bottom: 8px; margin-bottom: 8px;">
                <strong>Chunk ${coords}</strong><br>
                <span style="color: #4CAF50;">ID: ${chunk.chunkId}</span>
            </div>
            
            <div style="margin-bottom: 8px;">
                <strong>📊 Performance:</strong><br>
                • Total Time: ${chunk.totalTime.toFixed(2)}ms<br>
                • Blocks: ${chunk.blockCount}<br>
                • Avg Vertices/Block: ${avgVertices}
            </div>
            
            <div style="margin-bottom: 8px;">
                <strong>✂️ Geometry:</strong><br>
                • Faces Generated: ${chunk.geometryStats.facesGenerated.toLocaleString()}<br>
                • Faces Culled: ${chunk.geometryStats.facesCulled.toLocaleString()}<br>
                • Culling Efficiency: ${efficiency}%
            </div>
            
            <div>
                <strong>💾 Memory:</strong><br>
                • Vertex Buffers: ${vertexMB}MB<br>
                • Index Buffers: ${indexMB}MB<br>
                • Materials: ${(chunk.memoryBreakdown.materials / 1024).toFixed(1)}KB<br>
                • Textures: ${(chunk.memoryBreakdown.textures / 1024).toFixed(1)}KB
            </div>
        `;

		this.tooltip
			.style("opacity", 1)
			.html(tooltipContent)
			.style("left", `${event.pageX + 15}px`)
			.style("top", `${event.pageY - 10}px`);
	}

	private showPhaseTooltip(
		event: MouseEvent,
		chunk: ChunkAnalysisData,
		phase: ChunkRenderingPhase
	): void {
		const coords = `[${chunk.chunkCoords.join(", ")}]`;
		const percentage = (((phase.duration || 0) / chunk.totalTime) * 100).toFixed(1);
		const memoryDelta =
			phase.memoryAfter && phase.memoryBefore
				? ((phase.memoryAfter - phase.memoryBefore) / 1024 / 1024).toFixed(2)
				: "N/A";

		const tooltipContent = `
            <div style="border-bottom: 1px solid #666; padding-bottom: 8px; margin-bottom: 8px;">
                <strong>${phase.name.replace(/_/g, " ").toUpperCase()}</strong><br>
                <span style="color: #888;">Chunk ${coords}</span>
            </div>
            
            <div>
                <strong>⏱️ Timing:</strong><br>
                • Duration: ${(phase.duration || 0).toFixed(2)}ms<br>
                • Percentage of Total: ${percentage}%<br>
                • Memory Delta: ${memoryDelta}MB
            </div>
            
            ${
							phase.metadata
								? `
            <div style="margin-top: 8px;">
                <strong>📋 Details:</strong><br>
                ${Object.entries(phase.metadata)
									.map(([key, value]) => `• ${key}: ${value}`)
									.join("<br>")}
            </div>
            `
								: ""
						}
        `;

		this.tooltip
			.style("opacity", 1)
			.html(tooltipContent)
			.style("left", `${event.pageX + 15}px`)
			.style("top", `${event.pageY - 10}px`);
	}

	private hideTooltip(): void {
		this.tooltip.style("opacity", 0);
	}

	public destroy(): void {
		this.tooltip.remove();
		this.container.innerHTML = "";
	}
}
