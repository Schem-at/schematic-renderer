import { defineConfig } from 'vite';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import dts from 'vite-plugin-dts'; // ← Add this
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
      formats: ['es'],
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
    wasm(),
    topLevelAwait(),
    dts({
      insertTypesEntry: true,
      outDir: '../dist',
      exclude: ['test/**/*', '**/*.test.ts']
    }) // ← Add this plugin
  ],
  define: {
    'process.env': {},
    'global': 'globalThis',
  },
  optimizeDeps: {
    exclude: ['@wasm/minecraft_schematic_utils', '@ffmpeg/ffmpeg', '@ffmpeg/util'],
  }
});