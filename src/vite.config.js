// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'web/ext',
    lib: {
      entry: 'src/chart-full.js',
      name: 'ChartjsMatrixPlugin',
      fileName: () => 'chart-full.js',
      formats: ['iife']
    },
    rollupOptions: {
      treeshake: false
    }
  }
});
