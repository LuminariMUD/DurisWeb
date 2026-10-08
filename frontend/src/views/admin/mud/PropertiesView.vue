<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-4xl md:text-5xl text-foreground">MUD Properties</h1>
        <p class="text-muted-foreground mt-1">Browse and edit game settings ({{ totalProperties }} properties)</p>
      </div>
    </div>

    <!-- Search Bar -->
    <div class="relative">
      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search properties (e.g., exp., epic., ship.)..."
        class="w-full bg-ink-high border border-border rounded-lg pl-10 pr-4 py-2 text-white placeholder:text-muted-foreground focus:border-info focus:ring-1 focus:ring-info outline-none"
        @input="onSearchInput"
      />
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-info"></div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="rounded-lg border border-destructive bg-destructive/10 p-4">
      <p class="text-destructive">{{ error }}</p>
    </div>

    <!-- Search Results -->
    <div v-else-if="searchResults.length > 0" class="space-y-4">
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <Info class="w-4 h-4" />
        <span>Found {{ searchResults.length }} properties matching "{{ lastSearch }}"</span>
      </div>

      <div class="rounded-lg border overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b bg-muted/50">
              <tr>
                <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Property Key</th>
                <th class="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Value</th>
                <th class="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Category</th>
                <th class="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="prop in searchResults" :key="prop.key" class="hover:bg-muted/50 transition-colors">
                <td class="px-4 py-3 text-sm font-mono">{{ prop.key }}</td>
                <td class="px-4 py-3 text-sm font-mono text-right">
                  <span v-if="editingKey !== prop.key" class="text-info">{{ prop.value }}</span>
                  <input
                    v-else
                    v-model="editingValue"
                    type="number"
                    step="any"
                    class="w-32 bg-background border border-info rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-info"
                    @keydown.enter="saveProperty(prop.key)"
                    @keydown.escape="cancelEdit"
                  />
                </td>
                <td class="px-4 py-3 text-sm">
                  <span class="px-2 py-1 bg-muted rounded text-xs">{{ prop.category }}</span>
                </td>
                <td class="px-4 py-3 text-sm text-center">
                  <div v-if="editingKey !== prop.key" class="flex items-center justify-center gap-2">
                    <button
                      @click="startEdit(prop.key, prop.value)"
                      class="p-1 text-info hover:text-info hover:bg-info/20 rounded"
                      title="Edit property"
                    >
                      <Edit class="w-4 h-4" />
                    </button>
                    <button
                      @click="loadPropertyHistory(prop.key)"
                      class="p-1 text-purple-400 hover:text-purple-300 hover:bg-purple-500/20 rounded"
                      title="View change history"
                    >
                      <History class="w-4 h-4" />
                    </button>
                  </div>
                  <div v-else class="flex items-center justify-center gap-2">
                    <button
                      @click="saveProperty(prop.key)"
                      class="p-1 text-success hover:text-success hover:bg-success/20 rounded"
                      title="Save changes"
                    >
                      <Check class="w-4 h-4" />
                    </button>
                    <button
                      @click="cancelEdit"
                      class="p-1 text-danger hover:text-danger hover:bg-danger/20 rounded"
                      title="Cancel"
                    >
                      <X class="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Categories View -->
    <div v-else-if="categories.length > 0" class="space-y-6">
      <div v-for="category in categories" :key="category.name" class="rounded-lg border overflow-hidden">
        <!-- Category Header -->
        <button
          @click="toggleCategory(category.name)"
          class="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors"
        >
          <div class="flex items-center gap-3">
            <component :is="getCategoryIcon(category.name)" class="w-5 h-5" :class="getCategoryColor(category.name)" />
            <div class="text-left">
              <h3 class="text-lg font-semibold">{{ category.name }}</h3>
              <p class="text-sm text-muted-foreground">{{ category.description }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-muted-foreground">{{ category.properties.length }} properties</span>
            <ChevronDown
              :class="[
                'w-5 h-5 text-muted-foreground transition-transform',
                expandedCategories.has(category.name) ? 'rotate-180' : ''
              ]"
            />
          </div>
        </button>

        <!-- Category Properties (Expandable) -->
        <div
          v-if="expandedCategories.has(category.name)"
          class="border-t"
        >
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-muted/50">
                <tr>
                  <th class="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Property Key</th>
                  <th class="text-right px-6 py-3 text-sm font-medium text-muted-foreground">Value</th>
                  <th class="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Subcategory</th>
                  <th class="text-center px-6 py-3 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr v-for="prop in category.properties" :key="prop.key" class="hover:bg-muted/50 transition-colors">
                  <td class="px-6 py-3 text-sm font-mono">{{ prop.key }}</td>
                  <td class="px-6 py-3 text-sm font-mono text-right">
                    <span v-if="editingKey !== prop.key" class="text-info">{{ prop.value }}</span>
                    <input
                      v-else
                      v-model="editingValue"
                      type="number"
                      step="any"
                      class="w-32 bg-background border border-info rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-info"
                      @keydown.enter="saveProperty(prop.key)"
                      @keydown.escape="cancelEdit"
                    />
                  </td>
                  <td class="px-6 py-3 text-sm text-muted-foreground">{{ prop.subcategory || '-' }}</td>
                  <td class="px-6 py-3 text-sm text-center">
                    <div v-if="editingKey !== prop.key" class="flex items-center justify-center gap-2">
                      <button
                        @click="startEdit(prop.key, prop.value)"
                        class="p-1 text-info hover:text-info hover:bg-info/20 rounded"
                        title="Edit property"
                      >
                        <Edit class="w-4 h-4" />
                      </button>
                      <button
                        @click="loadPropertyHistory(prop.key)"
                        class="p-1 text-purple-400 hover:text-purple-300 hover:bg-purple-500/20 rounded"
                        title="View change history"
                      >
                        <History class="w-4 h-4" />
                      </button>
                    </div>
                    <div v-else class="flex items-center justify-center gap-2">
                      <button
                        @click="saveProperty(prop.key)"
                        :disabled="isSaving"
                        class="p-1 text-success hover:text-success hover:bg-success/20 rounded disabled:opacity-50"
                        title="Save changes"
                      >
                        <Check class="w-4 h-4" />
                      </button>
                      <button
                        @click="cancelEdit"
                        :disabled="isSaving"
                        class="p-1 text-danger hover:text-danger hover:bg-danger/20 rounded disabled:opacity-50"
                        title="Cancel"
                      >
                        <X class="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirmation Dialog -->
    <PropertyEditDialog
      :open="showConfirmDialog"
      :property-key="pendingPropertyKey"
      :old-value="originalValue"
      :new-value="pendingNewValue"
      :saving="isSaving"
      @update:open="showConfirmDialog = $event"
      @confirm="handleConfirmSave"
      @cancel="handleCancelSave"
    />

    <!-- History Dialog -->
    <PropertyHistoryDialog
      :open="showHistoryDialog"
      :property-key="historyPropertyKey"
      :history="historyData"
      :loading="loadingHistory"
      :error="historyError"
      @update:open="showHistoryDialog = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Search,
  Info,
  ChevronDown,
  TrendingUp,
  Zap,
  DollarSign,
  Swords,
  Clock,
  Settings,
  Edit,
  Check,
  X,
  History,
} from '@lucide/vue'
import { apiClient as api } from '@/services/api'
import { useDebounceFn } from '@vueuse/core'
import { toast } from 'vue-sonner'
import PropertyEditDialog from '@/components/admin/PropertyEditDialog.vue'
import PropertyHistoryDialog from '@/components/admin/PropertyHistoryDialog.vue'

interface Property {
  key: string
  value: number
  category: string
  subcategory?: string
}

interface PropertyCategory {
  name: string
  description: string
  properties: Property[]
}

interface HistoryEntry {
  id: number
  accountName: string
  oldValue: string
  newValue: string
  timestamp: Date
  notes?: string
}

const isLoading = ref(true)
const error = ref<string | null>(null)
const categories = ref<PropertyCategory[]>([])
const searchResults = ref<Property[]>([])
const searchQuery = ref('')
const lastSearch = ref('')
const expandedCategories = ref<Set<string>>(new Set())
const isSaving = ref(false)

// Editing state
const editingKey = ref<string | null>(null)
const editingValue = ref<string>('')
const originalValue = ref<number>(0)

// Dialog state
const showConfirmDialog = ref(false)
const pendingPropertyKey = ref<string>('')
const pendingNewValue = ref<number>(0)

// History dialog state
const showHistoryDialog = ref(false)
const historyPropertyKey = ref<string>('')
const historyData = ref<HistoryEntry[]>([])
const loadingHistory = ref(false)
const historyError = ref<string | null>(null)

const totalProperties = computed(() => {
  return categories.value.reduce((sum, cat) => sum + cat.properties.length, 0)
})

const getCategoryIcon = (name: string) => {
  switch (name) {
    case 'Leveling':
      return TrendingUp
    case 'Epic':
      return Zap
    case 'Economy':
      return DollarSign
    case 'Combat':
      return Swords
    case 'Timers':
      return Clock
    default:
      return Settings
  }
}

const getCategoryColor = (name: string): string => {
  switch (name) {
    case 'Leveling':
      return 'text-info'
    case 'Epic':
      return 'text-warning'
    case 'Economy':
      return 'text-success'
    case 'Combat':
      return 'text-danger'
    case 'Timers':
      return 'text-purple-400'
    default:
      return 'text-muted-foreground'
  }
}

const toggleCategory = (name: string) => {
  if (expandedCategories.value.has(name)) {
    expandedCategories.value.delete(name)
  } else {
    expandedCategories.value.add(name)
  }
}

const startEdit = (key: string, value: number) => {
  editingKey.value = key
  editingValue.value = value.toString()
  originalValue.value = value
}

const cancelEdit = () => {
  editingKey.value = null
  editingValue.value = ''
  originalValue.value = 0
}

const saveProperty = async (key: string) => {
  const newValue = parseFloat(editingValue.value)

  if (isNaN(newValue)) {
    toast.error('Invalid number', {
      description: 'Please enter a valid numeric value',
    })
    return
  }

  if (newValue === originalValue.value) {
    cancelEdit()
    return
  }

  // Show confirmation dialog
  pendingPropertyKey.value = key
  pendingNewValue.value = newValue
  showConfirmDialog.value = true
}

const handleConfirmSave = async () => {
  isSaving.value = true
  error.value = null

  try {
    const response = await api.put(
      `/api/admin/mud/properties/${encodeURIComponent(pendingPropertyKey.value)}`,
      {
        value: pendingNewValue.value,
      },
    )

    // Update local value
    const updateLocalValue = (props: Property[]) => {
      const prop = props.find((p) => p.key === pendingPropertyKey.value)
      if (prop) {
        prop.value = pendingNewValue.value
      }
    }

    // Update in categories
    categories.value.forEach((cat) => {
      updateLocalValue(cat.properties)
    })

    // Update in search results
    updateLocalValue(searchResults.value)

    // Show success toast
    toast.success('Property updated successfully!', {
      description:
        response.data.message || 'Remember to restart the MUD for changes to take effect.',
    })

    // Close dialog and reset edit state
    showConfirmDialog.value = false
    cancelEdit()
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to update property'
    console.error('Property update error:', err)
    toast.error('Update failed', {
      description: error.value || undefined,
    })
  } finally {
    isSaving.value = false
  }
}

const handleCancelSave = () => {
  showConfirmDialog.value = false
  cancelEdit()
}

const loadPropertyHistory = async (key: string) => {
  historyPropertyKey.value = key
  showHistoryDialog.value = true
  loadingHistory.value = true
  historyError.value = null
  historyData.value = []

  try {
    const response = await api.get<{ history: HistoryEntry[] }>(
      `/api/admin/mud/properties/${encodeURIComponent(key)}/history`,
      { params: { limit: 20 } },
    )
    historyData.value = response.data.history
  } catch (err: any) {
    historyError.value = err.response?.data?.error || 'Failed to load property history'
    console.error('Property history load error:', err)
  } finally {
    loadingHistory.value = false
  }
}

const loadProperties = async () => {
  isLoading.value = true
  error.value = null

  try {
    const response = await api.get<{ categories: PropertyCategory[] }>('/api/admin/mud/properties')
    categories.value = response.data.categories

    // Auto-expand first category
    if (categories.value.length > 0 && categories.value[0]) {
      expandedCategories.value.add(categories.value[0].name)
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to load properties'
    console.error('Properties load error:', err)
  } finally {
    isLoading.value = false
  }
}

const searchProperties = async (query: string) => {
  if (!query.trim()) {
    searchResults.value = []
    lastSearch.value = ''
    return
  }

  isLoading.value = true
  error.value = null

  try {
    const response = await api.get<{ search: string; results: Property[] }>(
      '/api/admin/mud/properties',
      { params: { search: query } },
    )
    searchResults.value = response.data.results
    lastSearch.value = response.data.search
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to search properties'
    console.error('Property search error:', err)
  } finally {
    isLoading.value = false
  }
}

const onSearchInput = useDebounceFn(() => {
  if (searchQuery.value.trim()) {
    searchProperties(searchQuery.value)
  } else {
    searchResults.value = []
    lastSearch.value = ''
  }
}, 300)

onMounted(() => {
  loadProperties()
})
</script>
