import { fileURLToPath, URL } from 'node:url'
import { defineConfig, configDefaults } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_BASE_URL': JSON.stringify('/'),
    'import.meta.env.VITE_API_URL': JSON.stringify('http://api.test.invalid'),
    'import.meta.env.VITE_WS_URL': JSON.stringify('ws://websocket.test.invalid/ws'),
    'import.meta.env.VITE_STATIC_URL': JSON.stringify('http://static.test.invalid'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    root: fileURLToPath(new URL('./', import.meta.url)),
  },
})
