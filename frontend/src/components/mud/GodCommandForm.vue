<script setup lang="ts">
import { inject, ref, computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ScrollArea } from '@/components/ui/scroll-area'
import AnsiText from '@/components/ui/AnsiText.vue'
import { Check, ChevronsUpDown, Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/vue-query'
import { useDebounceFn } from '@vueuse/core'
import { apiClient } from '@/services/api'
import type { UseGodCommandsReturn } from './god-commands/useGodCommands'
import type { GodCommandParam } from './god-commands/types'
import { useBuilderFlags } from './god-commands/useBuilderFlags'

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'execute'): void
}>()

const godCommands = inject<UseGodCommandsReturn>('godCommands')!
const builderFlags = useBuilderFlags()

const execution = computed(() => godCommands.execution.value)
const command = computed(() => execution.value?.command)
const params = computed(() => execution.value?.params ?? {})

// Popover open states for each parameter
const openPopovers = ref<Record<string, boolean>>({})

// Track search terms for player autocomplete (allows using typed value when no match)
const playerSearchTerms = ref<Record<string, string>>({})

// Password visibility toggle for password inputs
const passwordVisible = ref<Record<string, boolean>>({})

// Account search state
const accountSearchQuery = ref('')
const debouncedAccountSearch = ref('')
const isWaitingAccountDebounce = ref(false)

const updateAccountSearch = useDebounceFn((value: string) => {
  debouncedAccountSearch.value = value
  isWaitingAccountDebounce.value = false
}, 300)

function setAccountSearchQuery(value: string) {
  accountSearchQuery.value = value
  if (value.length >= 2) {
    isWaitingAccountDebounce.value = true
  } else {
    isWaitingAccountDebounce.value = false
  }
  updateAccountSearch(value)
}

// Account search query
const {
  data: accountResults,
  isLoading: isLoadingAccountsQuery,
} = useQuery({
  queryKey: computed(() => ['god-accounts', debouncedAccountSearch.value]),
  queryFn: async () => {
    const response = await apiClient.get<string[]>('/api/admin/god/accounts/search', {
      params: { query: debouncedAccountSearch.value, limit: 15 }
    })
    return response.data
  },
  enabled: computed(() => debouncedAccountSearch.value.length >= 2),
  staleTime: 60000,
})

const isLoadingAccounts = computed(() =>
  isLoadingAccountsQuery.value || isWaitingAccountDebounce.value
)

function updateParam(name: string, value: string | number | boolean) {
  godCommands.updateParam(name, value)
}

function togglePopover(name: string, open: boolean) {
  openPopovers.value[name] = open
}

// Handle player selection from WHO list
function handlePlayerSelect(paramName: string, playerName: string) {
  updateParam(paramName, playerName)
  togglePopover(paramName, false)
}

// Handle object selection
function handleObjectSelect(paramName: string, vnum: number, nameAnsi: string) {
  updateParam(paramName, vnum)
  godCommands.setSelectedObjectName(paramName, nameAnsi)
  togglePopover(paramName, false)
}

// Handle mob selection
function handleMobSelect(paramName: string, vnum: number, nameAnsi: string) {
  updateParam(paramName, vnum)
  godCommands.setSelectedMobName(paramName, nameAnsi)
  togglePopover(paramName, false)
}

// Handle account selection
function handleAccountSelect(paramName: string, accountName: string) {
  updateParam(paramName, accountName)
  togglePopover(paramName, false)
}

// Toggle password visibility
function togglePasswordVisibility(paramName: string) {
  passwordVisible.value[paramName] = !passwordVisible.value[paramName]
}

// Get display value for combobox
function getDisplayValue(param: GodCommandParam): string {
  const value = params.value[param.name]
  if (value === undefined || value === '') {
    return param.placeholder || `Select ${param.label.toLowerCase()}...`
  }
  return String(value)
}

// Get the selected setbit property name
function getSelectedSetbitPropertyName(): string | null {
  const flagParam = command.value?.params.find(p => p.type === 'setbit-property')
  if (!flagParam) return null
  const selectedValue = params.value[flagParam.name]
  return selectedValue ? String(selectedValue) : null
}

// Check if selected property has a subtable (needs dropdown for value)
// Uses dynamic flags from API
const selectedPropertyHasSubtable = computed(() => {
  const propertyName = getSelectedSetbitPropertyName()
  if (!propertyName) return false
  const subtable = builderFlags.getSubtableForProperty(propertyName)
  return subtable.length > 0
})

// Get the subtable for the selected property from API
const selectedPropertySubtable = computed(() => {
  const propertyName = getSelectedSetbitPropertyName()
  if (!propertyName) return []
  return builderFlags.getSubtableForProperty(propertyName)
})

// Check if selected property needs on/off toggle
const selectedPropertyNeedsOnOff = computed(() => {
  const propertyName = getSelectedSetbitPropertyName()
  if (!propertyName) return false
  return builderFlags.propertyNeedsOnOff(propertyName)
})

// Check if command is a setbit command (has setbit-property param)
const isSetbitCommand = computed(() => {
  return command.value?.params.some(p => p.type === 'setbit-property') || false
})

// Check if on-off param should be shown
// For setbit commands: only show when property needs on/off
// For other commands: always show
const shouldShowOnOff = computed(() => {
  if (!isSetbitCommand.value) return true
  return selectedPropertyNeedsOnOff.value
})
</script>

<template>
  <div v-if="command" class="flex flex-col">
    <!-- Command Description -->
    <div class="px-4 py-2 bg-muted/50 border-b">
      <p class="text-sm text-muted-foreground">{{ command.description }}</p>
      <div v-if="command.dangerous" class="flex items-center gap-1 mt-1 text-destructive text-xs">
        <AlertTriangle class="h-3 w-3" />
        <span>This is a dangerous command</span>
      </div>
    </div>

    <!-- Parameters Form -->
    <ScrollArea class="max-h-[45vh]">
      <div class="p-4 space-y-4">
        <div
          v-for="param in command.params"
          v-show="param.type !== 'on-off' || shouldShowOnOff"
          :key="param.name"
          class="space-y-2"
        >
          <Label :for="param.name" class="flex items-center gap-1">
            {{ param.label }}
            <span v-if="param.required" class="text-destructive">*</span>
          </Label>

          <!-- Player Autocomplete -->
          <template v-if="param.type === 'player'">
            <Popover :open="openPopovers[param.name]" @update:open="(v) => togglePopover(param.name, v)">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between font-normal"
                >
                  {{ getDisplayValue(param) }}
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[300px] p-0">
                <Command v-model:search-term="playerSearchTerms[param.name]">
                  <CommandInput :placeholder="`Search ${param.label.toLowerCase()}...`" />
                  <CommandEmpty>
                    <div class="py-2 text-center text-sm">
                      <template v-if="godCommands.isLoadingPlayers.value">
                        <Loader2 class="h-4 w-4 animate-spin mx-auto" />
                        <span class="text-muted-foreground">Loading players...</span>
                      </template>
                      <template v-else-if="playerSearchTerms[param.name]">
                        <button
                          class="text-primary underline"
                          @click="handlePlayerSelect(param.name, playerSearchTerms[param.name] || '')"
                        >
                          Use "{{ playerSearchTerms[param.name] }}"
                        </button>
                      </template>
                      <template v-else>
                        No players found.
                        <button
                          class="text-primary underline"
                          @click="godCommands.refreshWhoList()"
                        >
                          Refresh
                        </button>
                      </template>
                    </div>
                  </CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      <!-- "all" option for some commands -->
                      <CommandItem
                        v-if="param.placeholder?.includes('all')"
                        value="all"
                        @select="handlePlayerSelect(param.name, 'all')"
                      >
                        <Check
                          :class="cn('mr-2 h-4 w-4', params[param.name] === 'all' ? 'opacity-100' : 'opacity-0')"
                        />
                        all
                      </CommandItem>
                      <CommandItem
                        v-for="player in godCommands.onlinePlayers.value"
                        :key="player"
                        :value="player"
                        @select="handlePlayerSelect(param.name, player)"
                      >
                        <Check
                          :class="cn('mr-2 h-4 w-4', params[param.name] === player ? 'opacity-100' : 'opacity-0')"
                        />
                        {{ player }}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </template>

          <!-- Account Autocomplete -->
          <template v-else-if="param.type === 'account'">
            <Popover :open="openPopovers[param.name]" @update:open="(v) => togglePopover(param.name, v)">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between font-normal"
                >
                  {{ params[param.name] || param.placeholder || 'Search account...' }}
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[300px] p-0">
                <div class="flex items-center border-b px-3">
                  <Input
                    :model-value="accountSearchQuery"
                    placeholder="Search accounts..."
                    class="h-10 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    @update:model-value="setAccountSearchQuery(String($event))"
                  />
                </div>
                <div class="max-h-[300px] overflow-y-auto p-1">
                  <!-- Loading state -->
                  <div v-if="isLoadingAccounts" class="py-6 text-center text-sm">
                    <Loader2 class="h-4 w-4 animate-spin mx-auto mb-2" />
                    <span class="text-muted-foreground">Searching...</span>
                  </div>
                  <!-- Need more chars -->
                  <div v-else-if="accountSearchQuery.length < 2" class="py-6 text-center text-sm text-muted-foreground">
                    Type at least 2 characters to search
                  </div>
                  <!-- Results -->
                  <template v-else-if="accountResults?.length">
                    <div
                      v-for="account in accountResults"
                      :key="account"
                      class="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                      @click="handleAccountSelect(param.name, account)"
                    >
                      <Check
                        :class="cn('mr-2 h-4 w-4', params[param.name] === account ? 'opacity-100' : 'opacity-0')"
                      />
                      {{ account }}
                    </div>
                  </template>
                  <!-- No results but has query - allow using typed value -->
                  <div v-else-if="accountSearchQuery.length >= 2" class="py-6 text-center text-sm">
                    <p class="text-muted-foreground mb-2">No accounts found</p>
                    <button
                      class="text-primary underline"
                      @click="handleAccountSelect(param.name, accountSearchQuery)"
                    >
                      Use "{{ accountSearchQuery }}"
                    </button>
                  </div>
                  <!-- No results -->
                  <div v-else class="py-6 text-center text-sm text-muted-foreground">
                    No accounts found
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </template>

          <!-- Password Input -->
          <template v-else-if="param.type === 'password'">
            <div class="relative">
              <Input
                :id="param.name"
                :type="passwordVisible[param.name] ? 'text' : 'password'"
                :placeholder="param.placeholder"
                :model-value="String(params[param.name] ?? '')"
                class="pr-10"
                @update:model-value="updateParam(param.name, $event)"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                @click="togglePasswordVisibility(param.name)"
              >
                <Eye v-if="!passwordVisible[param.name]" class="h-4 w-4 text-muted-foreground" />
                <EyeOff v-else class="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
            <p v-if="params[param.name] && String(params[param.name]).length < 6" class="text-xs text-destructive mt-1">
              Password must be at least 6 characters
            </p>
          </template>

          <!-- Object Vnum Search -->
          <template v-else-if="param.type === 'vnum-object'">
            <Popover :open="openPopovers[param.name]" @update:open="(v) => togglePopover(param.name, v)">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between font-normal text-left"
                >
                  <span class="truncate flex items-center gap-1">
                    <template v-if="godCommands.getSelectedObjectAnsi(param.name)">
                      <span>Object #{{ params[param.name] }} -</span>
                      <AnsiText :text="godCommands.getSelectedObjectAnsi(param.name)!" class="truncate" />
                    </template>
                    <template v-else-if="params[param.name]">
                      Object #{{ params[param.name] }}
                    </template>
                    <template v-else>
                      Search objects...
                    </template>
                  </span>
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[400px] p-0">
                <div class="flex items-center border-b px-3">
                  <Input
                    :model-value="godCommands.objectSearchQuery.value"
                    placeholder="Search objects..."
                    class="h-10 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    @update:model-value="godCommands.setObjectSearchQuery(String($event))"
                  />
                </div>
                <div class="max-h-[300px] overflow-y-auto p-1">
                  <!-- Loading state -->
                  <div v-if="godCommands.isLoadingObjects.value" class="py-6 text-center text-sm">
                    <Loader2 class="h-4 w-4 animate-spin mx-auto mb-2" />
                    <span class="text-muted-foreground">Searching...</span>
                  </div>
                  <!-- Need more chars -->
                  <div v-else-if="godCommands.objectSearchQuery.value.length < 2" class="py-6 text-center text-sm text-muted-foreground">
                    Type at least 2 characters to search
                  </div>
                  <!-- Results -->
                  <template v-else-if="godCommands.objectResults.value?.objects.length">
                    <div
                      v-for="obj in godCommands.objectResults.value.objects"
                      :key="obj.vnum"
                      class="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                      @click="handleObjectSelect(param.name, obj.vnum, obj.nameAnsi || obj.name)"
                    >
                      <Check
                        :class="cn('mr-2 h-4 w-4', params[param.name] === obj.vnum ? 'opacity-100' : 'opacity-0')"
                      />
                      <div class="flex flex-col flex-1 min-w-0">
                        <AnsiText :text="obj.nameAnsi || obj.name" class="truncate" />
                        <span class="text-xs text-muted-foreground">
                          #{{ obj.vnum }} - {{ obj.typeName }}
                        </span>
                      </div>
                    </div>
                  </template>
                  <!-- No results -->
                  <div v-else class="py-6 text-center text-sm text-muted-foreground">
                    No objects found
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <!-- Manual vnum input -->
            <Input
              :id="param.name"
              type="number"
              placeholder="Or enter vnum directly..."
              :model-value="String(params[param.name] ?? '')"
              class="mt-1"
              @update:model-value="(v: string | number) => updateParam(param.name, v ? parseInt(String(v)) : '')"
            />
          </template>

          <!-- Mob Vnum Search -->
          <template v-else-if="param.type === 'vnum-mob'">
            <Popover :open="openPopovers[param.name]" @update:open="(v) => togglePopover(param.name, v)">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between font-normal text-left"
                >
                  <span class="truncate flex items-center gap-1">
                    <template v-if="godCommands.getSelectedMobAnsi(param.name)">
                      <span>Mob #{{ params[param.name] }} -</span>
                      <AnsiText :text="godCommands.getSelectedMobAnsi(param.name)!" class="truncate" />
                    </template>
                    <template v-else-if="params[param.name]">
                      Mob #{{ params[param.name] }}
                    </template>
                    <template v-else>
                      Search mobs...
                    </template>
                  </span>
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[400px] p-0">
                <div class="flex items-center border-b px-3">
                  <Input
                    :model-value="godCommands.mobSearchQuery.value"
                    placeholder="Search mobs..."
                    class="h-10 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    @update:model-value="godCommands.setMobSearchQuery(String($event))"
                  />
                </div>
                <div class="max-h-[300px] overflow-y-auto p-1">
                  <!-- Loading state -->
                  <div v-if="godCommands.isLoadingMobs.value" class="py-6 text-center text-sm">
                    <Loader2 class="h-4 w-4 animate-spin mx-auto mb-2" />
                    <span class="text-muted-foreground">Searching...</span>
                  </div>
                  <!-- Need more chars -->
                  <div v-else-if="godCommands.mobSearchQuery.value.length < 2" class="py-6 text-center text-sm text-muted-foreground">
                    Type at least 2 characters to search
                  </div>
                  <!-- Results -->
                  <template v-else-if="godCommands.mobResults.value?.mobs.length">
                    <div
                      v-for="mob in godCommands.mobResults.value.mobs"
                      :key="mob.vnum"
                      class="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                      @click="handleMobSelect(param.name, mob.vnum, mob.name)"
                    >
                      <Check
                        :class="cn('mr-2 h-4 w-4', params[param.name] === mob.vnum ? 'opacity-100' : 'opacity-0')"
                      />
                      <div class="flex flex-col flex-1 min-w-0">
                        <AnsiText :text="mob.name" class="truncate" />
                        <span class="text-xs text-muted-foreground">
                          #{{ mob.vnum }} - L{{ mob.level }}
                        </span>
                      </div>
                    </div>
                  </template>
                  <!-- No results -->
                  <div v-else class="py-6 text-center text-sm text-muted-foreground">
                    No mobs found
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <!-- Manual vnum input -->
            <Input
              :id="param.name"
              type="number"
              placeholder="Or enter vnum directly..."
              :model-value="String(params[param.name] ?? '')"
              class="mt-1"
              @update:model-value="(v: string | number) => updateParam(param.name, v ? parseInt(String(v)) : '')"
            />
          </template>

          <!-- Flag Select -->
          <template v-else-if="param.type === 'flag-select' || param.type === 'direction'">
            <Select
              :model-value="String(params[param.name] ?? '')"
              @update:model-value="(v) => updateParam(param.name, String(v ?? ''))"
            >
              <SelectTrigger>
                <SelectValue :placeholder="`Select ${param.label.toLowerCase()}...`" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in param.options"
                  :key="option.value"
                  :value="option.value"
                  :text-value="option.label"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </template>

          <!-- Setbit Property Select (Combobox) -->
          <template v-else-if="param.type === 'setbit-property'">
            <Popover :open="openPopovers[param.name]" @update:open="(v) => togglePopover(param.name, v)">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between font-normal"
                >
                  {{ params[param.name] || `Select ${param.label.toLowerCase()}...` }}
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[250px] p-0">
                <Command>
                  <CommandInput placeholder="Search property..." />
                  <CommandEmpty>No property found.</CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      <CommandItem
                        v-for="option in param.options"
                        :key="option.value"
                        :value="option.value"
                        @select="() => { updateParam(param.name, option.value); updateParam('value', ''); updateParam('onoff', false); togglePopover(param.name, false) }"
                      >
                        <Check :class="cn('mr-2 h-4 w-4', params[param.name] === option.value ? 'opacity-100' : 'opacity-0')" />
                        {{ option.label }}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </template>

          <!-- Setbit Value (dynamic based on selected property) -->
          <template v-else-if="param.type === 'setbit-value'">
            <!-- If property has subtable, show combobox -->
            <Popover v-if="selectedPropertyHasSubtable" :open="openPopovers[param.name]" @update:open="(v) => togglePopover(param.name, v)">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between font-normal"
                >
                  {{ params[param.name] || 'Select flag...' }}
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[250px] p-0">
                <Command>
                  <CommandInput placeholder="Search flag..." />
                  <CommandEmpty>No flag found.</CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      <CommandItem
                        v-for="option in selectedPropertySubtable"
                        :key="option.value"
                        :value="option.value"
                        @select="() => { updateParam(param.name, option.value); togglePopover(param.name, false) }"
                      >
                        <Check :class="cn('mr-2 h-4 w-4', params[param.name] === option.value ? 'opacity-100' : 'opacity-0')" />
                        {{ option.label }}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <!-- Otherwise show number input -->
            <Input
              v-else
              :id="param.name"
              type="number"
              placeholder="Enter value..."
              :model-value="String(params[param.name] ?? '')"
              @update:model-value="(v: string | number) => updateParam(param.name, v ? parseInt(String(v)) : '')"
            />
          </template>

          <!-- On/Off Toggle -->
          <template v-else-if="param.type === 'on-off'">
            <div class="flex items-center gap-3">
              <Switch
                :id="param.name"
                :model-value="params[param.name] === true || params[param.name] === 'on'"
                @update:model-value="updateParam(param.name, $event)"
              />
              <Label :for="param.name" class="text-sm font-normal">
                {{ params[param.name] === true || params[param.name] === 'on' ? 'ON' : 'OFF' }}
              </Label>
            </div>
          </template>

          <!-- Textarea -->
          <template v-else-if="param.type === 'textarea'">
            <Textarea
              :id="param.name"
              :placeholder="param.placeholder"
              :model-value="String(params[param.name] ?? '')"
              rows="3"
              @update:model-value="updateParam(param.name, $event)"
            />
          </template>

          <!-- Number Input -->
          <template v-else-if="param.type === 'number' || param.type === 'level' || param.type === 'room-vnum'">
            <Input
              :id="param.name"
              type="number"
              :placeholder="param.placeholder"
              :min="param.validation?.min"
              :max="param.validation?.max"
              :model-value="String(params[param.name] ?? '')"
              @update:model-value="(v: string | number) => updateParam(param.name, v ? parseInt(String(v)) : '')"
            />
          </template>

          <!-- Text Input (default) -->
          <template v-else>
            <Input
              :id="param.name"
              :placeholder="param.placeholder"
              :model-value="String(params[param.name] ?? '')"
              @update:model-value="updateParam(param.name, $event)"
            />
          </template>
        </div>
      </div>
    </ScrollArea>

    <!-- Command Preview & Actions -->
    <div class="border-t p-4 space-y-3 bg-muted/30">
      <!-- Error Display -->
      <div v-if="godCommands.executionError.value" class="bg-destructive/15 border border-destructive/50 rounded-md px-3 py-2">
        <p class="text-sm text-destructive font-medium">{{ godCommands.executionError.value }}</p>
      </div>

      <!-- Preview -->
      <div class="space-y-1">
        <Label class="text-xs text-muted-foreground">Command Preview</Label>
        <code class="block bg-background px-3 py-2 rounded border text-sm font-mono">
          {{ execution?.preview || command.template }}
        </code>
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="emit('back')">
          Cancel
        </Button>
        <Button
          :disabled="!execution?.isValid"
          :variant="command.dangerous ? 'destructive' : 'default'"
          @click="emit('execute')"
        >
          {{ command.dangerous ? 'Execute (Dangerous)' : 'Execute' }}
        </Button>
      </div>
    </div>
  </div>
</template>
