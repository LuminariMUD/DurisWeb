import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'
import { parseViteEnvironment } from './config/environment.ts'

/**
 * Preload the hashed display-face files to reduce fallback-font display.
 * Design contract: [Typography](../docs/DESIGN.md#typography).
 */
function preloadDisplayFonts(base: string): Plugin {
  return {
    name: 'duris-preload-display-fonts',
    enforce: 'post',
    transformIndexHtml(_html, context) {
      if (!context.bundle) return []
      return Object.keys(context.bundle)
        .filter((fileName) => /cormorant-garamond-[^/]*\.woff2$/.test(fileName))
        .sort()
        .map((fileName) => ({
          tag: 'link',
          attrs: {
            rel: 'preload',
            href: `${base}${fileName}`,
            as: 'font',
            type: 'font/woff2',
            crossorigin: '',
          },
          injectTo: 'head' as const,
        }))
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const environment = parseViteEnvironment(env)
  const shellAssets = new Set<string>(['index.html', 'favicon.ico', 'push-sw.js'])

  return {
    base: environment.baseUrl,
    plugins: [
      vue(),
      vueDevTools(),
      preloadDisplayFonts(environment.baseUrl),
      {
        name: 'duris-shell-precache',
        enforce: 'post',
        generateBundle(_options, bundle) {
          const include = (fileName: string) => {
            if (shellAssets.has(fileName)) return
            shellAssets.add(fileName)
            const output = bundle[fileName]
            if (output?.type !== 'chunk') return
            for (const imported of output.imports) include(imported)
            // Vite supplies the CSS/asset graph on generated chunks.
            const { viteMetadata } = output as typeof output & {
              viteMetadata?: { importedCss: Set<string>; importedAssets: Set<string> }
            }
            for (const css of viteMetadata?.importedCss ?? []) include(css)
            for (const asset of viteMetadata?.importedAssets ?? []) include(asset)
          }
          for (const output of Object.values(bundle)) {
            if (
              output.type === 'chunk' &&
              (output.isEntry || output.facadeModuleId?.endsWith('/src/views/FrontPageView.vue'))
            )
              include(output.fileName)
          }
        },
      },
      VitePWA({
        // /sw.js retires old registrations whose cached API URL used another host.
        filename: 'service-worker.js',
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'icons/*.svg'],
        manifest: false, // use manifest.json from public folder
        workbox: {
          importScripts: ['/push-sw.js'],
          globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,woff,woff2}'],
          manifestTransforms: [
            async (entries) => ({
              manifest: entries.filter(
                ({ url }) => shellAssets.has(url) || url.startsWith('icons/'),
              ),
              warnings: [],
            }),
          ],
          runtimeCaching: [
            {
              // Never replay a POV or stored quote whose publication may have changed.
              urlPattern: /\/api\/pvp(?:\/|$)/,
              handler: 'NetworkOnly',
            },
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
              // api requests - stale while revalidate for news/forum
              urlPattern: /\/api\/(news|forum)/,
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
      host: environment.developmentHost,
      port: environment.developmentPort,
      allowedHosts: environment.allowedHosts,
      proxy: {
        '/api': {
          target: environment.apiUrl,
          changeOrigin: true,
        },
        '/maps': {
          target: environment.apiUrl,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: environment.previewHost,
      port: environment.previewPort,
    },
    build: {
      // Vite 8 minifies with Oxc by default (the esbuild minifier is deprecated).
      sourcemap: false, // Skip sourcemaps to save memory
      // The route-split main bundle remains below 200 KiB compressed. Keep the
      // warning above its observed uncompressed size so genuine regressions
      // still surface without flagging the intentionally shared application UI.
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        output: {
          // Group shared UI/chart runtimes only. Explicit editor/icon groups
          // pull optional code into the shell through shared dependencies.
          // Let dynamic route consumers determine those chunks instead.
          codeSplitting: {
            groups: [
              {
                name: 'vendor-vue',
                test: /[\\/]node_modules[\\/](?:.*[\\/]node_modules[\\/])?(?:vue|@vue|vue-router|pinia)[\\/]/,
              },
              {
                name: 'vendor-charts',
                test: /[\\/]node_modules[\\/](?:.*[\\/]node_modules[\\/])?(?:chart\.js|vue-chartjs)[\\/]/,
              },
            ],
          },
        },
      },
    },
  }
})
