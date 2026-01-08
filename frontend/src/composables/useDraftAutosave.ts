import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'

export interface Draft {
  content: string
  timestamp: number
  title?: string
  parentPostId?: number | null
}

/**
 * Auto-save draft to localStorage with debouncing
 * @param draftKey - Unique key for localStorage (e.g., 'forum_draft_thread_1')
 * @param content - Reactive content ref to save
 * @param title - Optional title ref (for thread creation)
 * @param parentPostId - Optional parent post ID ref (for replies)
 */
export function useDraftAutosave(
  draftKey: string,
  content: Ref<string>,
  title?: Ref<string>,
  parentPostId?: Ref<number | null>
) {
  const hasDraft = ref(false)
  const draftSavedAt = ref<Date | null>(null)
  const saveTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Save draft to localStorage
   */
  function saveDraft() {
    const draft: Draft = {
      content: content.value,
      timestamp: Date.now(),
      ...(title?.value && { title: title.value }),
      ...(parentPostId?.value !== undefined && { parentPostId: parentPostId.value })
    }

    try {
      localStorage.setItem(draftKey, JSON.stringify(draft))
      draftSavedAt.value = new Date()
      hasDraft.value = true
    } catch {
    }
  }

  /**
   * Load draft from localStorage
   */
  function loadDraft(): Draft | null {
    try {
      const stored = localStorage.getItem(draftKey)
      if (!stored) return null

      const draft: Draft = JSON.parse(stored)

      // Check if draft is older than 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      if (draft.timestamp < sevenDaysAgo) {
        clearDraft()
        return null
      }

      return draft
    } catch {
      return null
    }
  }

  /**
   * Restore draft to refs
   */
  function restoreDraft() {
    const draft = loadDraft()
    if (!draft) return false

    content.value = draft.content
    if (title && draft.title) {
      title.value = draft.title
    }
    if (parentPostId && draft.parentPostId !== undefined) {
      parentPostId.value = draft.parentPostId
    }

    draftSavedAt.value = new Date(draft.timestamp)
    hasDraft.value = true
    return true
  }

  /**
   * Clear draft from localStorage
   */
  function clearDraft() {
    try {
      localStorage.removeItem(draftKey)
      hasDraft.value = false
      draftSavedAt.value = null
    } catch {
    }
  }

  /**
   * Debounced save - saves 5 seconds after last change
   */
  function debouncedSave() {
    if (saveTimer.value) {
      clearTimeout(saveTimer.value)
    }

    // Only save if there's actual content
    const hasContent = content.value.trim().length > 0 || (title?.value && title.value.trim().length > 0)
    if (!hasContent) {
      clearDraft()
      return
    }

    saveTimer.value = setTimeout(() => {
      saveDraft()
    }, 5000) // Save 5 seconds after last keystroke
  }

  /**
   * Format draft timestamp for display
   */
  function formatDraftTime(): string {
    if (!draftSavedAt.value) return ''

    const now = new Date()
    const diff = now.getTime() - draftSavedAt.value.getTime()
    const minutes = Math.floor(diff / 60000)

    if (minutes < 1) return 'just now'
    if (minutes === 1) return '1 minute ago'
    if (minutes < 60) return `${minutes} minutes ago'`

    const hours = Math.floor(minutes / 60)
    if (hours === 1) return '1 hour ago'
    if (hours < 24) return `${hours} hours ago`

    return draftSavedAt.value.toLocaleDateString()
  }

  // Watch for content changes
  watch(content, debouncedSave)
  if (title) watch(title, debouncedSave)
  if (parentPostId) watch(parentPostId, debouncedSave)

  // Check for existing draft on mount
  onMounted(() => {
    const draft = loadDraft()
    if (draft) {
      hasDraft.value = true
      draftSavedAt.value = new Date(draft.timestamp)
    }
  })

  // Clear timer on unmount
  onUnmounted(() => {
    if (saveTimer.value) {
      clearTimeout(saveTimer.value)
    }
  })

  return {
    hasDraft,
    draftSavedAt,
    saveDraft,
    loadDraft,
    restoreDraft,
    clearDraft,
    formatDraftTime
  }
}
