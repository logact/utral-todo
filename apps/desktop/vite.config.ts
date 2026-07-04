import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(async () => ({
  base: process.env.TAURI_ENV_PLATFORM ? '/' : '/desktop/',
  plugins: [react(), tailwindcss()],
  // Disable code splitting for Tauri production builds. The Tauri custom
  // protocol (tauri://) can return HTML fallbacks for dynamically imported
  // chunks, causing "text/html is not a valid JavaScript MIME type" and a
  // blank screen. Keeping everything in one chunk avoids those runtime loads.
  build: {
    rollupOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
