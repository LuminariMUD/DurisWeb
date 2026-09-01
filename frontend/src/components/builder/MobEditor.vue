<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { useAuth } from '@/composables/useAuth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import FlagPicker from '@/components/builder/FlagPicker.vue'
import AnsiEditor from '@/components/builder/AnsiEditor.vue'
import DescriptionPreview from '@/components/builder/DescriptionPreview.vue'
import {
  Save,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Info,
  FileText,
  Flag,
  Swords,
  Sparkles,
  Coins,
  Eye,
  Check,
} from 'lucide-vue-next'
import type { Mobile } from '@/types'

const props = defineProps<{
  mob: Mobile
  zoneNumber: number
  saving?: boolean
}>()

const emit = defineEmits<{
  (e: 'save', mob: Mobile): void
  (e: 'update:shortDesc', value: string): void
}>()

// Auth for overlord-only features
const { isOverlord } = useAuth()

// Local editable copy
const editedMob = ref<Mobile>({ ...props.mob })

// Section collapse state
const sectionsOpen = ref({
  basic: true,
  descriptions: true,
  combat: false,
  behavior: false,
  affects: false,
  rewards: false,
})

// Preview toggles
const showLongDescPreview = ref(false)
const showDetailedDescPreview = ref(false)

// Fetch flag definitions
const { data: flagsData } = useQuery({
  queryKey: ['builder-flags'],
  queryFn: () => builderApi.getFlags(),
  staleTime: Infinity,
})

// Static sex options (never change)
const sexOptions = [
  { name: 'Neutral', value: 0 },
  { name: 'Male', value: 1 },
  { name: 'Female', value: 2 },
]

// Static position options (only editable ones for mob default/current position)
const positionOptions = [
  { name: 'Sleeping', value: 4 },
  { name: 'Resting', value: 5 },
  { name: 'Sitting', value: 6 },
  { name: 'Standing', value: 8 },
  { name: 'Prone', value: 9 },
]

// Reset when mob prop changes
watch(
  () => props.mob,
  (newMob) => {
    editedMob.value = { ...newMob }
  },
  { deep: true },
)

// Emit shortDesc changes for live preview in navbar
watch(
  () => editedMob.value.shortDesc,
  (newValue) => {
    emit('update:shortDesc', newValue)
  },
)

// Computed: has unsaved changes
const hasChanges = computed(() => {
  return JSON.stringify(editedMob.value) !== JSON.stringify(props.mob)
})

// Computed: active action flags
const activeActFlags = computed(() => {
  if (!flagsData.value?.mobActFlags) return []
  return flagsData.value.mobActFlags.filter((f) => (editedMob.value.actFlags & f.value) !== 0)
})

// Computed: active affect flags
const activeAffFlags = computed(() => {
  if (!flagsData.value?.mobAffFlags) return []
  return flagsData.value.mobAffFlags.filter((f) => (editedMob.value.affFlags1 & f.value) !== 0)
})

// Handle flag changes
function handleActFlagsChange(newFlags: number) {
  editedMob.value.actFlags = newFlags
}

function handleAffFlags1Change(newFlags: number) {
  editedMob.value.affFlags1 = newFlags
}

function handleAffFlags2Change(newFlags: number) {
  editedMob.value.affFlags2 = newFlags
}

function handleAffFlags3Change(newFlags: number) {
  editedMob.value.affFlags3 = newFlags
}

function handleAffFlags4Change(newFlags: number) {
  editedMob.value.affFlags4 = newFlags
}

// Handle position change
function handlePositionChange(event: Event) {
  const value = parseInt((event.target as HTMLSelectElement).value, 10)
  editedMob.value.position = value
}

function handleDefaultPositionChange(event: Event) {
  const value = parseInt((event.target as HTMLSelectElement).value, 10)
  editedMob.value.defaultPosition = value
}

// Handle sex change
function handleSexChange(event: Event) {
  const value = parseInt((event.target as HTMLSelectElement).value, 10)
  editedMob.value.sex = value
}

// Popover open states
const speciesOpen = ref(false)

// Get display text for selected species
const selectedSpeciesName = computed(() => {
  const species = flagsData.value?.mobRaces || []
  const selected = species.find(
    (s: { name: string; value: number }) => s.value === editedMob.value.species,
  )
  return selected ? `${selected.name} (${selected.value})` : 'Select species...'
})

// Handle selection
function selectSpecies(value: number) {
  editedMob.value.species = value
  speciesOpen.value = false
}

// Handle class flags change (bitmask)
function handleMobClassChange(newFlags: number) {
  editedMob.value.mobClass = newFlags
}

// Parse dice notation (XdY+Z)
function parseDice(dice: string): { count: number; sides: number; bonus: number } {
  const match = dice.match(/^(\d+)d(\d+)([+-]\d+)?$/)
  if (match && match[1] && match[2]) {
    return {
      count: parseInt(match[1], 10) || 1,
      sides: parseInt(match[2], 10) || 1,
      bonus: parseInt(match[3] || '0', 10),
    }
  }
  return { count: 1, sides: 1, bonus: 0 }
}

// Format dice notation
function formatDice(count: number, sides: number, bonus: number): string {
  const sign = bonus >= 0 ? '+' : ''
  return `${count}d${sides}${sign}${bonus}`
}

// Hit dice computed
const hitDiceParsed = computed(() => parseDice(editedMob.value.hitDice))
const hitDiceCount = computed({
  get: () => hitDiceParsed.value.count,
  set: (v) => {
    editedMob.value.hitDice = formatDice(v, hitDiceParsed.value.sides, hitDiceParsed.value.bonus)
  },
})
const hitDiceSides = computed({
  get: () => hitDiceParsed.value.sides,
  set: (v) => {
    editedMob.value.hitDice = formatDice(hitDiceParsed.value.count, v, hitDiceParsed.value.bonus)
  },
})
const hitDiceBonus = computed({
  get: () => hitDiceParsed.value.bonus,
  set: (v) => {
    editedMob.value.hitDice = formatDice(hitDiceParsed.value.count, hitDiceParsed.value.sides, v)
  },
})

// Damage dice computed
const damDiceParsed = computed(() => parseDice(editedMob.value.damDice))
const damDiceCount = computed({
  get: () => damDiceParsed.value.count,
  set: (v) => {
    editedMob.value.damDice = formatDice(v, damDiceParsed.value.sides, damDiceParsed.value.bonus)
  },
})
const damDiceSides = computed({
  get: () => damDiceParsed.value.sides,
  set: (v) => {
    editedMob.value.damDice = formatDice(damDiceParsed.value.count, v, damDiceParsed.value.bonus)
  },
})
const damDiceBonus = computed({
  get: () => damDiceParsed.value.bonus,
  set: (v) => {
    editedMob.value.damDice = formatDice(damDiceParsed.value.count, damDiceParsed.value.sides, v)
  },
})

// Save
function save() {
  emit('save', editedMob.value)
}
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- Header with Save Button -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-semibold">
          Mobile #{{ editedMob.vnum }}
        </h2>
        <p class="text-sm text-muted-foreground">
          Zone {{ zoneNumber }} - Level {{ editedMob.level }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Badge v-if="hasChanges" variant="secondary">Unsaved changes</Badge>
        <Button
          @click="save"
          :disabled="saving || !hasChanges"
        >
          <Save class="h-4 w-4 mr-2" />
          {{ saving ? 'Saving...' : 'Save' }}
        </Button>
      </div>
    </div>

    <!-- Basic Info Section -->
    <Collapsible v-model:open="sectionsOpen.basic">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Info class="h-5 w-5" />
                Basic Info
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.basic" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <!-- VNUM and Keywords -->
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label>VNUM</Label>
                <Input
                  v-model.number="editedMob.vnum"
                  :disabled="!isOverlord"
                  class="font-mono"
                  type="number"
                />
              </div>
              <div class="space-y-2">
                <Label for="mob-keywords">Keywords</Label>
                <Input
                  id="mob-keywords"
                  v-model="editedMob.keywords"
                  placeholder="guard soldier warrior"
                />
              </div>
            </div>

            <!-- Sex and Species -->
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="mob-sex">Sex</Label>
                <select
                  id="mob-sex"
                  :value="editedMob.sex"
                  @change="handleSexChange"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option
                    v-for="sex in sexOptions"
                    :key="sex.value"
                    :value="sex.value"
                  >
                    {{ sex.name }} ({{ sex.value }})
                  </option>
                </select>
              </div>
              <div class="space-y-2">
                <Label>Species</Label>
                <Popover v-model:open="speciesOpen">
                  <PopoverTrigger as-child>
                    <Button
                      variant="outline"
                      role="combobox"
                      :aria-expanded="speciesOpen"
                      class="w-full justify-between"
                    >
                      {{ selectedSpeciesName }}
                      <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-[300px] p-0">
                    <Command>
                      <CommandInput placeholder="Search species..." />
                      <CommandList>
                        <CommandEmpty>No species found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            v-for="sp in flagsData?.mobRaces || []"
                            :key="sp.value"
                            :value="sp.name"
                            @select="selectSpecies(sp.value)"
                          >
                            {{ sp.name }} ({{ sp.value }})
                            <Check
                              :class="[
                                'ml-auto h-4 w-4',
                                editedMob.species === sp.value ? 'opacity-100' : 'opacity-0'
                              ]"
                            />
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <!-- Level -->
            <div class="space-y-2">
              <Label for="mob-level">Level</Label>
              <Input
                id="mob-level"
                v-model.number="editedMob.level"
                type="number"
                min="1"
                max="70"
                class="w-32"
              />
            </div>

            <!-- Class (multi-select bitmask) -->
            <div class="space-y-2">
              <Label>Class(es)</Label>
              <FlagPicker
                :value="editedMob.mobClass"
                :flags="flagsData?.mobClasses || []"
                @update="handleMobClassChange"
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Descriptions Section -->
    <Collapsible v-model:open="sectionsOpen.descriptions">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <FileText class="h-5 w-5" />
                Descriptions
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.descriptions" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <!-- Short Description -->
            <div class="space-y-2">
              <Label>Short Description (shown in combat)</Label>
              <AnsiEditor
                v-model="editedMob.shortDesc"
                placeholder="a city guard"
                min-height="50px"
                :single-line="true"
              />
            </div>

            <!-- Long Description -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <Label>Long Description (when standing in room)</Label>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7"
                  @click="showLongDescPreview = !showLongDescPreview"
                >
                  <Eye class="h-3 w-3 mr-1" />
                  {{ showLongDescPreview ? 'Hide' : 'Preview' }}
                </Button>
              </div>
              <div :class="showLongDescPreview ? 'grid grid-cols-2 gap-4' : ''">
                <AnsiEditor
                  v-model="editedMob.longDesc"
                  placeholder="A city guard stands here, watching for trouble."
                  min-height="80px"
                />
                <DescriptionPreview
                  v-if="showLongDescPreview"
                  :text="editedMob.longDesc"
                  title="Long Desc Preview"
                />
              </div>
            </div>

            <!-- Detailed Description -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <Label>Detailed Description (when looked at)</Label>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7"
                  @click="showDetailedDescPreview = !showDetailedDescPreview"
                >
                  <Eye class="h-3 w-3 mr-1" />
                  {{ showDetailedDescPreview ? 'Hide' : 'Preview' }}
                </Button>
              </div>
              <div :class="showDetailedDescPreview ? 'grid grid-cols-2 gap-4' : ''">
                <AnsiEditor
                  v-model="editedMob.detailedDesc"
                  placeholder="This guard wears polished armor..."
                  min-height="120px"
                />
                <DescriptionPreview
                  v-if="showDetailedDescPreview"
                  :text="editedMob.detailedDesc"
                  title="Detailed Desc Preview"
                />
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Combat Stats Section -->
    <Collapsible v-model:open="sectionsOpen.combat">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Swords class="h-5 w-5" />
                Combat Stats
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.combat" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <!-- THAC0 and AC -->
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="mob-thac0">THAC0 (To Hit AC 0)</Label>
                <Input
                  id="mob-thac0"
                  v-model.number="editedMob.thac0"
                  type="number"
                />
                <p class="text-xs text-muted-foreground">Lower is better (typically 20 - level)</p>
              </div>
              <div class="space-y-2">
                <Label for="mob-ac">Armor Class</Label>
                <Input
                  id="mob-ac"
                  v-model.number="editedMob.ac"
                  type="number"
                />
                <p class="text-xs text-muted-foreground">Lower is better (typically -10 to 10)</p>
              </div>
            </div>

            <!-- Hit Dice -->
            <div class="space-y-2">
              <Label>Hit Dice (HP = XdY+Z)</Label>
              <div class="flex items-center gap-2">
                <Input
                  v-model.number="hitDiceCount"
                  type="number"
                  min="1"
                  class="w-20"
                />
                <span class="text-muted-foreground">d</span>
                <Input
                  v-model.number="hitDiceSides"
                  type="number"
                  min="1"
                  class="w-20"
                />
                <span class="text-muted-foreground">+</span>
                <Input
                  v-model.number="hitDiceBonus"
                  type="number"
                  class="w-24"
                />
                <span class="text-muted-foreground ml-2">= {{ editedMob.hitDice }}</span>
              </div>
              <p class="text-xs text-muted-foreground">
                Average HP: {{ Math.round(hitDiceCount * (hitDiceSides + 1) / 2 + hitDiceBonus) }}
              </p>
            </div>

            <!-- Damage Dice -->
            <div class="space-y-2">
              <Label>Damage Dice (Barehand = XdY+Z)</Label>
              <div class="flex items-center gap-2">
                <Input
                  v-model.number="damDiceCount"
                  type="number"
                  min="1"
                  class="w-20"
                />
                <span class="text-muted-foreground">d</span>
                <Input
                  v-model.number="damDiceSides"
                  type="number"
                  min="1"
                  class="w-20"
                />
                <span class="text-muted-foreground">+</span>
                <Input
                  v-model.number="damDiceBonus"
                  type="number"
                  class="w-24"
                />
                <span class="text-muted-foreground ml-2">= {{ editedMob.damDice }}</span>
              </div>
              <p class="text-xs text-muted-foreground">
                Average Damage: {{ Math.round(damDiceCount * (damDiceSides + 1) / 2 + damDiceBonus) }}
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Behavior Flags Section -->
    <Collapsible v-model:open="sectionsOpen.behavior">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Flag class="h-5 w-5" />
                Behavior Flags
                <Badge variant="secondary">{{ activeActFlags.length }}</Badge>
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.behavior" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <!-- Action Flags -->
            <div class="space-y-2">
              <Label>Action Flags</Label>
              <FlagPicker
                :value="editedMob.actFlags"
                :flags="flagsData?.mobActFlags || []"
                @update="handleActFlagsChange"
              />
            </div>

            <!-- Position -->
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="mob-position">Current Position</Label>
                <select
                  id="mob-position"
                  :value="editedMob.position"
                  @change="handlePositionChange"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option
                    v-for="pos in positionOptions"
                    :key="pos.value"
                    :value="pos.value"
                  >
                    {{ pos.name }} ({{ pos.value }})
                  </option>
                </select>
              </div>
              <div class="space-y-2">
                <Label for="mob-default-position">Default Position</Label>
                <select
                  id="mob-default-position"
                  :value="editedMob.defaultPosition"
                  @change="handleDefaultPositionChange"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option
                    v-for="pos in positionOptions"
                    :key="pos.value"
                    :value="pos.value"
                  >
                    {{ pos.name }} ({{ pos.value }})
                  </option>
                </select>
              </div>
            </div>

            <!-- Alignment -->
            <div class="space-y-2">
              <Label for="mob-alignment">Alignment (-1000 to 1000)</Label>
              <div class="flex items-center gap-4">
                <Input
                  id="mob-alignment"
                  v-model.number="editedMob.alignment"
                  type="number"
                  min="-1000"
                  max="1000"
                  class="w-32"
                />
                <input
                  type="range"
                  v-model.number="editedMob.alignment"
                  min="-1000"
                  max="1000"
                  class="flex-1"
                />
                <span class="text-sm text-muted-foreground w-24 text-right">
                  {{ editedMob.alignment < -350 ? 'Evil' : editedMob.alignment > 350 ? 'Good' : 'Neutral' }}
                </span>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Affect Flags Section -->
    <Collapsible v-model:open="sectionsOpen.affects">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Sparkles class="h-5 w-5" />
                Affect Flags
                <Badge variant="secondary">{{ activeAffFlags.length }}</Badge>
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.affects" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <!-- Affect Flags 1 -->
            <div class="space-y-2">
              <Label>Affect Flags (Primary)</Label>
              <FlagPicker
                :value="editedMob.affFlags1"
                :flags="flagsData?.mobAffFlags || []"
                @update="handleAffFlags1Change"
              />
            </div>

            <!-- Affect Flags 2 -->
            <div class="space-y-2">
              <Label>Affect Flags 2</Label>
              <FlagPicker
                :value="editedMob.affFlags2"
                :flags="flagsData?.mobAffFlags2 || []"
                @update="handleAffFlags2Change"
              />
            </div>

            <!-- Affect Flags 3 -->
            <div class="space-y-2">
              <Label>Affect Flags 3</Label>
              <FlagPicker
                :value="editedMob.affFlags3"
                :flags="flagsData?.mobAffFlags3 || []"
                @update="handleAffFlags3Change"
              />
            </div>

            <!-- Affect Flags 4 -->
            <div class="space-y-2">
              <Label>Affect Flags 4</Label>
              <FlagPicker
                :value="editedMob.affFlags4"
                :flags="flagsData?.mobAffFlags4 || []"
                @update="handleAffFlags4Change"
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Rewards Section -->
    <Collapsible v-model:open="sectionsOpen.rewards">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Coins class="h-5 w-5" />
                Rewards
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.rewards" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <p class="text-sm text-muted-foreground">
              The MUD will auto-calculate gold and experience based on mob level and stats.
              Values set here are overrides.
            </p>
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="mob-gold">Gold</Label>
                <Input
                  id="mob-gold"
                  v-model.number="editedMob.gold"
                  type="number"
                  min="0"
                />
              </div>
              <div class="space-y-2">
                <Label for="mob-exp">Experience Points</Label>
                <Input
                  id="mob-exp"
                  v-model.number="editedMob.exp"
                  type="number"
                  min="0"
                />
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  </div>
</template>
