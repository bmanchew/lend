export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://0.0.0.0:3000',
        changeOrigin: true
      }
    }
  },
});