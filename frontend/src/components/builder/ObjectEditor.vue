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
import { Badge } from '@/components/ui/badge'
import FlagPicker from '@/components/builder/FlagPicker.vue'
import AnsiEditor from '@/components/builder/AnsiEditor.vue'
import DescriptionPreview from '@/components/builder/DescriptionPreview.vue'
import ExtraDescEditor from '@/components/builder/ExtraDescEditor.vue'
import {
  Save,
  ChevronDown,
  ChevronRight,
  Info,
  FileText,
  Flag,
  Shirt,
  Package,
  Coins,
  Sparkles,
  Eye,
  Plus,
  Trash2,
  Shield,
  Zap,
} from 'lucide-vue-next'
import type { ZoneObject, ExtraDescription } from '@/types'

const props = defineProps<{
  obj: ZoneObject
  zoneNumber: number
  saving?: boolean
}>()

const emit = defineEmits<{
  (e: 'save', obj: ZoneObject): void
  (e: 'update:shortDesc', value: string): void
}>()

// Auth for overlord-only features
const { isOverlord } = useAuth()

// Local editable copy
const editedObj = ref<ZoneObject>({ ...props.obj })

// Section collapse state
const sectionsOpen = ref({
  basic: true,
  descriptions: true,
  wearFlags: false,
  extraFlags: false,
  values: false,
  economy: false,
  applies: false,
  antiFlags: false,
  charAffects: false,
  extras: false,
})

// Preview toggles
const showLongDescPreview = ref(false)
const showActionDescPreview = ref(false)

// Fetch flag definitions
const { data: flagsData } = useQuery({
  queryKey: ['builder-flags'],
  queryFn: () => builderApi.getFlags(),
  staleTime: Infinity,
})

// Reset when obj prop changes
watch(
  () => props.obj,
  (newObj) => {
    editedObj.value = {
      ...newObj,
      applies: [...(newObj.applies || [])],
      extras: [...(newObj.extras || [])],
    }
  },
  { deep: true },
)

// Emit shortDesc changes for live preview in navbar
watch(
  () => editedObj.value.shortDesc,
  (newValue) => {
    emit('update:shortDesc', newValue)
  },
)

// Computed: has unsaved changes
const hasChanges = computed(() => {
  return JSON.stringify(editedObj.value) !== JSON.stringify(props.obj)
})

// Computed: active wear flags count
const activeWearFlagsCount = computed(() => {
  if (!flagsData.value?.objWearFlags) return 0
  return flagsData.value.objWearFlags.filter((f) => (editedObj.value.wearFlags & f.value) !== 0)
    .length
})

// Computed: active extra flags count (includes both extra and extra2)
const activeExtraFlagsCount = computed(() => {
  let count = 0
  if (flagsData.value?.objExtraFlags) {
    count += flagsData.value.objExtraFlags.filter(
      (f) => (editedObj.value.extraFlags & f.value) !== 0,
    ).length
  }
  if (flagsData.value?.objExtra2Flags) {
    count += flagsData.value.objExtra2Flags.filter(
      (f) => (editedObj.value.extraFlags2 & f.value) !== 0,
    ).length
  }
  return count
})

// Computed: weapon dice string (e.g., "2D5")
// Access the full values array to ensure reactivity when elements change
const weaponDiceString = computed(() => {
  if (editedObj.value.itemType !== 5) return ''
  const values = editedObj.value.values
  if (!values || values.length < 3) return ''
  return `${values[1]}D${values[2]}`
})

// Computed: ALLOWED flags in extraFlags
// ITEM_ALLOWED_CLASSES = BIT_11 = 1024, ITEM_ALLOWED_RACES = BIT_10 = 512
const isAllowedClasses = computed(() => (editedObj.value.extraFlags & 1024) !== 0)
const isAllowedRaces = computed(() => (editedObj.value.extraFlags & 512) !== 0)

// Computed: Convert mob_race sequential values to bitfield for object anti2_flags
// handler.c checks: IS_SET(obj->anti2_flags, 1 << (GET_RACE(ch) - 1))
const raceRestrictionsFlags = computed(() => {
  if (!flagsData.value?.mobRaces) return []
  return flagsData.value.mobRaces
    .filter((r: { value: number }) => r.value > 0) // Skip RACE_NONE (value 0)
    .map(
      (r: {
        name: string
        value: number
        description?: string
        ansiName?: string
        shortCode?: string
      }) => ({
        ...r,
        value: 1 << (r.value - 1), // Convert sequential to bitfield: HUMAN(1)->1, BARBARIAN(2)->2, DWARF(3)->4, etc.
      }),
    )
})

// Computed: Class restrictions flags (already bitfield in database, use directly)
// handler.c checks: IS_SET(obj->anti_flags, ch->player.m_class)
const classRestrictionsFlags = computed(() => {
  if (!flagsData.value?.mobClasses) return []
  // Filter out CLASS_NONE (value 0)
  return flagsData.value.mobClasses.filter((c: { value: number }) => c.value > 0)
})

// Computed: active restrictions count (class + race restrictions)
const activeRestrictionsCount = computed(() => {
  let count = 0
  // Count active class restrictions
  if (flagsData.value?.mobClasses) {
    count += flagsData.value.mobClasses.filter(
      (f: { value: number }) => f.value > 0 && (editedObj.value.antiFlags & f.value) !== 0,
    ).length
  }
  // Count active race restrictions (convert sequential to bitfield)
  if (flagsData.value?.mobRaces) {
    for (const race of flagsData.value.mobRaces as Array<{ value: number }>) {
      if (race.value > 0) {
        const bitValue = 1 << (race.value - 1)
        if ((editedObj.value.antiFlags2 & bitValue) !== 0) count++
      }
    }
  }
  return count
})

// Dynamic value labels based on item type
const VALUE_LABELS: Record<number, string[]> = {
  1: ['Unused', 'Unused', 'Hours Remaining', 'Unused'], // LIGHT
  2: ['Spell Level', 'Spell 1', 'Spell 2', 'Spell 3'], // SCROLL
  3: ['Spell Level', 'Max Charges', 'Current Charges', 'Spell'], // WAND
  4: ['Spell Level', 'Max Charges', 'Current Charges', 'Spell'], // STAFF
  5: ['Weapon Type', 'Dice Count', 'Dice Size', 'Damage Type'], // WEAPON
  6: ['Unused', 'Unused', 'Unused', 'Unused'], // FIREWEAPON
  7: ['Unused', 'Unused', 'Unused', 'Unused'], // MISSILE
  8: ['Unused', 'Unused', 'Unused', 'Unused'], // TREASURE
  9: ['AC Apply', 'Unused', 'Unused', 'Unused'], // ARMOR
  10: ['Spell Level', 'Spell 1', 'Spell 2', 'Spell 3'], // POTION
  11: ['Unused', 'Unused', 'Unused', 'Unused'], // WORN
  12: ['Unused', 'Unused', 'Unused', 'Unused'], // OTHER
  13: ['Unused', 'Unused', 'Unused', 'Unused'], // TRASH
  14: ['Trap Type', 'Damage Dice', 'Damage Sides', 'Trap Level'], // TRAP
  15: ['Capacity', 'Container Flags', 'Key VNUM', 'Unused'], // CONTAINER
  16: ['Unused', 'Unused', 'Unused', 'Unused'], // NOTE
  17: ['Capacity', 'Current Amount', 'Liquid Type', 'Poisoned'], // DRINKCON
  18: ['Key Zone', 'Unused', 'Unused', 'Unused'], // KEY
  19: ['Hours Full', 'Unused', 'Unused', 'Poisoned'], // FOOD
  20: ['Amount', 'Unused', 'Unused', 'Unused'], // MONEY
  21: ['Unused', 'Unused', 'Unused', 'Unused'], // PEN
  22: ['Unused', 'Unused', 'Unused', 'Unused'], // BOAT
  23: ['Capacity', 'Current Amount', 'Liquid Type', 'Poisoned'], // FOUNTAIN
  24: ['Instrument Type', 'Unused', 'Unused', 'Unused'], // INSTRUMENT
  25: ['Target Zone', 'Target Room', 'Unused', 'Unused'], // WARP_STONE
  26: ['Portal Target Room', 'Unused', 'Unused', 'Unused'], // PORTAL
  27: ['Max Pages', 'Current Page', 'Unused', 'Unused'], // SPELLBOOK
  28: ['Totem Type', 'Unused', 'Unused', 'Unused'], // TOTEM
  29: ['Furniture Type', 'Capacity', 'Unused', 'Unused'], // FURNITURE
}

const valueLabels = computed(() => {
  return VALUE_LABELS[editedObj.value.itemType] || ['Value 0', 'Value 1', 'Value 2', 'Value 3']
})

// Get item type name
const itemTypeName = computed(() => {
  const types = flagsData.value?.objectTypes || []
  const found = types.find(
    (t: { name: string; value: number }) => t.value === editedObj.value.itemType,
  )
  return found?.name || 'Unknown'
})

// Handle flag changes
function handleWearFlagsChange(newFlags: number) {
  editedObj.value.wearFlags = newFlags
}

function handleExtraFlagsChange(newFlags: number) {
  editedObj.value.extraFlags = newFlags
}

function handleExtra2FlagsChange(newFlags: number) {
  editedObj.value.extraFlags2 = newFlags
}

function handleAntiFlagsChange(newFlags: number) {
  editedObj.value.antiFlags = newFlags
}

function handleAnti2FlagsChange(newFlags: number) {
  editedObj.value.antiFlags2 = newFlags
}

// Bitvector handlers (character affects when wearing item)
function handleBitvector1Change(newFlags: number) {
  editedObj.value.bitvector = newFlags || undefined
}

function handleBitvector2Change(newFlags: number) {
  editedObj.value.bitvector2 = newFlags || undefined
}

function handleBitvector3Change(newFlags: number) {
  editedObj.value.bitvector3 = newFlags || undefined
}

function handleBitvector4Change(newFlags: number) {
  editedObj.value.bitvector4 = newFlags || undefined
}

// Computed: active character affects count
const activeCharAffectsCount = computed(() => {
  let count = 0
  if (flagsData.value?.mobAffected1 && editedObj.value.bitvector) {
    count += flagsData.value.mobAffected1.filter(
      (f: { value: number }) => (editedObj.value.bitvector! & f.value) !== 0,
    ).length
  }
  if (flagsData.value?.mobAffected2 && editedObj.value.bitvector2) {
    count += flagsData.value.mobAffected2.filter(
      (f: { value: number }) => (editedObj.value.bitvector2! & f.value) !== 0,
    ).length
  }
  if (flagsData.value?.mobAffected3 && editedObj.value.bitvector3) {
    count += flagsData.value.mobAffected3.filter(
      (f: { value: number }) => (editedObj.value.bitvector3! & f.value) !== 0,
    ).length
  }
  if (flagsData.value?.mobAffected4 && editedObj.value.bitvector4) {
    count += flagsData.value.mobAffected4.filter(
      (f: { value: number }) => (editedObj.value.bitvector4! & f.value) !== 0,
    ).length
  }
  return count
})

// Handle item type change
function handleItemTypeChange(event: Event) {
  const value = parseInt((event.target as HTMLSelectElement).value, 10)
  editedObj.value.itemType = value
}

// Applies management
function addApply() {
  if (!editedObj.value.applies) {
    editedObj.value.applies = []
  }
  editedObj.value.applies.push({ location: 0, modifier: 0 })
}

function removeApply(index: number) {
  editedObj.value.applies.splice(index, 1)
}

function handleApplyLocationChange(index: number, event: Event) {
  const value = parseInt((event.target as HTMLSelectElement).value, 10)
  const apply = editedObj.value.applies[index]
  if (apply) {
    apply.location = value
  }
}

// Extra descriptions management
function handleExtrasChange(newExtras: ExtraDescription[]) {
  editedObj.value.extras = newExtras
}

// Ensure values array has 8 elements
function ensureValues() {
  if (!editedObj.value.values || editedObj.value.values.length < 8) {
    editedObj.value.values = [
      editedObj.value.values?.[0] || 0,
      editedObj.value.values?.[1] || 0,
      editedObj.value.values?.[2] || 0,
      editedObj.value.values?.[3] || 0,
      editedObj.value.values?.[4] || 0,
      editedObj.value.values?.[5] || 0,
      editedObj.value.values?.[6] || 0,
      editedObj.value.values?.[7] || 0,
    ]
  }
}

// Handle value change with proper reactivity
function handleValueChange(index: number, event: Event) {
  const target = event.target as HTMLInputElement
  const newValue = parseInt(target.value, 10) || 0
  // Create a new array to trigger reactivity
  const newValues = [...editedObj.value.values]
  newValues[index] = newValue
  editedObj.value.values = newValues
}

// Call on mount
ensureValues()

// Save
function save() {
  emit('save', editedObj.value)
}
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- Header with Save Button -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-semibold">
          Object #{{ editedObj.vnum }}
        </h2>
        <p class="text-sm text-muted-foreground">
          Zone {{ zoneNumber }} - {{ itemTypeName }}
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
                  v-model.number="editedObj.vnum"
                  :disabled="!isOverlord"
                  class="font-mono"
                  type="number"
                />
              </div>
              <div class="space-y-2">
                <Label for="obj-keywords">Keywords</Label>
                <Input
                  id="obj-keywords"
                  v-model="editedObj.keywords"
                  placeholder="sword weapon blade"
                />
              </div>
            </div>

            <!-- Item Type -->
            <div class="space-y-2">
              <Label for="obj-type">Item Type</Label>
              <select
                id="obj-type"
                :value="editedObj.itemType"
                @change="handleItemTypeChange"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option
                  v-for="objType in flagsData?.objectTypes || []"
                  :key="objType.value"
                  :value="objType.value"
                >
                  {{ objType.name }} ({{ objType.value }})
                </option>
              </select>
            </div>

            <!-- Material and Craftsmanship -->
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="obj-material">Material</Label>
                <select
                  id="obj-material"
                  v-model.number="editedObj.material"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option
                    v-for="mat in flagsData?.objMaterials || []"
                    :key="mat.value"
                    :value="mat.value"
                  >
                    {{ mat.name }} ({{ mat.value }})
                  </option>
                </select>
              </div>
              <div class="space-y-2">
                <Label for="obj-craftsmanship">Craftsmanship</Label>
                <select
                  id="obj-craftsmanship"
                  v-model.number="editedObj.craftsmanship"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option
                    v-for="craft in flagsData?.objCraftsmanship || []"
                    :key="craft.value"
                    :value="craft.value"
                  >
                    {{ craft.description || craft.name }} ({{ craft.value }})
                  </option>
                </select>
              </div>
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
              <Label>Short Description (shown in inventory/combat)</Label>
              <AnsiEditor
                v-model="editedObj.shortDesc"
                placeholder="a gleaming steel sword"
                min-height="50px"
                :single-line="true"
              />
            </div>

            <!-- Long Description -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <Label>Long Description (when on ground)</Label>
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
                  v-model="editedObj.longDesc"
                  placeholder="A gleaming steel sword lies here."
                  min-height="80px"
                />
                <DescriptionPreview
                  v-if="showLongDescPreview"
                  :text="editedObj.longDesc"
                  title="Long Desc Preview"
                />
              </div>
            </div>

            <!-- Action Description -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <Label>Action Description (when used)</Label>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7"
                  @click="showActionDescPreview = !showActionDescPreview"
                >
                  <Eye class="h-3 w-3 mr-1" />
                  {{ showActionDescPreview ? 'Hide' : 'Preview' }}
                </Button>
              </div>
              <div :class="showActionDescPreview ? 'grid grid-cols-2 gap-4' : ''">
                <AnsiEditor
                  v-model="editedObj.actionDesc"
                  placeholder="Optional action description..."
                  min-height="80px"
                />
                <DescriptionPreview
                  v-if="showActionDescPreview"
                  :text="editedObj.actionDesc"
                  title="Action Desc Preview"
                />
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Wear Flags Section -->
    <Collapsible v-model:open="sectionsOpen.wearFlags">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Shirt class="h-5 w-5" />
                Wear Locations
                <Badge variant="secondary">{{ activeWearFlagsCount }}</Badge>
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.wearFlags" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <FlagPicker
              :value="editedObj.wearFlags"
              :flags="flagsData?.objWearFlags || []"
              @update="handleWearFlagsChange"
            />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Extra Flags Section -->
    <Collapsible v-model:open="sectionsOpen.extraFlags">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Sparkles class="h-5 w-5" />
                Extra Flags
                <Badge variant="secondary">{{ activeExtraFlagsCount }}</Badge>
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.extraFlags" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <!-- Extra Flags 1 -->
            <div class="space-y-2">
              <Label>Extra Flags (Primary)</Label>
              <FlagPicker
                :value="editedObj.extraFlags"
                :flags="flagsData?.objExtraFlags || []"
                @update="handleExtraFlagsChange"
              />
            </div>

            <!-- Extra Flags 2 -->
            <div class="space-y-2">
              <Label>Extra Flags 2 (Extended)</Label>
              <FlagPicker
                :value="editedObj.extraFlags2"
                :flags="flagsData?.objExtra2Flags || []"
                @update="handleExtra2FlagsChange"
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Values Section -->
    <Collapsible v-model:open="sectionsOpen.values">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Package class="h-5 w-5" />
                Type Values
                <Badge variant="outline">{{ itemTypeName }}</Badge>
                <Badge v-if="weaponDiceString" variant="secondary">{{ weaponDiceString }}</Badge>
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.values" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <p class="text-sm text-muted-foreground">
              These values have different meanings based on item type.
            </p>
            <div class="grid grid-cols-2 gap-4">
              <div v-for="(label, index) in valueLabels" :key="index" class="space-y-2">
                <Label :for="`obj-value-${index}`">{{ label }}</Label>
                <!-- Weapon type dropdown for weapons (itemType 5) value[0] -->
                <select
                  v-if="editedObj.itemType === 5 && index === 0"
                  :id="`obj-value-${index}`"
                  :value="editedObj.values[index]"
                  @change="handleValueChange(index, $event)"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option
                    v-for="wtype in flagsData?.objWeaponTypes || []"
                    :key="wtype.value"
                    :value="wtype.value"
                  >
                    {{ wtype.description }} ({{ wtype.name }})
                  </option>
                </select>
                <!-- Weapon damage type dropdown for weapons (itemType 5) value[3] -->
                <select
                  v-else-if="editedObj.itemType === 5 && index === 3"
                  :id="`obj-value-${index}`"
                  :value="editedObj.values[index]"
                  @change="handleValueChange(index, $event)"
                  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option
                    v-for="dtype in flagsData?.objWeaponDamageTypes || []"
                    :key="dtype.value"
                    :value="dtype.value"
                  >
                    {{ dtype.description }} ({{ dtype.name }})
                  </option>
                </select>
                <Input
                  v-else
                  :id="`obj-value-${index}`"
                  :model-value="editedObj.values[index]"
                  @input="handleValueChange(index, $event)"
                  type="number"
                />
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Economy Section -->
    <Collapsible v-model:open="sectionsOpen.economy">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Coins class="h-5 w-5" />
                Economy
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.economy" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-3 gap-4">
              <div class="space-y-2">
                <Label for="obj-weight">Weight</Label>
                <Input
                  id="obj-weight"
                  v-model.number="editedObj.weight"
                  type="number"
                  min="0"
                />
              </div>
              <div class="space-y-2">
                <Label for="obj-cost">Cost (gold)</Label>
                <Input
                  id="obj-cost"
                  v-model.number="editedObj.cost"
                  type="number"
                  min="0"
                />
              </div>
              <div class="space-y-2">
                <Label for="obj-condition">Condition</Label>
                <Input
                  id="obj-condition"
                  v-model.number="editedObj.condition"
                  type="number"
                  min="0"
                />
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Applies Section -->
    <Collapsible v-model:open="sectionsOpen.applies">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Flag class="h-5 w-5" />
                Stat Modifiers
                <Badge variant="secondary">{{ editedObj.applies?.length || 0 }}</Badge>
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.applies" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <div v-if="!editedObj.applies?.length" class="text-sm text-muted-foreground">
              No stat modifiers - click Add to add one.
            </div>

            <div v-for="(apply, index) in editedObj.applies" :key="index" class="flex items-center gap-2">
              <select
                :value="apply.location"
                @change="handleApplyLocationChange(index, $event)"
                class="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option
                  v-for="applyType in flagsData?.objApplyTypes || []"
                  :key="applyType.value"
                  :value="applyType.value"
                >
                  {{ applyType.name }} ({{ applyType.value }})
                </option>
              </select>
              <Input
                v-model.number="apply.modifier"
                type="number"
                class="w-24"
                placeholder="Modifier"
              />
              <Button
                variant="ghost"
                size="icon"
                @click="removeApply(index)"
              >
                <Trash2 class="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              @click="addApply"
            >
              <Plus class="h-4 w-4 mr-2" />
              Add Apply
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Anti Flags Section -->
    <Collapsible v-model:open="sectionsOpen.antiFlags">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Shield class="h-5 w-5" />
                Restrictions
                <Badge variant="secondary">{{ activeRestrictionsCount }}</Badge>
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.antiFlags" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <!-- Class restrictions -->
            <div class="space-y-2">
              <Label>
                {{ isAllowedClasses ? 'Allowed Classes (CAN use)' : 'Restricted Classes (CANNOT use)' }}
              </Label>
              <p class="text-xs text-muted-foreground">
                {{ isAllowedClasses
                  ? 'Only selected classes can use this item (ITEM_ALLOWED_CLASSES is set)'
                  : 'Selected classes cannot use this item'
                }}
              </p>
              <FlagPicker
                :value="editedObj.antiFlags"
                :flags="classRestrictionsFlags"
                @update="handleAntiFlagsChange"
              />
            </div>

            <!-- Race restrictions -->
            <div class="space-y-2">
              <Label>
                {{ isAllowedRaces ? 'Allowed Races (CAN use)' : 'Restricted Races (CANNOT use)' }}
              </Label>
              <p class="text-xs text-muted-foreground">
                {{ isAllowedRaces
                  ? 'Only selected races can use this item (ITEM_ALLOWED_RACES is set)'
                  : 'Selected races cannot use this item'
                }}
              </p>
              <FlagPicker
                :value="editedObj.antiFlags2"
                :flags="raceRestrictionsFlags"
                @update="handleAnti2FlagsChange"
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Character Affects Section (bitvectors) -->
    <Collapsible v-model:open="sectionsOpen.charAffects">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <Zap class="h-5 w-5" />
                Character Affects
                <Badge variant="secondary">{{ activeCharAffectsCount }}</Badge>
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.charAffects" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent class="space-y-4">
            <p class="text-sm text-muted-foreground">
              These flags are applied to the character when wearing this item (e.g., PROT_FIRE, DETECT_INVISIBLE).
            </p>

            <!-- Affected 1 -->
            <div v-if="flagsData?.mobAffected1?.length" class="space-y-2">
              <Label>Affected 1 (Primary)</Label>
              <FlagPicker
                :value="editedObj.bitvector || 0"
                :flags="flagsData.mobAffected1"
                @update="handleBitvector1Change"
              />
            </div>

            <!-- Affected 2 -->
            <div v-if="flagsData?.mobAffected2?.length" class="space-y-2">
              <Label>Affected 2</Label>
              <FlagPicker
                :value="editedObj.bitvector2 || 0"
                :flags="flagsData.mobAffected2"
                @update="handleBitvector2Change"
              />
            </div>

            <!-- Affected 3 -->
            <div v-if="flagsData?.mobAffected3?.length" class="space-y-2">
              <Label>Affected 3</Label>
              <FlagPicker
                :value="editedObj.bitvector3 || 0"
                :flags="flagsData.mobAffected3"
                @update="handleBitvector3Change"
              />
            </div>

            <!-- Affected 4 -->
            <div v-if="flagsData?.mobAffected4?.length" class="space-y-2">
              <Label>Affected 4</Label>
              <FlagPicker
                :value="editedObj.bitvector4 || 0"
                :flags="flagsData.mobAffected4"
                @update="handleBitvector4Change"
              />
            </div>

            <div v-if="!flagsData?.mobAffected1?.length" class="text-sm text-muted-foreground">
              Affected flags not loaded. Try syncing flags from MUD source.
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>

    <!-- Extra Descriptions Section -->
    <Collapsible v-model:open="sectionsOpen.extras">
      <Card>
        <CollapsibleTrigger class="w-full">
          <CardHeader class="cursor-pointer hover:bg-muted/50 transition-colors">
            <div class="flex items-center justify-between">
              <CardTitle class="flex items-center gap-2">
                <FileText class="h-5 w-5" />
                Extra Descriptions
                <Badge variant="secondary">{{ editedObj.extras?.length || 0 }}</Badge>
              </CardTitle>
              <ChevronDown v-if="sectionsOpen.extras" class="h-5 w-5" />
              <ChevronRight v-else class="h-5 w-5" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <ExtraDescEditor
              :extras="editedObj.extras || []"
              @update="handleExtrasChange"
            />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  </div>
</template>
