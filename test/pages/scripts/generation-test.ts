import { SchematicRenderer } from '../../../src/index.js';

// Initialize the renderer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    try {
        const renderer = new SchematicRenderer(canvas);
        
        // Store renderer instance on canvas for Alpine.js to access
        (canvas as any).schematicRenderer = renderer;
        
        // Dispatch custom event to notify Alpine.js that renderer is ready
        const event = new CustomEvent('rendererInitialized', { detail: { renderer } });
        canvas.dispatchEvent(event);
        
        console.log('Generation test renderer initialized successfully');
    } catch (error) {
        console.error('Failed to initialize generation test renderer:', error);
    }
});
