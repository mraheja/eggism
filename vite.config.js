import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        explainer: resolve(__dirname, 'explainer.html'),
        // Add sphere if you still wish to maintain that page
        sphere: resolve(__dirname, 'sphere.html')
      }
    }
  }
});
