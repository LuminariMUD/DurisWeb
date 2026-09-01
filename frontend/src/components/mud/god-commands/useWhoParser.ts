/**
 * WHO Parser Composable
 * Sends `who` command to MUD and parses the response for online player names
 */

import { ref, computed } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { useMudConnection } from '@/composables/useMudConnection'
import type { OnlinePlayer } from './types'

// Cache duration in milliseconds
const CACHE_DURATION = 30000 // 30 seconds

// Regex to match WHO list entries for mortals
// Format: [level class] name (Acct: account) ...stuff... (race)
// Examples:
//   [46 Huntsman        ] Inib (Acct: Poum) (Human)
//   [51 Dragon Hunter   ]%Darmi (Acct: Boomstick) Pup | Black Wolf Co.| (inv) (Tiefling)
const WHO_MORTAL_REGEX =
  /\[(\d+)\s+([^\]]+)\]\s*(?:\[\d+\s+[^\]]+\]\s*)*[%]?(\w+)\s+\(Acct:[^)]+\).*\(([^)]+)\)\s*$/

// Regex for god entries (different format - no Acct, has wiz invis level)
// Format: [  Overlord   ] Arih </Webmaster> (56)
// Format: [ Greater God ] Jestros ~ God of...
const WHO_GOD_REGEX = /\[\s*([\w\s]+?)\s*\]\s*(\w+)/

// God rank names for filtering
const GOD_RANKS = ['Overlord', 'Forger', 'Greater', 'Lesser', 'Immortal', 'Avatar']

export function useWhoParser() {
  const store = useMudStore()
  const { sendGameCommand } = useMudConnection()

  // State
  const players = ref<OnlinePlayer[]>([])
  const isLoading = ref(false)
  const lastFetched = ref<number>(0)
  const error = ref<string | null>(null)

  // Strip ANSI color codes from text
  function stripAnsi(text: string): string {
    // Remove terminal escape sequences like [1;35m, [0m, [31m
    // These are in format: ESC[ or just [ followed by numbers/semicolons and ending with m
    let result = text.replace(/\x1b\[[0-9;]*m/g, '') // ESC[...m
    result = result.replace(/\[[0-9;]*m/g, '') // [...m without ESC
    // Also remove MUD &+X, &-X, &n patterns
    result = result.replace(/&[+-]?[A-Za-z]/g, '').replace(/&n/g, '')
    return result
  }

  // Parse a single WHO line into player info
  function parseWhoLine(line: string): OnlinePlayer | null {
    const cleanLine = stripAnsi(line)

    // Try mortal format first: [level class] name (Acct: account) ... (race)
    const mortalMatch = cleanLine.match(WHO_MORTAL_REGEX)
    if (mortalMatch && mortalMatch[1] && mortalMatch[2] && mortalMatch[3] && mortalMatch[4]) {
      return {
        name: mortalMatch[3],
        level: parseInt(mortalMatch[1], 10),
        class: mortalMatch[2].trim(),
        race: mortalMatch[4],
      }
    }

    // Try god format: [  Rank   ] Name ...
    const godMatch = cleanLine.match(WHO_GOD_REGEX)
    if (godMatch && godMatch[1] && godMatch[2]) {
      const rank = godMatch[1]
      if (GOD_RANKS.some((r) => rank.includes(r))) {
        return {
          name: godMatch[2],
          level: 62,
          class: rank.trim(),
        }
      }
    }

    return null
  }

  // Scan activity log for WHO output
  function scanActivityLog(): OnlinePlayer[] {
    const parsed: OnlinePlayer[] = []
    const seenNames = new Set<string>()

    // Scan last 100 entries for WHO output
    const entries = store.activityLog.slice(-100)

    for (const entry of entries) {
      const text = entry.text || ''
      const player = parseWhoLine(text)
      if (player && !seenNames.has(player.name)) {
        seenNames.add(player.name)
        parsed.push(player)
      }
    }

    return parsed
  }

  // Refresh WHO list by sending command and waiting for response
  async function refresh(): Promise<void> {
    // Don't refresh if already loading
    if (isLoading.value) return

    // Check cache
    const now = Date.now()
    if (now - lastFetched.value < CACHE_DURATION && players.value.length > 0) {
      return // Use cached data
    }

    isLoading.value = true
    error.value = null

    // Send WHO command
    const sent = sendGameCommand('who')

    if (!sent) {
      error.value = 'Failed to send WHO command'
      isLoading.value = false
      return
    }

    // Wait for WHO output to arrive (give it time to populate activity log)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Scan activity log for WHO output
    const parsed = scanActivityLog()

    if (parsed.length > 0) {
      players.value = parsed
      lastFetched.value = Date.now()
      error.value = null
    } else {
      error.value = 'No players found in WHO output'
    }

    isLoading.value = false
  }

  // Get just player names for autocomplete
  const playerNames = computed(() => players.value.map((p) => p.name))

  // Check if cache is stale
  const isStale = computed(() => Date.now() - lastFetched.value > CACHE_DURATION)

  // Force refresh (bypass cache)
  async function forceRefresh(): Promise<void> {
    lastFetched.value = 0
    await refresh()
  }

  return {
    // State
    players,
    playerNames,
    isLoading,
    isStale,
    error,

    // Actions
    refresh,
    forceRefresh,
  }
}
