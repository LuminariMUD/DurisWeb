import { ref, computed, type Ref } from 'vue'
import { forumApi } from '@/services/api'

export interface MentionSuggestion {
  username: string
  index: number
}

export function useMentionAutocomplete(textareaRef: Ref<HTMLTextAreaElement | null>) {
  const suggestions = ref<string[]>([])
  const selectedIndex = ref(0)
  const cursorPosition = ref(0)
  const mentionStart = ref(-1)
  const isOpen = ref(false)

  // Current mention query
  const mentionQuery = computed(() => {
    if (mentionStart.value === -1 || !textareaRef.value) return ''
    return textareaRef.value.value.slice(mentionStart.value + 1, cursorPosition.value)
  })

  // Debounced search
  let searchTimeout: ReturnType<typeof setTimeout> | null = null

  async function searchMentions(query: string) {
    if (query.length < 2) {
      suggestions.value = []
      isOpen.value = false
      return
    }

    try {
      const results = await forumApi.searchAccounts(query)
      suggestions.value = results
      isOpen.value = results.length > 0
      selectedIndex.value = 0
    } catch {
      suggestions.value = []
      isOpen.value = false
    }
  }

  function checkForMention(_event: KeyboardEvent) {
    if (!textareaRef.value) return

    const textarea = textareaRef.value
    const pos = textarea.selectionStart || 0
    const text = textarea.value
    cursorPosition.value = pos

    // Find the last @ before cursor
    let atIndex = -1
    for (let i = pos - 1; i >= 0; i--) {
      const char = text[i]
      if (char === '@') {
        // Check if there's a space or start of line before @
        const prevChar = text[i - 1]
        if (i === 0 || (prevChar && /\s/.test(prevChar))) {
          atIndex = i
          break
        }
      } else if (char && /\s/.test(char)) {
        // Hit a space before finding @
        break
      }
    }

    if (atIndex !== -1) {
      mentionStart.value = atIndex
      const query = text.slice(atIndex + 1, pos)

      // Clear previous timeout
      if (searchTimeout) {
        clearTimeout(searchTimeout)
      }

      // Debounce search
      searchTimeout = setTimeout(() => {
        searchMentions(query)
      }, 300)
    } else {
      mentionStart.value = -1
      isOpen.value = false
      suggestions.value = []
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!isOpen.value || suggestions.value.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedIndex.value =
        selectedIndex.value === 0 ? suggestions.value.length - 1 : selectedIndex.value - 1
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      if (isOpen.value && suggestions.value.length > 0) {
        event.preventDefault()
        const selectedSuggestion = suggestions.value[selectedIndex.value]
        if (selectedSuggestion) {
          selectMention(selectedSuggestion)
        }
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeSuggestions()
    }
  }

  function selectMention(username: string) {
    if (!textareaRef.value || mentionStart.value === -1) return

    const textarea = textareaRef.value
    const text = textarea.value
    const beforeMention = text.slice(0, mentionStart.value)
    const afterCursor = text.slice(cursorPosition.value)

    // Insert mention with @ and a space after
    const newText = `${beforeMention}@${username} ${afterCursor}`
    textarea.value = newText

    // Move cursor after the mention
    const newCursorPos = mentionStart.value + username.length + 2 // +2 for @ and space
    textarea.setSelectionRange(newCursorPos, newCursorPos)

    // Trigger input event so v-model updates
    textarea.dispatchEvent(new Event('input', { bubbles: true }))

    closeSuggestions()
  }

  function closeSuggestions() {
    isOpen.value = false
    suggestions.value = []
    mentionStart.value = -1
    selectedIndex.value = 0
  }

  // Calculate dropdown position relative to textarea
  function getDropdownPosition() {
    if (!textareaRef.value || mentionStart.value === -1) {
      return { top: 0, left: 0 }
    }

    const textarea = textareaRef.value
    const text = textarea.value.slice(0, mentionStart.value)

    // Create a mirror div to calculate position
    const mirror = document.createElement('div')
    const computed = window.getComputedStyle(textarea)

    // Copy textarea styles
    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.wordWrap = 'break-word'
    mirror.style.font = computed.font
    mirror.style.padding = computed.padding
    mirror.style.width = computed.width
    mirror.style.border = computed.border
    mirror.textContent = text

    document.body.appendChild(mirror)

    const rect = textarea.getBoundingClientRect()
    const mirrorRect = mirror.getBoundingClientRect()

    document.body.removeChild(mirror)

    return {
      top: rect.top + window.scrollY + mirrorRect.height - textarea.scrollTop + 20,
      left: rect.left + window.scrollX + 10,
    }
  }

  return {
    suggestions,
    selectedIndex,
    isOpen,
    mentionQuery,
    checkForMention,
    handleKeyDown,
    selectMention,
    closeSuggestions,
    getDropdownPosition,
  }
}
