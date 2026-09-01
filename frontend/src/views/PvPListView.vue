<script setup lang="ts">
import { ref, computed, watch, watchEffect, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { useQuery } from '@tanstack/vue-query'
import { useHead } from '@unhead/vue'
import pvpApi from '@/services/api'
import { useWebSocket } from '@/composables/useWebSocket'
import { format } from 'date-fns'
import { parseAnsiForVue } from '@/utils/ansiParser'
import {
  ThumbsUp,
  MessageSquare,
  Droplet,
  Crown,
  Filter,
  ChevronDown,
  ChevronRight,
} from 'lucide-vue-next'
import type { PvPEvent, PaginatedResponse } from '@/types'

useHead({
  title: 'DurisMUD | PvP Logs',
})

const router = useRouter()
const route = useRoute()
const queryClient = useQueryClient()

// Filter state
const playerName = ref('')
const locationName = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const selectedHour = ref<number | null>(null) // Hour of day filter (0-23)
const selectedClasses = ref<string[]>([])
const selectedRaces = ref<string[]>([])
const levelMin = ref(1)
const levelMax = ref(56)
const selectedAlignment = ref<'good' | 'evil' | 'neutral' | ''>('')
const sortBy = ref<'date' | 'likes'>('date')
const currentPage = ref(1)
const pageSize = ref(20)

// Mobile filter state
const showFilters = ref(false)

// DurisMUD classes (from database)
const classList = [
  'Anti-Paladin',
  'Assassin',
  'Bard',
  'Blackguard',
  'Blademaster',
  'Brigand',
  'Cavalier',
  'Cleric',
  'Controller',
  'Crusader',
  'Diabolis',
  'Dragon',
  'Dragoon',
  'Dreamer',
  'Druid',
  'Elaphidist',
  'Elementalist',
  'Enslaver',
  'Gladiator',
  'Guardian',
  'Healer',
  'Holyman',
  'Hunter',
  'Huntsman',
  'Illusionist',
  'Knight',
  'Magus',
  'Mercenary',
  'MindFlayer',
  'Minstrel',
  'Necrolyte',
  'Necromancer',
  'Paladin',
  'Psionicist',
  'Psycheporter',
  'Pyrokinetic',
  'Ranger',
  'Reaver',
  'Rider',
  'Rogue',
  'Scourge',
  'Shadowmage',
  'Shaman',
  'Sorcerer',
  'Spiritualist',
  'Summoner',
  'Swordsman',
  'Thief',
  'Thug',
  'Wildmage',
  'Wizard',
  'Zealot',
]

// DurisMUD races (from database)
const raceList = [
  'Barbarian',
  'Centaur',
  'Drow Elf',
  'Duergar',
  'Dwarf',
  'Firbolg',
  'Githyanki',
  'Githzerai',
  'Gnome',
  'Goblin',
  'Grey Elf',
  'Halfling',
  'Human',
  'Illithid',
  'Kobold',
  'Minotaur',
  'Ogre',
  'Orc',
  'Revenant',
  'Thri-Kreen',
  'Tiefling',
  'Troll',
]

// Autocomplete state
const playerSearch = ref('')
const locationSearch = ref('')
const showPlayerDropdown = ref(false)
const showLocationDropdown = ref(false)
const playerInputValue = ref('')
const locationInputValue = ref('')

// Pagination state for lazy loading
const playerPage = ref(1)
const locationPage = ref(1)
const playerSuggestionsList = ref<any[]>([])
const locationSuggestionsList = ref<any[]>([])
const playerLoading = ref(false)
const locationLoading = ref(false)
const playerHasMore = ref(true)
const locationHasMore = ref(true)

// Debounce timers
let playerDebounceTimer: ReturnType<typeof setTimeout> | null = null
let locationDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Fetch autocomplete data with pagination
const { data: playerSuggestions } = useQuery({
  queryKey: ['players', playerSearch, playerPage],
  queryFn: () => pvpApi.getPlayers(playerSearch.value, playerPage.value, 20),
  enabled: computed(() => showPlayerDropdown.value),
  staleTime: 1000 * 60 * 10,
})

const { data: locationSuggestions } = useQuery({
  queryKey: ['locations', locationSearch, locationPage],
  queryFn: () => pvpApi.getLocations(locationSearch.value, locationPage.value, 20),
  enabled: computed(() => showLocationDropdown.value),
  staleTime: 1000 * 60 * 10,
})

// Watch player suggestions and append to list
watch(playerSuggestions, (newData) => {
  if (newData) {
    if (playerPage.value === 1) {
      playerSuggestionsList.value = newData
    } else {
      playerSuggestionsList.value = [...playerSuggestionsList.value, ...newData]
    }
    playerLoading.value = false
    playerHasMore.value = newData.length === 20
  }
})

// Watch location suggestions and append to list
watch(locationSuggestions, (newData) => {
  if (newData) {
    if (locationPage.value === 1) {
      locationSuggestionsList.value = newData
    } else {
      locationSuggestionsList.value = [...locationSuggestionsList.value, ...newData]
    }
    locationLoading.value = false
    locationHasMore.value = newData.length === 20
  }
})

// Cleanup debounce timers on unmount
onUnmounted(() => {
  if (playerDebounceTimer) clearTimeout(playerDebounceTimer)
  if (locationDebounceTimer) clearTimeout(locationDebounceTimer)
})

// Build API filters (using search endpoint for advanced filters)
const hasAdvancedFilters = computed(
  () =>
    selectedClasses.value.length > 0 ||
    selectedRaces.value.length > 0 ||
    levelMin.value > 1 ||
    levelMax.value < 56 ||
    selectedAlignment.value !== '' ||
    selectedHour.value !== null,
)

const apiFilters = computed(() => {
  const filters: any = {
    player: playerName.value || undefined,
    location: locationName.value || undefined,
    date_from: dateFrom.value || undefined,
    date_to: dateTo.value || undefined,
    sort_by: sortBy.value,
    page: currentPage.value,
    limit: pageSize.value,
  }

  // Add advanced filters if any are set
  if (selectedClasses.value.length > 0) {
    filters.class = [...selectedClasses.value]
  }
  if (selectedRaces.value.length > 0) {
    filters.race = [...selectedRaces.value]
  }
  if (levelMin.value > 1) {
    filters.level_min = levelMin.value
  }
  if (levelMax.value < 56) {
    filters.level_max = levelMax.value
  }
  if (selectedAlignment.value) {
    filters.alignment = selectedAlignment.value
  }
  if (selectedHour.value !== null) {
    filters.hour = selectedHour.value
  }

  return filters
})

// Fetch events with real-time filtering (use search endpoint if advanced filters are active)
const { data, isLoading, isError, error } = useQuery<PaginatedResponse<PvPEvent>>({
  queryKey: ['pvp-events', apiFilters],
  queryFn: () => {
    if (hasAdvancedFilters.value) {
      return pvpApi.search(apiFilters.value)
    }
    return pvpApi.getEvents(apiFilters.value)
  },
  staleTime: 1000 * 60 * 2,
})

// WebSocket integration - auto-refresh on new events
const { onNewEvent } = useWebSocket()
onNewEvent(() => {
  queryClient.invalidateQueries({ queryKey: ['pvp-events'] })
})

// Watch filters and reset to page 1
watch(
  [
    playerName,
    locationName,
    dateFrom,
    dateTo,
    selectedHour,
    selectedClasses,
    selectedRaces,
    levelMin,
    levelMax,
    selectedAlignment,
    sortBy,
    pageSize,
  ],
  () => {
    currentPage.value = 1
  },
  { deep: true },
)

// Sync URL params
watchEffect(() => {
  const query: Record<string, string> = {}
  if (playerName.value) query.player = playerName.value
  if (locationName.value) query.location = locationName.value
  if (dateFrom.value) query.date_from = dateFrom.value
  if (dateTo.value) query.date_to = dateTo.value
  if (selectedClasses.value.length > 0) query.classes = selectedClasses.value.join(',')
  if (selectedRaces.value.length > 0) query.races = selectedRaces.value.join(',')
  if (levelMin.value > 1) query.level_min = levelMin.value.toString()
  if (levelMax.value < 56) query.level_max = levelMax.value.toString()
  if (selectedAlignment.value) query.alignment = selectedAlignment.value
  if (selectedHour.value !== null) query.hour = selectedHour.value.toString()
  if (sortBy.value !== 'date') query.sort_by = sortBy.value
  if (currentPage.value > 1) query.page = currentPage.value.toString()
  if (pageSize.value !== 20) query.limit = pageSize.value.toString()

  router.replace({ query })
})

// Load filters from URL on mount
if (route.query.player) {
  playerName.value = route.query.player as string
  playerInputValue.value = route.query.player as string
}
if (route.query.location) {
  locationName.value = route.query.location as string
  locationInputValue.value = route.query.location as string
}
if (route.query.date_from) dateFrom.value = route.query.date_from as string
if (route.query.date_to) dateTo.value = route.query.date_to as string
if (route.query.classes) selectedClasses.value = (route.query.classes as string).split(',')
if (route.query.races) selectedRaces.value = (route.query.races as string).split(',')
if (route.query.level_min) levelMin.value = parseInt(route.query.level_min as string)
if (route.query.level_max) levelMax.value = parseInt(route.query.level_max as string)
if (route.query.alignment) selectedAlignment.value = route.query.alignment as any
if (route.query.hour) selectedHour.value = parseInt(route.query.hour as string)
if (route.query.sort_by) sortBy.value = route.query.sort_by as 'date' | 'likes'
if (route.query.page) currentPage.value = parseInt(route.query.page as string)
if (route.query.limit) pageSize.value = parseInt(route.query.limit as string)

// Player autocomplete handlers with debounce
const handlePlayerInput = (e: Event) => {
  const value = (e.target as HTMLInputElement).value
  playerInputValue.value = value
  playerName.value = value

  // Clear existing timer
  if (playerDebounceTimer) {
    clearTimeout(playerDebounceTimer)
  }

  // Set new timer with 300ms debounce
  playerDebounceTimer = setTimeout(() => {
    playerSearch.value = value
    playerPage.value = 1
    playerSuggestionsList.value = []
    playerHasMore.value = true
    showPlayerDropdown.value = true
  }, 300)
}

const selectPlayer = (name: string) => {
  playerName.value = name
  playerInputValue.value = name
  playerSearch.value = name
  showPlayerDropdown.value = false
}

const handlePlayerFocus = () => {
  if (playerInputValue.value.length >= 2) {
    playerSearch.value = playerInputValue.value
    playerPage.value = 1
    showPlayerDropdown.value = true
  }
}

const handlePlayerBlur = () => {
  // Delay to allow click on dropdown item
  setTimeout(() => {
    showPlayerDropdown.value = false
  }, 200)
}

const togglePlayerDropdown = () => {
  if (showPlayerDropdown.value) {
    showPlayerDropdown.value = false
  } else {
    // Trigger search with current input value (even if empty)
    playerSearch.value = playerInputValue.value
    playerPage.value = 1
    playerSuggestionsList.value = []
    playerHasMore.value = true
    showPlayerDropdown.value = true
  }
}

// Load more players on scroll
const handlePlayerScroll = (e: Event) => {
  const target = e.target as HTMLElement
  const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight

  if (scrollBottom < 10 && playerHasMore.value && !playerLoading.value) {
    playerLoading.value = true
    playerPage.value++
  }
}

// Location autocomplete handlers with debounce
const handleLocationInput = (e: Event) => {
  const value = (e.target as HTMLInputElement).value
  locationInputValue.value = value
  locationName.value = value

  // Clear existing timer
  if (locationDebounceTimer) {
    clearTimeout(locationDebounceTimer)
  }

  // Set new timer with 300ms debounce
  locationDebounceTimer = setTimeout(() => {
    locationSearch.value = value
    locationPage.value = 1
    locationSuggestionsList.value = []
    locationHasMore.value = true
    showLocationDropdown.value = true
  }, 300)
}

const selectLocation = (name: string) => {
  locationName.value = name
  locationInputValue.value = name
  locationSearch.value = name
  showLocationDropdown.value = false
}

const handleLocationFocus = () => {
  if (locationInputValue.value.length >= 2) {
    locationSearch.value = locationInputValue.value
    locationPage.value = 1
    showLocationDropdown.value = true
  }
}

const handleLocationBlur = () => {
  // Delay to allow click on dropdown item
  setTimeout(() => {
    showLocationDropdown.value = false
  }, 200)
}

const toggleLocationDropdown = () => {
  if (showLocationDropdown.value) {
    showLocationDropdown.value = false
  } else {
    // Trigger search with current input value (even if empty)
    locationSearch.value = locationInputValue.value
    locationPage.value = 1
    locationSuggestionsList.value = []
    locationHasMore.value = true
    showLocationDropdown.value = true
  }
}

// Load more locations on scroll
const handleLocationScroll = (e: Event) => {
  const target = e.target as HTMLElement
  const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight

  if (scrollBottom < 10 && locationHasMore.value && !locationLoading.value) {
    locationLoading.value = true
    locationPage.value++
  }
}

// Reset filters
const handleReset = () => {
  playerName.value = ''
  playerInputValue.value = ''
  playerSearch.value = ''
  locationName.value = ''
  locationInputValue.value = ''
  locationSearch.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  selectedClasses.value = []
  selectedRaces.value = []
  levelMin.value = 1
  levelMax.value = 56
  selectedAlignment.value = ''
  sortBy.value = 'date'
  currentPage.value = 1
  pageSize.value = 20
  router.replace({ query: {} })
}

// Toggle multi-select for classes and races
const toggleSelection = (list: string[], value: string) => {
  const index = list.indexOf(value)
  if (index > -1) {
    list.splice(index, 1)
  } else {
    list.push(value)
  }
}

// Level range handlers to prevent overlap
const handleMinLevelChange = () => {
  if (levelMin.value > levelMax.value) {
    levelMax.value = levelMin.value
  }
}

const handleMaxLevelChange = () => {
  if (levelMax.value < levelMin.value) {
    levelMin.value = levelMax.value
  }
}

// Navigate to battle detail
const viewBattle = (eventId: number) => {
  router.push({ name: 'battle-detail', params: { id: eventId } })
}

// Extract character name from player_description like "[56 Crusader] Juts (Githzerai)"
const extractCharacterName = (playerDescription: string): string | null => {
  // Remove ANSI codes first (handles &+X, &-X, &n patterns)
  const stripped = playerDescription.replace(/&[+\-]?[a-zA-Z]/g, '')
  // Match pattern: [level class] Name - allow optional space before level for single-digit levels
  const match = stripped.match(/\[\s*\d+\s+[^\]]+\]\s+(\w+)/)
  return match && match[1] ? match[1] : null
}

// Navigate to battle POV when clicking a player name
const navigateToPov = (eventId: number, playerDescription: string, event: Event) => {
  event.stopPropagation()
  const charName = extractCharacterName(playerDescription)
  if (!charName) return
  router.push({ name: 'battle-detail', params: { id: eventId }, query: { pov: charName } })
}

// Format date
const formatDate = (dateString: string) => {
  return format(new Date(dateString), 'MM/dd/yy HH:mm')
}

// Pagination helpers
const totalPages = computed(() => data.value?.pagination?.totalPages || 1)
const paginationRange = computed(() => {
  const current = currentPage.value
  const total = totalPages.value
  const delta = 2 // Number of pages to show on each side
  const range: (number | string)[] = []

  // Always show first page
  range.push(1)

  // Calculate start and end of middle range
  const start = Math.max(2, current - delta)
  const end = Math.min(total - 1, current + delta)

  // Add ellipsis after first page if needed
  if (start > 2) {
    range.push('...')
  }

  // Add middle pages
  for (let i = start; i <= end; i++) {
    range.push(i)
  }

  // Add ellipsis before last page if needed
  if (end < total - 1) {
    range.push('...')
  }

  // Always show last page if more than 1 page
  if (total > 1) {
    range.push(total)
  }

  return range
})

const goToPage = (page: number | string) => {
  if (typeof page === 'number') {
    currentPage.value = page
  }
}

// Mobile helpers
const formatTimeMobile = (dateString: string) => {
  return format(new Date(dateString), 'HH:mm')
}

const formatDateMobile = (dateString: string) => {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  }
  return format(date, 'MM/dd')
}

const getAlignmentIndicator = (event: PvPEvent) => {
  // check if killers are predominantly good or evil based on race
  const goodRaces = [
    'Grey Elf',
    'Human',
    'Dwarf',
    'Gnome',
    'Halfling',
    'Centaur',
    'Firbolg',
    'Githzerai',
  ]
  const evilRaces = [
    'Drow Elf',
    'Orc',
    'Troll',
    'Ogre',
    'Goblin',
    'Duergar',
    'Githyanki',
    'Illithid',
    'Kobold',
    'Tiefling',
  ]

  let goodCount = 0
  let evilCount = 0

  for (const killer of event.killers || []) {
    const desc = killer.description || ''
    if (goodRaces.some((r) => desc.includes(r))) goodCount++
    if (evilRaces.some((r) => desc.includes(r))) evilCount++
  }

  if (goodCount > evilCount) return 'good'
  if (evilCount > goodCount) return 'evil'
  return 'mixed'
}

const getPlayerSummary = (event: PvPEvent) => {
  const killerNames = (event.killers || [])
    .map((k) => {
      const name = extractCharacterName(k.description)
      return name || 'Unknown'
    })
    .slice(0, 2)

  const victimNames = (event.victims || [])
    .map((v) => {
      const name = extractCharacterName(v.description)
      return name || 'Unknown'
    })
    .slice(0, 2)

  const killerStr =
    killerNames.join(', ') + (event.killers && event.killers.length > 2 ? '...' : '')
  const victimStr =
    victimNames.join(', ') + (event.victims && event.victims.length > 2 ? '...' : '')

  const killerCount = event.killers?.length || 0
  const victimCount = event.victims?.length || 0

  return `${killerCount}v${victimCount} • ${killerStr} vs ${victimStr}`
}

// Count active filters for badge
const activeFilterCount = computed(() => {
  let count = 0
  if (playerName.value) count++
  if (locationName.value) count++
  if (dateFrom.value) count++
  if (dateTo.value) count++
  if (selectedClasses.value.length > 0) count++
  if (selectedRaces.value.length > 0) count++
  if (levelMin.value > 1 || levelMax.value < 56) count++
  if (selectedAlignment.value) count++
  if (selectedHour.value !== null) count++
  return count
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h2 class="text-3xl font-bold tracking-tight text-gray-100">PvP Logs</h2>
      <p class="text-gray-400">
        Browse and filter all player vs player combat events
      </p>
    </div>

    <!-- Filters -->
    <div class="rounded-lg border border-gray-800 bg-gray-950">
      <!-- Mobile: Quick filters bar + collapsible -->
      <div class="lg:hidden">
        <!-- Quick filter chips -->
        <div class="flex items-center gap-2 p-4 overflow-x-auto border-b border-gray-800">
          <button
            @click="showFilters = !showFilters"
            class="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 flex-shrink-0"
          >
            <Filter class="h-4 w-4" />
            Filters
            <span v-if="activeFilterCount > 0" class="ml-1 px-1.5 py-0.5 text-xs bg-cyan-600 text-white rounded-full">
              {{ activeFilterCount }}
            </span>
            <ChevronDown :class="['h-4 w-4 transition-transform', showFilters ? 'rotate-180' : '']" />
          </button>
          <button
            @click="selectedAlignment = selectedAlignment === 'good' ? '' : 'good'"
            :class="[
              'px-3 py-1.5 rounded-md text-sm font-medium flex-shrink-0 transition-colors',
              selectedAlignment === 'good' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400'
            ]"
          >
            Good
          </button>
          <button
            @click="selectedAlignment = selectedAlignment === 'evil' ? '' : 'evil'"
            :class="[
              'px-3 py-1.5 rounded-md text-sm font-medium flex-shrink-0 transition-colors',
              selectedAlignment === 'evil' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400'
            ]"
          >
            Evil
          </button>
          <button
            @click="sortBy = sortBy === 'likes' ? 'date' : 'likes'"
            :class="[
              'px-3 py-1.5 rounded-md text-sm font-medium flex-shrink-0 transition-colors',
              sortBy === 'likes' ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400'
            ]"
          >
            {{ sortBy === 'likes' ? '♥ Popular' : '🕐 Recent' }}
          </button>
        </div>

        <!-- Collapsible filter content -->
        <div v-show="showFilters" class="p-4 space-y-4 border-b border-gray-800">
          <!-- Player & Location -->
          <div class="grid grid-cols-2 gap-3">
            <div class="relative">
              <input
                :value="playerInputValue"
                @input="handlePlayerInput"
                @focus="handlePlayerFocus"
                @blur="handlePlayerBlur"
                type="text"
                placeholder="Player..."
                class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              />
            </div>
            <div class="relative">
              <input
                :value="locationInputValue"
                @input="handleLocationInput"
                @focus="handleLocationFocus"
                @blur="handleLocationBlur"
                type="text"
                placeholder="Location..."
                class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              />
            </div>
          </div>

          <!-- Date range -->
          <div class="grid grid-cols-2 gap-3">
            <input
              v-model="dateFrom"
              type="date"
              class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 date-input"
            />
            <input
              v-model="dateTo"
              type="date"
              class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 date-input"
            />
          </div>

          <!-- Level range simplified -->
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-2">Level: {{ levelMin }} - {{ levelMax }}</label>
            <div class="flex gap-2">
              <input v-model.number="levelMin" type="number" min="1" max="56" class="w-16 h-8 rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-2 text-sm text-center" />
              <span class="text-gray-500 self-center">to</span>
              <input v-model.number="levelMax" type="number" min="1" max="56" class="w-16 h-8 rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-2 text-sm text-center" />
            </div>
          </div>

          <!-- Reset button -->
          <button
            @click="handleReset"
            class="w-full py-2 rounded-md text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700"
          >
            Reset Filters
          </button>
        </div>
      </div>

      <!-- Desktop: Full filters -->
      <div class="hidden lg:block p-6">
        <div class="space-y-4">
          <!-- Row 1: Player, Location, Date From, Date To -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <!-- Player Name Combo Box -->
          <div class="relative">
            <label class="block text-sm font-medium text-gray-300 mb-2">Player Name</label>
            <div class="relative">
              <input
                :value="playerInputValue"
                @input="handlePlayerInput"
                @focus="handlePlayerFocus"
                @blur="handlePlayerBlur"
                type="text"
                placeholder="Search player..."
                class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 pl-3 pr-9 py-1 text-sm shadow-sm transition-colors placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              />
              <button
                @mousedown.prevent="togglePlayerDropdown"
                class="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-400 hover:text-gray-300"
                type="button"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <!-- Player Dropdown -->
            <div
              v-if="showPlayerDropdown && playerSuggestionsList && playerSuggestionsList.length > 0"
              @scroll="handlePlayerScroll"
              class="absolute z-10 mt-1 w-full rounded-md border border-gray-700 bg-gray-900 shadow-lg max-h-60 overflow-auto"
            >
              <button
                v-for="player in playerSuggestionsList"
                :key="player.name"
                @mousedown.prevent="selectPlayer(player.name)"
                class="w-full px-3 py-2 text-left text-sm hover:bg-gray-800 transition-colors flex items-center justify-between font-mono"
              >
                <span class="flex-1" v-html="parseAnsiForVue(player.displayName)"></span>
                <span class="text-xs text-gray-400 whitespace-nowrap ml-4">
                  Lv{{ player.level }} <span v-html="parseAnsiForVue(player.race)"></span> <span v-html="parseAnsiForVue(player.class)"></span>
                </span>
              </button>
              <!-- Loading indicator -->
              <div v-if="playerLoading" class="px-3 py-2 text-center text-sm text-gray-500">
                Loading...
              </div>
            </div>
            <!-- Show "No results" if searching but no results -->
            <div
              v-else-if="showPlayerDropdown && playerSearch.length >= 2 && (!playerSuggestionsList || playerSuggestionsList.length === 0)"
              class="absolute z-10 mt-1 w-full rounded-md border border-gray-700 bg-gray-900 shadow-lg px-3 py-2"
            >
              <span class="text-sm text-gray-500">No players found</span>
            </div>
          </div>

          <!-- Location Combo Box -->
          <div class="relative">
            <label class="block text-sm font-medium text-gray-300 mb-2">Location</label>
            <div class="relative">
              <input
                :value="locationInputValue"
                @input="handleLocationInput"
                @focus="handleLocationFocus"
                @blur="handleLocationBlur"
                type="text"
                placeholder="Search location..."
                class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 pl-3 pr-9 py-1 text-sm shadow-sm transition-colors placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              />
              <button
                @mousedown.prevent="toggleLocationDropdown"
                class="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-400 hover:text-gray-300"
                type="button"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <!-- Location Dropdown -->
            <div
              v-if="showLocationDropdown && locationSuggestionsList && locationSuggestionsList.length > 0"
              @scroll="handleLocationScroll"
              class="absolute z-10 mt-1 w-full rounded-md border border-gray-700 bg-gray-900 shadow-lg max-h-60 overflow-auto"
            >
              <button
                v-for="location in locationSuggestionsList"
                :key="location.room_vnum"
                @mousedown.prevent="selectLocation(location.room_name)"
                class="w-full px-3 py-2 text-left text-sm hover:bg-gray-800 transition-colors"
              >
                <div v-html="parseAnsiForVue(location.room_name)"></div>
                <div class="text-xs text-gray-500 mt-1">{{ location.battle_count }} battles</div>
              </button>
              <!-- Loading indicator -->
              <div v-if="locationLoading" class="px-3 py-2 text-center text-sm text-gray-500">
                Loading...
              </div>
            </div>
            <!-- Show "No results" if searching but no results -->
            <div
              v-else-if="showLocationDropdown && locationSearch.length >= 2 && (!locationSuggestionsList || locationSuggestionsList.length === 0)"
              class="absolute z-10 mt-1 w-full rounded-md border border-gray-700 bg-gray-900 shadow-lg px-3 py-2"
            >
              <span class="text-sm text-gray-500">No locations found</span>
            </div>
          </div>

          <!-- Date From -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Date From</label>
            <div class="relative">
              <input
                v-model="dateFrom"
                type="date"
                class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 date-input"
              />
            </div>
          </div>

          <!-- Date To -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Date To</label>
            <div class="relative">
              <input
                v-model="dateTo"
                type="date"
                class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 date-input"
              />
            </div>
          </div>
        </div>

        <!-- Row 2: Alignment, Sort By, and Level Range -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Alignment -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Alignment</label>
            <select
              v-model="selectedAlignment"
              class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
            >
              <option value="">All Alignments</option>
              <option value="good">Good</option>
              <option value="evil">Evil</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>

          <!-- Sort By -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Sort By</label>
            <select
              v-model="sortBy"
              class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
            >
              <option value="date">Most Recent</option>
              <option value="likes">Most Liked</option>
            </select>
          </div>

          <!-- Level Range -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              Level Range: {{ levelMin }} - {{ levelMax }}
            </label>
            <div class="flex items-center gap-3">
              <input
                v-model.number="levelMin"
                type="number"
                min="1"
                max="56"
                class="w-14 h-9 rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-2 text-sm text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              />
              <div class="relative flex-1 h-2">
                <div class="absolute w-full h-2 bg-gray-700 rounded-lg"></div>
                <div
                  class="absolute h-2 bg-cyan-500 rounded-lg"
                  :style="{
                    left: `${((levelMin - 1) / 55) * 100}%`,
                    right: `${100 - ((levelMax - 1) / 55) * 100}%`
                  }"
                ></div>
                <input
                  v-model.number="levelMin"
                  type="range"
                  min="1"
                  max="56"
                  class="absolute w-full h-2 bg-transparent appearance-none cursor-pointer pointer-events-auto range-slider"
                  style="z-index: 3"
                  @input="handleMinLevelChange"
                />
                <input
                  v-model.number="levelMax"
                  type="range"
                  min="1"
                  max="56"
                  class="absolute w-full h-2 bg-transparent appearance-none cursor-pointer pointer-events-auto range-slider"
                  style="z-index: 4"
                  @input="handleMaxLevelChange"
                />
              </div>
              <input
                v-model.number="levelMax"
                type="number"
                min="1"
                max="56"
                class="w-14 h-9 rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-2 text-sm text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              />
            </div>
          </div>
        </div>

        <!-- Row 3: Class Filter -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Classes</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="cls in classList"
              :key="cls"
              @click="toggleSelection(selectedClasses, cls)"
              :class="[
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                selectedClasses.includes(cls)
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              ]"
            >
              {{ cls }}
            </button>
          </div>
        </div>

        <!-- Row 4: Race Filter -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Races</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="race in raceList"
              :key="race"
              @click="toggleSelection(selectedRaces, race)"
              :class="[
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                selectedRaces.includes(race)
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              ]"
            >
              {{ race }}
            </button>
          </div>
        </div>

        <!-- Row 5: Reset Button -->
        <div class="flex items-end justify-end pt-2 border-t border-gray-800">
          <button
            @click="handleReset"
            class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 bg-gray-800 text-gray-300 hover:bg-gray-700 h-9 px-6"
          >
            Reset Filters
          </button>
        </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
        <p class="mt-4 text-gray-400">Loading PvP events...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="isError" class="rounded-lg border border-red-800 bg-red-950/20 p-4">
      <h3 class="font-semibold text-red-400">Error loading PvP events</h3>
      <p class="text-sm text-red-400/80">{{ error?.message || 'Unknown error occurred' }}</p>
    </div>

    <!-- Events List/Table -->
    <div v-else-if="data?.data && data.data.length > 0" class="rounded-lg border border-gray-800 bg-gray-950">
      <!-- Mobile: Compact List -->
      <div class="lg:hidden divide-y divide-gray-800">
        <div
          v-for="event in data.data"
          :key="event.id"
          @click="viewBattle(event.id)"
          class="flex items-center gap-3 p-4 hover:bg-gray-900 transition-colors cursor-pointer"
        >
          <!-- Alignment indicator -->
          <div
            :class="[
              'w-1 h-12 rounded-full flex-shrink-0',
              getAlignmentIndicator(event) === 'good' ? 'bg-green-500' :
              getAlignmentIndicator(event) === 'evil' ? 'bg-red-500' :
              'bg-gradient-to-b from-green-500 to-red-500'
            ]"
          ></div>

          <!-- Main content -->
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-100 truncate">
              <span v-html="parseAnsiForVue(event.room_name)"></span>
            </div>
            <div class="text-xs text-gray-500 mt-0.5 truncate">
              {{ getPlayerSummary(event) }}
            </div>
          </div>

          <!-- Right side: time & stats -->
          <div class="text-right flex-shrink-0">
            <div class="text-xs text-gray-500">{{ formatTimeMobile(event.stamp) }}</div>
            <div class="text-xs text-gray-600">{{ formatDateMobile(event.stamp) }}</div>
            <div class="flex items-center gap-2 mt-1 justify-end">
              <span v-if="(event.like_count ?? 0) > 0" class="text-xs text-gray-500 flex items-center gap-0.5">
                <ThumbsUp class="h-3 w-3" /> {{ event.like_count }}
              </span>
              <span v-if="(event.comment_count ?? 0) > 0" class="text-xs text-gray-500 flex items-center gap-0.5">
                <MessageSquare class="h-3 w-3" /> {{ event.comment_count }}
              </span>
            </div>
          </div>

          <!-- Chevron -->
          <ChevronRight class="h-4 w-4 text-gray-600 flex-shrink-0" />
        </div>
      </div>

      <!-- Desktop: Table -->
      <div class="hidden lg:block overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-gray-800 bg-gray-900">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-400">Date/Time</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-400">Location</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-400">Killers</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-400">Victims</th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-400 w-16">
                <ThumbsUp class="h-4 w-4 mx-auto" />
              </th>
              <th class="px-4 py-3 text-center text-sm font-medium text-gray-400 w-16">
                <MessageSquare class="h-4 w-4 mx-auto" />
              </th>
              <th class="px-4 py-3 text-right text-sm font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="event in data.data"
              :key="event.id"
              class="border-b border-gray-800 hover:bg-gray-900 transition-colors"
            >
              <td class="px-4 py-3 text-sm">{{ formatDate(event.stamp) }}</td>
              <td class="px-4 py-3 text-sm"><span v-html="parseAnsiForVue(event.room_name)"></span></td>
              <td class="px-4 py-3 text-sm text-green-600 dark:text-green-400">
                <div class="space-y-1">
                  <div v-for="(killer, idx) in event.killers" :key="idx" class="flex items-center gap-1">
                    <span
                      class="hover:underline cursor-pointer"
                      @click="navigateToPov(event.id, killer.description, $event)"
                      v-html="parseAnsiForVue(killer.description)"
                    ></span>
                    <Crown v-if="killer.isLeader" class="h-3 w-3 text-yellow-500 flex-shrink-0" />
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-red-600 dark:text-red-400">
                <div class="space-y-1">
                  <div v-for="(victim, idx) in event.victims" :key="idx" class="flex items-center gap-1">
                    <span
                      class="hover:underline cursor-pointer"
                      @click="navigateToPov(event.id, victim.description, $event)"
                      v-html="parseAnsiForVue(victim.description)"
                    ></span>
                    <Droplet v-if="victim.died" class="h-3 w-3 text-red-500 fill-red-500 flex-shrink-0" />
                    <Crown v-if="victim.isLeader" class="h-3 w-3 text-yellow-500 flex-shrink-0" />
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-center text-gray-400">
                <span v-if="(event.like_count ?? 0) > 0" class="inline-flex items-center gap-1">
                  {{ event.like_count }}
                </span>
                <span v-else class="text-gray-600">-</span>
              </td>
              <td class="px-4 py-3 text-sm text-center text-gray-400">
                <span v-if="(event.comment_count ?? 0) > 0" class="inline-flex items-center gap-1">
                  {{ event.comment_count }}
                </span>
                <span v-else class="text-gray-600">-</span>
              </td>
              <td class="px-4 py-3 text-sm text-right">
                <button
                  @click.stop="viewBattle(event.id)"
                  class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-cyan-600 text-white hover:bg-cyan-700 h-9 px-4"
                >
                  View Details
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="data?.pagination" class="border-t border-gray-800 px-4 py-3">
        <div class="flex flex-col lg:flex-row items-center justify-between gap-3">
          <div class="flex items-center gap-4 w-full lg:w-auto justify-between lg:justify-start">
            <div class="text-xs lg:text-sm text-gray-400">
              <span class="lg:hidden">{{ data.pagination.total }} events</span>
              <span class="hidden lg:inline">Showing {{ ((currentPage - 1) * pageSize) + 1 }} - {{ Math.min(currentPage * pageSize, data.pagination.total) }} of {{ data.pagination.total }} events</span>
            </div>
            <div class="hidden lg:flex items-center space-x-2">
              <label class="text-xs text-gray-400">Per page:</label>
              <select
                v-model.number="pageSize"
                class="h-8 rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              >
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </div>
          </div>

          <div class="flex items-center space-x-1 lg:space-x-2">
          <!-- Previous Button -->
          <button
            @click="currentPage--"
            :disabled="currentPage === 1"
            class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-300 h-8 lg:h-9 px-2 lg:px-3"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <!-- Page Numbers with Ellipsis -->
          <template v-for="(page, idx) in paginationRange" :key="idx">
            <button
              v-if="typeof page === 'number'"
              @click="goToPage(page)"
              :class="[
                'inline-flex items-center justify-center rounded-md text-xs lg:text-sm font-medium transition-colors h-8 w-8 lg:h-9 lg:w-9',
                page === currentPage
                  ? 'bg-cyan-600 text-white'
                  : 'border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-300'
              ]"
            >
              {{ page }}
            </button>
            <span v-else class="px-1 lg:px-2 text-gray-500 text-xs lg:text-sm">...</span>
          </template>

          <!-- Next Button -->
          <button
            @click="currentPage++"
            :disabled="currentPage >= totalPages"
            class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-300 h-8 lg:h-9 px-2 lg:px-3"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="rounded-lg border border-gray-800 bg-gray-950 p-12 text-center">
      <svg class="h-16 w-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 class="text-xl font-semibold text-gray-100 mb-2">No PvP Events Found</h3>
      <p class="text-gray-400">
        {{ playerName || locationName || dateFrom || dateTo || selectedClasses.length > 0 || selectedRaces.length > 0 || levelMin > 1 || levelMax < 56 || selectedAlignment
          ? 'Try adjusting your filters to see more results'
          : 'No PvP events have been logged yet'
        }}
      </p>
    </div>
  </div>
</template>

<style>
/* Date picker icon styling */
.date-input::-webkit-calendar-picker-indicator {
  filter: invert(0.6);
  cursor: pointer;
  position: absolute;
  right: 8px;
}

.date-input::-webkit-calendar-picker-indicator:hover {
  filter: invert(0.8);
}

.date-input::-webkit-datetime-edit {
  padding-right: 30px;
}

/* Dual-handle range slider styling */
.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #06b6d4; /* cyan-500 */
  cursor: pointer;
  border: 2px solid #0e7490; /* cyan-700 */
  position: relative;
  z-index: 5;
}

.range-slider::-webkit-slider-thumb:hover {
  background: #22d3ee; /* cyan-400 */
}

.range-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #06b6d4;
  cursor: pointer;
  border: 2px solid #0e7490;
  position: relative;
  z-index: 5;
}

.range-slider::-moz-range-thumb:hover {
  background: #22d3ee;
}

/* Hide default track for both browsers */
.range-slider::-webkit-slider-runnable-track {
  background: transparent;
}

.range-slider::-moz-range-track {
  background: transparent;
}
</style>
