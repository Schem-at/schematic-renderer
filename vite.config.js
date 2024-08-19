import { defineConfig } from 'vite';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
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
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      // This is usually not necessary, but include it if you still have issues
      buffer: 'vite-plugin-node-polyfills/polyfills/buffer',
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
    }
  }
});