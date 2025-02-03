
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path from "path";

export default defineConfig({
  server: {
    port: 3003,
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
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@components', replacement: path.resolve(__dirname, './src/components') },
      { find: '@hooks', replacement: path.resolve(__dirname, './src/hooks') },
      { find: '@pages', replacement: path.resolve(__dirname, './src/pages') },
      { find: '@lib', replacement: path.resolve(__dirname, './src/lib') }
    ]
  }
});
