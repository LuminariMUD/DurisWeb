<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useLogFiles, useLogContent, getLogDownloadUrl, type LogFilters } from '@/composables/useServerLogs';
import { useLogWebSocket } from '@/composables/useLogWebSocket';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AnsiText from '@/components/ui/AnsiText.vue';
import PaginationWithEllipsis from '@/components/forum/PaginationWithEllipsis.vue';
import { Download, Search, RefreshCw, X } from 'lucide-vue-next';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import 'flatpickr/dist/themes/dark.css';

// State
const selectedCategory = ref<'runtime' | 'player'>('runtime');
const selectedLogName = ref<string | null>(null);
const currentPage = ref(1);
const pageSize = ref(100);
const searchText = ref('');
const startDateStr = ref('');
const endDateStr = ref('');
const autoRefreshEnabled = ref(false);
const searchDebounceTimer = ref<ReturnType<typeof setTimeout> | null>(null);

// Flatpickr instances
const startDateInput = ref<HTMLInputElement | null>(null);
const endDateInput = ref<HTMLInputElement | null>(null);
let startDatePicker: flatpickr.Instance | null = null;
let endDatePicker: flatpickr.Instance | null = null;

// Initialize flatpickr on mount
onMounted(() => {
  if (startDateInput.value) {
    startDatePicker = flatpickr(startDateInput.value as HTMLElement, {
      dateFormat: 'Y-m-d',
      onChange: (_selectedDates: any, dateStr: string) => {
        startDateStr.value = dateStr;
      },
    } as any);
  }
  if (endDateInput.value) {
    endDatePicker = flatpickr(endDateInput.value as HTMLElement, {
      dateFormat: 'Y-m-d',
      onChange: (_selectedDates: any, dateStr: string) => {
        endDateStr.value = dateStr;
      },
    } as any);
  }
});

// Cleanup flatpickr on unmount
onUnmounted(() => {
  startDatePicker?.destroy();
  endDatePicker?.destroy();
});

// Computed filters
const filters = computed<LogFilters>(() => ({
  search: searchText.value || undefined,
  startDate: startDateStr.value ? new Date(startDateStr.value).toISOString() : undefined,
  endDate: endDateStr.value ? new Date(endDateStr.value).toISOString() : undefined,
}));

// Fetch log files
const { data: logFiles } = useLogFiles();

// Debug logging
watch(logFiles, (files) => {
  console.log('logFiles loaded:', files);
}, { immediate: true });

// Categorize log files
const runtimeLogs = computed(() =>
  logFiles.value?.filter(log => log.category === 'runtime').sort((a, b) => a.name.localeCompare(b.name)) || []
);

const playerLogs = computed(() =>
  logFiles.value?.filter(log => log.category === 'player').sort((a, b) => a.name.localeCompare(b.name)) || []
);

const availableLogs = computed(() => {
  const logs = selectedCategory.value === 'runtime' ? runtimeLogs.value : playerLogs.value;
  console.log('availableLogs computed:', logs);
  return logs;
});

// Fetch log content
const {
  data: logContent,
  isLoading: isLoadingContent,
  refetch: refetchContent,
} = useLogContent(
  computed(() => selectedCategory.value),
  computed(() => selectedLogName.value || ''),
  currentPage,
  pageSize,
  filters
);

// WebSocket for real-time updates
const { newLines, isSubscribed } = useLogWebSocket(
  computed(() => selectedCategory.value),
  computed(() => selectedLogName.value),
  autoRefreshEnabled
);

// Auto-select first log when category changes
watch(selectedCategory, () => {
  if (availableLogs.value.length > 0 && availableLogs.value[0]) {
    selectedLogName.value = availableLogs.value[0].name;
    currentPage.value = 1;
  }
}, { immediate: true });

// Reset page when filters change
watch([searchText, startDateStr, endDateStr], () => {
  currentPage.value = 1;
});

// Handle search with debounce
function handleSearchInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;

  if (searchDebounceTimer.value) {
    clearTimeout(searchDebounceTimer.value);
  }

  searchDebounceTimer.value = setTimeout(() => {
    searchText.value = value;
  }, 500);
}

// Clear filters
function clearFilters() {
  searchText.value = '';
  startDateStr.value = '';
  endDateStr.value = '';
  startDatePicker?.clear();
  endDatePicker?.clear();
  currentPage.value = 1;
}

// Download log file
function downloadLog() {
  if (!selectedLogName.value) return;

  const url = getLogDownloadUrl(selectedCategory.value, selectedLogName.value);
  window.open(url, '_blank');
}

// Get log level class
function getLogLevelClass(level: string): string {
  switch (level) {
    case 'ERROR':
      return 'bg-red-900/20 text-red-400 border-l-4 border-red-500';
    case 'WARNING':
      return 'bg-yellow-900/20 text-yellow-400 border-l-4 border-yellow-500';
    case 'DEBUG':
      return 'text-gray-500';
    default:
      return '';
  }
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
</script>

<template>
  <div class="container mx-auto py-6 space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-3xl font-bold text-white mb-2">Server Logs</h1>
      <p class="text-gray-400">View and monitor DurisMUD server logs in real-time</p>
    </div>

    <!-- Controls -->
    <Card>
      <CardHeader>
        <CardTitle>Log Controls</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- Log Selection Row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Category Selector -->
          <div class="space-y-2">
            <Label>Category</Label>
            <Select v-model="selectedCategory">
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="runtime">Runtime Logs</SelectItem>
                <SelectItem value="player">Player Logs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Log File Selector -->
          <div class="space-y-2">
            <Label>Log File</Label>
            <Select v-model="selectedLogName" :disabled="!availableLogs.length">
              <SelectTrigger>
                <SelectValue placeholder="Select log file" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="log in availableLogs"
                  :key="log.name"
                  :value="log.name"
                >
                  {{ log.name }}
                  <span class="text-gray-500 text-xs ml-2">
                    ({{ formatFileSize(log.size) }})
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Actions -->
          <div class="space-y-2">
            <Label class="invisible">Actions</Label>
            <div class="flex gap-2">
              <Button
                @click="downloadLog"
                :disabled="!selectedLogName"
                variant="outline"
                size="sm"
                class="flex-1"
              >
                <Download class="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button
                @click="refetchContent()"
                :disabled="!selectedLogName"
                variant="outline"
                size="sm"
                class="flex-1"
              >
                <RefreshCw class="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <!-- Filters Row -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <!-- Search -->
          <div class="space-y-2 md:col-span-2">
            <Label>Search</Label>
            <div class="relative">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                :model-value="searchText"
                @input="handleSearchInput"
                placeholder="Search log content..."
                class="pl-10"
              />
            </div>
          </div>

          <!-- Start Date -->
          <div class="space-y-2">
            <Label>Start Date</Label>
            <input
              ref="startDateInput"
              v-model="startDateStr"
              type="text"
              placeholder="YYYY-MM-DD"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <!-- End Date -->
          <div class="space-y-2">
            <Label>End Date</Label>
            <input
              ref="endDateInput"
              v-model="endDateStr"
              type="text"
              placeholder="YYYY-MM-DD"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        <!-- Auto-refresh Toggle & Clear Filters -->
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <Switch
              id="auto-refresh"
              :model-value="autoRefreshEnabled"
              @update:model-value="autoRefreshEnabled = $event"
            />
            <Label for="auto-refresh" class="cursor-pointer">
              Auto-refresh (Real-time updates)
              <span v-if="isSubscribed" class="text-green-500 ml-2">● Live</span>
            </Label>
          </div>

          <Button
            @click="clearFilters"
            variant="ghost"
            size="sm"
            v-if="searchText || startDateStr || endDateStr"
          >
            <X class="w-4 h-4 mr-2" />
            Clear Filters
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Log Content -->
    <Card v-if="selectedLogName">
      <CardHeader>
        <CardTitle>{{ selectedLogName }}</CardTitle>
        <CardDescription>
          <span v-if="logContent">
            Showing {{ logContent.lines.length }} of {{ logContent.totalLines }} lines
          </span>
          <span v-if="filters.search || startDateStr || endDateStr" class="text-yellow-500 ml-2">
            (Filtered)
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <!-- Loading State -->
        <div v-if="isLoadingContent" class="text-center py-8 text-gray-500">
          Loading log content...
        </div>

        <!-- Empty State -->
        <div v-else-if="!logContent || logContent.lines.length === 0" class="text-center py-8 text-gray-500">
          No log lines found
          <span v-if="filters.search || startDateStr || endDateStr">(try adjusting filters)</span>
        </div>

        <!-- Log Lines -->
        <div v-else class="space-y-2">
          <div class="h-[600px] w-full overflow-y-auto rounded-md border border-gray-800 p-4 bg-black/50 font-mono text-sm">
            <div
              v-for="line in logContent.lines"
              :key="line.lineNumber"
              :class="['py-1 px-2 rounded', getLogLevelClass(line.level)]"
            >
              <span class="text-gray-600 mr-4 select-none">[{{ line.lineNumber }}]</span>
              <AnsiText :text="line.content" />
            </div>

            <!-- Real-time new lines indicator -->
            <div v-if="newLines.length > 0 && currentPage === logContent.totalPages" class="mt-4 pt-4 border-t border-green-500/30">
              <div class="text-green-500 text-xs mb-2">New lines (real-time):</div>
              <div
                v-for="(newLine, idx) in newLines"
                :key="`new-${idx}`"
                class="py-1 px-2 rounded bg-green-900/10 border-l-4 border-green-500"
              >
                <span class="text-gray-600 mr-4 select-none">[+{{ idx + 1 }}]</span>
                <AnsiText :text="newLine" />
              </div>
            </div>
          </div>

          <!-- Pagination -->
          <div v-if="logContent.totalPages > 1" class="flex justify-center mt-4">
            <PaginationWithEllipsis
              :current-page="currentPage"
              :total-pages="logContent.totalPages"
              @page-change="(page) => currentPage = page"
            />
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- No Log Selected -->
    <Card v-else>
      <CardContent class="text-center py-12 text-gray-500">
        Select a log file to view its contents
      </CardContent>
    </Card>
  </div>
</template>
