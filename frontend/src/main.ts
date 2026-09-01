// Disable pinia devtools logging
if (typeof window !== 'undefined') {
  ;(window as any).__VUE_DEVTOOLS_TOAST__ = () => {}
}

import './assets/main.css'
import 'vue-sonner/style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createHead } from '@unhead/vue/client'

import App from './App.vue'
import router from './router'
import { initAnalytics } from './services/analytics'

const app = createApp(App)
const head = createHead()

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(head)
app.use(VueQueryPlugin, {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 10, // 10 minutes (previously cacheTime)
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  },
})

// Initialize web analytics tracking
initAnalytics(router)

app.mount('#app')
