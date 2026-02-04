<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Timer, TimerFormData, TimerScope, TimerAction } from '@/types/timer'
import { parseInterval, formatInterval, TIMER_CONSTRAINTS } from '@/types/timer'
import { useMudStore } from '@/stores/mudStore'
import { useTimers } from '@/composables/useTimers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Plus, Terminal, Volume2, MessageSquare, HelpCircle } from 'lucide-vue-next'
import TriggerActionCard from './TriggerActionCard.vue'
import GroupSelectDropdown from './GroupSelectDropdown.vue'

const props = defineProps<{
  open: boolean
  timer?: Timer | null
  mode: 'add' | 'edit'
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: TimerFormData, id?: string]
}>()

const store = useMudStore()
const { isNameInUse, validateInterval } = useTimers()

// Form state
const name = ref('')
const intervalInput = ref('')
const intervalMs = ref(60000) // 1 minute default
const isOneShot = ref(false)
const actions = ref<TimerAction[]>([])
const scope = ref<TimerScope>('global')
const characterName = ref<string | null>(null)
const groupId = ref<string | null>(null)
const description = ref('')
const enabled = ref(true)

// Validation
const nameError = ref('')
const intervalError = ref('')

// Help dialog
const showHelp = ref(false)

// Get available characters from store
const characters = computed(() => store.characters || [])
const currentCharacter = computed(() => store.selectedCharacter)

// Reset form when dialog opens
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (props.mode === 'edit' && props.timer) {
        // Edit mode: populate from existing timer
        name.value = props.timer.name
        intervalMs.value = props.timer.intervalMs
        intervalInput.value = formatInterval(props.timer.intervalMs)
        isOneShot.value = props.timer.isOneShot
        actions.value = JSON.parse(JSON.stringify(props.timer.actions))
        scope.value = props.timer.scope
        characterName.value = props.timer.characterName
        groupId.value = props.timer.groupId ?? null
        description.value = props.timer.description || ''
        enabled.value = props.timer.enabled
      } else {
        // Add mode: reset to defaults
        name.value = ''
        intervalMs.value = 60000
        intervalInput.value = '1m'
        isOneShot.value = false
        actions.value = []
        scope.value = 'global'
        characterName.value = currentCharacter.value
        groupId.value = null
        description.value = ''
        enabled.value = true
      }
      nameError.value = ''
      intervalError.value = ''
    }
  }
)

// Validate name on change
watch(name, (value) => {
  if (!value.trim()) {
    nameError.value = ''
    return
  }

  const excludeId = props.mode === 'edit' ? props.timer?.id : undefined
  if (isNameInUse(value, excludeId, scope.value, characterName.value)) {
    nameError.value = 'This name is already in use'
    return
  }

  nameError.value = ''
})

// Validate interval on change
watch(intervalInput, (value) => {
  const parsed = parseInterval(value)
  if (parsed === null) {
    intervalError.value = 'Invalid interval format (e.g., 30, 2m, 1h30m)'
    return
  }

  const validation = validateInterval(parsed)
  if (!validation.valid) {
    intervalError.value = validation.error || ''
    return
  }

  intervalMs.value = parsed
  intervalError.value = ''
})

// Re-validate name when scope or character changes
watch([scope, characterName], () => {
  if (name.value.trim()) {
    const excludeId = props.mode === 'edit' ? props.timer?.id : undefined
    if (isNameInUse(name.value, excludeId, scope.value, characterName.value)) {
      nameError.value = 'This name is already in use'
    } else {
      nameError.value = ''
    }
  }
})

const isValid = computed(() => {
  return (
    name.value.trim() &&
    !nameError.value &&
    !intervalError.value &&
    intervalMs.value >= TIMER_CONSTRAINTS.MIN_INTERVAL_MS &&
    intervalMs.value <= TIMER_CONSTRAINTS.MAX_INTERVAL_MS &&
    actions.value.length > 0 &&
    (scope.value === 'global' || characterName.value)
  )
})

function addAction(type: TimerAction['type']) {
  const newAction: TimerAction = (() => {
    switch (type) {
      case 'command':
        return { type: 'command', commands: '', delay: 0 }
      case 'sound':
        return { type: 'sound', sound: 'beep' as const, volume: 0.5 }
      case 'echo':
        return { type: 'echo', text: '' }
    }
  })()
  actions.value.push(newAction)
}

function updateAction(index: number, action: TimerAction | import('@/types/trigger').TriggerAction) {
  // TriggerActionCard emits TriggerAction, but we only add command/sound/echo which are valid TimerActions
  actions.value[index] = action as TimerAction
}

function removeAction(index: number) {
  actions.value.splice(index, 1)
}

function handleSave() {
  if (!isValid.value) return

  const data: TimerFormData = {
    name: name.value.trim(),
    intervalMs: intervalMs.value,
    isOneShot: isOneShot.value,
    actions: JSON.parse(JSON.stringify(actions.value)),
    scope: scope.value,
    characterName: scope.value === 'character' ? characterName.value : null,
    groupId: groupId.value,
    description: description.value.trim() || undefined,
    enabled: enabled.value,
  }

  emit('save', data, props.mode === 'edit' ? props.timer?.id : undefined)
  emit('update:open', false)
}

function handleCancel() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ mode === 'add' ? 'Add Timer' : 'Edit Timer' }}</DialogTitle>
        <DialogDescription>
          Create a timer to execute actions at regular intervals.
        </DialogDescription>
      </DialogHeader>

      <Tabs default-value="timing" class="w-full">
        <TabsList class="grid w-full grid-cols-3">
          <TabsTrigger value="timing">Timing</TabsTrigger>
          <TabsTrigger value="actions">
            Actions
            <span v-if="actions.length > 0" class="ml-1 text-xs">({{ actions.length }})</span>
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <!-- Timing Tab -->
        <TabsContent value="timing" class="space-y-4 mt-4">
          <!-- Name -->
          <div class="grid gap-2">
            <Label for="name">Name <span class="text-destructive">*</span></Label>
            <Input
              id="name"
              v-model="name"
              placeholder="e.g., Group blessing"
              :class="{ 'border-destructive': nameError }"
            />
            <p v-if="nameError" class="text-sm text-destructive">{{ nameError }}</p>
            <p v-else class="text-sm text-muted-foreground">A descriptive name for this timer</p>
          </div>

          <!-- Interval -->
          <div class="grid gap-2">
            <div class="flex items-center justify-between">
              <Label for="interval">Interval <span class="text-destructive">*</span></Label>
              <span class="text-sm text-muted-foreground">
                {{ intervalError ? '' : `= ${formatInterval(intervalMs)}` }}
              </span>
            </div>
            <Input
              id="interval"
              v-model="intervalInput"
              placeholder="e.g., 30, 2m, 1h30m"
              :class="{ 'border-destructive': intervalError }"
            />
            <p v-if="intervalError" class="text-sm text-destructive">{{ intervalError }}</p>
            <p v-else class="text-sm text-muted-foreground">
              Examples: 30 (seconds), 2m, 1h30m, 90s
            </p>
          </div>

          <!-- One-shot -->
          <div class="flex items-center justify-between">
            <div>
              <Label for="one-shot" class="cursor-pointer">One-shot Timer</Label>
              <p class="text-sm text-muted-foreground">
                Timer will disable itself after first execution
              </p>
            </div>
            <Switch id="one-shot" v-model="isOneShot" />
          </div>
        </TabsContent>

        <!-- Actions Tab -->
        <TabsContent value="actions" class="space-y-4 mt-4">
          <div class="flex items-center justify-between">
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" @click="addAction('command')">
                <Terminal class="h-4 w-4 mr-1" />
                Command
              </Button>
              <Button variant="outline" size="sm" @click="addAction('sound')">
                <Volume2 class="h-4 w-4 mr-1" />
                Sound
              </Button>
              <Button variant="outline" size="sm" @click="addAction('echo')">
                <MessageSquare class="h-4 w-4 mr-1" />
                Echo
              </Button>
            </div>
            <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" @click="showHelp = true">
              <HelpCircle class="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>

          <div v-if="actions.length === 0" class="text-center py-8 text-muted-foreground border rounded-md">
            <Plus class="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No actions defined. Click a button above to add one.</p>
          </div>

          <div v-else class="space-y-3">
            <TriggerActionCard
              v-for="(action, index) in actions"
              :key="index"
              :action="action"
              :index="index"
              @update="updateAction"
              @remove="removeAction"
            />
          </div>
        </TabsContent>

        <!-- Settings Tab -->
        <TabsContent value="settings" class="space-y-4 mt-4">
          <!-- Scope -->
          <div class="grid gap-2">
            <Label>Scope</Label>
            <RadioGroup v-model="scope" class="flex gap-4">
              <div class="flex items-center space-x-2">
                <RadioGroupItem id="scope-global" value="global" />
                <Label for="scope-global" class="font-normal cursor-pointer">Global</Label>
              </div>
              <div class="flex items-center space-x-2">
                <RadioGroupItem id="scope-character" value="character" />
                <Label for="scope-character" class="font-normal cursor-pointer">Character</Label>
              </div>
            </RadioGroup>
          </div>

          <!-- Character Select -->
          <div v-if="scope === 'character'" class="grid gap-2">
            <Label for="character">Character <span class="text-destructive">*</span></Label>
            <Select v-model="characterName">
              <SelectTrigger id="character">
                <SelectValue placeholder="Select character" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="char in characters" :key="char.name" :value="char.name">
                  {{ char.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Group -->
          <div class="space-y-2">
            <Label>Group</Label>
            <GroupSelectDropdown v-model="groupId" />
          </div>

          <!-- Description -->
          <div class="grid gap-2">
            <Label for="description">Description</Label>
            <Input
              id="description"
              v-model="description"
              placeholder="Optional note about this timer"
            />
          </div>

          <!-- Enabled -->
          <div class="flex items-center justify-between">
            <Label for="enabled" class="cursor-pointer">Enabled</Label>
            <Switch id="enabled" v-model="enabled" />
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter class="mt-4">
        <Button variant="outline" @click="handleCancel">Cancel</Button>
        <Button :disabled="!isValid" @click="handleSave">
          {{ mode === 'add' ? 'Add Timer' : 'Save Changes' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Help Dialog -->
  <Dialog v-model:open="showHelp">
    <DialogContent class="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Timer Actions Help</DialogTitle>
      </DialogHeader>
      <div class="space-y-4 text-sm">
        <div>
          <h4 class="font-semibold mb-2 flex items-center gap-2">
            <Terminal class="h-4 w-4" /> Command Action
          </h4>
          <p class="text-muted-foreground mb-2">Send commands to the MUD when timer fires.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p>Example: <span class="text-green-400">cast 'bless' group</span></p>
            <p>Example: <span class="text-green-400">say Hello everyone!</span></p>
            <p class="mt-2">Use <span class="text-yellow-400">;</span> to separate multiple commands</p>
            <p>Example: <span class="text-green-400">stand;look</span></p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2">GMCP Variables</h4>
          <p class="text-muted-foreground mb-2">Use live character data in commands.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-cyan-400">%hp%</span> current HP, <span class="text-cyan-400">%maxhp%</span> max HP, <span class="text-cyan-400">%hppct%</span> HP %</p>
            <p><span class="text-cyan-400">%mana%</span> current mana, <span class="text-cyan-400">%maxmana%</span> max mana, <span class="text-cyan-400">%manapct%</span> mana %</p>
            <p><span class="text-cyan-400">%mv%</span> move, <span class="text-cyan-400">%maxmv%</span> max move, <span class="text-cyan-400">%mvpct%</span> move %</p>
            <p><span class="text-cyan-400">%pos%</span> position, <span class="text-cyan-400">%target%</span> combat target</p>
            <p class="mt-2">Example: <span class="text-green-400">gt Status: %hp%/%maxhp% HP</span></p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2 flex items-center gap-2">
            <Volume2 class="h-4 w-4" /> Sound Action
          </h4>
          <p class="text-muted-foreground">
            Play a notification sound when timer fires.
          </p>
        </div>

        <div>
          <h4 class="font-semibold mb-2 flex items-center gap-2">
            <MessageSquare class="h-4 w-4" /> Echo Action
          </h4>
          <p class="text-muted-foreground mb-2">
            Display a message in the activity log when timer fires.
          </p>
          <div class="bg-muted p-2 rounded font-mono text-xs">
            <p>Supports ANSI colors: <span class="text-yellow-400">&amp;+R</span> red, <span class="text-yellow-400">&amp;+G</span> green, etc.</p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Interval Format</h4>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-green-400">30</span> - 30 seconds</p>
            <p><span class="text-green-400">2m</span> - 2 minutes</p>
            <p><span class="text-green-400">1h</span> - 1 hour</p>
            <p><span class="text-green-400">1h30m</span> - 1 hour 30 minutes</p>
            <p><span class="text-green-400">90s</span> - 90 seconds</p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Timer Lifecycle</h4>
          <p class="text-muted-foreground">
            Timers only run when connected to the MUD. They automatically pause when disconnected
            and resume when you reconnect.
          </p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
