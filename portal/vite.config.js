import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// A PORTAL HUB TYCOON SAJÁT vite-gyökérrel fut, nem a repó gyökerével.
//
// MIÉRT: a gyökér az AGE OF THE CRYSTALS-é, és a CLAUDE.md szabálya szerint a
// meglévőt nem írjuk át, ha bővítés is elég. Így a két játék egyetlen közös
// fájlt sem oszt meg a `package.json` három scriptjén kívül, és egyik build
// sem tud véletlenül belerondítani a másikba.
//
// A `base: './'` azért kell, mert a kirakott `dist/` alkönyvtárba is kerülhet.
export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5274 },
  preview: { port: 5274 },
});
