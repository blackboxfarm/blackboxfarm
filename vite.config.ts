import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execFileSync } from "node:child_process";
import { componentTagger } from "lovable-tagger";

function intelBriefingStaticPages() {
  return {
    name: "intel-briefing-static-pages",
    apply: "build" as const,
    async closeBundle() {
      execFileSync("node", ["scripts/generate-intel-briefing-pages.mjs"], { stdio: "inherit" });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    intelBriefingStaticPages(),
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
