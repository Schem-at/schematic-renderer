// Multi-run Performance Visualizer
class MultiRunVisualizer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.data = null;
        this.setupContainer();
    }

    setupContainer() {
        if (!this.container) {
            console.error('MultiRunVisualizer container not found');
            return;
        }

        this.container.innerHTML = `
            <div class="bg-gray-900/95 backdrop-blur-sm text-gray-100 font-mono p-6 rounded-xl shadow-xl border border-gray-700/50">
                <div class="flex items-center mb-6 pb-4 border-b border-gray-700/60">
                    <span class="material-icons text-lg mr-3 text-gray-400">analytics</span>
                    <h2 class="m-0 text-gray-100 text-xl font-bold">Multi-Run Performance Results</h2>
                </div>
                <div id="multi-run-content" class="space-y-6">
                    <div class="text-center text-gray-400 py-8">
                        <span class="material-icons text-4xl mb-2 block opacity-50">speed</span>
                        <p>Run a multi-run performance test to see results</p>
                    </div>
                </div>
            </div>
        `;
    }

    updateData(multiRunResults) {
        this.data = multiRunResults;
        this.render();
    }

    render() {
        if (!this.data || !this.data.runs || this.data.runs.length === 0) {
            return;
        }

        const contentDiv = document.getElementById('multi-run-content');
        if (!contentDiv) return;

        const runs = this.data.runs;
        const averages = this.data.averages;
        const statistics = this.data.statistics;

        contentDiv.innerHTML = `
            <!-- Summary Statistics -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div class="bg-gray-800/50 p-4 rounded-lg border border-gray-600/30">
                    <div class="text-sm text-gray-400">Average Build Time</div>
                    <div class="text-2xl font-bold text-emerald-400">${averages.buildTime}ms</div>
                    <div class="text-xs text-gray-500">±${statistics.buildTimeStdDev}ms</div>
                </div>
                <div class="bg-gray-800/50 p-4 rounded-lg border border-gray-600/30">
                    <div class="text-sm text-gray-400">Average Memory Usage</div>
                    <div class="text-2xl font-bold text-blue-400">${averages.memoryUsage}MB</div>
                    <div class="text-xs text-gray-500">±${statistics.memoryStdDev}MB</div>
                </div>
                <div class="bg-gray-800/50 p-4 rounded-lg border border-gray-600/30">
                    <div class="text-sm text-gray-400">Average Peak Memory</div>
                    <div class="text-2xl font-bold text-purple-400">${averages.peakMemory}MB</div>
                    <div class="text-xs text-gray-500">Range: ${statistics.minMemory}-${statistics.maxMemory}MB</div>
                </div>
            </div>

            <!-- Charts Container -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Build Time Chart -->
                <div class="bg-gray-800/30 p-4 rounded-lg border border-gray-600/20">
                    <h3 class="text-lg font-semibold mb-4 text-gray-200">Build Time per Run</h3>
                    <div id="build-time-chart" class="w-full h-64"></div>
                </div>
                
                <!-- Mesh Building Breakdown Chart -->
                <div class="bg-gray-800/30 p-4 rounded-lg border border-gray-600/20">
                    <h3 class="text-lg font-semibold mb-4 text-gray-200">Mesh Building Breakdown per Run</h3>
                    <div id="mesh-breakdown-chart" class="w-full h-64"></div>
                </div>
                
                <!-- Memory Usage Chart -->
                <div class="bg-gray-800/30 p-4 rounded-lg border border-gray-600/20">
                    <h3 class="text-lg font-semibold mb-4 text-gray-200">Memory Usage per Run</h3>
                    <div id="memory-chart" class="w-full h-64"></div>
                </div>
                
                <!-- Memory Leak Analysis -->
                <div class="bg-gray-800/30 p-4 rounded-lg border border-gray-600/20">
                    <h3 class="text-lg font-semibold mb-4 text-gray-200">Memory Leak Analysis</h3>
                    <div id="memory-leak-chart" class="w-full h-64"></div>
                </div>
            </div>

            <!-- Detailed Run Table -->
            <div class="bg-gray-800/30 p-4 rounded-lg border border-gray-600/20">
                <h3 class="text-lg font-semibold mb-4 text-gray-200">Detailed Run Results</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="border-b border-gray-600">
                                <th class="text-left py-2 text-gray-400">Run</th>
                                <th class="text-right py-2 text-gray-400">Build Time (ms)</th>
                                <th class="text-right py-2 text-gray-400">Memory Used (MB)</th>
                                <th class="text-right py-2 text-gray-400">Peak Memory (MB)</th>
                                <th class="text-right py-2 text-gray-400">Blocks</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${runs.map(run => `
                                <tr class="border-b border-gray-700/50">
                                    <td class="py-2 text-gray-300">${run.runNumber}</td>
                                    <td class="py-2 text-right ${this.getPerformanceColor(run.buildTime, statistics.minBuildTime, statistics.maxBuildTime, true)}">${run.buildTime}</td>
                                    <td class="py-2 text-right ${this.getPerformanceColor(run.memoryUsed, statistics.minMemory, statistics.maxMemory, true)}">${run.memoryUsed}</td>
                                    <td class="py-2 text-right text-purple-400">${run.peakMemory}</td>
                                    <td class="py-2 text-right text-gray-400">${run.blockCount}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Render D3 charts after DOM is updated
        setTimeout(() => {
            this.renderBuildTimeChart();
            this.renderMeshBreakdownChart();
            this.renderMemoryChart();
            this.renderMemoryLeakChart();
        }, 100);
    }

    getPerformanceColor(value, min, max, lowerIsBetter = true) {
        const normalized = (value - min) / (max - min);
        if (lowerIsBetter) {
            if (normalized < 0.33) return 'text-emerald-400';
            if (normalized < 0.66) return 'text-yellow-400';
            return 'text-red-400';
        } else {
            if (normalized > 0.66) return 'text-emerald-400';
            if (normalized > 0.33) return 'text-yellow-400';
            return 'text-red-400';
        }
    }

    renderBuildTimeChart() {
        const container = document.getElementById('build-time-chart');
        if (!container || !this.data) return;

        container.innerHTML = '';
        
        const margin = { top: 30, right: 150, bottom: 50, left: 70 };
        const width = container.offsetWidth - margin.left - margin.right;
        const height = 250 - margin.top - margin.bottom;

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const data = this.data.runs;
        
        // Define the phases and their colors
        const phases = [
            { key: 'setup', label: 'Setup', color: '#6b7280' },
            { key: 'blockGeneration', label: 'Block Gen', color: '#8b5cf6' },
            { key: 'meshBuilding', label: 'Mesh Build', color: '#10b981' },
            { key: 'sceneUpdates', label: 'Scene Updates', color: '#f59e0b' }
        ];
        
        // Prepare stacked data
        const stackedData = data.map((run, i) => {
            const breakdown = run.timingBreakdown || {};
            let cumulativeTime = 0;
            const phaseData = phases.map(phase => {
                const value = breakdown[phase.key] || 0;
                const result = {
                    runIndex: run.runNumber,
                    phase: phase.key,
                    label: phase.label,
                    color: phase.color,
                    value: value,
                    start: cumulativeTime,
                    end: cumulativeTime + value,
                    totalTime: run.buildTime,
                    runData: run
                };
                cumulativeTime += value;
                return result;
            });
            return phaseData;
        }).flat();
        
        // Scales
        const x = d3.scaleBand()
            .domain(data.map(d => d.runNumber))
            .range([0, width])
            .padding(0.1);

        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.buildTime)])
            .nice()
            .range([height, 0]);

        // Create tooltip
        const tooltip = d3.select('body').append('div')
            .attr('class', 'build-tooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(0, 0, 0, 0.9)')
            .style('color', 'white')
            .style('padding', '12px')
            .style('border-radius', '6px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('opacity', 0)
            .style('max-width', '250px');

        // Create stacked bars
        g.selectAll('.phase-segment')
            .data(stackedData)
            .enter().append('rect')
            .attr('class', 'phase-segment')
            .attr('x', d => x(d.runIndex))
            .attr('y', d => y(d.end))
            .attr('width', x.bandwidth())
            .attr('height', d => y(d.start) - y(d.end))
            .attr('fill', d => d.color)
            .attr('stroke', '#374151')
            .attr('stroke-width', 0.5)
            .attr('opacity', 0.8)
            .on('mouseover', function(event, d) {
                const breakdown = d.runData.timingBreakdown || {};
                const tooltipContent = `
                    <div style="font-weight: bold; margin-bottom: 8px; color: ${d.color};">Run ${d.runData.runNumber} - ${d.label}</div>
                    <div style="margin-bottom: 8px;">
                        <strong>Phase Time:</strong> ${d.value}ms (${Math.round((d.value / d.totalTime) * 100)}%)<br>
                        <strong>Total Time:</strong> ${d.totalTime}ms
                    </div>
                    <div style="margin-bottom: 8px; font-size: 11px; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px;">
                        <div style="font-weight: bold; margin-bottom: 4px;">Timing Breakdown:</div>
                        Setup: ${breakdown.setup || 0}ms<br>
                        Block Gen: ${breakdown.blockGeneration || 0}ms<br>
                        Mesh Build: ${breakdown.meshBuilding || 0}ms<br>
                        Scene Updates: ${breakdown.sceneUpdates || 0}ms
                    </div>
                    ${d.phase === 'meshBuilding' && d.runData.meshBuildingBreakdown ? `
                    <div style="margin-bottom: 8px; font-size: 11px; padding: 8px; background: rgba(16, 185, 129, 0.1); border-radius: 4px;">
                        <div style="font-weight: bold; margin-bottom: 4px; color: #10b981;">Mesh Building Breakdown:</div>
                        Palette Precomputation: ${d.runData.meshBuildingBreakdown.palettePrecomputation || 0}ms<br>
                        Block Categorization: ${d.runData.meshBuildingBreakdown.blockCategorization || 0}ms<br>
                        Material Grouping: ${d.runData.meshBuildingBreakdown.materialGrouping || 0}ms<br>
                        Geometry Merging: ${d.runData.meshBuildingBreakdown.geometryMerging || 0}ms<br>
                        Mesh Creation: ${d.runData.meshBuildingBreakdown.meshCreation || 0}ms
                    </div>
                    ` : ''}
                    <div style="font-size: 11px;">
                        Memory: ${d.runData.memoryUsed}MB (Peak: ${d.runData.peakMemory}MB)<br>
                        FPS: ${d.runData.avgFps} avg (${d.runData.minFps}-${d.runData.maxFps})<br>
                        Blocks: ${d.runData.blockCount}
                    </div>
                `;
                
                tooltip.html(tooltipContent)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 10) + 'px')
                    .transition()
                    .duration(200)
                    .style('opacity', 1);
                
                // Highlight the entire stack for this run
                g.selectAll('.phase-segment')
                    .filter(seg => seg.runIndex === d.runIndex)
                    .attr('opacity', 1)
                    .attr('stroke-width', 1.5);
            })
            .on('mouseout', function() {
                tooltip.transition()
                    .duration(200)
                    .style('opacity', 0);
                g.selectAll('.phase-segment')
                    .attr('opacity', 0.8)
                    .attr('stroke-width', 0.5);
            });

        // Add average line
        const avgLine = g.append('line')
            .attr('x1', 0)
            .attr('x2', width)
            .attr('y1', y(this.data.averages.buildTime))
            .attr('y2', y(this.data.averages.buildTime))
            .attr('stroke', '#f59e0b')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');

        // Add axes
        g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x))
            .selectAll('text')
            .style('fill', '#9ca3af');

        g.append('g')
            .call(d3.axisLeft(y))
            .selectAll('text')
            .style('fill', '#9ca3af');

        // Add axis labels
        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', 0 - margin.left + 15)
            .attr('x', 0 - (height / 2))
            .attr('dy', '1em')
            .style('text-anchor', 'middle')
            .style('fill', '#9ca3af')
            .style('font-size', '12px')
            .text('Build Time (ms)');
            
        g.append('text')
            .attr('x', width / 2)
            .attr('y', height + 40)
            .style('text-anchor', 'middle')
            .style('fill', '#9ca3af')
            .style('font-size', '12px')
            .text('Run Number');

        // Add title
        g.append('text')
            .attr('x', width / 2)
            .attr('y', -10)
            .style('text-anchor', 'middle')
            .style('fill', '#f3f4f6')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text('Build Time Breakdown per Run');
            
        // Add legend
        const legend = g.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(${width + 10}, 10)`);
        
        phases.forEach((phase, i) => {
            const legendItem = legend.append('g')
                .attr('transform', `translate(0, ${i * 18})`);
            
            legendItem.append('rect')
                .attr('width', 12)
                .attr('height', 12)
                .attr('fill', phase.color)
                .attr('stroke', '#374151')
                .attr('stroke-width', 0.5);
            
            legendItem.append('text')
                .attr('x', 16)
                .attr('y', 9)
                .style('font-size', '11px')
                .style('fill', '#9ca3af')
                .text(phase.label);
        });
        
        // Add average label
        g.append('text')
            .attr('x', width - 5)
            .attr('y', y(this.data.averages.buildTime) - 5)
            .attr('text-anchor', 'end')
            .style('font-size', '12px')
            .style('fill', '#f59e0b')
            .style('font-weight', 'bold')
            .text(`Avg: ${this.data.averages.buildTime}ms`);
    }

    renderMemoryChart() {
        const container = document.getElementById('memory-chart');
        if (!container || !this.data) return;

        container.innerHTML = '';
        
        const margin = { top: 20, right: 30, bottom: 40, left: 60 };
        const width = container.offsetWidth - margin.left - margin.right;
        const height = 200 - margin.top - margin.bottom;

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const data = this.data.runs;
        
        const x = d3.scaleBand()
            .domain(data.map(d => d.runNumber))
            .range([0, width])
            .padding(0.1);

        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => Math.max(d.memoryUsed, d.peakMemory))])
            .nice()
            .range([height, 0]);

        // Add memory used bars
        g.selectAll('.memory-bar')
            .data(data)
            .enter().append('rect')
            .attr('class', 'memory-bar')
            .attr('x', d => x(d.runNumber))
            .attr('width', x.bandwidth() / 2)
            .attr('y', d => y(d.memoryUsed))
            .attr('height', d => height - y(d.memoryUsed))
            .attr('fill', '#3b82f6');

        // Add peak memory bars
        g.selectAll('.peak-bar')
            .data(data)
            .enter().append('rect')
            .attr('class', 'peak-bar')
            .attr('x', d => x(d.runNumber) + x.bandwidth() / 2)
            .attr('width', x.bandwidth() / 2)
            .attr('y', d => y(d.peakMemory))
            .attr('height', d => height - y(d.peakMemory))
            .attr('fill', '#8b5cf6');

        // Add axes
        g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x))
            .selectAll('text')
            .style('fill', '#9ca3af');

        g.append('g')
            .call(d3.axisLeft(y))
            .selectAll('text')
            .style('fill', '#9ca3af');

        // Add legend
        const legend = g.append('g')
            .attr('transform', `translate(${width - 120}, 20)`);

        legend.append('rect')
            .attr('width', 12)
            .attr('height', 12)
            .attr('fill', '#3b82f6');
        
        legend.append('text')
            .attr('x', 18)
            .attr('y', 9)
            .style('fill', '#9ca3af')
            .style('font-size', '10px')
            .text('Used');

        legend.append('rect')
            .attr('y', 18)
            .attr('width', 12)
            .attr('height', 12)
            .attr('fill', '#8b5cf6');
        
        legend.append('text')
            .attr('x', 18)
            .attr('y', 27)
            .style('fill', '#9ca3af')
            .style('font-size', '10px')
            .text('Peak');
    }

    renderMeshBreakdownChart() {       
        const container = document.getElementById('mesh-breakdown-chart');
        if (!container || !this.data) return;

        container.innerHTML = '';

        const margin = { top: 20, right: 100, bottom: 50, left: 60 };
        const width = container.offsetWidth - margin.left - margin.right;
        const height = 250 - margin.top - margin.bottom;

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const data = this.data.runs.filter(run => run.meshBuildingBreakdown);
        
        // Define the sub-phases of mesh building and colors
        const subPhases = [
            { key: 'palettePrecomputation', label: 'Palette Precomp', color: '#3B82F6' },     // Blue
            { key: 'blockCategorization', label: 'Block Categorization', color: '#8B5CF6' },   // Purple
            { key: 'materialGrouping', label: 'Material Grouping', color: '#10B981' },        // Green
            { key: 'geometryMerging', label: 'Geometry Merging', color: '#F59E0B' },          // Orange
            { key: 'meshCreation', label: 'Mesh Creation', color: '#EF4444' },               // Red
        ];

        // Prepare stacked data for mesh building
        const stackedData = data.map((run, i) => {
            const breakdown = run.meshBuildingBreakdown || {};
            let cumulativeTime = 0;
            const phaseData = subPhases.map(subPhase => {
                const value = breakdown[subPhase.key] || 0;
                const result = {
                    runIndex: run.runNumber,
                    phase: subPhase.key,
                    label: subPhase.label,
                    color: subPhase.color,
                    value: value,
                    start: cumulativeTime,
                    end: cumulativeTime + value,
                    totalTime: breakdown,
                    runData: run
                };
                cumulativeTime += value;
                return result;
            });
            return phaseData;
        }).flat();

        // Scales
        const x = d3.scaleBand()
            .domain(data.map(d => d.runNumber))
            .range([0, width])
            .padding(0.1);

        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.timingBreakdown.meshBuilding || 0)]).nice()
            .range([height, 0]);

        // Tooltip
        const tooltip = d3.select('body').append('div')
            .attr('class', 'build-tooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(0, 0, 0, 0.9)')
            .style('color', 'white')
            .style('padding', '12px')
            .style('border-radius', '6px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('opacity', 0)
            .style('max-width', '250px');

        // Create stacked bars
        g.selectAll('.subphase-segment')
            .data(stackedData)
            .enter().append('rect')
            .attr('class', 'subphase-segment')
            .attr('x', d => x(d.runIndex))
            .attr('y', d => y(d.end))
            .attr('width', x.bandwidth())
            .attr('height', d => y(d.start) - y(d.end))
            .attr('fill', d => d.color)
            .attr('stroke', '#374151')
            .attr('stroke-width', 0.5)
            .attr('opacity', 0.8)
            .on('mouseover', function(event, d) {
                const tooltipContent = `
                    <div style="font-weight: bold; margin-bottom: 4px; color: ${d.color};">Run ${d.runData.runNumber} - ${d.label}</div>
                    <div style="margin-bottom: 8px;">
                        <strong>Sub-phase Time:</strong> ${d.value}ms<br>
                        <strong>Total Mesh Build Time:</strong> ${d.runData.timingBreakdown.meshBuilding || 0}ms
                    </div>
                    <div style="font-size: 11px;">
                        Blocks: ${d.runData.blockCount}
                    </div>
                `;

                tooltip.html(tooltipContent)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 10) + 'px')
                    .transition()
                    .duration(200)
                    .style('opacity', 1);

                g.selectAll('.subphase-segment')
                    .filter(seg => seg.runIndex === d.runIndex)
                    .attr('opacity', 1)
                    .attr('stroke-width', 1.5);
            })
            .on('mouseout', function() {
                tooltip.transition()
                    .duration(200)
                    .style('opacity', 0);
                g.selectAll('.subphase-segment')
                    .attr('opacity', 0.8)
                    .attr('stroke-width', 0.5);
            });

        // Add axes
        g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x))
            .selectAll('text')
            .style('fill', '#9ca3af');

        g.append('g')
            .call(d3.axisLeft(y))
            .selectAll('text')
            .style('fill', '#9ca3af');

        // Add legend
        const legend = g.append('g')
            .attr('class', 'legend')
            .attr('transform', `translate(${width + 10}, 10)`);

        subPhases.forEach((subPhase, i) => {
            const legendItem = legend.append('g')
                .attr('transform', `translate(0, ${i * 18})`);

            legendItem.append('rect')
                .attr('width', 12)
                .attr('height', 12)
                .attr('fill', subPhase.color)
                .attr('stroke', '#374151')
                .attr('stroke-width', 0.5);

            legendItem.append('text')
                .attr('x', 16)
                .attr('y', 9)
                .style('font-size', '11px')
                .style('fill', '#9ca3af')
                .text(subPhase.label);
        });
    }

    renderFPSChart() {
        const container = document.getElementById('fps-chart');
        if (!container || !this.data) return;

        container.innerHTML = '';
        
        const margin = { top: 20, right: 30, bottom: 40, left: 60 };
        const width = container.offsetWidth - margin.left - margin.right;
        const height = 200 - margin.top - margin.bottom;

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const data = this.data.runs;
        
        const x = d3.scaleLinear()
            .domain(d3.extent(data, d => d.runNumber))
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain(d3.extent(data, d => d.avgFps))
            .nice()
            .range([height, 0]);

        const line = d3.line()
            .x(d => x(d.runNumber))
            .y(d => y(d.avgFps))
            .curve(d3.curveMonotoneX);

        // Add line
        g.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', '#fbbf24')
            .attr('stroke-width', 2)
            .attr('d', line);

        // Add points
        g.selectAll('.dot')
            .data(data)
            .enter().append('circle')
            .attr('class', 'dot')
            .attr('cx', d => x(d.runNumber))
            .attr('cy', d => y(d.avgFps))
            .attr('r', 4)
            .attr('fill', '#fbbf24');

        // Add axes
        g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x))
            .selectAll('text')
            .style('fill', '#9ca3af');

        g.append('g')
            .call(d3.axisLeft(y))
            .selectAll('text')
            .style('fill', '#9ca3af');
    }

    renderMemoryLeakChart() {
        const container = document.getElementById('memory-leak-chart');
        if (!container || !this.data) return;

        container.innerHTML = '';
        
        const margin = { top: 20, right: 30, bottom: 40, left: 60 };
        const width = container.offsetWidth - margin.left - margin.right;
        const height = 200 - margin.top - margin.bottom;

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const data = this.data.runs;
        
        // Calculate cumulative peak memory (the leak we're tracking)
        const cumulativeData = data.map((run, index) => ({
            runNumber: run.runNumber,
            peakMemory: run.peakMemory,
            baselineMemory: run.baselineMemory || 0,
            memoryLeak: index === 0 ? 0 : run.peakMemory - data[0].peakMemory
        }));
        
        const x = d3.scaleLinear()
            .domain(d3.extent(cumulativeData, d => d.runNumber))
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([0, d3.max(cumulativeData, d => d.peakMemory)])
            .nice()
            .range([height, 0]);

        // Create line generators
        const peakLine = d3.line()
            .x(d => x(d.runNumber))
            .y(d => y(d.peakMemory))
            .curve(d3.curveMonotoneX);
            
        const baselineLine = d3.line()
            .x(d => x(d.runNumber))
            .y(d => y(d.baselineMemory))
            .curve(d3.curveMonotoneX);

        // Add baseline memory line
        g.append('path')
            .datum(cumulativeData)
            .attr('fill', 'none')
            .attr('stroke', '#6b7280')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5')
            .attr('d', baselineLine);

        // Add peak memory line  
        g.append('path')
            .datum(cumulativeData)
            .attr('fill', 'none')
            .attr('stroke', '#dc2626')
            .attr('stroke-width', 3)
            .attr('d', peakLine);

        // Add points for peak memory
        g.selectAll('.peak-dot')
            .data(cumulativeData)
            .enter().append('circle')
            .attr('class', 'peak-dot')
            .attr('cx', d => x(d.runNumber))
            .attr('cy', d => y(d.peakMemory))
            .attr('r', 4)
            .attr('fill', '#dc2626')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .on('mouseover', function(event, d) {
                // Create tooltip
                const tooltip = d3.select('body').append('div')
                    .attr('class', 'memory-leak-tooltip')
                    .style('position', 'absolute')
                    .style('background', 'rgba(0, 0, 0, 0.9)')
                    .style('color', 'white')
                    .style('padding', '10px')
                    .style('border-radius', '4px')
                    .style('font-size', '12px')
                    .style('pointer-events', 'none')
                    .style('z-index', '10000');
                    
                tooltip.html(`
                    <strong>Run ${d.runNumber}</strong><br>
                    Peak Memory: ${d.peakMemory.toFixed(2)} MB<br>
                    Baseline: ${d.baselineMemory.toFixed(2)} MB<br>
                    Memory Leak: ${d.memoryLeak.toFixed(2)} MB
                `)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
            })
            .on('mouseout', function() {
                d3.selectAll('.memory-leak-tooltip').remove();
            });

        // Add area fill to show memory leak accumulation
        const area = d3.area()
            .x(d => x(d.runNumber))
            .y0(d => y(d.baselineMemory))
            .y1(d => y(d.peakMemory))
            .curve(d3.curveMonotoneX);
            
        g.append('path')
            .datum(cumulativeData)
            .attr('fill', '#dc2626')
            .attr('fill-opacity', 0.1)
            .attr('d', area);

        // Add axes
        g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat(d3.format('d')))
            .selectAll('text')
            .style('fill', '#9ca3af');

        g.append('g')
            .call(d3.axisLeft(y).tickFormat(d => `${d}MB`))
            .selectAll('text')
            .style('fill', '#9ca3af');
            
        // Add axis labels
        g.append('text')
            .attr('x', width / 2)
            .attr('y', height + 35)
            .style('text-anchor', 'middle')
            .style('fill', '#9ca3af')
            .style('font-size', '12px')
            .text('Run Number');
            
        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', 0 - margin.left + 15)
            .attr('x', 0 - (height / 2))
            .attr('dy', '1em')
            .style('text-anchor', 'middle')
            .style('fill', '#9ca3af')
            .style('font-size', '12px')
            .text('Memory (MB)');
            
        // Add legend
        const legend = g.append('g')
            .attr('transform', `translate(${width - 120}, 20)`);

        legend.append('line')
            .attr('x1', 0).attr('x2', 20)
            .attr('y1', 0).attr('y2', 0)
            .attr('stroke', '#dc2626')
            .attr('stroke-width', 3);
        
        legend.append('text')
            .attr('x', 25).attr('y', 4)
            .style('fill', '#9ca3af')
            .style('font-size', '11px')
            .text('Peak Memory');

        legend.append('line')
            .attr('x1', 0).attr('x2', 20)
            .attr('y1', 15).attr('y2', 15)
            .attr('stroke', '#6b7280')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5');
        
        legend.append('text')
            .attr('x', 25).attr('y', 19)
            .style('fill', '#9ca3af')
            .style('font-size', '11px')
            .text('Baseline');
            
        // Calculate and display memory leak rate
        const totalLeak = cumulativeData[cumulativeData.length - 1].memoryLeak;
        const leakPerRun = totalLeak / (cumulativeData.length - 1);
        
        g.append('text')
            .attr('x', 10)
            .attr('y', 20)
            .style('fill', totalLeak > 50 ? '#dc2626' : '#f59e0b')
            .style('font-size', '14px')
            .style('font-weight', 'bold')
            .text(`🚨 Memory Leak: ${leakPerRun.toFixed(1)} MB/run`);
    }
}

// Make it globally available
window.MultiRunVisualizer = MultiRunVisualizer;
