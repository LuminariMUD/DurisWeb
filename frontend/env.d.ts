/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_URL: string
  readonly VITE_API_URL: string
  readonly VITE_WS_URL: string
  readonly VITE_STATIC_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
