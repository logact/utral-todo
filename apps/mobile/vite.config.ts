import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'fix-file-protocol',
      transformIndexHtml(html, ctx) {
        if (ctx.server) return html;
        return html
          .replace(/ crossorigin/g, '')
          .replace('type="module"', 'defer');
      },
    },
  ],
  clearScreen: false,
  build: {
    assetsDir: '',
    rollupOptions: {
      output: {
        format: 'iife',
      },
    },
  },
  define: {
    'import.meta': {},
  },
  server: {
    port: 1421,
    strictPort: true,
    host: true,
  },
});
