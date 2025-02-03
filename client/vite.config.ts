
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  server: {
    port: 3002,
    host: '0.0.0.0'
  },
  plugins: [
    react({
      fastRefresh: true,
      jsxRuntime: 'automatic',
      babel: {
        plugins: ['@babel/plugin-transform-react-jsx'],
        presets: ['@babel/preset-react']
      }
    }),
    runtimeErrorOverlay(),
    themePlugin()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@lib': path.resolve(__dirname, 'src/lib')
    }
  }
});
