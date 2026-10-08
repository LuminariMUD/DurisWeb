<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import pvpApi from '@/services/api'
import { useLocations, usePlayers } from '@/composables/usePvPEvents'
import { format } from 'date-fns'
import { parseAnsiForVue } from '@/utils/ansiParser'
import type { SearchQuery, PvPEvent, PaginatedResponse } from '@/types'
import flatpickr from 'flatpickr'
import 'flatpickr/dist/flatpickr.min.css'
import 'flatpickr/dist/themes/dark.css'

const route = useRoute()
const router = useRouter()

// Search form state
const playerName = ref('')
const dateRangeStart = ref('')
const dateRangeEnd = ref('')
const selectedLocation = ref('')
const selectedClasses = ref<string[]>([])
const selectedRaces = ref<string[]>([])
const levelMin = ref(1)
const levelMax = ref(60)
const selectedAlignment = ref<'good' | 'evil' | 'neutral' | ''>('')
const groupSize = ref('')
const currentPage = ref(1)

// Flatpickr instances
const startDateInput = ref<HTMLInputElement | null>(null)
const endDateInput = ref<HTMLInputElement | null>(null)
let startDatePicker: flatpickr.Instance | null = null
let endDatePicker: flatpickr.Instance | null = null

// Autocomplete search terms
const locationSearch = ref('')
const playerSearch = ref('')

// Fetch autocomplete data
const { data: _locations } = useLocations(locationSearch)
const { data: _players } = usePlayers(playerSearch)

// DurisMUD classes (common ones)
const classList = [
  'Warrior',
  'Cleric',
  'Thief',
  'Wizard',
  'Druid',
  'Shaman',
  'Sorcerer',
  'Bard',
  'Ranger',
  'Paladin',
  'Anti-Paladin',
  'Crusader',
  'Blighter',
  'Necromancer',
  'Bounty Hunter',
  'Monk',
]

// DurisMUD races (common ones)
const raceList = [
  'Human',
  'Elf',
  'Dwarf',
  'Halfling',
  'Gnome',
  'Drow',
  'Orc',
  'Ogre',
  'Troll',
  'Githzerai',
  'Githyanki',
  'Goblin',
  'Kobold',
  'Duergar',
  'Minotaur',
]

// Group sizes
const groupSizes = ['1v1', '2v2', '3v3', '4v4', '5v5']

// Build search query
const searchQuery = computed<SearchQuery>(() => {
  const query: SearchQuery = {}

  if (playerName.value) query.playerName = playerName.value
  if (dateRangeStart.value || dateRangeEnd.value) {
    const today = new Date().toISOString().split('T')[0] as string
    query.dateRange = {
      start: dateRangeStart.value || '2000-01-01',
      end: dateRangeEnd.value || today,
    }
  }
  if (selectedLocation.value) query.location = selectedLocation.value
  if (selectedClasses.value.length > 0) query.class = selectedClasses.value
  if (selectedRaces.value.length > 0) query.race = selectedRaces.value
  if (levelMin.value > 1 || levelMax.value < 60) {
    query.levelRange = { min: levelMin.value, max: levelMax.value }
  }
  if (selectedAlignment.value) query.alignment = selectedAlignment.value
  if (groupSize.value) query.groupSize = groupSize.value

  return query
})

// Execute search
const hasSearched = ref(false)
const {
  data: searchResults,
  isLoading,
  isError,
  error,
} = useQuery<PaginatedResponse<PvPEvent>>({
  queryKey: ['search', searchQuery, currentPage],
  queryFn: () => pvpApi.search({ ...searchQuery.value, page: currentPage.value, limit: 50 } as any),
  enabled: hasSearched,
  staleTime: 1000 * 60 * 2,
  refetchOnWindowFocus: false,
})

// Handle search submit
const handleSearch = () => {
  hasSearched.value = true
  currentPage.value = 1
  updateUrlParams()
}

// Reset filters
const handleReset = () => {
  playerName.value = ''
  dateRangeStart.value = ''
  dateRangeEnd.value = ''
  selectedLocation.value = ''
  selectedClasses.value = []
  selectedRaces.value = []
  levelMin.value = 1
  levelMax.value = 60
  selectedAlignment.value = ''
  groupSize.value = ''
  currentPage.value = 1
  hasSearched.value = false
  router.replace({ query: {} })
}

// Update URL query params for bookmarkable searches
const updateUrlParams = () => {
  const query: Record<string, string> = {}

  if (playerName.value) query.player = playerName.value
  if (dateRangeStart.value) query.startDate = dateRangeStart.value
  if (dateRangeEnd.value) query.endDate = dateRangeEnd.value
  if (selectedLocation.value) query.location = selectedLocation.value
  if (selectedClasses.value.length > 0) query.classes = selectedClasses.value.join(',')
  if (selectedRaces.value.length > 0) query.races = selectedRaces.value.join(',')
  if (levelMin.value > 1) query.minLevel = levelMin.value.toString()
  if (levelMax.value < 60) query.maxLevel = levelMax.value.toString()
  if (selectedAlignment.value) query.alignment = selectedAlignment.value
  if (groupSize.value) query.groupSize = groupSize.value
  if (currentPage.value > 1) query.page = currentPage.value.toString()

  router.replace({ query })
}

// Initialize flatpickr
const initializeDatePickers = () => {
  if (startDateInput.value && !startDatePicker) {
    startDatePicker = flatpickr(
      startDateInput.value as HTMLElement,
      {
        dateFormat: 'Y-m-d',
        onChange: (_selectedDates: any, dateStr: string) => {
          dateRangeStart.value = dateStr
        },
        maxDate: endDateInput.value?.value || 'today',
      } as any,
    )
  }

  if (endDateInput.value && !endDatePicker) {
    endDatePicker = flatpickr(
      endDateInput.value as HTMLElement,
      {
        dateFormat: 'Y-m-d',
        onChange: (_selectedDates: any, dateStr: string) => {
          dateRangeEnd.value = dateStr
          if (startDatePicker) {
            startDatePicker.set('maxDate', dateStr || 'today')
          }
        },
        maxDate: 'today',
      } as any,
    )
  }
}

// Load from URL params on mount
onMounted(async () => {
  if (route.query.player) playerName.value = route.query.player as string
  if (route.query.startDate) dateRangeStart.value = route.query.startDate as string
  if (route.query.endDate) dateRangeEnd.value = route.query.endDate as string
  if (route.query.location) selectedLocation.value = route.query.location as string
  if (route.query.classes) selectedClasses.value = (route.query.classes as string).split(',')
  if (route.query.races) selectedRaces.value = (route.query.races as string).split(',')
  if (route.query.minLevel) levelMin.value = parseInt(route.query.minLevel as string)
  if (route.query.maxLevel) levelMax.value = parseInt(route.query.maxLevel as string)
  if (route.query.alignment) selectedAlignment.value = route.query.alignment as any
  if (route.query.groupSize) groupSize.value = route.query.groupSize as string
  if (route.query.page) currentPage.value = parseInt(route.query.page as string)

  // Initialize date pickers after DOM is ready
  await nextTick()
  initializeDatePickers()

  // Set initial values if they exist
  if (dateRangeStart.value && startDatePicker) {
    startDatePicker.setDate(dateRangeStart.value, false)
  }
  if (dateRangeEnd.value && endDatePicker) {
    endDatePicker.setDate(dateRangeEnd.value, false)
  }

  // Auto-search if there are URL params
  if (Object.keys(route.query).length > 0) {
    hasSearched.value = true
  }
})

// Watch page changes
watch(currentPage, () => {
  if (hasSearched.value) {
    updateUrlParams()
  }
})

// Navigate to battle detail
const viewBattle = (eventId: number) => {
  router.push({ name: 'battle-detail', params: { id: eventId } })
}

// Format date
const formatDate = (dateString: string) => {
  return format(new Date(dateString), 'MM/dd/yy HH:mm')
}

// Toggle multi-select
const toggleSelection = (list: string[], value: string) => {
  const index = list.indexOf(value)
  if (index > -1) {
    list.splice(index, 1)
  } else {
    list.push(value)
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h2 class="text-4xl md:text-5xl text-foreground">Advanced Search</h2>
      <p class="text-muted-foreground">
        Search and filter PvP events with advanced criteria
      </p>
    </div>

    <!-- Search Form -->
    <div class="rounded-lg border border-border bg-background p-6">
      <div class="space-y-6">
        <!-- Row 1: Player & Date Range -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Player Name -->
          <div>
            <label class="block text-sm font-medium text-bone-muted mb-2">Player Name</label>
            <input
              v-model="playerName"
              type="text"
              placeholder="Search by player name..."
              class="flex h-9 w-full rounded-md border border-border bg-card text-bone-muted px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vermilion"
              @input="playerSearch = playerName"
            />
          </div>

          <!-- Start Date -->
          <div>
            <label class="block text-sm font-medium text-bone-muted mb-2">Start Date</label>
            <input
              ref="startDateInput"
              v-model="dateRangeStart"
              type="text"
              placeholder="Select start date..."
              class="flex h-9 w-full rounded-md border border-border bg-card text-bone-muted px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vermilion"
            />
          </div>

          <!-- End Date -->
          <div>
            <label class="block text-sm font-medium text-bone-muted mb-2">End Date</label>
            <input
              ref="endDateInput"
              v-model="dateRangeEnd"
              type="text"
              placeholder="Select end date..."
              class="flex h-9 w-full rounded-md border border-border bg-card text-bone-muted px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vermilion"
            />
          </div>
        </div>

        <!-- Row 2: Location & Alignment & Group Size -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Location -->
          <div>
            <label class="block text-sm font-medium text-bone-muted mb-2">Location</label>
            <input
              v-model="selectedLocation"
              type="text"
              placeholder="Search by location..."
              class="flex h-9 w-full rounded-md border border-border bg-card text-bone-muted px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-faint focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vermilion"
              @input="locationSearch = selectedLocation"
            />
          </div>

          <!-- Alignment -->
          <div>
            <label class="block text-sm font-medium text-bone-muted mb-2">Alignment</label>
            <select
              v-model="selectedAlignment"
              class="flex h-9 w-full rounded-md border border-border bg-card text-bone-muted px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vermilion"
            >
              <option value="">All Alignments</option>
              <option value="good">Good</option>
              <option value="evil">Evil</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>

          <!-- Group Size -->
          <div>
            <label class="block text-sm font-medium text-bone-muted mb-2">Group Size</label>
            <select
              v-model="groupSize"
              class="flex h-9 w-full rounded-md border border-border bg-card text-bone-muted px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vermilion"
            >
              <option value="">Any Size</option>
              <option v-for="size in groupSizes" :key="size" :value="size">{{ size }}</option>
            </select>
          </div>
        </div>

        <!-- Row 3: Level Range -->
        <div>
          <label class="block text-sm font-medium text-bone-muted mb-2">
            Level Range: {{ levelMin }} - {{ levelMax }}
          </label>
          <div class="flex items-center space-x-4">
            <input
              v-model.number="levelMin"
              type="range"
              min="1"
              max="60"
              class="flex-1 h-2 bg-ink-top rounded-lg appearance-none cursor-pointer accent-vermilion"
            />
            <input
              v-model.number="levelMax"
              type="range"
              min="1"
              max="60"
              class="flex-1 h-2 bg-ink-top rounded-lg appearance-none cursor-pointer accent-vermilion"
            />
          </div>
        </div>

        <!-- Row 4: Class Filter -->
        <div>
          <label class="block text-sm font-medium text-bone-muted mb-2">Classes</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="cls in classList"
              :key="cls"
              @click="toggleSelection(selectedClasses, cls)"
              :class="[
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                selectedClasses.includes(cls)
                  ? 'bg-vermilion-deep text-white'
                  : 'bg-ink-high text-bone-muted hover:bg-ink-top'
              ]"
            >
              {{ cls }}
            </button>
          </div>
        </div>

        <!-- Row 5: Race Filter -->
        <div>
          <label class="block text-sm font-medium text-bone-muted mb-2">Races</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="race in raceList"
              :key="race"
              @click="toggleSelection(selectedRaces, race)"
              :class="[
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                selectedRaces.includes(race)
                  ? 'bg-vermilion-deep text-white'
                  : 'bg-ink-high text-bone-muted hover:bg-ink-top'
              ]"
            >
              {{ race }}
            </button>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center space-x-4 pt-4 border-t border-border">
          <button
            @click="handleSearch"
            class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermilion disabled:pointer-events-none disabled:opacity-50 bg-vermilion-deep text-white hover:bg-vermilion-hover h-9 px-6"
          >
            <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search
          </button>
          <button
            @click="handleReset"
            class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermilion disabled:pointer-events-none disabled:opacity-50 bg-ink-high text-bone-muted hover:bg-ink-top h-9 px-6"
          >
            Reset
          </button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
        <p class="mt-4 text-muted-foreground">Searching PvP events...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="isError" class="rounded-lg border border-destructive bg-destructive/10 p-4">
      <h3 class="font-semibold text-destructive">Error searching PvP events</h3>
      <p class="text-sm text-destructive/80">{{ error?.message || 'Unknown error occurred' }}</p>
    </div>

    <!-- Search Results -->
    <div v-else-if="hasSearched && searchResults" class="rounded-lg border border-border bg-background">
      <div class="border-b border-border px-4 py-3">
        <h3 class="text-lg font-semibold text-foreground">
          Search Results
          <span class="text-sm text-muted-foreground font-normal ml-2">
            ({{ searchResults.pagination?.total || 0 }} events found)
          </span>
        </h3>
      </div>

      <div v-if="searchResults?.data?.length > 0" class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-border bg-card">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Date/Time</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Location</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Killers</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Victims</th>
              <th class="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="event in searchResults.data"
              :key="event.id"
              class="border-b border-border hover:bg-card transition-colors cursor-pointer"
              @click="viewBattle(event.id)"
            >
              <td class="px-4 py-3 text-sm">{{ formatDate(event.stamp) }}</td>
              <td class="px-4 py-3 text-sm"><span v-html="parseAnsiForVue(event.room_name)"></span></td>
              <td class="px-4 py-3 text-sm text-success">
                <div class="space-y-1">
                  <div v-for="(killer, idx) in event.killers" :key="idx">
                    <span v-html="parseAnsiForVue(killer.description)"></span>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-danger">
                <div class="space-y-1">
                  <div v-for="(victim, idx) in event.victims" :key="idx">
                    <span v-html="parseAnsiForVue(victim.description)"></span>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-right">
                <button
                  @click.stop="viewBattle(event.id)"
                  class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4"
                >
                  View Details
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty Results -->
      <div v-else class="p-12 text-center text-muted-foreground">
        <svg class="h-12 w-12 mx-auto mb-4 text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>No PvP events found matching your criteria</p>
        <p class="text-sm mt-2">Try adjusting your search filters</p>
      </div>

      <!-- Pagination -->
      <div v-if="searchResults?.pagination && searchResults?.data?.length > 0" class="flex items-center justify-between border-t border-border px-4 py-3">
        <div class="text-sm text-muted-foreground">
          Showing page {{ searchResults.pagination.page }} of {{ searchResults.pagination.totalPages }}
          ({{ searchResults.pagination.total }} total events)
        </div>
        <div class="flex items-center space-x-2">
          <button
            @click="currentPage--"
            :disabled="currentPage === 1"
            class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 border border-border bg-card hover:bg-ink-high text-bone-muted h-9 px-4"
          >
            Previous
          </button>
          <button
            @click="currentPage++"
            :disabled="currentPage >= searchResults.pagination.totalPages"
            class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 border border-border bg-card hover:bg-ink-high text-bone-muted h-9 px-4"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Initial State -->
    <div v-else-if="!hasSearched" class="rounded-lg border border-border bg-background p-12 text-center">
      <div class="space-y-4">
        <svg class="h-16 w-16 mx-auto text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <h3 class="text-xl font-semibold text-foreground">Ready to Search</h3>
        <p class="text-muted-foreground max-w-md mx-auto">
          Use the filters above to search for specific PvP events. You can filter by player, date, location, class, race, level range, and more.
        </p>
        <p class="text-sm text-muted-foreground">
          All search criteria are optional - use as many or as few as you need!
        </p>
      </div>
    </div>
  </div>
</template>

<style>
/* Flatpickr Dark MUD Theme Overrides */
.flatpickr-calendar.arrowTop:before,
.flatpickr-calendar.arrowTop:after {
  border-bottom-color: var(--color-ink-high) !important;
}

.flatpickr-calendar {
  background: var(--color-ink-raised) !important;
  border: 1px solid var(--color-ink-high) !important;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.5) !important;
}

.flatpickr-months {
  background: var(--color-ink-high) !important;
  border-bottom: 1px solid var(--color-ink-top) !important;
}

.flatpickr-current-month .flatpickr-monthDropdown-months,
.flatpickr-current-month input.cur-year {
  background: var(--color-ink-raised) !important;
  color: var(--color-bone) !important;
  border: 1px solid var(--color-ink-top) !important;
}

.flatpickr-current-month .flatpickr-monthDropdown-months:hover,
.flatpickr-current-month input.cur-year:hover {
  background: var(--color-ink-high) !important;
}

.flatpickr-weekdays {
  background: var(--color-ink-high) !important;
}

span.flatpickr-weekday {
  color: var(--muted-foreground) !important;
  font-weight: 600;
}

.flatpickr-day {
  color: var(--color-bone) !important;
  border: none !important;
}

.flatpickr-day:hover,
.flatpickr-day:focus {
  background: var(--color-ink-high) !important;
  border-color: var(--color-ink-high) !important;
  color: var(--color-vermilion) !important;
}

.flatpickr-day.today {
  border-color: var(--color-vermilion) !important;
  background: rgb(90, 29, 18) !important;
  color: var(--color-vermilion) !important;
}

.flatpickr-day.today:hover,
.flatpickr-day.today:focus {
  border-color: var(--color-vermilion) !important;
  background: rgb(138, 36, 22) !important;
  color: var(--color-vermilion) !important;
}

.flatpickr-day.selected,
.flatpickr-day.startRange,
.flatpickr-day.endRange,
.flatpickr-day.selected.inRange,
.flatpickr-day.startRange.inRange,
.flatpickr-day.endRange.inRange,
.flatpickr-day.selected:focus,
.flatpickr-day.startRange:focus,
.flatpickr-day.endRange:focus,
.flatpickr-day.selected:hover,
.flatpickr-day.startRange:hover,
.flatpickr-day.endRange:hover,
.flatpickr-day.selected.prevMonthDay,
.flatpickr-day.startRange.prevMonthDay,
.flatpickr-day.endRange.prevMonthDay,
.flatpickr-day.selected.nextMonthDay,
.flatpickr-day.startRange.nextMonthDay,
.flatpickr-day.endRange.nextMonthDay {
  background: var(--color-vermilion) !important;
  border-color: var(--color-vermilion) !important;
  color: white !important;
}

.flatpickr-day.inRange {
  background: color-mix(in srgb, var(--color-vermilion) 20%, transparent) !important;
  border-color: transparent !important;
  box-shadow: -5px 0 0 color-mix(in srgb, var(--color-vermilion) 20%, transparent), 5px 0 0 color-mix(in srgb, var(--color-vermilion) 20%, transparent) !important;
}

.flatpickr-day.disabled,
.flatpickr-day.disabled:hover,
.flatpickr-day.prevMonthDay,
.flatpickr-day.nextMonthDay,
.flatpickr-day.notAllowed,
.flatpickr-day.notAllowed.prevMonthDay,
.flatpickr-day.notAllowed.nextMonthDay {
  color: var(--color-rule) !important;
  background: transparent !important;
}

.flatpickr-months .flatpickr-prev-month,
.flatpickr-months .flatpickr-next-month {
  color: var(--muted-foreground) !important;
}

.flatpickr-months .flatpickr-prev-month:hover,
.flatpickr-months .flatpickr-next-month:hover {
  color: var(--color-vermilion) !important;
}

.flatpickr-months .flatpickr-prev-month:hover svg,
.flatpickr-months .flatpickr-next-month:hover svg {
  fill: var(--color-vermilion) !important;
}

.flatpickr-time {
  border-top: 1px solid var(--color-ink-top) !important;
  background: var(--color-ink-high) !important;
}

.flatpickr-time input {
  background: var(--color-ink-raised) !important;
  color: var(--color-bone) !important;
  border: 1px solid var(--color-ink-top) !important;
}

.flatpickr-time .flatpickr-time-separator,
.flatpickr-time .flatpickr-am-pm {
  color: var(--muted-foreground) !important;
}
</style>
