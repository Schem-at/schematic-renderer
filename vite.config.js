import { defineConfig } from 'vite';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill'
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
      external: ['buffer', 'three'],
      output: {
        globals: {
          buffer: 'Buffer',
          three: 'THREE',
        },
      },
    },
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true
        })
      ]
    }
  }
});