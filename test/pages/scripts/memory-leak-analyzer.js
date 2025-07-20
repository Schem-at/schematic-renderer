// Memory Leak Analysis Utility
class MemoryLeakAnalyzer {
    constructor() {
        this.observations = [];
        this.thresholds = {
            warning: 50 * 1024 * 1024,   // 50MB
            critical: 200 * 1024 * 1024, // 200MB
            severe: 500 * 1024 * 1024    // 500MB
        };
    }

    analyzeMultiRunResults(multiRunResults) {
        if (!multiRunResults || !multiRunResults.runs || multiRunResults.runs.length < 2) {
            console.warn('Insufficient data for memory leak analysis');
            return null;
        }

        const runs = multiRunResults.runs;
        const analysis = {
            memoryProgression: [],
            leakRate: 0,
            totalLeak: 0,
            severity: 'none',
            recommendations: [],
            potentialCauses: []
        };

        // Calculate memory progression
        let baselineMemory = runs[0].baselineMemory || runs[0].peakMemory * 0.8;
        
        for (let i = 0; i < runs.length; i++) {
            const run = runs[i];
            const memoryLeak = i === 0 ? 0 : run.peakMemory - runs[0].peakMemory;
            
            analysis.memoryProgression.push({
                runNumber: run.runNumber,
                peakMemory: run.peakMemory,
                baselineMemory: baselineMemory,
                memoryLeak: memoryLeak,
                leakFromBaseline: Math.max(0, run.peakMemory - baselineMemory)
            });
        }

        // Calculate leak rate (MB per run)
        if (runs.length > 1) {
            const firstRun = runs[0];
            const lastRun = runs[runs.length - 1];
            analysis.totalLeak = lastRun.peakMemory - firstRun.peakMemory;
            analysis.leakRate = analysis.totalLeak / (runs.length - 1);
        }

        // Determine severity
        if (Math.abs(analysis.totalLeak) > this.thresholds.severe / (1024 * 1024)) {
            analysis.severity = 'severe';
        } else if (Math.abs(analysis.totalLeak) > this.thresholds.critical / (1024 * 1024)) {
            analysis.severity = 'critical';
        } else if (Math.abs(analysis.totalLeak) > this.thresholds.warning / (1024 * 1024)) {
            analysis.severity = 'warning';
        } else {
            analysis.severity = 'normal';
        }

        // Generate recommendations based on analysis
        this.generateRecommendations(analysis, runs);
        
        // Identify potential causes
        this.identifyPotentialCauses(analysis, runs);

        return analysis;
    }

    generateRecommendations(analysis, runs) {
        const recommendations = [];

        if (analysis.severity === 'severe' || analysis.severity === 'critical') {
            recommendations.push({
                priority: 'high',
                action: 'Immediate investigation required',
                description: `Memory leak of ${analysis.totalLeak.toFixed(1)}MB detected across ${runs.length} runs`
            });

            recommendations.push({
                priority: 'high', 
                action: 'Check geometry disposal',
                description: 'Verify that Three.js geometries are properly disposed after each mesh build'
            });

            recommendations.push({
                priority: 'high',
                action: 'Check material disposal', 
                description: 'Ensure materials are not being duplicated or improperly cached'
            });
        }

        if (analysis.leakRate > 5) {
            recommendations.push({
                priority: 'medium',
                action: 'Monitor buffer memory',
                description: `Consistent ${analysis.leakRate.toFixed(1)}MB/run leak suggests buffer memory issues`
            });
        }

        if (analysis.severity === 'warning') {
            recommendations.push({
                priority: 'medium',
                action: 'Performance monitoring',
                description: 'Continue monitoring memory usage in subsequent tests'
            });
        }

        analysis.recommendations = recommendations;
    }

    identifyPotentialCauses(analysis, runs) {
        const causes = [];

        // Check for consistent memory increase pattern
        let increasingPattern = true;
        for (let i = 1; i < analysis.memoryProgression.length; i++) {
            if (analysis.memoryProgression[i].peakMemory <= analysis.memoryProgression[i-1].peakMemory) {
                increasingPattern = false;
                break;
            }
        }

        if (increasingPattern) {
            causes.push({
                likelihood: 'high',
                cause: 'Unreleased resources',
                description: 'Consistent memory increase suggests resources are not being properly disposed'
            });
        }

        // Check mesh building breakdown for patterns
        const meshBreakdownVariance = this.analyzeMeshBreakdownVariance(runs);
        if (meshBreakdownVariance.high) {
            causes.push({
                likelihood: 'medium',
                cause: 'Inconsistent mesh building performance',
                description: `High variance in ${meshBreakdownVariance.phase} suggests potential memory fragmentation`
            });
        }

        // Check for block count correlation
        const blockCounts = runs.map(r => r.blockCount);
        const blockCountVariance = this.calculateVariance(blockCounts);
        if (blockCountVariance < 1 && analysis.totalLeak > 10) {
            causes.push({
                likelihood: 'high',
                cause: 'Memory leak independent of content size',
                description: 'Memory leak occurs even with consistent block counts, suggesting systematic issue'
            });
        }

        analysis.potentialCauses = causes;
    }

    analyzeMeshBreakdownVariance(runs) {
        const phases = ['palettePrecomputation', 'blockCategorization', 'materialGrouping', 'geometryMerging', 'meshCreation'];
        let highestVariance = { variance: 0, phase: null };

        phases.forEach(phase => {
            const values = runs
                .filter(r => r.meshBuildingBreakdown && r.meshBuildingBreakdown[phase])
                .map(r => r.meshBuildingBreakdown[phase]);
            
            if (values.length > 1) {
                const variance = this.calculateVariance(values);
                if (variance > highestVariance.variance) {
                    highestVariance = { variance, phase };
                }
            }
        });

        return {
            high: highestVariance.variance > 1000, // High variance if > 1 second variation
            phase: highestVariance.phase,
            variance: highestVariance.variance
        };
    }

    calculateVariance(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDifferences = values.map(val => Math.pow(val - mean, 2));
        return squaredDifferences.reduce((sum, val) => sum + val, 0) / values.length;
    }

    generateReport(analysis) {
        if (!analysis) return 'No analysis data available';

        let report = `
Memory Leak Analysis Report
===========================

Severity: ${analysis.severity.toUpperCase()}
Total Memory Leak: ${analysis.totalLeak.toFixed(2)} MB
Leak Rate: ${analysis.leakRate.toFixed(2)} MB per run
Runs Analyzed: ${analysis.memoryProgression.length}

Memory Progression:
`;

        analysis.memoryProgression.forEach(prog => {
            report += `  Run ${prog.runNumber}: ${prog.peakMemory.toFixed(1)}MB peak (${prog.memoryLeak >= 0 ? '+' : ''}${prog.memoryLeak.toFixed(1)}MB from first run)
`;
        });

        if (analysis.recommendations.length > 0) {
            report += `
Recommendations:
`;
            analysis.recommendations.forEach(rec => {
                report += `  [${rec.priority.toUpperCase()}] ${rec.action}: ${rec.description}
`;
            });
        }

        if (analysis.potentialCauses.length > 0) {
            report += `
Potential Causes:
`;
            analysis.potentialCauses.forEach(cause => {
                report += `  [${cause.likelihood.toUpperCase()} likelihood] ${cause.cause}: ${cause.description}
`;
            });
        }

        return report;
    }

    logAnalysis(multiRunResults) {
        const analysis = this.analyzeMultiRunResults(multiRunResults);
        if (!analysis) return;

        console.group('🔍 Memory Leak Analysis');
        console.log(this.generateReport(analysis));
        
        // Visual representation in console
        if (analysis.severity !== 'normal') {
            console.warn(`⚠️ Memory leak detected: ${analysis.totalLeak.toFixed(1)}MB over ${analysis.memoryProgression.length} runs`);
        } else {
            console.log('✅ No significant memory leaks detected');
        }
        
        console.groupEnd();
        return analysis;
    }
}

// Make globally available
window.MemoryLeakAnalyzer = MemoryLeakAnalyzer;

// Create global instance
window.memoryLeakAnalyzer = new MemoryLeakAnalyzer();

// Helper function to analyze current results
window.analyzeMemoryLeaks = function() {
    const testInstance = document.querySelector('[x-data]')?.__x?.$data;
    if (testInstance && testInstance.multiRunResults && testInstance.multiRunResults.runs.length > 0) {
        return window.memoryLeakAnalyzer.logAnalysis(testInstance.multiRunResults);
    } else {
        console.log('No multi-run results available. Run a performance test first.');
        return null;
    }
};

console.log('Memory Leak Analyzer loaded. Use analyzeMemoryLeaks() after running performance tests.');
