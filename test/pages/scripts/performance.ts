

import { SchematicRenderer } from '../../../src/SchematicRenderer';
import { PerformanceVisualizer } from '../../../src/performance/PerformanceVisualizer';
import { performanceMonitor } from '../../../src/performance/PerformanceMonitor';
import * as d3 from 'd3';

// Get canvas element - will be available after DOM loads
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

// Initialize the renderer outside the event listener
const renderer = new SchematicRenderer(
    canvas,
    {}, // No initial schematics
    { // Default resource packs
        vanillaPack: async () => {
            const response = await fetch('/pack.zip');
            const buffer = await response.arrayBuffer();
            return new Blob([buffer], { type: 'application/zip' });
        },
    },
    { // Renderer options
        enableInteraction: true,
        enableDragAndDrop: false,
        enableGizmos: false,
        singleSchematicMode: true,
        enableProgressBar: true,
        callbacks: {
            onRendererInitialized: (renderer: SchematicRenderer) => {
                console.log('Performance test renderer fully initialized');
                
                // Set up the renderer for performance monitoring immediately
                if (renderer.renderManager?.renderer) {
                    performanceMonitor.setRenderer(renderer.renderManager.renderer);
                    console.log('Performance monitor renderer set');
                }
                
                // Store renderer instance on canvas for Alpine.js to access
                (canvas as any).schematicRenderer = renderer;
                
                // Dispatch custom event to notify Alpine.js that renderer is ready
                const event = new CustomEvent('rendererInitialized', { detail: { renderer } });
                canvas.dispatchEvent(event);
            },
            onSchematicLoaded: (schematicName: string) => {
                console.log(`Performance test schematic ${schematicName} loaded`);
            }
        }
    }
);

// Make renderer globally accessible
window.renderer = renderer;

// Performance visualizer instance
let performanceVisualizer: PerformanceVisualizer | null = null;

// Initialize performance visualizer immediately
function initializePerformanceVisualizer() {
    console.log('Initializing performance visualizer...');
    
    const visualizerContainer = document.getElementById('performance-visualizer');
    console.log('Performance visualizer container:', visualizerContainer);
    
    if (visualizerContainer) {
        console.log('Creating PerformanceVisualizer...');
        try {
            performanceVisualizer = new PerformanceVisualizer({
                container: visualizerContainer,
                theme: 'dark',
                showLiveFPS: true,
                updateInterval: 1000
            });
            console.log('PerformanceVisualizer created successfully');
            
            // Start a background performance monitoring session for continuous FPS tracking
            const backgroundSessionId = performanceMonitor.startSession('background_monitoring', 'immediate');
            console.log('Started background performance monitoring session:', backgroundSessionId);
            
            // Show the visualizer initially
            console.log('Showing visualizer...');
            performanceVisualizer.show();
            console.log('Visualizer shown');
            
            // Make it globally accessible
            (window as any).performanceVisualizer = performanceVisualizer;
            
            // Add periodic chart updates
            setInterval(() => {
                if (performanceVisualizer) {
                    const sessions = performanceMonitor.getAllSessions();
                    performanceVisualizer.updateCharts();
                }
            }, 2000);
        } catch (error) {
            console.error('Error creating PerformanceVisualizer:', error);
        }
    } else {
        console.error('Performance visualizer container not found!');
    }
}

// Try multiple initialization strategies
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, performance test renderer should be initializing...');
    initializePerformanceVisualizer();
});

// Also try after window load
window.addEventListener('load', () => {
    console.log('Window loaded, trying visualizer initialization again...');
    if (!performanceVisualizer) {
        initializePerformanceVisualizer();
    }
});

// Try with a timeout as well
setTimeout(() => {
    console.log('Timeout reached, trying visualizer initialization...');
    if (!performanceVisualizer) {
        initializePerformanceVisualizer();
    }
}, 1000);

// Export for global access
(window as any).performanceMonitor = performanceMonitor;

// Add test function for manual initialization
(window as any).testVisualizerInit = () => {
    console.log('Manual visualizer test triggered');
    console.log('Current performanceVisualizer:', performanceVisualizer);
    console.log('Performance monitor sessions:', performanceMonitor.getAllSessions());
    
    if (!performanceVisualizer) {
        console.log('Visualizer not found, trying to initialize...');
        initializePerformanceVisualizer();
    } else {
        console.log('Visualizer exists, trying to update charts...');
        performanceVisualizer.updateCharts();
    }
};
