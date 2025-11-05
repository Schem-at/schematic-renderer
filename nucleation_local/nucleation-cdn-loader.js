// This loader is for use in a browser via <script type="module"> from a CDN.
// It ensures that the .wasm file is loaded from the correct relative path.

// Import the real init function and all the classes from the original module.
import init, * as wasm from './nucleation-original.js';

// The default export is a new initializer function for CDN use.
// It calls the real 'init' but provides the URL to the .wasm file.
export default async function() {
  const wasmUrl = new URL('./nucleation_bg.wasm', import.meta.url);
  await init(wasmUrl);
}

// Re-export all the named classes (SchematicWrapper, etc.).
export * from './nucleation-original.js';
