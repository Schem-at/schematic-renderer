// src/performance/PerformanceVisualizer.ts
import * as d3 from 'd3';
import { performanceMonitor } from './PerformanceMonitor';

export interface VisualizationConfig {
    container: HTMLElement;
    width?: number;
    height?: number;
    theme?: 'light' | 'dark';
    showLiveFPS?: boolean;
    updateInterval?: number;
}

export class PerformanceVisualizer {
    private container: HTMLElement;
    private config: Required<VisualizationConfig>;
    private fpsMonitor: FPSMonitor | null = null;
    private charts: Map<string, Chart> = new Map();
    private isVisible: boolean = false;
    private onMeshModeChange?: (mode: 'immediate' | 'incremental' | 'instanced') => void;

    constructor(config: VisualizationConfig) {
        this.container = config.container;
        this.config = {
            container: config.container,
            width: config.width || 800,
            height: config.height || 600,
            theme: config.theme || 'dark',
            showLiveFPS: config.showLiveFPS !== false,
            updateInterval: config.updateInterval || 1000
        };

        this.setupContainer();
        this.createCharts();
        
        if (this.config.showLiveFPS) {
            this.startFPSMonitoring();
        }
    }

    private setupContainer(): void {
        this.container.innerHTML = '';
        this.container.className = 'bg-gray-900 text-white font-mono p-5 rounded-lg shadow-lg max-h-screen overflow-y-auto';

        // Create main layout
        const header = document.createElement('div');
        header.className = 'flex justify-between items-center mb-5 pb-3 border-b-2 border-gray-700';
        
        const title = document.createElement('h2');
        title.textContent = 'Performance Monitor';
        title.className = 'm-0 text-white text-xl font-bold';
        
        const controls = document.createElement('div');
        controls.className = 'flex items-center gap-3';
        
        // Mesh Mode Controls
        const meshModeGroup = document.createElement('div');
        meshModeGroup.className = 'flex items-center gap-2 mr-4 pr-4 border-r border-gray-600';
        
        const meshModeLabel = document.createElement('span');
        meshModeLabel.textContent = 'Mesh Mode:';
        meshModeLabel.className = 'text-xs text-gray-300 whitespace-nowrap';
        
        const meshModeSelect = document.createElement('select');
        meshModeSelect.className = 'bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 text-xs cursor-pointer';
        meshModeSelect.innerHTML = `
            <option value="immediate">Immediate</option>
            <option value="incremental">Incremental</option>
            <option value="instanced">Instanced</option>
        `;
        meshModeSelect.value = 'incremental';
        
        meshModeSelect.onchange = () => {
            const selectedMode = meshModeSelect.value as 'immediate' | 'incremental' | 'instanced';
            if (this.onMeshModeChange) {
                this.onMeshModeChange(selectedMode);
            }
        };
        
        meshModeGroup.appendChild(meshModeLabel);
        meshModeGroup.appendChild(meshModeSelect);
        
        // Export button
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export Data';
        exportBtn.className = 'bg-green-600 text-white border-none px-4 py-2 rounded cursor-pointer text-xs hover:bg-green-700';
        exportBtn.onclick = () => this.exportData();
        
        // Clear button
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear Data';
        clearBtn.className = 'bg-red-600 text-white border-none px-4 py-2 rounded cursor-pointer text-xs hover:bg-red-700';
        clearBtn.onclick = () => this.clearData();
        
        controls.appendChild(meshModeGroup);
        controls.appendChild(exportBtn);
        controls.appendChild(clearBtn);
        header.appendChild(title);
        header.appendChild(controls);
        
        this.container.appendChild(header);

        // Create grid layout for charts
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 lg:grid-cols-2 gap-5';
        grid.id = 'performance-grid';
        this.container.appendChild(grid);
    }

    private createCharts(): void {
        const grid = this.container.querySelector('#performance-grid') as HTMLElement;
        
        // Operation Timing Chart
        const timingChart = new TimingChart(this.config.theme);
        this.charts.set('timing', timingChart);
        grid.appendChild(timingChart.getContainer());

        // Chunk Processing Chart
        const chunkChart = new ChunkProcessingChart(this.config.theme);
        this.charts.set('chunks', chunkChart);
        grid.appendChild(chunkChart.getContainer());
    }

    private startFPSMonitoring(): void {
        // Update FPS chart regularly using the actual PerformanceMonitor FPS data
        setInterval(() => {
            if (this.isVisible) {
                const fpsChart = this.charts.get('fps') as FPSChart;
                if (fpsChart) {
                    const currentFPS = performanceMonitor.getCurrentFPS();
                    if (currentFPS > 0) {
                        fpsChart.updateData({
                            timestamp: Date.now(),
                            fps: currentFPS
                        });
                    }
                }
            }
        }, this.config.updateInterval);
    }

    public show(): void {
        this.isVisible = true;
        this.container.style.display = 'block';
        this.updateCharts();
    }

    public hide(): void {
        this.isVisible = false;
        this.container.style.display = 'none';
    }

    public toggle(): void {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    public updateCharts(): void {
        if (!this.isVisible) return;

        const sessions = performanceMonitor.getAllSessions();
        
        // Update timing chart
        const timingChart = this.charts.get('timing') as TimingChart;
        if (timingChart) {
            timingChart.updateData(sessions);
        }

        // Update chunk processing chart
        const chunkChart = this.charts.get('chunks') as ChunkProcessingChart;
        if (chunkChart) {
            chunkChart.updateData(sessions);
        }
    }

    private exportData(): void {
        const currentSession = performanceMonitor.getCurrentSession();
        const allSessions = performanceMonitor.getAllSessions();
        const data = {
            currentSession,
            allSessions,
            exportTime: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `performance-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    private clearData(): void {
        performanceMonitor.clearSessions();
        this.updateCharts();
    }

    public setMeshModeChangeCallback(callback: (mode: 'immediate' | 'incremental' | 'instanced') => void): void {
        this.onMeshModeChange = callback;
    }

    public destroy(): void {
        this.isVisible = false;
        if (this.fpsMonitor) {
            this.fpsMonitor.stop();
        }
        this.charts.forEach(chart => chart.destroy());
        this.charts.clear();
    }
}

// Base Chart class
abstract class Chart {
    protected container: HTMLElement;
    protected svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    protected theme: 'light' | 'dark';
    protected width: number = 400;
    protected height: number = 300;
    protected margin = { top: 30, right: 30, bottom: 60, left: 80 };
    protected tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined>;
    
    // Responsive sizing
    protected minWidth = 300;
    protected minHeight = 200;

    constructor(theme: 'light' | 'dark', title: string) {
        this.theme = theme;
        this.container = this.createContainer(title);
        
        // Calculate proper dimensions based on container
        const containerRect = this.container.getBoundingClientRect();
        this.width = Math.max(this.minWidth, containerRect.width - 30);
        this.height = Math.max(this.minHeight, containerRect.height - 60);
        
        this.svg = this.createSVG();
        this.tooltip = this.createTooltip();
        
        // Setup responsive behavior
        this.setupResponsive();
    }
    
    protected createTooltip(): d3.Selection<HTMLDivElement, unknown, null, undefined> {
        return d3.select('body')
            .append('div')
            .attr('class', 'chart-tooltip')
            .style('position', 'absolute')
            .style('padding', '10px')
            .style('background', this.theme === 'dark' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.9)')
            .style('color', this.theme === 'dark' ? '#fff' : '#333')
            .style('border', `1px solid ${this.theme === 'dark' ? '#666' : '#ccc'}`)
            .style('border-radius', '4px')
            .style('font-size', '12px')
            .style('font-family', 'Arial, sans-serif')
            .style('pointer-events', 'none')
            .style('opacity', 0)
            .style('z-index', '10000') as unknown as d3.Selection<HTMLDivElement, unknown, null, undefined>;
    }
    
    protected setupResponsive(): void {
        // Add resize observer if available
        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(entries => {
                const rect = entries[0].contentRect;
                this.onResize(rect.width, rect.height);
            });
            resizeObserver.observe(this.container);
        }
        
        // Fallback to window resize for older browsers
        window.addEventListener('resize', () => {
            this.onResize();
        });
    }
    
    protected onResize(containerWidth?: number, containerHeight?: number): void {
        const containerRect = this.container.getBoundingClientRect();
        const newWidth = Math.max(this.minWidth, containerWidth || containerRect.width - 30);
        const newHeight = Math.max(this.minHeight, containerHeight || containerRect.height - 60);
        
        if (newWidth !== this.width || newHeight !== this.height) {
            this.width = newWidth;
            this.height = newHeight;
            this.svg.attr('width', this.width).attr('height', this.height);
            
            // Trigger data update to redraw with new dimensions
            this.redraw();
        }
    }
    
    protected abstract redraw(): void;
    
    protected showTooltip(content: string, event: MouseEvent): void {
        this.tooltip
            .style('opacity', 1)
            .html(content)
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY - 10}px`);
    }
    
    protected hideTooltip(): void {
        this.tooltip.style('opacity', 0);
    }

    protected createContainer(title: string): HTMLElement {
        const container = document.createElement('div');
        container.style.cssText = `
            background: ${this.theme === 'dark' ? '#2a2a2a' : '#f5f5f5'};
            border-radius: 8px;
            padding: 15px;
            border: 1px solid ${this.theme === 'dark' ? '#444' : '#ddd'};
            overflow: hidden;
            width: 100%;
            height: 400px;
            box-sizing: border-box;
        `;

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        titleEl.style.cssText = `
            margin: 0 0 10px 0;
            color: ${this.theme === 'dark' ? '#fff' : '#333'};
            font-size: 16px;
        `;
        container.appendChild(titleEl);

        return container;
    }

    protected createSVG(): d3.Selection<SVGSVGElement, unknown, null, undefined> {
        return d3.select(this.container)
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height);
    }

    abstract updateData(data: any): void;

    public getContainer(): HTMLElement {
        return this.container;
    }

    public destroy(): void {
        this.container.remove();
    }
}

// FPS Chart for live monitoring
class FPSChart extends Chart {
    private fpsData: Array<{ timestamp: number; fps: number }> = [];
    private maxDataPoints = 100;
    private line!: d3.Line<{ timestamp: number; fps: number }>;
    private xScale!: d3.ScaleTime<number, number>;
    private yScale!: d3.ScaleLinear<number, number>;

    constructor(theme: 'light' | 'dark') {
        super(theme, 'Live FPS Monitor');
        this.setupScales();
        this.setupChart();
    }

    private setupScales(): void {
        this.xScale = d3.scaleTime()
            .range([this.margin.left, this.width - this.margin.right]);

        this.yScale = d3.scaleLinear()
            .domain([0, 120])
            .range([this.height - this.margin.bottom, this.margin.top]);

        this.line = d3.line<{ timestamp: number; fps: number }>()
            .x(d => this.xScale(d.timestamp))
            .y(d => this.yScale(d.fps))
            .curve(d3.curveMonotoneX);
    }

    private setupChart(): void {
        // X-axis
        this.svg.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${this.height - this.margin.bottom})`)
            .call(d3.axisBottom(this.xScale).tickFormat((d: any) => d3.timeFormat('%H:%M:%S')(d)));

        // Y-axis
        this.svg.append('g')
            .attr('class', 'y-axis')
            .attr('transform', `translate(${this.margin.left},0)`)
            .call(d3.axisLeft(this.yScale));

        // Line path
        this.svg.append('path')
            .attr('class', 'fps-line')
            .attr('fill', 'none')
            .attr('stroke', '#4CAF50')
            .attr('stroke-width', 2);

        // Current FPS display
        this.svg.append('text')
            .attr('class', 'fps-current')
            .attr('x', this.width - 80)
            .attr('y', 30)
            .attr('font-size', '24px')
            .attr('font-weight', 'bold')
            .attr('fill', '#4CAF50')
            .text('-- FPS');

        // Style axes
        this.svg.selectAll('.x-axis, .y-axis')
            .selectAll('text')
            .attr('fill', this.theme === 'dark' ? '#fff' : '#333');

        this.svg.selectAll('.x-axis, .y-axis')
            .selectAll('path, line')
            .attr('stroke', this.theme === 'dark' ? '#666' : '#333');
    }

    updateData(newData: { timestamp: number; fps: number }): void {
        this.fpsData.push(newData);
        
        // Keep only recent data points
        if (this.fpsData.length > this.maxDataPoints) {
            this.fpsData.shift();
        }

        this.redraw();
    }
    
    protected redraw(): void {
        // Clear and rebuild
        this.svg.selectAll('*').remove();
        
        if (!this.fpsData.length) return;
        
        // Update scales with current data
        const extent = d3.extent(this.fpsData, d => d.timestamp);
        if (extent[0] && extent[1]) {
            this.xScale.domain([new Date(extent[0]), new Date(extent[1])]);
        }
        
        // Update y scale based on data
        const fpsExtent = d3.extent(this.fpsData, d => d.fps);
        this.yScale.domain([0, Math.max(120, (fpsExtent[1] || 60) * 1.1)]);
        
        // Recreate scales with current dimensions
        this.setupScales();
        
        // Recreate chart elements
        this.setupChart();
        
        // Add interactive dots for tooltips
        this.svg.selectAll('.fps-dot')
            .data(this.fpsData)
            .enter()
            .append('circle')
            .attr('class', 'fps-dot')
            .attr('cx', d => this.xScale(d.timestamp))
            .attr('cy', d => this.yScale(d.fps))
            .attr('r', 3)
            .attr('fill', '#4CAF50')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .style('cursor', 'pointer')
            .on('mouseover', (event: MouseEvent, d: any) => {
                const tooltipContent = `
                    <strong>FPS:</strong> ${Math.round(d.fps)}<br>
                    <strong>Time:</strong> ${d3.timeFormat('%H:%M:%S')(new Date(d.timestamp))}
                `;
                this.showTooltip(tooltipContent, event);
            })
            .on('mouseout', () => {
                this.hideTooltip();
            });
            
        // Update line
        this.svg.select('.fps-line')
            .datum(this.fpsData)
            .attr('d', this.line);

        // Update current FPS display
        if (this.fpsData.length > 0) {
            const latestFPS = this.fpsData[this.fpsData.length - 1].fps;
            this.svg.select('.fps-current')
                .text(`${Math.round(latestFPS)} FPS`);
        }
    }
}

/*
// Memory Usage Chart (commented out as unused)
class MemoryChart extends Chart {
    private sessionData: any[] = [];
    private xScale!: d3.ScaleTime<number, number>;
    private yScale!: d3.ScaleLinear<number, number>;
    private line!: d3.Line<any>;
    
    constructor(theme: 'light' | 'dark') {
        super(theme, 'Memory Usage');
        this.initializeScales();
    }
    
    private initializeScales(): void {
        this.xScale = d3.scaleTime()
            .range([this.margin.left, this.width - this.margin.right]);
            
        this.yScale = d3.scaleLinear()
            .range([this.height - this.margin.bottom, this.margin.top]);
            
        this.line = d3.line<any>()
            .x(d => this.xScale(new Date(d.timestamp)))
            .y(d => this.yScale(d.usedJSHeapSize))
            .curve(d3.curveMonotoneX);
    }

    updateData(sessions: any[]): void {
        this.sessionData = sessions;
        this.redraw();
    }
    
    protected redraw(): void {
        this.svg.selectAll('*').remove();

        if (!this.sessionData.length) {
            this.showEmptyState();
            return;
        }

        const latestSession = this.sessionData[this.sessionData.length - 1];
        const memorySnapshots = latestSession.memorySnapshots || [];
        
        if (!memorySnapshots.length) {
            this.showEmptyState();
            return;
        }

        // Update scales with current dimensions and data
        this.initializeScales();
        
        // Calculate dynamic Y domain with some padding
        const memoryValues = memorySnapshots.map((d: any) => d.usedJSHeapSize);
        const minMemory = Math.min(...memoryValues);
        const maxMemory = Math.max(...memoryValues);
        const padding = (maxMemory - minMemory) * 0.1; // 10% padding
        
        this.xScale.domain(d3.extent(memorySnapshots, (d: any) => new Date(d.timestamp)) as [Date, Date]);
        this.yScale.domain([Math.max(0, minMemory - padding), maxMemory + padding]);

        // Add axes with updated scales
        this.svg.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${this.height - this.margin.bottom})`)
            .call(d3.axisBottom(this.xScale)
                .tickFormat((d: any) => d3.timeFormat('%H:%M:%S')(d))
                .ticks(6));

        this.svg.append('g')
            .attr('class', 'y-axis')
            .attr('transform', `translate(${this.margin.left},0)`)
            .call(d3.axisLeft(this.yScale)
                .tickFormat((d: any) => `${(Number(d) / 1024 / 1024).toFixed(1)}MB`)
                .ticks(6));

        // Add grid lines for better readability
        this.svg.append('g')
            .attr('class', 'grid')
            .attr('transform', `translate(${this.margin.left},0)`)
            .call(d3.axisLeft(this.yScale)
                .tickSize(-(this.width - this.margin.left - this.margin.right))
                .tickFormat(() => '')
                .ticks(6))
            .selectAll('line')
            .attr('stroke', this.theme === 'dark' ? '#333' : '#e0e0e0')
            .attr('stroke-dasharray', '2,2');

        // Add area under curve for better visual appeal
        const area = d3.area<any>()
            .x(d => this.xScale(new Date(d.timestamp)))
            .y0(this.yScale.range()[0])
            .y1(d => this.yScale(d.usedJSHeapSize))
            .curve(d3.curveMonotoneX);
            
        this.svg.append('path')
            .datum(memorySnapshots)
            .attr('fill', '#FF9800')
            .attr('fill-opacity', 0.2)
            .attr('d', area);

        // Add main line
        this.svg.append('path')
            .datum(memorySnapshots)
            .attr('class', 'memory-line')
            .attr('fill', 'none')
            .attr('stroke', '#FF9800')
            .attr('stroke-width', 3)
            .attr('d', this.line);
            
        // Add interactive dots for tooltips
        this.svg.selectAll('.memory-dot')
            .data(memorySnapshots)
            .enter()
            .append('circle')
            .attr('class', 'memory-dot')
            .attr('cx', (d: any) => this.xScale(new Date(d.timestamp)))
            .attr('cy', (d: any) => this.yScale(d.usedJSHeapSize))
            .attr('r', 4)
            .attr('fill', '#FF9800')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .style('opacity', 0.8)
            .on('mouseover', (event: MouseEvent, d: any) => {
                const memoryMB = (d.usedJSHeapSize / 1024 / 1024).toFixed(2);
                const timeStr = d3.timeFormat('%H:%M:%S')(new Date(d.timestamp));
                const label = d.customData?.label || 'Memory snapshot';
                const tooltipContent = `
                    <strong>Memory:</strong> ${memoryMB} MB<br>
                    <strong>Time:</strong> ${timeStr}<br>
                    <strong>Label:</strong> ${label}<br>
                    <strong>Geometries:</strong> ${d.geometryCount || 0}<br>
                    <strong>Textures:</strong> ${d.textureCount || 0}<br>
                    <strong>Buffer Est:</strong> ${(d.bufferMemoryEstimate / 1024 / 1024).toFixed(2)} MB
                `;
                this.showTooltip(tooltipContent, event);
                
                // Highlight the dot
                d3.select(event.target as Element)
                    .transition()
                    .duration(150)
                    .attr('r', 6)
                    .style('opacity', 1);
            })
            .on('mouseout', (event: MouseEvent) => {
                this.hideTooltip();
                
                // Reset the dot
                d3.select(event.target as Element)
                    .transition()
                    .duration(150)
                    .attr('r', 4)
                    .style('opacity', 0.8);
            });

        // Style axes
        this.svg.selectAll('.x-axis text, .y-axis text')
            .attr('fill', this.theme === 'dark' ? '#fff' : '#333')
            .attr('font-size', '11px');
        
        this.svg.selectAll('.x-axis path, .y-axis path, .x-axis line, .y-axis line')
            .attr('stroke', this.theme === 'dark' ? '#666' : '#333');
            
        // Add current value indicator
        if (memorySnapshots.length > 0) {
            const latestValue = memorySnapshots[memorySnapshots.length - 1];
            const latestMB = (latestValue.usedJSHeapSize / 1024 / 1024).toFixed(1);
            
            this.svg.append('text')
                .attr('x', this.width - this.margin.right - 10)
                .attr('y', this.margin.top + 20)
                .attr('text-anchor', 'end')
                .attr('fill', '#FF9800')
                .attr('font-size', '14px')
                .attr('font-weight', 'bold')
                .text(`${latestMB} MB`);
        }
    }
    
    private showEmptyState(): void {
        this.svg.append('text')
            .attr('x', this.width / 2)
            .attr('y', this.height / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', this.theme === 'dark' ? '#888' : '#666')
            .attr('font-size', '14px')
            .text('No memory data available');
    }
}
*/

// Operation Timing Chart
class TimingChart extends Chart {
    private pieData: any[] = [];
    private totalTime: number = 0;
    
    constructor(theme: 'light' | 'dark') {
        super(theme, 'Operation Time Distribution');
    }
    
    protected redraw(): void {
        this.drawPieChart();
    }

    updateData(sessions: any[]): void {
        this.svg.selectAll('*').remove();

        if (!sessions.length) {
            this.showEmptyState();
            return;
        }

        const latestSession = sessions[sessions.length - 1];
        const timingData = latestSession.timingData || [];
        
        if (!timingData.length) {
            this.showEmptyState();
            return;
        }

        // Group by operation and calculate totals
        const operationGroups = d3.group(timingData, (d: any) => d.name);
        const operationStats = Array.from(operationGroups, ([operation, values]) => {
            const totalDuration = d3.sum(values, (d: any) => d.duration);
            const avgDuration = d3.mean(values, (d: any) => d.duration) || 0;
            const count = values.length;
            const minDuration = d3.min(values, (d: any) => d.duration) || 0;
            const maxDuration = d3.max(values, (d: any) => d.duration) || 0;
            
            return {
                operation,
                totalDuration,
                avgDuration,
                count,
                minDuration,
                maxDuration,
                percentage: 0 // Will be calculated below
            };
        }).sort((a, b) => b.totalDuration - a.totalDuration);

        this.totalTime = d3.sum(operationStats, d => d.totalDuration);
        
        // Calculate percentages
        operationStats.forEach(d => {
            d.percentage = (d.totalDuration / this.totalTime) * 100;
        });

        this.pieData = operationStats;
        this.drawPieChart();
    }
    
    private drawPieChart(): void {
        if (!this.pieData.length) return;
        
        // Calculate pie chart dimensions
        const centerX = this.width / 2;
        const centerY = (this.height - 40) / 2; // Leave space for legend
        const radius = Math.min(centerX - 80, centerY - 40);
        
        // Color scale
        const colorScale = d3.scaleOrdinal()
            .domain(this.pieData.map(d => d.operation))
            .range([
                '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', 
                '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
                '#C8D6E5', '#222F3E', '#26DE81', '#FC5C65', '#FD79A8'
            ]);
        
        // Create pie generator
        const pie = d3.pie<any>()
            .value(d => d.totalDuration)
            .sort(null);
            
        // Create arc generator
        const arc = d3.arc<any>()
            .innerRadius(0)
            .outerRadius(radius);
            
        const labelArc = d3.arc<any>()
            .innerRadius(radius * 0.7)
            .outerRadius(radius * 0.7);
        
        // Create pie slices
        const g = this.svg.append('g')
            .attr('transform', `translate(${centerX}, ${centerY})`);
            
        const slices = g.selectAll('.slice')
            .data(pie(this.pieData))
            .enter()
            .append('g')
            .attr('class', 'slice');
            
        // Add pie slices
        slices.append('path')
            .attr('d', arc)
            .attr('fill', d => colorScale(d.data.operation) as string)
            .attr('stroke', this.theme === 'dark' ? '#2a2a2a' : '#fff')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .style('opacity', 0.8)
            .on('mouseover', (event: MouseEvent, d: any) => {
                // Highlight slice
                d3.select(event.target as Element)
                    .transition()
                    .duration(200)
                    .style('opacity', 1)
                    .attr('transform', 'scale(1.05)');
                    
                // Show detailed tooltip
                const tooltipContent = `
                    <strong>${d.data.operation}</strong><br>
                    <strong>Total Time:</strong> ${d.data.totalDuration.toFixed(2)}ms<br>
                    <strong>Percentage:</strong> ${d.data.percentage.toFixed(1)}%<br>
                    <strong>Count:</strong> ${d.data.count} calls<br>
                    <strong>Avg Time:</strong> ${d.data.avgDuration.toFixed(2)}ms<br>
                    <strong>Min Time:</strong> ${d.data.minDuration.toFixed(2)}ms<br>
                    <strong>Max Time:</strong> ${d.data.maxDuration.toFixed(2)}ms
                `;
                this.showTooltip(tooltipContent, event);
            })
            .on('mouseout', (event: MouseEvent) => {
                // Reset slice
                d3.select(event.target as Element)
                    .transition()
                    .duration(200)
                    .style('opacity', 0.8)
                    .attr('transform', 'scale(1)');
                    
                this.hideTooltip();
            });
            
        // Add percentage labels for significant slices (>5%)
        slices.filter(d => d.data.percentage > 5)
            .append('text')
            .attr('transform', d => `translate(${labelArc.centroid(d)})`)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('font-weight', 'bold')
            .attr('fill', this.theme === 'dark' ? '#fff' : '#333')
            .text(d => `${d.data.percentage.toFixed(1)}%`);
            
        // Add center label with total time
        g.append('text')
            .attr('text-anchor', 'middle')
            .attr('y', -5)
            .attr('font-size', '14px')
            .attr('font-weight', 'bold')
            .attr('fill', this.theme === 'dark' ? '#fff' : '#333')
            .text('Total Time');
            
        g.append('text')
            .attr('text-anchor', 'middle')
            .attr('y', 15)
            .attr('font-size', '16px')
            .attr('font-weight', 'bold')
            .attr('fill', '#4ECDC4')
            .text(`${this.totalTime.toFixed(1)}ms`);
        
        // Add legend
        this.drawLegend(colorScale);
    }
    
    private drawLegend(colorScale: d3.ScaleOrdinal<string, unknown>): void {
        const legendY = this.height - 35;
        const legendItemWidth = 120;
        const legendItemHeight = 15;
        const itemsPerRow = Math.floor((this.width - 40) / legendItemWidth);
        
        // Show only top operations (up to 10) to avoid clutter
        const topOperations = this.pieData.slice(0, Math.min(10, this.pieData.length));
        
        const legend = this.svg.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(20, ${legendY})`);
            
        const legendItems = legend.selectAll('.legend-item')
            .data(topOperations)
            .enter()
            .append('g')
            .attr('class', 'legend-item')
            .attr('transform', (_d, i) => {
                const row = Math.floor(i / itemsPerRow);
                const col = i % itemsPerRow;
                return `translate(${col * legendItemWidth}, ${row * legendItemHeight})`;
            });
            
        legendItems.append('rect')
            .attr('width', 10)
            .attr('height', 10)
            .attr('fill', d => colorScale(d.operation) as string);
            
        legendItems.append('text')
            .attr('x', 15)
            .attr('y', 8)
            .attr('font-size', '10px')
            .attr('fill', this.theme === 'dark' ? '#fff' : '#333')
            .text(d => {
                const maxLength = 12;
                return d.operation.length > maxLength ? 
                    d.operation.substring(0, maxLength) + '...' : 
                    d.operation;
            });
    }
    
    private showEmptyState(): void {
        this.svg.append('text')
            .attr('x', this.width / 2)
            .attr('y', this.height / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', this.theme === 'dark' ? '#888' : '#666')
            .attr('font-size', '14px')
            .text('No timing data available');
    }
}

// Chunk Processing Chart
class ChunkProcessingChart extends Chart {
    private currentView: 'overview' | 'blocks' | 'memory' = 'overview';
    
    constructor(theme: 'light' | 'dark') {
        super(theme, 'Chunk Processing Analysis');
        this.addViewControls();
    }
    
    private addViewControls(): void {
        const controlsDiv = document.createElement('div');
        controlsDiv.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            display: flex;
            gap: 5px;
            z-index: 1000;
        `;
        
        const buttons = [
            { key: 'overview', label: 'Overview' },
            { key: 'blocks', label: 'Block Distribution' },
            { key: 'memory', label: 'Memory Usage' }
        ];
        
        buttons.forEach(({key, label}) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = `
                padding: 4px 8px;
                font-size: 10px;
                border: 1px solid ${this.theme === 'dark' ? '#666' : '#ccc'};
                background: ${this.currentView === key ? '#4ECDC4' : (this.theme === 'dark' ? '#333' : '#f5f5f5')};
                color: ${this.currentView === key ? '#fff' : (this.theme === 'dark' ? '#fff' : '#333')};
                cursor: pointer;
                border-radius: 3px;
            `;
            btn.onclick = () => {
                this.currentView = key as any;
                this.updateViewControls();
                this.redraw();
            };
            controlsDiv.appendChild(btn);
        });
        
        this.container.style.position = 'relative';
        this.container.appendChild(controlsDiv);
    }
    
    private updateViewControls(): void {
        const buttons = this.container.querySelectorAll('button');
        const buttonLabels = ['overview', 'blocks', 'memory'];
        
        buttons.forEach((btn, index) => {
            const isActive = buttonLabels[index] === this.currentView;
            (btn as HTMLElement).style.background = isActive ? '#4ECDC4' : (this.theme === 'dark' ? '#333' : '#f5f5f5');
            (btn as HTMLElement).style.color = isActive ? '#fff' : (this.theme === 'dark' ? '#fff' : '#333');
        });
    }

    updateData(_sessions: any[]): void {
        this.redraw();
    }
    
    protected redraw(): void {
        this.svg.selectAll('*').remove();

        const sessions = this.getLatestSessionData();
        if (!sessions.length) {
            this.showEmptyState();
            return;
        }

        const latestSession = sessions[sessions.length - 1];
        const chunkData = latestSession.chunkProcessingData || [];
        
        if (!chunkData.length) {
            this.showEmptyState();
            return;
        }
        
        switch (this.currentView) {
            case 'overview':
                this.drawOverview(chunkData);
                break;
            case 'blocks':
                this.drawBlockDistribution(chunkData);
                break;
            case 'memory':
                this.drawMemoryUsage(chunkData);
                break;
        }
    }
    
    private getLatestSessionData(): any[] {
        return performanceMonitor.getAllSessions();
    }
    
    private drawOverview(chunkData: any[]): void {
        const stats = this.calculateOverviewStats(chunkData);
        
        // Create a summary view with key metrics
        const metrics = [
            { label: 'Total Chunks', value: stats.totalChunks.toLocaleString(), color: '#4ECDC4' },
            { label: 'Total Blocks', value: stats.totalBlocks.toLocaleString(), color: '#FF6B6B' },
            { label: 'Avg Processing Time', value: `${stats.avgProcessingTime.toFixed(2)}ms`, color: '#FECA57' },
            { label: 'Avg Memory/Chunk', value: `${(stats.avgMemoryPerChunk / 1024).toFixed(1)}KB`, color: '#48CAE4' },
            { label: 'Peak Vertices', value: stats.peakVertices.toLocaleString(), color: '#9C27B0' },
            { label: 'Slowest Chunk', value: `${stats.slowestChunkTime.toFixed(2)}ms`, color: '#FF9F43' }
        ];
        
        const cardWidth = 120;
        const cardHeight = 60;
        const cols = 3;
        const rows = Math.ceil(metrics.length / cols);
        
        const offsetX = (this.width - (cols * cardWidth + (cols - 1) * 20)) / 2;
        const offsetY = (this.height - (rows * cardHeight + (rows - 1) * 20)) / 2;
        
        metrics.forEach((metric, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = offsetX + col * (cardWidth + 20);
            const y = offsetY + row * (cardHeight + 20);
            
            // Background card
            this.svg.append('rect')
                .attr('x', x)
                .attr('y', y)
                .attr('width', cardWidth)
                .attr('height', cardHeight)
                .attr('fill', this.theme === 'dark' ? '#333' : '#f8f9fa')
                .attr('stroke', metric.color)
                .attr('stroke-width', 2)
                .attr('rx', 8);
                
            // Value
            this.svg.append('text')
                .attr('x', x + cardWidth / 2)
                .attr('y', y + 25)
                .attr('text-anchor', 'middle')
                .attr('font-size', '18px')
                .attr('font-weight', 'bold')
                .attr('fill', metric.color)
                .text(metric.value);
                
            // Label
            this.svg.append('text')
                .attr('x', x + cardWidth / 2)
                .attr('y', y + 45)
                .attr('text-anchor', 'middle')
                .attr('font-size', '10px')
                .attr('fill', this.theme === 'dark' ? '#ccc' : '#666')
                .text(metric.label);
        });
    }
    
    private drawBlockDistribution(chunkData: any[]): void {
        const blockCounts = chunkData.map((d: any) => d.blockCount);
        const bins = d3.histogram()
            .domain([0, Number(d3.max(blockCounts)) || 0])
            .thresholds(15)(blockCounts);

        const xScale = d3.scaleLinear()
            .domain([0, Number(d3.max(blockCounts)) || 0])
            .range([this.margin.left, this.width - this.margin.right]);

        const yScale = d3.scaleLinear()
            .domain([0, Number(d3.max(bins, (d: any) => d?.length || 0)) || 0])
            .range([this.height - this.margin.bottom, this.margin.top]);

        // Add axes
        this.svg.append('g')
            .attr('transform', `translate(0,${this.height - this.margin.bottom})`)
            .call(d3.axisBottom(xScale));

        this.svg.append('g')
            .attr('transform', `translate(${this.margin.left},0)`)
            .call(d3.axisLeft(yScale));

        // Add bars with tooltips
        this.svg.selectAll('.bar')
            .data(bins)
            .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', (d: any) => xScale(d.x0!))
            .attr('y', (d: any) => yScale(d.length))
            .attr('width', (d: any) => Math.max(0, xScale(d.x1!) - xScale(d.x0!) - 1))
            .attr('height', (d: any) => this.height - this.margin.bottom - yScale(d.length))
            .attr('fill', '#9C27B0')
            .attr('stroke', this.theme === 'dark' ? '#2a2a2a' : '#fff')
            .attr('stroke-width', 1)
            .style('cursor', 'pointer')
            .on('mouseover', (event: MouseEvent, d: any) => {
                const tooltipContent = `
                    <strong>Block Range:</strong> ${Math.round(d.x0!)}-${Math.round(d.x1!)}<br>
                    <strong>Chunks:</strong> ${d.length}<br>
                    <strong>Percentage:</strong> ${((d.length / chunkData.length) * 100).toFixed(1)}%
                `;
                this.showTooltip(tooltipContent, event);
            })
            .on('mouseout', () => {
                this.hideTooltip();
            });
            
        // Add axis labels
        this.svg.append('text')
            .attr('x', this.width / 2)
            .attr('y', this.height - 10)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', this.theme === 'dark' ? '#ccc' : '#666')
            .text('Blocks per Chunk');
            
        this.svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -this.height / 2)
            .attr('y', 20)
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .attr('fill', this.theme === 'dark' ? '#ccc' : '#666')
            .text('Chunk Count');

        // Style axes
        this.svg.selectAll('text')
            .attr('fill', this.theme === 'dark' ? '#fff' : '#333');
        
        this.svg.selectAll('path, line')
            .attr('stroke', this.theme === 'dark' ? '#666' : '#333');
    }
    
    private drawMemoryUsage(chunkData: any[]): void {
        // Create a scatter plot of memory usage vs block count
        const xScale = d3.scaleLinear()
            .domain([0, d3.max(chunkData, (d: any) => d.blockCount) || 0])
            .range([this.margin.left, this.width - this.margin.right]);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(chunkData, (d: any) => d.memoryUsed) || 0])
            .range([this.height - this.margin.bottom, this.margin.top]);

        // Add axes
        this.svg.append('g')
            .attr('transform', `translate(0,${this.height - this.margin.bottom})`)
            .call(d3.axisBottom(xScale));

        this.svg.append('g')
            .attr('transform', `translate(${this.margin.left},0)`)
            .call(d3.axisLeft(yScale).tickFormat(d => `${(Number(d) / 1024).toFixed(0)}KB`));
            
        // Add scatter points
        this.svg.selectAll('.memory-point')
            .data(chunkData)
            .enter().append('circle')
            .attr('class', 'memory-point')
            .attr('cx', (d: any) => xScale(d.blockCount))
            .attr('cy', (d: any) => yScale(d.memoryUsed))
            .attr('r', 4)
            .attr('fill', '#FF6B6B')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .style('cursor', 'pointer')
            .style('opacity', 0.7)
            .on('mouseover', (event: MouseEvent, d: any) => {
                const tooltipContent = `
                    <strong>Chunk:</strong> [${d.chunkCoords.join(', ')}]<br>
                    <strong>Blocks:</strong> ${d.blockCount}<br>
                    <strong>Memory:</strong> ${(d.memoryUsed / 1024).toFixed(1)}KB<br>
                    <strong>Vertices:</strong> ${d.totalVertices}<br>
                    <strong>Processing Time:</strong> ${d.processingTime.toFixed(2)}ms
                `;
                this.showTooltip(tooltipContent, event);
                
                d3.select(event.target as Element)
                    .transition()
                    .duration(150)
                    .attr('r', 6)
                    .style('opacity', 1);
            })
            .on('mouseout', (event: MouseEvent) => {
                this.hideTooltip();
                
                d3.select(event.target as Element)
                    .transition()
                    .duration(150)
                    .attr('r', 4)
                    .style('opacity', 0.7);
            });
            
        // Add trend line
        const correlation = this.calculateCorrelation(chunkData, 'blockCount', 'memoryUsed');
        if (Math.abs(correlation) > 0.1) {
            const regression = this.calculateLinearRegression(chunkData, 'blockCount', 'memoryUsed');
            const xDomain = xScale.domain();
            const lineData = [
                { x: xDomain[0], y: regression.slope * xDomain[0] + regression.intercept },
                { x: xDomain[1], y: regression.slope * xDomain[1] + regression.intercept }
            ];
            
            const line = d3.line<any>()
                .x(d => xScale(d.x))
                .y(d => yScale(d.y));
                
            this.svg.append('path')
                .datum(lineData)
                .attr('d', line)
                .attr('stroke', '#4ECDC4')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5')
                .attr('fill', 'none');
                
            // Add correlation text
            this.svg.append('text')
                .attr('x', this.width - this.margin.right - 10)
                .attr('y', this.margin.top + 20)
                .attr('text-anchor', 'end')
                .attr('font-size', '12px')
                .attr('fill', '#4ECDC4')
                .text(`r = ${correlation.toFixed(3)}`);
        }

        // Style axes
        this.svg.selectAll('text')
            .attr('fill', this.theme === 'dark' ? '#fff' : '#333');
        
        this.svg.selectAll('path, line')
            .attr('stroke', this.theme === 'dark' ? '#666' : '#333');
    }
    
    private calculateOverviewStats(chunkData: any[]): any {
        return {
            totalChunks: chunkData.length,
            totalBlocks: chunkData.reduce((sum, chunk) => sum + chunk.blockCount, 0),
            avgProcessingTime: chunkData.reduce((sum, chunk) => sum + chunk.processingTime, 0) / chunkData.length,
            avgMemoryPerChunk: chunkData.reduce((sum, chunk) => sum + chunk.memoryUsed, 0) / chunkData.length,
            peakVertices: d3.max(chunkData, d => d.totalVertices) || 0,
            slowestChunkTime: d3.max(chunkData, d => d.processingTime) || 0
        };
    }
    
    private calculateCorrelation(data: any[], xKey: string, yKey: string): number {
        const n = data.length;
        if (n < 2) return 0;
        
        const xMean = d3.mean(data, d => d[xKey]) || 0;
        const yMean = d3.mean(data, d => d[yKey]) || 0;
        
        let numerator = 0;
        let xSumSq = 0;
        let ySumSq = 0;
        
        for (const point of data) {
            const xDiff = point[xKey] - xMean;
            const yDiff = point[yKey] - yMean;
            numerator += xDiff * yDiff;
            xSumSq += xDiff * xDiff;
            ySumSq += yDiff * yDiff;
        }
        
        const denominator = Math.sqrt(xSumSq * ySumSq);
        return denominator === 0 ? 0 : numerator / denominator;
    }
    
    private calculateLinearRegression(data: any[], xKey: string, yKey: string): { slope: number; intercept: number } {
        const xMean = d3.mean(data, d => d[xKey]) || 0;
        const yMean = d3.mean(data, d => d[yKey]) || 0;
        
        let numerator = 0;
        let denominator = 0;
        
        for (const point of data) {
            const xDiff = point[xKey] - xMean;
            const yDiff = point[yKey] - yMean;
            numerator += xDiff * yDiff;
            denominator += xDiff * xDiff;
        }
        
        const slope = denominator === 0 ? 0 : numerator / denominator;
        const intercept = yMean - slope * xMean;
        
        return { slope, intercept };
    }
    
    private showEmptyState(): void {
        this.svg.append('text')
            .attr('x', this.width / 2)
            .attr('y', this.height / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', this.theme === 'dark' ? '#888' : '#666')
            .attr('font-size', '14px')
            .text('No chunk processing data available');
    }
}

// FPS Monitor utility class
class FPSMonitor {
    private lastTime = performance.now();
    private frames = 0;
    private fps = 0;
    private isRunning = false;
    private animationId: number | null = null;

    start(): void {
        this.isRunning = true;
        this.lastTime = performance.now();
        this.frames = 0;
        this.loop();
    }

    stop(): void {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    private loop = (): void => {
        if (!this.isRunning) return;

        const currentTime = performance.now();
        this.frames++;

        if (currentTime - this.lastTime >= 1000) {
            this.fps = Math.round((this.frames * 1000) / (currentTime - this.lastTime));
            this.frames = 0;
            this.lastTime = currentTime;
        }

        this.animationId = requestAnimationFrame(this.loop);
    };

    getFPSData(): { timestamp: number; fps: number } {
        return {
            timestamp: Date.now(),
            fps: this.fps
        };
    }
}
