import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds to a single self-contained index.html (inlined JS/CSS/assets) so it runs
// from any static host *and* directly from file://. base: './' keeps paths relative.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 100_000_000, // inline the sample image as a data URL too
    cssCodeSplit: false,
  },
});
