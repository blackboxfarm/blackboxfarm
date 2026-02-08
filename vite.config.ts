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
      injectRegister: false,

      // IMPORTANT:
      // A previously-installed SW can pin users to an old build forever.
      // We ship a self-destroying SW to forcefully unregister + clear caches.
      // This prioritizes "always latest" over offline/PWA caching.
      filename: 'sw.js',
      selfDestroying: true,
      devOptions: {
        enabled: false,
      },

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
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Don't precache HTML; it can cause clients to get stuck on old deployments.
        globPatterns: ['**/*.{js,css,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.helius\.xyz\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'helius-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300
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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React/Router - loaded first
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI components library
          'vendor-ui': ['@radix-ui/react-tabs', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tooltip'],
          // Query/State management
          'vendor-query': ['@tanstack/react-query'],
          // Charts
          'vendor-charts': ['recharts'],
          // Admin components - only loaded when accessing /super-admin
          'admin': [
            './src/pages/SuperAdmin.tsx',
          ],
          // Security components
          'security': [
            './src/components/security/SecurityDashboard.tsx',
          ],
          // Trading components
          'trading': [
            './src/components/trading/RealTimeTrading.tsx',
            './src/components/copy-trading/CopyTradingConfig.tsx',
            './src/components/copy-trading/CopyTradingDashboard.tsx',
          ],
          // Blackbox components
          'blackbox': [
            './src/components/blackbox/CampaignDashboard.tsx',
            './src/components/blackbox/EnhancedWalletView.tsx',
          ],
        }
      }
    }
  }
}));
