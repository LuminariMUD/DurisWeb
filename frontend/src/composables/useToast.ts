import { toast } from 'vue-sonner'
import { h } from 'vue'

/**
 * Wrapper around vue-sonner toast to maintain backwards compatibility
 * with the previous custom toast API used throughout the codebase.
 */
export function useToast() {
  const show = (options: {
    type?: 'info' | 'success' | 'error' | 'warning'
    title?: string
    message: string
    duration?: number
  }) => {
    const { type = 'info', title, message, duration } = options

    const toastOptions = {
      description: message,
      duration: duration ?? 5000,
    }

    switch (type) {
      case 'success':
        return toast.success(title || 'Success', toastOptions)
      case 'error':
        return toast.error(title || 'Error', toastOptions)
      case 'warning':
        return toast.warning(title || 'Warning', toastOptions)
      default:
        return toast.info(title || 'Info', toastOptions)
    }
  }

  const success = (message: string, title?: string, duration?: number) => {
    return toast.success(title || 'Success', {
      description: message,
      duration: duration ?? 5000,
    })
  }

  const error = (message: string, title?: string, duration?: number) => {
    return toast.error(title || 'Error', {
      description: message,
      duration: duration ?? 5000,
    })
  }

  const warning = (message: string, title?: string, duration?: number) => {
    return toast.warning(title || 'Warning', {
      description: message,
      duration: duration ?? 5000,
    })
  }

  const info = (message: string, title?: string, duration?: number) => {
    return toast.info(title || 'Info', {
      description: message,
      duration: duration ?? 5000,
    })
  }

  // html-enabled toast functions for rendering ansi/html content
  const successHtml = (html: string, title?: string, duration?: number) => {
    return toast.success(title || 'Success', {
      description: h('div', { innerHTML: html }),
      duration: duration ?? 5000,
    })
  }

  const errorHtml = (html: string, title?: string, duration?: number) => {
    return toast.error(title || 'Error', {
      description: h('div', { innerHTML: html }),
      duration: duration ?? 5000,
    })
  }

  const infoHtml = (html: string, title?: string, duration?: number) => {
    return toast.info(title || 'Info', {
      description: h('div', { innerHTML: html }),
      duration: duration ?? 5000,
    })
  }

  const remove = (id: string | number) => {
    toast.dismiss(id)
  }

  const clear = () => {
    toast.dismiss()
  }

  return {
    show,
    success,
    error,
    warning,
    info,
    successHtml,
    errorHtml,
    infoHtml,
    remove,
    clear,
  }
}
