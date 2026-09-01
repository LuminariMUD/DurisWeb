<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ArrowLeft,
  ArrowRight,
  Dices,
  Check,
  Loader2,
  Skull,
  Shield,
  RefreshCw,
  AlertCircle,
} from 'lucide-vue-next'
import type { MudRace, MudChargenClass, MudStatLabels, MudHometown } from '@/types/mud'
import { parseAnsiToHtml } from '@/utils/ansiParser'
import HelpModal from './HelpModal.vue'

const emit = defineEmits<{
  (e: 'request-options'): void
  (e: 'roll-stats', race: number): void
  (e: 'add-bonus', stat: string): void
  (e: 'swap-stats', stat1: string, stat2: string): void
  (e: 'get-hometowns', race: number): void
  (e: 'validate-name', name: string): void
  (
    e: 'create-character',
    data: {
      name: string
      race: number
      class: number
      sex: number
      alignment?: string
      hometown?: number
      hardcore?: boolean
      newbie?: boolean
    },
  ): void
  (e: 'cancel'): void
}>()

const props = defineProps<{
  races: MudRace[]
  stats: { stats: MudStatLabels; bonusRemaining: number } | null
  loading: boolean
  error: string | null
  hometowns: MudHometown[]
  hasHometownChoice: boolean
  nameValid: boolean | null
  nameMessage: string | null
}>()

// Wizard steps - full flow
type Step =
  | 'newbie'
  | 'race'
  | 'sex'
  | 'hardcore'
  | 'class'
  | 'alignment'
  | 'hometown'
  | 'stats'
  | 'bonus'
  | 'swap'
  | 'name'
  | 'review'
const currentStep = ref<Step>('newbie')

// Character data
const isNewbie = ref<boolean | null>(null)
const isHardcore = ref(false)
const selectedRace = ref<MudRace | null>(null)
const selectedClass = ref<MudChargenClass | null>(null)
const selectedAlignment = ref<'good' | 'evil' | null>(null)
const selectedSex = ref<1 | 2 | null>(null)
const selectedHometown = ref<number | null>(null)
const characterName = ref('')
const nameError = ref('')
const nameValidating = ref(false)
const nameValidateTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

// Stat swap state
const swapMode = ref<'none' | 'selecting-first' | 'selecting-second'>('none')
const swapFirst = ref<string | null>(null)
const swapSecond = ref<string | null>(null)

// Stat quality label to color mapping
const STAT_COLORS: Record<string, string> = {
  'quite excellent': 'text-purple-400',
  excellent: 'text-white font-bold',
  'very good': 'text-green-400',
  good: 'text-blue-400',
  'above average': 'text-blue-500',
  average: 'text-gray-400',
  'below average': 'text-yellow-500',
  poor: 'text-orange-500',
  lame: 'text-red-500',
}

function getStatColor(label: string | undefined): string {
  return STAT_COLORS[label ?? ''] || 'text-gray-400'
}

// All stats for display (10 total)
const STAT_ORDER = ['str', 'dex', 'agi', 'con', 'pow', 'int', 'wis', 'cha', 'luk', 'kar']
// Stats that can receive bonus points (9 - kar cannot)
const BONUS_STATS = ['str', 'dex', 'agi', 'con', 'pow', 'int', 'wis', 'cha', 'luk']
// Stats that can be swapped (9 - kar cannot)
const SWAP_STATS = ['str', 'dex', 'agi', 'con', 'pow', 'int', 'wis', 'cha', 'luk']
// Display names for stats
const STAT_NAMES: Record<string, string> = {
  str: 'Str',
  dex: 'Dex',
  agi: 'Agi',
  con: 'Con',
  pow: 'Pow',
  int: 'Int',
  wis: 'Wis',
  cha: 'Cha',
  luk: 'Luck',
  kar: 'Unused',
}

// Add bonus to a stat (server handles the logic)
function handleAddBonus(stat: string) {
  if (props.stats && (props.stats.bonusRemaining ?? 0) > 0) {
    emit('add-bonus', stat)
  }
}

// Computed
const goodRaces = computed(() => props.races.filter((r) => r.faction === 'good'))
const evilRaces = computed(() => props.races.filter((r) => r.faction === 'evil'))
const neutralRaces = computed(() => props.races.filter((r) => r.faction === 'neutral'))

const availableClasses = computed(() => {
  if (!selectedRace.value) return []
  return selectedRace.value.classes
})

const needsAlignmentChoice = computed(() => {
  return selectedRace.value?.faction === 'neutral'
})

const needsHometownChoice = computed(() => {
  return props.hasHometownChoice && props.hometowns.length > 1
})

// Calculate which steps are needed for this character
const requiredSteps = computed(() => {
  const steps: Step[] = ['newbie', 'race', 'sex']
  // Hardcore only for veterans
  if (isNewbie.value === false) {
    steps.push('hardcore')
  }
  steps.push('class')
  if (needsAlignmentChoice.value) {
    steps.push('alignment')
  }
  if (needsHometownChoice.value) {
    steps.push('hometown')
  }
  steps.push('stats', 'bonus', 'swap', 'name', 'review')
  return steps
})

const stepNumber = computed(() => {
  return requiredSteps.value.indexOf(currentStep.value) + 1
})

const totalSteps = computed(() => {
  return requiredSteps.value.length
})

// Request chargen options on mount
watch(
  () => props.races,
  (newRaces) => {
    if (newRaces.length === 0) {
      emit('request-options')
    }
  },
  { immediate: true },
)

// Watch for name validation response
watch(
  () => props.nameValid,
  (valid) => {
    nameValidating.value = false
    if (valid === false && props.nameMessage) {
      nameError.value = props.nameMessage
    } else if (valid === true) {
      nameError.value = ''
    }
  },
)

// Auto-roll stats when entering the stats step
watch(currentStep, (newStep) => {
  if (newStep === 'stats' && selectedRace.value && !props.stats) {
    emit('roll-stats', selectedRace.value.id)
  }
})

// Functions
function selectRace(race: MudRace) {
  selectedRace.value = race
  selectedClass.value = null
  selectedAlignment.value = null
  selectedHometown.value = null
  // Request hometowns when race is selected
  emit('get-hometowns', race.id)
}

function selectClass(cls: MudChargenClass) {
  selectedClass.value = cls
}

function selectHometown(id: number) {
  selectedHometown.value = id
}

function getNextStep(): Step | undefined {
  const idx = requiredSteps.value.indexOf(currentStep.value)
  if (idx < requiredSteps.value.length - 1) {
    return requiredSteps.value[idx + 1]
  }
  return undefined
}

function getPrevStep(): Step | undefined {
  const idx = requiredSteps.value.indexOf(currentStep.value)
  if (idx > 0) {
    return requiredSteps.value[idx - 1]
  }
  return undefined
}

function nextStep() {
  const next = getNextStep()
  if (!next) return

  switch (currentStep.value) {
    case 'newbie':
      if (isNewbie.value !== null) currentStep.value = next
      break
    case 'race':
      if (selectedRace.value) currentStep.value = next
      break
    case 'sex':
      if (selectedSex.value) currentStep.value = next
      break
    case 'hardcore':
      currentStep.value = next
      break
    case 'class':
      if (selectedClass.value) currentStep.value = next
      break
    case 'alignment':
      if (selectedAlignment.value) currentStep.value = next
      break
    case 'hometown':
      if (selectedHometown.value !== null) currentStep.value = next
      break
    case 'stats':
      currentStep.value = next
      break
    case 'bonus':
      currentStep.value = next
      break
    case 'swap':
      currentStep.value = next
      break
    case 'name':
      if (validateNameLocally()) {
        currentStep.value = next
      }
      break
  }
}

function prevStep() {
  const prev = getPrevStep()
  if (prev) {
    currentStep.value = prev
  }
}

function validateNameLocally(): boolean {
  const name = characterName.value.trim()
  if (name.length < 2) {
    nameError.value = 'Name must be at least 2 characters'
    return false
  }
  if (name.length > 12) {
    nameError.value = 'Name must be at most 12 characters'
    return false
  }
  if (!/^[a-zA-Z]+$/.test(name)) {
    nameError.value = 'Name can only contain letters'
    return false
  }
  // If server hasn't validated yet, request validation
  if (props.nameValid === null) {
    nameError.value = 'Checking name availability...'
    return false
  }
  if (props.nameValid === false) {
    nameError.value = props.nameMessage || 'Name is not available'
    return false
  }
  nameError.value = ''
  return true
}

function handleNameInput() {
  nameError.value = ''

  // Clear any pending validation request
  if (nameValidateTimeout.value) {
    clearTimeout(nameValidateTimeout.value)
    nameValidateTimeout.value = null
  }

  const name = characterName.value.trim()
  if (name.length >= 2 && /^[a-zA-Z]+$/.test(name)) {
    nameValidating.value = true
    // Debounce: wait 300ms after user stops typing before validating
    nameValidateTimeout.value = setTimeout(() => {
      emit('validate-name', name)
    }, 300)
  } else {
    nameValidating.value = false
  }
}

function rerollStats() {
  if (selectedRace.value) {
    emit('roll-stats', selectedRace.value.id)
  }
}

// Stat swap functions
function startSwap() {
  swapMode.value = 'selecting-first'
  swapFirst.value = null
  swapSecond.value = null
}

function cancelSwap() {
  swapMode.value = 'none'
  swapFirst.value = null
  swapSecond.value = null
}

function selectSwapStat(stat: string) {
  if (swapMode.value === 'selecting-first') {
    swapFirst.value = stat
    swapMode.value = 'selecting-second'
  } else if (swapMode.value === 'selecting-second' && stat !== swapFirst.value) {
    swapSecond.value = stat
    // Send swap to backend
    emit('swap-stats', swapFirst.value!, stat)
    swapMode.value = 'none'
    swapFirst.value = null
    swapSecond.value = null
  }
}

function createCharacter() {
  console.log('[Chargen] createCharacter called', {
    race: selectedRace.value,
    class: selectedClass.value,
    sex: selectedSex.value,
    name: characterName.value,
  })
  if (!selectedRace.value || !selectedClass.value || !selectedSex.value) {
    console.log('[Chargen] Missing required fields')
    return
  }

  const data = {
    name: characterName.value.trim(),
    race: selectedRace.value.id,
    class: selectedClass.value.id,
    sex: selectedSex.value,
    alignment: needsAlignmentChoice.value ? (selectedAlignment.value ?? undefined) : undefined,
    hometown: selectedHometown.value ?? undefined,
    hardcore: isHardcore.value,
    newbie: isNewbie.value ?? true,
  }
  console.log('[Chargen] Emitting create-character:', data)
  emit('create-character', data)
}

function getAlignmentBadgeVariant(
  alignment: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (alignment) {
    case 'good':
      return 'default'
    case 'evil':
      return 'destructive'
    case 'any':
      return 'secondary'
    default:
      return 'outline'
  }
}

function formatAlignment(alignment: string): string {
  switch (alignment) {
    case 'good':
      return 'Good'
    case 'evil':
      return 'Evil'
    case 'neutral':
      return 'Neutral'
    case 'any':
      return 'Any'
    case 'good_neutral':
      return 'Good/Neutral'
    case 'neutral_evil':
      return 'Neutral/Evil'
    default:
      return alignment
  }
}
</script>

<template>
  <Card class="w-full max-w-4xl mx-auto">
    <CardHeader>
      <div class="flex items-center justify-between">
        <div>
          <CardTitle class="text-xl">Create Character</CardTitle>
          <CardDescription>Step {{ stepNumber }} of {{ totalSteps }}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" @click="emit('cancel')">Cancel</Button>
      </div>
      <!-- Progress bar -->
      <div class="w-full bg-muted rounded-full h-2 mt-4">
        <div
          class="bg-primary h-2 rounded-full transition-all duration-300"
          :style="{ width: `${(stepNumber / totalSteps) * 100}%` }"
        />
      </div>
    </CardHeader>

    <CardContent class="min-h-[400px]">
      <!-- Loading state -->
      <div v-if="loading" class="flex items-center justify-center h-64">
        <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="text-center text-destructive py-8">
        {{ error }}
      </div>

      <!-- Step: Newbie Check -->
      <div v-else-if="currentStep === 'newbie'" class="space-y-6">
        <h3 class="text-lg font-semibold text-center">Welcome to the World of Duris</h3>
        <p class="text-muted-foreground text-center max-w-md mx-auto">
          Before we begin, we'd like to know your experience level.
          This helps us customize your character creation experience.
        </p>

        <div class="grid grid-cols-2 gap-4 max-w-lg mx-auto pt-4">
          <Button
            variant="outline"
            :class="[
              'h-auto py-6 flex flex-col gap-2',
              isNewbie === true && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            ]"
            @click="isNewbie = true"
          >
            <Shield class="w-8 h-8" />
            <span class="font-semibold">New Player</span>
            <span class="text-xs text-muted-foreground">Simplified experience</span>
          </Button>

          <Button
            variant="outline"
            :class="[
              'h-auto py-6 flex flex-col gap-2',
              isNewbie === false && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            ]"
            @click="isNewbie = false"
          >
            <Skull class="w-8 h-8" />
            <span class="font-semibold">Veteran</span>
            <span class="text-xs text-muted-foreground">Full options</span>
          </Button>
        </div>
      </div>

      <!-- Step: Race Selection -->
      <div v-else-if="currentStep === 'race'" class="space-y-4">
        <h3 class="text-lg font-semibold">Choose Your Race</h3>

        <Tabs default-value="good" class="w-full">
          <TabsList class="grid w-full grid-cols-3">
            <TabsTrigger value="good">Good ({{ goodRaces.length }})</TabsTrigger>
            <TabsTrigger value="evil">Evil ({{ evilRaces.length }})</TabsTrigger>
            <TabsTrigger value="neutral">Neutral ({{ neutralRaces.length }})</TabsTrigger>
          </TabsList>

          <TabsContent value="good" class="mt-4">
            <div class="grid grid-cols-3 gap-2">
              <div v-for="race in goodRaces" :key="race.id" class="flex items-center gap-1">
                <Button
                  variant="outline"
                  :class="[
                    'justify-start h-auto py-2 flex-1',
                    selectedRace?.id === race.id && 'ring-2 ring-green-500 ring-offset-2 ring-offset-background'
                  ]"
                  @click="selectRace(race)"
                >
                  <span v-html="parseAnsiToHtml(race.ansi)" />
                </Button>
                <HelpModal type="race" :name="race.name" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="evil" class="mt-4">
            <div class="grid grid-cols-3 gap-2">
              <div v-for="race in evilRaces" :key="race.id" class="flex items-center gap-1">
                <Button
                  variant="outline"
                  :class="[
                    'justify-start h-auto py-2 flex-1',
                    selectedRace?.id === race.id && 'ring-2 ring-red-500 ring-offset-2 ring-offset-background'
                  ]"
                  @click="selectRace(race)"
                >
                  <span v-html="parseAnsiToHtml(race.ansi)" />
                </Button>
                <HelpModal type="race" :name="race.name" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="neutral" class="mt-4">
            <div class="grid grid-cols-3 gap-2">
              <div v-for="race in neutralRaces" :key="race.id" class="flex items-center gap-1">
                <Button
                  variant="outline"
                  :class="[
                    'justify-start h-auto py-2 flex-1',
                    selectedRace?.id === race.id && 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-background'
                  ]"
                  @click="selectRace(race)"
                >
                  <span v-html="parseAnsiToHtml(race.ansi)" />
                </Button>
                <HelpModal type="race" :name="race.name" />
              </div>
            </div>
            <p class="text-sm text-muted-foreground mt-2">
              Neutral races can choose to be good or evil.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      <!-- Step: Sex Selection -->
      <div v-else-if="currentStep === 'sex'" class="space-y-4">
        <h3 class="text-lg font-semibold">Choose Your Sex</h3>

        <RadioGroup v-model="selectedSex" class="space-y-2">
          <div class="flex items-center space-x-2">
            <RadioGroupItem id="male" :value="1" />
            <Label for="male" class="cursor-pointer">Male</Label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem id="female" :value="2" />
            <Label for="female" class="cursor-pointer">Female</Label>
          </div>
        </RadioGroup>
      </div>

      <!-- Step: Hardcore Mode (Veterans Only) -->
      <div v-else-if="currentStep === 'hardcore'" class="space-y-6">
        <h3 class="text-lg font-semibold text-center">Choose Your Mode</h3>
        <p class="text-muted-foreground text-center max-w-md mx-auto">
          Hardcore mode provides a more challenging experience.
          Characters who die 5 times are permanently deleted.
        </p>

        <div class="grid grid-cols-2 gap-4 max-w-lg mx-auto pt-4">
          <Button
            variant="outline"
            :class="[
              'h-auto py-6 flex flex-col gap-2',
              !isHardcore && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            ]"
            @click="isHardcore = false"
          >
            <Shield class="w-8 h-8 text-green-500" />
            <span class="font-semibold">Normal</span>
            <span class="text-xs text-muted-foreground">Standard gameplay</span>
          </Button>

          <Button
            variant="outline"
            :class="[
              'h-auto py-6 flex flex-col gap-2',
              isHardcore && 'ring-2 ring-red-500 ring-offset-2 ring-offset-background'
            ]"
            @click="isHardcore = true"
          >
            <Skull class="w-8 h-8 text-red-500" />
            <span class="font-semibold text-red-500">Hardcore</span>
            <span class="text-xs text-muted-foreground">5 deaths = deleted</span>
          </Button>
        </div>
      </div>

      <!-- Step: Class Selection -->
      <div v-else-if="currentStep === 'class'" class="space-y-4">
        <h3 class="text-lg font-semibold">
          Choose Your Class
          <span class="text-muted-foreground font-normal">
            (as <span v-html="parseAnsiToHtml(selectedRace?.ansi ?? '')" />)
          </span>
        </h3>

        <div class="grid grid-cols-2 gap-2">
          <div v-for="cls in availableClasses" :key="cls.id" class="flex items-center gap-1">
            <Button
              variant="outline"
              :class="[
                'justify-between h-auto py-2 flex-1',
                selectedClass?.id === cls.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
              ]"
              @click="selectClass(cls)"
            >
              <span v-html="parseAnsiToHtml(cls.ansi)" />
              <Badge :variant="getAlignmentBadgeVariant(cls.alignment)" class="ml-2">
                {{ formatAlignment(cls.alignment) }}
              </Badge>
            </Button>
            <HelpModal type="class" :name="cls.name" />
          </div>
        </div>
      </div>

      <!-- Step: Alignment Selection (for neutral races) -->
      <div v-else-if="currentStep === 'alignment'" class="space-y-4">
        <h3 class="text-lg font-semibold">Choose Your Alignment</h3>
        <p class="text-muted-foreground">
          As a <span v-html="parseAnsiToHtml(selectedRace?.ansi ?? '')" />, you may choose your faction.
        </p>

        <RadioGroup v-model="selectedAlignment" class="space-y-2">
          <div class="flex items-center space-x-2">
            <RadioGroupItem id="good" value="good" />
            <Label for="good" class="cursor-pointer">
              <span class="text-green-500 font-semibold">Good</span> - Fight for the forces of light
            </Label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem id="evil" value="evil" />
            <Label for="evil" class="cursor-pointer">
              <span class="text-red-500 font-semibold">Evil</span> - Embrace the darkness
            </Label>
          </div>
        </RadioGroup>
      </div>

      <!-- Step: Hometown Selection -->
      <div v-else-if="currentStep === 'hometown'" class="space-y-4">
        <h3 class="text-lg font-semibold">Choose Your Hometown</h3>
        <p class="text-muted-foreground">
          Your hometown determines where you begin your adventure.
        </p>

        <div class="grid grid-cols-2 gap-2">
          <Button
            v-for="town in hometowns"
            :key="town.id"
            variant="outline"
            :class="[
              'justify-start h-auto py-3',
              selectedHometown === town.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            ]"
            @click="selectHometown(town.id)"
          >
            {{ town.name }}
          </Button>
        </div>
      </div>

      <!-- Step: Stats -->
      <div v-else-if="currentStep === 'stats'" class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Your Statistics</h3>
          <Button variant="outline" size="sm" @click="rerollStats" :disabled="loading">
            <Dices class="w-4 h-4 mr-2" />
            Reroll
          </Button>
        </div>

        <div v-if="stats?.stats" class="grid grid-cols-5 gap-3">
          <div v-for="stat in STAT_ORDER" :key="stat" class="text-center p-3 bg-muted rounded-lg">
            <div class="text-xs text-muted-foreground uppercase">{{ STAT_NAMES[stat] }}</div>
            <div :class="getStatColor(stats.stats[stat])" class="text-lg font-medium mt-1">
              {{ stats.stats[stat] }}
            </div>
          </div>
        </div>

        <p class="text-sm text-muted-foreground">
          Your rolled statistics. Click Reroll to try again. Next step: allocate bonus points.
        </p>
      </div>

      <!-- Step: Bonus Allocation -->
      <div v-else-if="currentStep === 'bonus'" class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Allocate Bonus Points</h3>
          <Badge variant="outline" class="text-lg px-3 py-1">
            {{ stats?.bonusRemaining ?? 0 }} remaining
          </Badge>
        </div>

        <p class="text-sm text-muted-foreground">
          Click a stat to add +5 bonus points. You have 5 bonus points to allocate.
        </p>

        <div v-if="stats?.stats" class="grid grid-cols-5 gap-3">
          <button
            v-for="stat in BONUS_STATS"
            :key="stat"
            class="text-center p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 hover:ring-2 hover:ring-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="(stats.bonusRemaining ?? 0) === 0 || stats.stats[stat] === 'quite excellent'"
            @click="handleAddBonus(stat)"
          >
            <div class="text-xs text-muted-foreground uppercase">{{ STAT_NAMES[stat] }}</div>
            <div :class="getStatColor(stats.stats[stat])" class="text-lg font-medium mt-1">
              {{ stats.stats[stat] }}
            </div>
          </button>
        </div>
      </div>

      <!-- Step: Stat Swap -->
      <div v-else-if="currentStep === 'swap'" class="space-y-4">
        <h3 class="text-lg font-semibold">Swap Statistics (Optional)</h3>
        <p class="text-muted-foreground">
          You may swap the values of two stats if you wish. This is optional.
        </p>

        <div v-if="stats?.stats" class="grid grid-cols-5 gap-3">
          <button
            v-for="stat in SWAP_STATS"
            :key="stat"
            :class="[
              'text-center p-3 bg-muted rounded-lg cursor-pointer transition-all',
              swapMode !== 'none' && 'hover:bg-muted/80 hover:ring-2 hover:ring-primary',
              swapFirst === stat && 'ring-2 ring-yellow-500',
              swapSecond === stat && 'ring-2 ring-green-500',
            ]"
            :disabled="swapMode === 'none'"
            @click="selectSwapStat(stat)"
          >
            <div class="text-xs text-muted-foreground uppercase">{{ STAT_NAMES[stat] }}</div>
            <div :class="getStatColor(stats.stats[stat])" class="text-lg font-medium mt-1">
              {{ stats.stats[stat] }}
            </div>
          </button>
        </div>

        <div class="flex gap-2 justify-center pt-4">
          <Button
            v-if="swapMode === 'none'"
            variant="outline"
            @click="startSwap"
          >
            <RefreshCw class="w-4 h-4 mr-2" />
            Swap Two Stats
          </Button>
          <Button
            v-else
            variant="ghost"
            @click="cancelSwap"
          >
            Cancel Swap
          </Button>
        </div>

        <p v-if="swapMode === 'selecting-first'" class="text-sm text-center text-yellow-500">
          Select the first stat to swap
        </p>
        <p v-else-if="swapMode === 'selecting-second'" class="text-sm text-center text-green-500">
          Select the second stat to swap with {{ STAT_NAMES[swapFirst ?? ''] }}
        </p>
      </div>

      <!-- Step: Name -->
      <div v-else-if="currentStep === 'name'" class="space-y-4">
        <h3 class="text-lg font-semibold">Choose Your Name</h3>

        <div class="max-w-sm space-y-2">
          <Label for="name">Character Name</Label>
          <div class="relative">
            <Input
              id="name"
              v-model="characterName"
              placeholder="Enter a name (2-12 letters)"
              :class="{ 'border-destructive': nameError, 'border-green-500': nameValid === true }"
              @input="handleNameInput"
            />
            <Loader2 v-if="nameValidating" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
            <Check v-else-if="nameValid === true" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
          </div>
          <p v-if="nameError" class="text-sm text-destructive">{{ nameError }}</p>
          <p v-else-if="nameValid === true" class="text-sm text-green-500">Name is available!</p>
          <p v-else class="text-sm text-muted-foreground">
            Names must be 2-12 characters and contain only letters.
          </p>
        </div>
      </div>

      <!-- Step: Review -->
      <div v-else-if="currentStep === 'review'" class="space-y-4">
        <h3 class="text-lg font-semibold">Review Your Character</h3>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <div class="flex justify-between py-2 border-b">
              <span class="text-muted-foreground">Name</span>
              <span class="font-semibold">{{ characterName }}</span>
            </div>
            <div class="flex justify-between py-2 border-b">
              <span class="text-muted-foreground">Race</span>
              <span v-html="parseAnsiToHtml(selectedRace?.ansi ?? '')" />
            </div>
            <div class="flex justify-between py-2 border-b">
              <span class="text-muted-foreground">Class</span>
              <span v-html="parseAnsiToHtml(selectedClass?.ansi ?? '')" />
            </div>
            <div class="flex justify-between py-2 border-b">
              <span class="text-muted-foreground">Sex</span>
              <span>{{ selectedSex === 1 ? 'Male' : 'Female' }}</span>
            </div>
            <div class="flex justify-between py-2 border-b">
              <span class="text-muted-foreground">Faction</span>
              <Badge :variant="(needsAlignmentChoice ? selectedAlignment : selectedRace?.faction) === 'good' ? 'default' : 'destructive'">
                {{ needsAlignmentChoice ? (selectedAlignment === 'good' ? 'Good' : 'Evil') : (selectedRace?.faction === 'good' ? 'Good' : 'Evil') }}
              </Badge>
            </div>
            <div v-if="isHardcore" class="flex justify-between py-2 border-b">
              <span class="text-muted-foreground">Mode</span>
              <Badge variant="destructive">Hardcore</Badge>
            </div>
            <div v-if="selectedHometown !== null" class="flex justify-between py-2 border-b">
              <span class="text-muted-foreground">Hometown</span>
              <span>{{ hometowns.find(h => h.id === selectedHometown)?.name }}</span>
            </div>
          </div>

          <div v-if="stats?.stats" class="grid grid-cols-5 gap-2">
            <div v-for="stat in STAT_ORDER" :key="stat" class="text-center p-2 bg-muted rounded">
              <div class="text-xs text-muted-foreground uppercase">{{ STAT_NAMES[stat] }}</div>
              <div :class="getStatColor(stats.stats[stat])" class="text-sm font-medium">
                {{ stats.stats[stat] }}
              </div>
            </div>
          </div>
        </div>

        <!-- Error display for create_character failures -->
        <Alert v-if="error" variant="destructive" class="mt-4">
          <AlertCircle class="h-4 w-4" />
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>
      </div>

      <!-- Navigation -->
      <div class="flex justify-between mt-8 pt-4 border-t">
        <Button
          variant="outline"
          @click="prevStep"
          :disabled="currentStep === 'newbie'"
        >
          <ArrowLeft class="w-4 h-4 mr-2" />
          Back
        </Button>

        <Button
          v-if="currentStep !== 'review'"
          @click="nextStep"
          :disabled="
            (currentStep === 'newbie' && isNewbie === null) ||
            (currentStep === 'race' && !selectedRace) ||
            (currentStep === 'class' && !selectedClass) ||
            (currentStep === 'alignment' && !selectedAlignment) ||
            (currentStep === 'sex' && !selectedSex) ||
            (currentStep === 'hometown' && selectedHometown === null) ||
            (currentStep === 'stats' && !stats) ||
            (currentStep === 'bonus' && (stats?.bonusRemaining ?? 0) > 0) ||
            (currentStep === 'name' && (!characterName.trim() || nameValid !== true))
          "
        >
          Next
          <ArrowRight class="w-4 h-4 ml-2" />
        </Button>

        <Button
          v-else
          @click="createCharacter"
          :disabled="loading"
        >
          <Check class="w-4 h-4 mr-2" />
          Create Character
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
