import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import {pdfjsAssets,pdfAssetPrefix} from './scripts/pdfjs-assets.mjs';

export default defineConfig({
  plugins: [tailwindcss(),pdfjsAssets()],
  define: {'__PDF_ASSET_PREFIX__':JSON.stringify(pdfAssetPrefix)},
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
