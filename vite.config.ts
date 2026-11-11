import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // @ts-ignore vitest field
  test: { include: ["tests/**/*.test.ts"] },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Couple Court", short_name: "CoupleCourt",
        description: "Settle your tiny fights in a mock courtroom. For fun only.",
        theme_color: "#1b1226", background_color: "#1b1226", display: "standalone", start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      // API calls must never be cached or answered by the service worker.
      workbox: { navigateFallbackDenylist: [/^\/api/], runtimeCaching: [] },
    }),
  ],
  server: { host: "127.0.0.1", port: 5173, proxy: { "/api": "http://127.0.0.1:8787" } },
});
