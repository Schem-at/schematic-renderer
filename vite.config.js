import { defineConfig } from 'vite';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';

export default defineConfig({
  server: {
    port: 4000,
    open: true,
  },
  root: './test',
  build: {
    outDir: '../dist',
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'SchematicRenderer',
      fileName: (format) => `schematic-renderer.${format}.js`,
      formats: ['umd', 'es'],
    },
    sourcemap: true,
    rollupOptions: {
      external: ['three'],
      output: {
        globals: {
          three: 'THREE',
        },
      },
    },
  },
  plugins: [
    viteCommonjs(),
    nodePolyfills({
      protocolImports: true,
    }),
    wasm(),
    topLevelAwait()
  ],
  resolve: {
    alias: {
      buffer: 'vite-plugin-node-polyfills/polyfills/buffer',
      '@wasm': path.resolve(__dirname, 'src/wasm')
    },
  },
  define: {
    'process.env': {},
    'global': 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      },
    },
    exclude: ['@wasm/minecraft_schematic_utils']
  }
});