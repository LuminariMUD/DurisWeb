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
  'Warrior', 'Cleric', 'Thief', 'Wizard', 'Druid', 'Shaman',
  'Sorcerer', 'Bard', 'Ranger', 'Paladin', 'Anti-Paladin',
  'Crusader', 'Blighter', 'Necromancer', 'Bounty Hunter', 'Monk'
]

// DurisMUD races (common ones)
const raceList = [
  'Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Drow',
  'Orc', 'Ogre', 'Troll', 'Githzerai', 'Githyanki',
  'Goblin', 'Kobold', 'Duergar', 'Minotaur'
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
      end: dateRangeEnd.value || today
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
const { data: searchResults, isLoading, isError, error } = useQuery<PaginatedResponse<PvPEvent>>({
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
    startDatePicker = flatpickr(startDateInput.value as HTMLElement, {
      dateFormat: 'Y-m-d',
      onChange: (_selectedDates: any, dateStr: string) => {
        dateRangeStart.value = dateStr
      },
      maxDate: endDateInput.value?.value || 'today'
    } as any)
  }

  if (endDateInput.value && !endDatePicker) {
    endDatePicker = flatpickr(endDateInput.value as HTMLElement, {
      dateFormat: 'Y-m-d',
      onChange: (_selectedDates: any, dateStr: string) => {
        dateRangeEnd.value = dateStr
        if (startDatePicker) {
          startDatePicker.set('maxDate', dateStr || 'today')
        }
      },
      maxDate: 'today'
    } as any)
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
      <h2 class="text-3xl font-bold tracking-tight text-gray-100">Advanced Search</h2>
      <p class="text-gray-400">
        Search and filter PvP events with advanced criteria
      </p>
    </div>

    <!-- Search Form -->
    <div class="rounded-lg border border-gray-800 bg-gray-950 p-6">
      <div class="space-y-6">
        <!-- Row 1: Player & Date Range -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Player Name -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Player Name</label>
            <input
              v-model="playerName"
              type="text"
              placeholder="Search by player name..."
              class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              @input="playerSearch = playerName"
            />
          </div>

          <!-- Start Date -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
            <input
              ref="startDateInput"
              v-model="dateRangeStart"
              type="text"
              placeholder="Select start date..."
              class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
            />
          </div>

          <!-- End Date -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">End Date</label>
            <input
              ref="endDateInput"
              v-model="dateRangeEnd"
              type="text"
              placeholder="Select end date..."
              class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
            />
          </div>
        </div>

        <!-- Row 2: Location & Alignment & Group Size -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Location -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Location</label>
            <input
              v-model="selectedLocation"
              type="text"
              placeholder="Search by location..."
              class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
              @input="locationSearch = selectedLocation"
            />
          </div>

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

          <!-- Group Size -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Group Size</label>
            <select
              v-model="groupSize"
              class="flex h-9 w-full rounded-md border border-gray-700 bg-gray-900 text-gray-300 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
            >
              <option value="">Any Size</option>
              <option v-for="size in groupSizes" :key="size" :value="size">{{ size }}</option>
            </select>
          </div>
        </div>

        <!-- Row 3: Level Range -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            Level Range: {{ levelMin }} - {{ levelMax }}
          </label>
          <div class="flex items-center space-x-4">
            <input
              v-model.number="levelMin"
              type="range"
              min="1"
              max="60"
              class="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <input
              v-model.number="levelMax"
              type="range"
              min="1"
              max="60"
              class="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
        </div>

        <!-- Row 4: Class Filter -->
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

        <!-- Row 5: Race Filter -->
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

        <!-- Action Buttons -->
        <div class="flex items-center space-x-4 pt-4 border-t border-gray-800">
          <button
            @click="handleSearch"
            class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:pointer-events-none disabled:opacity-50 bg-cyan-600 text-white hover:bg-cyan-700 h-9 px-6"
          >
            <svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search
          </button>
          <button
            @click="handleReset"
            class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:pointer-events-none disabled:opacity-50 bg-gray-800 text-gray-300 hover:bg-gray-700 h-9 px-6"
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
    <div v-else-if="hasSearched && searchResults" class="rounded-lg border border-gray-800 bg-gray-950">
      <div class="border-b border-gray-800 px-4 py-3">
        <h3 class="text-lg font-semibold text-gray-100">
          Search Results
          <span class="text-sm text-gray-400 font-normal ml-2">
            ({{ searchResults.pagination?.total || 0 }} events found)
          </span>
        </h3>
      </div>

      <div v-if="searchResults?.data?.length > 0" class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-gray-800 bg-gray-900">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-400">Date/Time</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-400">Location</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-400">Killers</th>
              <th class="px-4 py-3 text-left text-sm font-medium text-gray-400">Victims</th>
              <th class="px-4 py-3 text-right text-sm font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="event in searchResults.data"
              :key="event.id"
              class="border-b border-gray-800 hover:bg-gray-900 transition-colors cursor-pointer"
              @click="viewBattle(event.id)"
            >
              <td class="px-4 py-3 text-sm">{{ formatDate(event.stamp) }}</td>
              <td class="px-4 py-3 text-sm"><span v-html="parseAnsiForVue(event.room_name)"></span></td>
              <td class="px-4 py-3 text-sm text-green-600 dark:text-green-400">
                <div class="space-y-1">
                  <div v-for="(killer, idx) in event.killers" :key="idx">
                    <span v-html="parseAnsiForVue(killer.description)"></span>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-red-600 dark:text-red-400">
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
      <div v-else class="p-12 text-center text-gray-400">
        <svg class="h-12 w-12 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>No PvP events found matching your criteria</p>
        <p class="text-sm mt-2">Try adjusting your search filters</p>
      </div>

      <!-- Pagination -->
      <div v-if="searchResults?.pagination && searchResults?.data?.length > 0" class="flex items-center justify-between border-t border-gray-800 px-4 py-3">
        <div class="text-sm text-gray-400">
          Showing page {{ searchResults.pagination.page }} of {{ searchResults.pagination.totalPages }}
          ({{ searchResults.pagination.total }} total events)
        </div>
        <div class="flex items-center space-x-2">
          <button
            @click="currentPage--"
            :disabled="currentPage === 1"
            class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-300 h-9 px-4"
          >
            Previous
          </button>
          <button
            @click="currentPage++"
            :disabled="currentPage >= searchResults.pagination.totalPages"
            class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-300 h-9 px-4"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Initial State -->
    <div v-else-if="!hasSearched" class="rounded-lg border border-gray-800 bg-gray-950 p-12 text-center">
      <div class="space-y-4">
        <svg class="h-16 w-16 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <h3 class="text-xl font-semibold text-gray-100">Ready to Search</h3>
        <p class="text-gray-400 max-w-md mx-auto">
          Use the filters above to search for specific PvP events. You can filter by player, date, location, class, race, level range, and more.
        </p>
        <p class="text-sm text-gray-400">
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
  border-bottom-color: rgb(31, 41, 55) !important; /* gray-800 */
}

.flatpickr-calendar {
  background: rgb(17, 24, 39) !important; /* gray-900 */
  border: 1px solid rgb(31, 41, 55) !important; /* gray-800 */
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.5) !important;
}

.flatpickr-months {
  background: rgb(31, 41, 55) !important; /* gray-800 */
  border-bottom: 1px solid rgb(55, 65, 81) !important; /* gray-700 */
}

.flatpickr-current-month .flatpickr-monthDropdown-months,
.flatpickr-current-month input.cur-year {
  background: rgb(17, 24, 39) !important; /* gray-900 */
  color: rgb(229, 231, 235) !important; /* gray-200 */
  border: 1px solid rgb(55, 65, 81) !important; /* gray-700 */
}

.flatpickr-current-month .flatpickr-monthDropdown-months:hover,
.flatpickr-current-month input.cur-year:hover {
  background: rgb(31, 41, 55) !important; /* gray-800 */
}

.flatpickr-weekdays {
  background: rgb(31, 41, 55) !important; /* gray-800 */
}

span.flatpickr-weekday {
  color: rgb(156, 163, 175) !important; /* gray-400 */
  font-weight: 600;
}

.flatpickr-day {
  color: rgb(229, 231, 235) !important; /* gray-200 */
  border: none !important;
}

.flatpickr-day:hover,
.flatpickr-day:focus {
  background: rgb(31, 41, 55) !important; /* gray-800 */
  border-color: rgb(31, 41, 55) !important; /* gray-800 */
  color: rgb(34, 211, 238) !important; /* cyan-400 */
}

.flatpickr-day.today {
  border-color: rgb(6, 182, 212) !important; /* cyan-600 */
  background: rgb(22, 78, 99) !important; /* cyan-900 */
  color: rgb(34, 211, 238) !important; /* cyan-400 */
}

.flatpickr-day.today:hover,
.flatpickr-day.today:focus {
  border-color: rgb(6, 182, 212) !important; /* cyan-600 */
  background: rgb(21, 94, 117) !important; /* cyan-800 */
  color: rgb(34, 211, 238) !important; /* cyan-400 */
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
  background: rgb(6, 182, 212) !important; /* cyan-600 */
  border-color: rgb(6, 182, 212) !important; /* cyan-600 */
  color: white !important;
}

.flatpickr-day.inRange {
  background: rgba(6, 182, 212, 0.2) !important; /* cyan-600 with opacity */
  border-color: transparent !important;
  box-shadow: -5px 0 0 rgba(6, 182, 212, 0.2), 5px 0 0 rgba(6, 182, 212, 0.2) !important;
}

.flatpickr-day.disabled,
.flatpickr-day.disabled:hover,
.flatpickr-day.prevMonthDay,
.flatpickr-day.nextMonthDay,
.flatpickr-day.notAllowed,
.flatpickr-day.notAllowed.prevMonthDay,
.flatpickr-day.notAllowed.nextMonthDay {
  color: rgb(75, 85, 99) !important; /* gray-600 */
  background: transparent !important;
}

.flatpickr-months .flatpickr-prev-month,
.flatpickr-months .flatpickr-next-month {
  color: rgb(156, 163, 175) !important; /* gray-400 */
}

.flatpickr-months .flatpickr-prev-month:hover,
.flatpickr-months .flatpickr-next-month:hover {
  color: rgb(34, 211, 238) !important; /* cyan-400 */
}

.flatpickr-months .flatpickr-prev-month:hover svg,
.flatpickr-months .flatpickr-next-month:hover svg {
  fill: rgb(34, 211, 238) !important; /* cyan-400 */
}

.flatpickr-time {
  border-top: 1px solid rgb(55, 65, 81) !important; /* gray-700 */
  background: rgb(31, 41, 55) !important; /* gray-800 */
}

.flatpickr-time input {
  background: rgb(17, 24, 39) !important; /* gray-900 */
  color: rgb(229, 231, 235) !important; /* gray-200 */
  border: 1px solid rgb(55, 65, 81) !important; /* gray-700 */
}

.flatpickr-time .flatpickr-time-separator,
.flatpickr-time .flatpickr-am-pm {
  color: rgb(156, 163, 175) !important; /* gray-400 */
}
</style>
