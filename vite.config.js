import { defineConfig } from 'vite';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import dts from 'vite-plugin-dts';
import path from 'path';
import fs from 'fs';

// Plugin to inline WASM as base64 data URIs
const wasmInlinePlugin = () => {
  return {
    name: 'wasm-inline',
    enforce: 'pre', // Run before other plugins
    transform(code, id) {
      if (id.endsWith('.wasm')) {
        const buffer = fs.readFileSync(id);
        const base64 = buffer.toString('base64');
        // Return as a data URI string
        return {
          code: `export default "data:application/wasm;base64,${base64}";`,
          map: null
        };
      }
    }
  }
};

export default defineConfig({
  server: {
    port: 4000,
    open: true,
    // Required headers for SharedArrayBuffer support
    // Using 'credentialless' instead of 'require-corp' to allow CDN resources
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    // Serve schematics folder from project root
    fs: {
      allow: ['..', '../..'],
    },
  },
  root: './test/pages',
  publicDir: '../public',
  build: {
    outDir: '../../dist',
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'SchematicRenderer',
      fileName: (format) => `schematic-renderer.${format}.js`,
      formats: ['es', 'umd'],
    },
    sourcemap: true,
    rollupOptions: {
      external: ['three'],
      output: {
        globals: {
          three: 'THREE',
        },
        // Ensure dynamic imports (like workers) are inlined
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      'nucleation-wasm': path.resolve(__dirname, 'node_modules/nucleation/nucleation_bg.wasm')
    }
  },
  plugins: [
    wasmInlinePlugin(), // Add our custom inline plugin
    viteCommonjs(),
    wasm(),
    topLevelAwait(),
    dts({
      insertTypesEntry: true,
      outDir: '../dist',
      exclude: ['test/**/*', '**/*.test.ts']
    })
  ],
  define: {
    'process.env': {},
    'global': 'globalThis',
  },
  optimizeDeps: {
    exclude: ['nucleation', '@wasm/minecraft_schematic_utils', '@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  test: {
    root: './',
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}', 'test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
  }
});
