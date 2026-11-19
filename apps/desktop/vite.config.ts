import solid from "@solidjs/vite-plugin";
import tailwind from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [solid(), tailwind()],
  clearScreen: false,
  optimizeDeps: { exclude: ["@ui-sdk/core"] },
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "safari16", outDir: "dist" },
});
