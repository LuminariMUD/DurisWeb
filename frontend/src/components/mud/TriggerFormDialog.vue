<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Trigger, TriggerPattern, TriggerFormData, TriggerScope, TriggerAction, TriggerPatternLogic } from '@/types/trigger'
import { useMudStore } from '@/stores/mudStore'
import { useTriggers } from '@/composables/useTriggers'
import { validateCondition } from '@/utils/gmcpVariables'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
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
import { Plus, Terminal, Highlighter, Volume2, EyeOff, MessageSquare, X, HelpCircle } from 'lucide-vue-next'
import TriggerActionCard from './TriggerActionCard.vue'
import GroupSelectDropdown from './GroupSelectDropdown.vue'

const props = defineProps<{
  open: boolean
  trigger?: Trigger | null
  mode: 'add' | 'edit'
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: TriggerFormData, id?: string]
}>()

const store = useMudStore()
const { isNameInUse, validatePattern } = useTriggers()

// Form state
const name = ref('')
const patterns = ref<TriggerPattern[]>([{ value: '', isGmcp: false }])
const patternLogic = ref<TriggerPatternLogic>('or')
const patternType = ref<'substring' | 'regex'>('substring')
const caseSensitive = ref(false)
const actions = ref<TriggerAction[]>([])
const scope = ref<TriggerScope>('global')
const characterName = ref<string | null>(null)
const description = ref('')
const priority = ref(50)
const stopProcessing = ref(false)
const enabled = ref(true)
const groupId = ref<string | null>(null)

// Validation
const nameError = ref('')
const patternErrors = ref<string[]>([])

// Help dialogs
const showPatternHelp = ref(false)
const showActionHelp = ref(false)

// Get available characters from store
const characters = computed(() => store.characters || [])
const currentCharacter = computed(() => store.selectedCharacter)

// Reset form when dialog opens
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (props.mode === 'edit' && props.trigger) {
        // Edit mode: populate from existing trigger
        name.value = props.trigger.name
        patterns.value = props.trigger.patterns.map(p => ({ value: p.value, isGmcp: Boolean(p.isGmcp) }))
        patternLogic.value = props.trigger.patternLogic || 'or'
        patternType.value = props.trigger.patternType
        caseSensitive.value = props.trigger.caseSensitive
        actions.value = JSON.parse(JSON.stringify(props.trigger.actions))
        scope.value = props.trigger.scope
        characterName.value = props.trigger.characterName
        description.value = props.trigger.description || ''
        priority.value = props.trigger.priority
        stopProcessing.value = props.trigger.stopProcessing
        enabled.value = props.trigger.enabled
        groupId.value = props.trigger.groupId ?? null
      } else {
        // Add mode: reset to defaults
        name.value = ''
        patterns.value = [{ value: '', isGmcp: false }]
        patternLogic.value = 'or'
        patternType.value = 'substring'
        caseSensitive.value = false
        actions.value = []
        scope.value = 'global'
        characterName.value = currentCharacter.value
        description.value = ''
        priority.value = 50
        stopProcessing.value = false
        enabled.value = true
        groupId.value = null
      }
      nameError.value = ''
      patternErrors.value = []
    }
  }
)

// Validate name on change
watch(name, (value) => {
  if (!value.trim()) {
    nameError.value = ''
    return
  }

  const excludeId = props.mode === 'edit' ? props.trigger?.id : undefined
  if (isNameInUse(value, excludeId, scope.value, characterName.value)) {
    nameError.value = 'This name is already in use'
    return
  }

  nameError.value = ''
})

// Validate patterns on change
watch([patterns, patternType], () => {
  patternErrors.value = patterns.value.map((pattern) => {
    if (!pattern?.value?.trim()) return ''
    if (pattern.isGmcp) {
      // Validate GMCP condition
      return validateCondition(pattern.value)
    } else {
      // Validate text pattern
      const result = validatePattern(pattern.value, patternType.value)
      return result.error || ''
    }
  })
}, { deep: true })

// Re-validate name when scope or character changes
watch([scope, characterName], () => {
  if (name.value.trim()) {
    const excludeId = props.mode === 'edit' ? props.trigger?.id : undefined
    if (isNameInUse(name.value, excludeId, scope.value, characterName.value)) {
      nameError.value = 'This name is already in use'
    } else {
      nameError.value = ''
    }
  }
})

// Check if at least one pattern has content
const hasValidPatterns = computed(() => {
  return patterns.value.some((p) => p?.value?.trim())
})

// Check if any pattern has errors
const hasPatternErrors = computed(() => {
  return patternErrors.value.some((e) => e)
})

const isValid = computed(() => {
  return (
    name.value.trim() &&
    hasValidPatterns.value &&
    !nameError.value &&
    !hasPatternErrors.value &&
    actions.value.length > 0 &&
    (scope.value === 'global' || characterName.value)
  )
})

function addAction(type: TriggerAction['type']) {
  const newAction: TriggerAction = (() => {
    switch (type) {
      case 'command':
        return { type: 'command', commands: '', delay: 0 }
      case 'highlight':
        return { type: 'highlight', backgroundColor: 'yellow' as const }
      case 'sound':
        return { type: 'sound', sound: 'beep' as const, volume: 0.5 }
      case 'gag':
        return { type: 'gag' }
      case 'echo':
        return { type: 'echo', text: '' }
    }
  })()
  actions.value.push(newAction)
}

function updateAction(index: number, action: TriggerAction) {
  actions.value[index] = action
}

function removeAction(index: number) {
  actions.value.splice(index, 1)
}

function addPattern() {
  patterns.value.push({ value: '', isGmcp: false })
  patternErrors.value.push('')
}

function removePattern(index: number) {
  if (patterns.value.length > 1) {
    patterns.value.splice(index, 1)
    patternErrors.value.splice(index, 1)
  }
}

function handleSave() {
  if (!isValid.value) return

  // Filter out empty patterns
  const validPatterns = patterns.value
    .filter((p) => p?.value?.trim())
    .map((p) => ({ value: p.value.trim(), isGmcp: Boolean(p.isGmcp) }))

  const data: TriggerFormData = {
    name: name.value.trim(),
    patterns: validPatterns,
    patternLogic: patternLogic.value,
    patternType: patternType.value,
    caseSensitive: caseSensitive.value,
    actions: JSON.parse(JSON.stringify(actions.value)),
    scope: scope.value,
    characterName: scope.value === 'character' ? characterName.value : null,
    groupId: groupId.value,
    description: description.value.trim() || undefined,
    priority: priority.value,
    stopProcessing: stopProcessing.value,
    enabled: enabled.value,
  }

  emit('save', data, props.mode === 'edit' ? props.trigger?.id : undefined)
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
        <DialogTitle>{{ mode === 'add' ? 'Add Trigger' : 'Edit Trigger' }}</DialogTitle>
        <DialogDescription>
          Create a trigger to match incoming text and perform actions.
        </DialogDescription>
      </DialogHeader>

      <Tabs default-value="pattern" class="w-full">
        <TabsList class="grid w-full grid-cols-3">
          <TabsTrigger value="pattern">Pattern</TabsTrigger>
          <TabsTrigger value="actions">
            Actions
            <span v-if="actions.length > 0" class="ml-1 text-xs">({{ actions.length }})</span>
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <!-- Pattern Tab -->
        <TabsContent value="pattern" class="space-y-4 mt-4">
          <!-- Name -->
          <div class="grid gap-2">
            <Label for="name">Name <span class="text-destructive">*</span></Label>
            <Input
              id="name"
              v-model="name"
              placeholder="e.g., Auto-heal warning"
              :class="{ 'border-destructive': nameError }"
            />
            <p v-if="nameError" class="text-sm text-destructive">{{ nameError }}</p>
            <p v-else class="text-sm text-muted-foreground">A descriptive name for this trigger</p>
          </div>

          <!-- Patterns -->
          <div class="grid gap-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1">
                <Label>Patterns <span class="text-destructive">*</span></Label>
                <Button variant="ghost" size="icon" class="h-5 w-5" @click="showPatternHelp = true">
                  <HelpCircle class="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
              <Button variant="outline" size="sm" @click="addPattern">
                <Plus class="h-4 w-4 mr-1" />
                Add Pattern
              </Button>
            </div>
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Match</span>
              <RadioGroup v-model="patternLogic" class="flex gap-2">
                <div class="flex items-center space-x-1">
                  <RadioGroupItem id="logic-or" value="or" class="h-3.5 w-3.5" />
                  <Label for="logic-or" class="font-normal cursor-pointer text-sm">ANY</Label>
                </div>
                <div class="flex items-center space-x-1">
                  <RadioGroupItem id="logic-and" value="and" class="h-3.5 w-3.5" />
                  <Label for="logic-and" class="font-normal cursor-pointer text-sm">ALL</Label>
                </div>
              </RadioGroup>
              <span>pattern{{ patterns.length > 1 ? 's' : '' }}</span>
            </div>
            <div class="space-y-2">
              <div v-for="(pattern, index) in patterns" :key="index" class="space-y-1">
                <div class="flex gap-2 items-center">
                  <div class="flex-1">
                    <Input
                      v-model="pattern.value"
                      :placeholder="pattern.isGmcp ? 'e.g., %hppct% < 50' : (index === 0 ? 'e.g., You need to heal' : 'Additional pattern...')"
                      class="font-mono"
                      :class="{ 'border-destructive': patternErrors[index] }"
                    />
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <Switch
                      :id="`gmcp-${index}`"
                      :model-value="pattern.isGmcp"
                      @update:model-value="(val) => { const p = patterns[index]; if (p) p.isGmcp = val }"
                      class="scale-75"
                    />
                    <Label :for="`gmcp-${index}`" class="text-xs cursor-pointer whitespace-nowrap" :class="{ 'text-cyan-400': pattern.isGmcp }">
                      GMCP
                    </Label>
                  </div>
                  <Button
                    v-if="patterns.length > 1"
                    variant="ghost"
                    size="icon"
                    class="shrink-0"
                    @click="removePattern(index)"
                  >
                    <X class="h-4 w-4" />
                  </Button>
                </div>
                <p v-if="patternErrors[index]" class="text-sm text-destructive">{{ patternErrors[index] }}</p>
                <p v-else-if="pattern.isGmcp" class="text-xs text-muted-foreground">
                  GMCP condition (e.g., %hppct% &lt; 50, %pos% == sitting)
                </p>
              </div>
            </div>
          </div>

          <!-- Pattern Type -->
          <div class="grid gap-2">
            <Label>Pattern Type</Label>
            <RadioGroup v-model="patternType" class="flex gap-4">
              <div class="flex items-center space-x-2">
                <RadioGroupItem id="type-substring" value="substring" />
                <Label for="type-substring" class="font-normal cursor-pointer">
                  Substring (simple)
                </Label>
              </div>
              <div class="flex items-center space-x-2">
                <RadioGroupItem id="type-regex" value="regex" />
                <Label for="type-regex" class="font-normal cursor-pointer">Regex (advanced)</Label>
              </div>
            </RadioGroup>
          </div>

          <!-- Case Sensitive -->
          <div class="flex items-center justify-between">
            <div>
              <Label for="case-sensitive" class="cursor-pointer">Case Sensitive</Label>
              <p class="text-sm text-muted-foreground">Only applies to text patterns (not GMCP)</p>
            </div>
            <Switch id="case-sensitive" v-model="caseSensitive" />
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
              <Button variant="outline" size="sm" @click="addAction('highlight')">
                <Highlighter class="h-4 w-4 mr-1" />
                Highlight
              </Button>
              <Button variant="outline" size="sm" @click="addAction('sound')">
                <Volume2 class="h-4 w-4 mr-1" />
                Sound
              </Button>
              <Button variant="outline" size="sm" @click="addAction('gag')">
                <EyeOff class="h-4 w-4 mr-1" />
                Gag
              </Button>
              <Button variant="outline" size="sm" @click="addAction('echo')">
                <MessageSquare class="h-4 w-4 mr-1" />
                Echo
              </Button>
            </div>
            <Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" @click="showActionHelp = true">
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

          <!-- Priority -->
          <div class="grid gap-2">
            <Label>Priority: {{ priority }}</Label>
            <Slider :model-value="[priority]" :min="0" :max="100" :step="1" @update:model-value="(val) => priority = val?.[0] ?? 50" />
            <p class="text-sm text-muted-foreground">Higher priority triggers are processed first</p>
          </div>

          <!-- Stop Processing -->
          <div class="flex items-center justify-between">
            <div>
              <Label for="stop-processing" class="cursor-pointer">Stop Processing</Label>
              <p class="text-sm text-muted-foreground">Skip remaining triggers if this one matches</p>
            </div>
            <Switch id="stop-processing" v-model="stopProcessing" />
          </div>

          <!-- Description -->
          <div class="grid gap-2">
            <Label for="description">Description</Label>
            <Input
              id="description"
              v-model="description"
              placeholder="Optional note about this trigger"
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
          {{ mode === 'add' ? 'Add Trigger' : 'Save Changes' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Pattern Help Dialog -->
  <Dialog v-model:open="showPatternHelp">
    <DialogContent class="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Pattern Matching Help</DialogTitle>
      </DialogHeader>
      <div class="space-y-4 text-sm">
        <div>
          <h4 class="font-semibold mb-2">Substring Mode (Simple)</h4>
          <p class="text-muted-foreground mb-2">Matches if the text contains your pattern anywhere.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-green-400">You need to heal</span> - matches "You need to heal yourself"</p>
            <p><span class="text-green-400">hits you</span> - matches "The orc hits you hard"</p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Regex Mode (Advanced)</h4>
          <p class="text-muted-foreground mb-2">Use regular expressions for complex matching.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-yellow-400">.</span> - any character</p>
            <p><span class="text-yellow-400">.*</span> - any characters (greedy)</p>
            <p><span class="text-yellow-400">.+</span> - one or more characters</p>
            <p><span class="text-yellow-400">\d+</span> - one or more digits</p>
            <p><span class="text-yellow-400">\w+</span> - one or more word characters</p>
            <p><span class="text-yellow-400">^</span> - start of line</p>
            <p><span class="text-yellow-400">$</span> - end of line</p>
            <p><span class="text-yellow-400">(text)</span> - capture group</p>
            <p><span class="text-yellow-400">(?:text)</span> - non-capturing group</p>
            <p><span class="text-yellow-400">a|b</span> - a or b</p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Capture Groups</h4>
          <p class="text-muted-foreground mb-2">Use parentheses to capture text for use in commands.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p>Pattern: <span class="text-green-400">(\w+) tells you, '(.+)'</span></p>
            <p>Input: "Arih tells you, 'Hej! Jag ar en artefakt!'"</p>
            <p>$0 = full match</p>
            <p>$1 = "Arih"</p>
            <p>$2 = "Hej! Jag ar en artefakt!"</p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Examples</h4>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-green-400">^(\w+) has arrived</span> - player entering room</p>
            <p><span class="text-green-400">drops (a|an|some) (.+)</span> - item drops</p>
            <p><span class="text-green-400">You need to heal</span> - simple text match</p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2 text-cyan-400">GMCP Pattern Mode</h4>
          <p class="text-muted-foreground mb-2">Toggle the GMCP switch to match based on character state instead of text.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p>Operators: <span class="text-yellow-400">&lt;</span> <span class="text-yellow-400">&gt;</span> <span class="text-yellow-400">&lt;=</span> <span class="text-yellow-400">&gt;=</span> <span class="text-yellow-400">==</span> <span class="text-yellow-400">!=</span></p>
            <p class="mt-1"><span class="text-cyan-400">%hppct% &lt; 50</span> - HP below 50%</p>
            <p><span class="text-cyan-400">%mv% &gt;= 100</span> - at least 100 move</p>
            <p><span class="text-cyan-400">%pos% == sitting</span> - character is sitting</p>
            <p><span class="text-cyan-400">%target% != </span> - currently fighting (target not empty)</p>
            <p><span class="text-cyan-400">%target% == </span> - not fighting (target is empty)</p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2 text-green-400">Multiple Patterns - AND vs OR</h4>
          <p class="text-muted-foreground mb-2">Choose how multiple patterns combine:</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-yellow-400">ANY (OR)</span> - trigger fires if any single pattern matches</p>
            <p><span class="text-yellow-400">ALL (AND)</span> - trigger fires only if all patterns match the same line</p>
            <p class="mt-2 text-muted-foreground">Example with AND: match lines containing both "orc" AND "attacks"</p>
            <p>Pattern 1: <span class="text-green-400">orc</span></p>
            <p>Pattern 2: <span class="text-green-400">attacks</span></p>
            <p class="mt-2 text-muted-foreground">Note: GMCP patterns always use AND logic with text patterns.</p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2">GMCP Variables</h4>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-cyan-400">%hp%</span> <span class="text-cyan-400">%maxhp%</span> <span class="text-cyan-400">%hppct%</span> - HP (current, max, percentage 0-100)</p>
            <p><span class="text-cyan-400">%mana%</span> <span class="text-cyan-400">%maxmana%</span> <span class="text-cyan-400">%manapct%</span> - mana</p>
            <p><span class="text-cyan-400">%mv%</span> <span class="text-cyan-400">%maxmv%</span> <span class="text-cyan-400">%mvpct%</span> - movement</p>
            <p><span class="text-cyan-400">%exp%</span> <span class="text-cyan-400">%tnl%</span> - exp, exp to next level</p>
            <p><span class="text-cyan-400">%pos%</span> - position (standing, sitting, resting, sleeping, fighting)</p>
            <p><span class="text-cyan-400">%target%</span> - combat target name (empty if not fighting)</p>
            <p><span class="text-cyan-400">%plat%</span> <span class="text-cyan-400">%gold%</span> <span class="text-cyan-400">%silver%</span> <span class="text-cyan-400">%copper%</span> - currency</p>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Action Help Dialog -->
  <Dialog v-model:open="showActionHelp">
    <DialogContent class="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Trigger Actions Help</DialogTitle>
      </DialogHeader>
      <div class="space-y-4 text-sm">
        <div>
          <h4 class="font-semibold mb-2 flex items-center gap-2">
            <Terminal class="h-4 w-4" /> Command Action
          </h4>
          <p class="text-muted-foreground mb-2">Send commands to the MUD when trigger matches.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-yellow-400">$0</span> - full matched text</p>
            <p><span class="text-yellow-400">$1-$9</span> - capture groups from regex</p>
            <p><span class="text-yellow-400">$*</span> - all capture groups joined by space</p>
            <p class="mt-2">Example pattern: <span class="text-green-400">(\w+) tells you,</span></p>
            <p>Example command: <span class="text-green-400">reply $1 I got your message!</span></p>
            <p class="mt-2">Use <span class="text-yellow-400">;</span> to separate multiple commands</p>
            <p>Example: <span class="text-green-400">stand;flee</span></p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2 flex items-center gap-2">
            GMCP Variables
          </h4>
          <p class="text-muted-foreground mb-2">Use live character data in commands.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-cyan-400">%hp%</span> current HP, <span class="text-cyan-400">%maxhp%</span> max HP, <span class="text-cyan-400">%hppct%</span> HP percentage (0-100)</p>
            <p><span class="text-cyan-400">%mana%</span> current mana, <span class="text-cyan-400">%maxmana%</span> max mana, <span class="text-cyan-400">%manapct%</span> mana %</p>
            <p><span class="text-cyan-400">%mv%</span> current move, <span class="text-cyan-400">%maxmv%</span> max move, <span class="text-cyan-400">%mvpct%</span> move %</p>
            <p><span class="text-cyan-400">%exp%</span> current exp, <span class="text-cyan-400">%tnl%</span> exp to next level</p>
            <p><span class="text-cyan-400">%pos%</span> position (standing, sitting, etc.)</p>
            <p><span class="text-cyan-400">%target%</span> current combat target (empty if not fighting)</p>
            <p><span class="text-cyan-400">%plat%</span> <span class="text-cyan-400">%gold%</span> <span class="text-cyan-400">%silver%</span> <span class="text-cyan-400">%copper%</span> - currency</p>
            <p class="mt-2">Example: <span class="text-green-400">gt I have %hp%/%maxhp% HP left!</span></p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2 text-purple-400">Scripting</h4>
          <p class="text-muted-foreground mb-2">Conditionals, loops, and variables in commands.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-yellow-400">{if COND}...{else}...{endif}</span> - conditionals</p>
            <p><span class="text-yellow-400">{repeat N}...{/repeat}</span> - loops</p>
            <p><span class="text-yellow-400">{set var value}</span> - set user variable</p>
            <p><span class="text-yellow-400">%varname%</span> - read user variable</p>
            <p><span class="text-yellow-400">{math expr}</span> - arithmetic (+, -, *, /)</p>
            <p class="mt-2">Example: <span class="text-green-400">{if %hppct% &lt; 30}flee{else}attack %target%{endif}</span></p>
            <p>Example: <span class="text-green-400">{set kills {math %kills% + 1}}</span></p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2 flex items-center gap-2">
            <Highlighter class="h-4 w-4" /> Highlight Action
          </h4>
          <p class="text-muted-foreground">
            Highlight the matching line with a background color to make it stand out in the activity log.
          </p>
        </div>

        <div>
          <h4 class="font-semibold mb-2 flex items-center gap-2">
            <Volume2 class="h-4 w-4" /> Sound Action
          </h4>
          <p class="text-muted-foreground">
            Play a sound when the trigger matches. Useful for alerts like tells, group invites, or combat warnings.
          </p>
        </div>

        <div>
          <h4 class="font-semibold mb-2 flex items-center gap-2">
            <EyeOff class="h-4 w-4" /> Gag Action
          </h4>
          <p class="text-muted-foreground">
            Hide the matching line from the activity log. Useful for filtering spam or repetitive messages.
          </p>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Multiple Actions</h4>
          <p class="text-muted-foreground">
            You can add multiple actions to a single trigger. They will all execute when the pattern matches.
            For example: highlight a line AND play a sound AND send a command.
          </p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
