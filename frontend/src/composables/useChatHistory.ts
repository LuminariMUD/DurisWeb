import { ref, computed, watch } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import type { ChatHistoryMessage, ChatHistoryEntry, ChatHistoryStorage } from '@/types/chat'
import { CHAT_STORAGE_VERSION } from '@/types/chat'

const STORAGE_KEY_PREFIX = 'duris_chat_history_'

// global state (shared across components)
const histories = ref<Record<string, ChatHistoryEntry>>({})
const isLoaded = ref(false)

export function useChatHistory() {
  const store = useMudStore()

  // computed: current account name
  const accountName = computed(() => store.account)

  // computed: storage key for current account
  const storageKey = computed(() => {
    if (!accountName.value) return null
    return `${STORAGE_KEY_PREFIX}${accountName.value.toLowerCase()}`
  })

  // =========================================================================
  // storage operations
  // =========================================================================

  /**
   * load chat history from localStorage for current account
   */
  function loadHistory(): void {
    if (!storageKey.value) {
      histories.value = {}
      isLoaded.value = false
      return
    }

    try {
      const stored = localStorage.getItem(storageKey.value)
      if (!stored) {
        histories.value = {}
        isLoaded.value = true
        return
      }

      const data: ChatHistoryStorage = JSON.parse(stored)

      // handle future version migrations here
      if (data.version !== CHAT_STORAGE_VERSION) {
        // migration logic would go here
      }

      histories.value = data.histories || {}
      isLoaded.value = true
    } catch (error) {
      console.error('[ChatHistory] failed to load:', error)
      histories.value = {}
      isLoaded.value = true
    }
  }

  /**
   * save chat history to localStorage
   */
  function saveHistory(): void {
    if (!storageKey.value) return

    try {
      const data: ChatHistoryStorage = {
        version: CHAT_STORAGE_VERSION,
        histories: histories.value,
      }
      localStorage.setItem(storageKey.value, JSON.stringify(data))
    } catch (error) {
      console.error('[ChatHistory] failed to save:', error)
    }
  }

  // =========================================================================
  // crud operations
  // =========================================================================

  /**
   * get chat history for a player
   */
  function getHistory(playerName: string): ChatHistoryEntry | null {
    const key = playerName.toLowerCase()
    return histories.value[key] || null
  }

  /**
   * get messages for a player
   */
  function getMessages(playerName: string): ChatHistoryMessage[] {
    const entry = getHistory(playerName)
    return entry?.messages || []
  }

  /**
   * add a message to history
   */
  function addMessage(playerName: string, message: Omit<ChatHistoryMessage, 'id'>): void {
    const key = playerName.toLowerCase()

    if (!histories.value[key]) {
      histories.value[key] = {
        playerName: playerName,
        messages: [],
        lastActivity: Date.now(),
      }
    }

    const entry = histories.value[key]
    entry.messages.push({
      ...message,
      id: crypto.randomUUID(),
    })
    entry.lastActivity = Date.now()

    saveHistory()
  }

  /**
   * clear history for one player
   */
  function clearHistory(playerName: string): void {
    const key = playerName.toLowerCase()
    delete histories.value[key]
    saveHistory()
  }

  /**
   * clear all chat history
   */
  function clearAllHistory(): void {
    histories.value = {}
    saveHistory()
  }

  /**
   * get list of recent chat partners sorted by lastActivity
   */
  function getRecentChats(limit = 10): ChatHistoryEntry[] {
    return Object.values(histories.value)
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .slice(0, limit)
  }

  // =========================================================================
  // initialization
  // =========================================================================

  // watch for account changes and reload history
  watch(
    accountName,
    (newAccount, oldAccount) => {
      if (newAccount !== oldAccount) {
        loadHistory()
      }
    },
    { immediate: true },
  )

  return {
    // state
    histories,
    isLoaded,

    // crud
    getHistory,
    getMessages,
    addMessage,
    clearHistory,
    clearAllHistory,
    getRecentChats,

    // storage
    loadHistory,
  }
}
