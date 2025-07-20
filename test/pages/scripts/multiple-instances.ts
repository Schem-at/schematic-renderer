import { SchematicRenderer } from '../../../src/index.js';

// Store renderer instances
const rendererInstances = new Map<string, SchematicRenderer>();

// Initialize multiple renderer instances
document.addEventListener('DOMContentLoaded', () => {
    // This script will handle dynamic initialization of multiple renderers
    console.log('Multiple instances test script loaded');
});

// Function to initialize a new renderer instance
export function initializeRenderer(canvasId: string): SchematicRenderer | null {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    
    if (!canvas) {
        console.error(`Canvas element with id "${canvasId}" not found`);
        return null;
    }

    try {
        const renderer = new SchematicRenderer(canvas);
        rendererInstances.set(canvasId, renderer);
        
        // Store renderer instance on canvas for Alpine.js to access
        (canvas as any).schematicRenderer = renderer;
        
        // Dispatch custom event to notify Alpine.js that renderer is ready
        const event = new CustomEvent('rendererInitialized', { detail: { renderer } });
        canvas.dispatchEvent(event);
        
        console.log(`Multiple instances renderer initialized successfully for ${canvasId}`);
        return renderer;
    } catch (error) {
        console.error(`Failed to initialize renderer for ${canvasId}:`, error);
        return null;
    }
}

// Function to cleanup a renderer instance
export function destroyRenderer(canvasId: string): void {
    const renderer = rendererInstances.get(canvasId);
    if (renderer) {
        renderer.dispose?.();
        rendererInstances.delete(canvasId);
        console.log(`Renderer ${canvasId} destroyed`);
    }
}

// Make functions available globally for Alpine.js
(window as any).initializeRenderer = initializeRenderer;
(window as any).destroyRenderer = destroyRenderer;
