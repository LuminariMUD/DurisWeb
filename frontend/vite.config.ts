import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      vue(),
      vueDevTools(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'icons/*.svg'],
        manifest: false, // use manifest.json from public folder
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
          runtimeCaching: [
            {
              // cache static assets
              urlPattern: /\.(?:js|css|woff|woff2)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'static-assets',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
              },
            },
            {
              // cache images
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico|webp)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
                },
              },
            },
            {
              // api requests - stale while revalidate for news/pvp/forum
              urlPattern: /\/api\/(news|pvp|forum)/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 5 * 60, // 5 minutes
                },
              },
            },
            {
              // auction api - network first (needs fresh data)
              urlPattern: /\/api\/auction/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'auction-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60, // 1 minute
                },
                networkTimeoutSeconds: 5,
              },
            },
          ],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/],
        },
        devOptions: {
          enabled: false, // disable pwa in dev mode
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: process.env.HOST,
      port: 5173,
      allowedHosts: [
        'localhost',
        'www.duris.sbs',
        'duris.sbs',
        '.duris.sbs',
        'www.newduris.com',
        'newduris.com',
        '.newduris.com', // Allow all subdomains
      ],
      proxy: {
        '/api': {
          target: env.VITE_API_URL,
          changeOrigin: true,
        },
        '/maps': {
          target: env.VITE_API_URL,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: env.HOST,
      port: 4173,
    },
    build: {
      // Reduce memory usage during build
      minify: 'esbuild', // esbuild uses less RAM than terser
      sourcemap: false, // Skip sourcemaps to save memory
      // The route-split main bundle remains below 200 KiB compressed. Keep the
      // warning above its observed uncompressed size so genuine regressions
      // still surface without flagging the intentionally shared application UI.
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            // Split large deps into separate chunks
            'vendor-vue': ['vue', 'vue-router', 'pinia'],
            'vendor-charts': ['chart.js', 'vue-chartjs'],
            'vendor-editor': ['@tiptap/core', '@tiptap/vue-3', '@tiptap/starter-kit'],
          },
        },
      },
    },
  }
})
