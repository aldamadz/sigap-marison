import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appPublicUrl = env.VITE_APP_PUBLIC_URL || env.APP_PUBLIC_URL;
  const apiProxyTarget = mode === "development"
    ? env.DEV_API_PROXY_TARGET || `http://127.0.0.1:${env.APP_PORT || "3010"}`
    : appPublicUrl && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(appPublicUrl)
      ? appPublicUrl.replace(/\/+$/, "")
      : undefined;

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: apiProxyTarget
        ? {
            "/api": {
              target: apiProxyTarget,
              // Preserve localhost:8080 so the BFF same-origin guard remains effective.
              changeOrigin: mode !== "development",
              secure: mode !== "development",
            },
          }
        : undefined,
    },
    plugins: [
      react(), 
      mode === "development" && componentTagger()
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      chunkSizeWarningLimit: 1100,
      cssMinify: true,
      minify: "esbuild",
      sourcemap: mode !== "production",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('vite/preload-helper')) return 'vendor-preload-helper';
            if (id.includes('node_modules')) {
              if (id.includes('react-dom') || id.includes('react-router-dom') || id.includes('react/')) return 'vendor-react';
              if (id.includes('class-variance-authority') || id.includes('clsx') || id.includes('tailwind-merge')) return 'vendor-ui-utils';
              if (id.includes('@tanstack')) return 'vendor-query';
              if (id.includes('@radix-ui')) return 'vendor-radix';
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('recharts')) return 'vendor-charts';
              if (id.includes('framer-motion')) return 'vendor-motion';
              if (id.includes('date-fns') || id.includes('react-day-picker')) return 'vendor-date';
              if (id.includes('exceljs')) return 'vendor-excel';
              if (id.includes('jspdf') || id.includes('jspdf-autotable')) return 'vendor-pdf-export';
              if (id.includes('pdfmake')) return 'vendor-pdfmake';
              if (id.includes('file-saver')) return 'vendor-file-export';
            }
          },
        },
      },
    },
  };
});
