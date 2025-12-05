import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-barn.png', 'farm-banner.svg', 'blackbox-cube-logo.png'],
      manifest: {
        name: 'BlackBox Farm',
        short_name: 'BlackBox',
        description: 'Advanced DeFi trading tools on Solana',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MiB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.helius\.xyz\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'helius-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300 // 5 minutes
              }
            }
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));