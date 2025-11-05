// Universal WASM initializer that works in both Node.js and browsers
import init_wasm from './nucleation-original.js';

export default async function init(input) {
  // If input is provided, use it directly (manual override)
  if (input !== undefined) {
    return await init_wasm(input);
  }

  // Auto-detect environment
  const isNode = typeof process !== 'undefined' && process.versions?.node;

  if (isNode) {
    // Node.js: read the WASM file directly
    try {
      const fs = await import('fs');
      const path = await import('path');
      const url = await import('url');

      const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
      const wasmPath = path.join(__dirname, 'nucleation_bg.wasm');
      const wasmBytes = fs.readFileSync(wasmPath);

      return await init_wasm(wasmBytes);
    } catch (error) {
      console.warn('Failed to load WASM in Node.js, trying default init:', error.message);
      return await init_wasm();
    }
  } else {
    // Browser: use default fetch behavior
    return await init_wasm();
  }
}

// Re-export everything from the original module
export * from './nucleation-original.js';
