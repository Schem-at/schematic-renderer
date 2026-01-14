import { defineConfig } from 'vite';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import dts from 'vite-plugin-dts';
import path from 'path';
import fs from 'fs';

// WASM inline plugin - inlines WASM as base64 for library distribution
// Note: This adds ~33% size overhead but ensures WASM works in all environments
const wasmInlinePlugin = () => {
  return {
    name: 'wasm-inline',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0];
      if (cleanId.endsWith('.wasm')) {
        const buffer = fs.readFileSync(cleanId);
        const base64 = buffer.toString('base64');
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
        // Code splitting is handled automatically via dynamic imports
        // manualChunks cannot be used with library mode
      },
    },
  },
  resolve: {
    alias: {
      'nucleation-wasm': path.resolve(__dirname, 'node_modules/nucleation/nucleation_bg.wasm')
    }
  },
  plugins: [
    wasmInlinePlugin(), // Keep WASM inlined for library compatibility
    viteCommonjs(),
    topLevelAwait(),
    wasm(), // Provides WASM support
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
  worker: {
    format: 'es',
    plugins: [
      wasmInlinePlugin()
    ]
  },
  test: {
    root: './',
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    exclude: ['node_modules', 'dist', 'test/pages'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
        'src/test/**',
      ],
    },
  }
});
