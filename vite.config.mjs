import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    watch: { ignored: ["**/dist-extension/**", "**/.data/**", "**/evidence/**"] },
    proxy: {
      "/api": "http://127.0.0.1:4174",
      "/sample": "http://127.0.0.1:4174",
    },
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
  },
  plugins: [react()],
});
