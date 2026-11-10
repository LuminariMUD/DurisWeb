import axios from 'axios'
import { frontendConfiguration } from '@/config/environment'

/** The one shared Axios instance; feature API modules import it from here. */
export const apiClient = axios.create({
  baseURL: frontendConfiguration.apiUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable cookies for auth
})

/** Read the existing necessary CSRF cookie without creating another identifier. */
export function getCsrfToken(): string | undefined {
  return document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('csrf_token='))
    ?.slice('csrf_token='.length)
}

// Request interceptor to include CSRF token
apiClient.interceptors.request.use(
  (config) => {
    // Extract CSRF token from cookie
    const csrfToken = getCsrfToken()

    // Add CSRF token header for state-changing requests
    if (
      csrfToken &&
      ['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method?.toUpperCase() || '')
    ) {
      config.headers['X-CSRF-Token'] = csrfToken
    }

    return config
  },
  (error) => Promise.reject(error),
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError<{ error?: unknown }>(error) && !axios.isCancel(error)) {
      const status = error.response?.status
      const operationGated = status === 503 && error.response?.data?.error === 'operation_gated'
      if (
        (status !== undefined && status >= 500 && !operationGated) ||
        ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '')
      ) {
        // No raw error details cross into the public notice, and no request is replayed.
        window.dispatchEvent(new Event('site-unavailable'))
      }
    }
    return Promise.reject(error)
  },
)
