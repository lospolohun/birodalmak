import { defineConfig } from 'vite';

// A jatek a SkyNet ala kerul majd (`/aoc/`), ezert relativ base kell.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5273 },
  preview: { port: 5273 },
});
