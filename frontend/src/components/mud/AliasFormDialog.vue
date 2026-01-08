<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Alias, AliasFormData, AliasScope } from '@/types/alias'
import { useMudStore } from '@/stores/mudStore'
import { useAliases } from '@/composables/useAliases'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { HelpCircle } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  alias?: Alias | null
  mode: 'add' | 'edit'
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: AliasFormData, id?: string]
}>()

const store = useMudStore()
const { isTriggerInUse } = useAliases()

// Form state
const trigger = ref('')
const expansion = ref('')
const scope = ref<AliasScope>('global')
const characterName = ref<string | null>(null)
const description = ref('')
const enabled = ref(true)

// Validation
const triggerError = ref('')

// Help dialog
const showHelp = ref(false)

// Get available characters from store
const characters = computed(() => store.characters || [])
const currentCharacter = computed(() => store.selectedCharacter)

// Reset form when dialog opens or alias changes
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (props.mode === 'edit' && props.alias) {
        // Edit mode: populate from existing alias
        trigger.value = props.alias.trigger
        expansion.value = props.alias.expansion
        scope.value = props.alias.scope
        characterName.value = props.alias.characterName
        description.value = props.alias.description || ''
        enabled.value = props.alias.enabled
      } else {
        // Add mode: reset to defaults
        trigger.value = ''
        expansion.value = ''
        scope.value = 'global'
        characterName.value = currentCharacter.value
        description.value = ''
        enabled.value = true
      }
      triggerError.value = ''
    }
  }
)

// Validate trigger on change
watch(trigger, (value) => {
  if (!value.trim()) {
    triggerError.value = ''
    return
  }

  const normalized = value.trim().toLowerCase()

  // Check for spaces
  if (/\s/.test(normalized)) {
    triggerError.value = 'Trigger cannot contain spaces'
    return
  }

  // Check for duplicates
  const excludeId = props.mode === 'edit' ? props.alias?.id : undefined
  if (isTriggerInUse(normalized, excludeId, scope.value, characterName.value)) {
    triggerError.value = 'This trigger is already in use'
    return
  }

  triggerError.value = ''
})

// Re-validate when scope or character changes
watch([scope, characterName], () => {
  if (trigger.value.trim()) {
    const normalized = trigger.value.trim().toLowerCase()
    const excludeId = props.mode === 'edit' ? props.alias?.id : undefined
    if (isTriggerInUse(normalized, excludeId, scope.value, characterName.value)) {
      triggerError.value = 'This trigger is already in use'
    } else if (!/\s/.test(normalized)) {
      triggerError.value = ''
    }
  }
})

const isValid = computed(() => {
  return (
    trigger.value.trim() &&
    expansion.value.trim() &&
    !triggerError.value &&
    (scope.value === 'global' || characterName.value)
  )
})

function handleSave() {
  if (!isValid.value) return

  const data: AliasFormData = {
    trigger: trigger.value.trim().toLowerCase(),
    expansion: expansion.value.trim(),
    scope: scope.value,
    characterName: scope.value === 'character' ? characterName.value : null,
    description: description.value.trim() || undefined,
    enabled: enabled.value,
  }

  emit('save', data, props.mode === 'edit' ? props.alias?.id : undefined)
  emit('update:open', false)
}

function handleCancel() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{{ mode === 'add' ? 'Add Alias' : 'Edit Alias' }}</DialogTitle>
        <DialogDescription>
          Create a command shortcut. Use $1, $2 for arguments, $* for all arguments, ; for
          multiple commands.
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <!-- Trigger -->
        <div class="grid gap-2">
          <Label for="trigger">Trigger <span class="text-destructive">*</span></Label>
          <Input
            id="trigger"
            v-model="trigger"
            placeholder="e.g., kk"
            class="font-mono"
            :class="{ 'border-destructive': triggerError }"
          />
          <p v-if="triggerError" class="text-sm text-destructive">{{ triggerError }}</p>
          <p v-else class="text-sm text-muted-foreground">
            The word you type to activate this alias (no spaces)
          </p>
        </div>

        <!-- Expansion -->
        <div class="grid gap-2">
          <div class="flex items-center gap-1">
            <Label for="expansion">Expansion <span class="text-destructive">*</span></Label>
            <Button variant="ghost" size="icon" class="h-5 w-5" @click="showHelp = true">
              <HelpCircle class="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          <Textarea
            id="expansion"
            v-model="expansion"
            placeholder="e.g., kill $1"
            class="font-mono min-h-[80px]"
            rows="3"
          />
          <p class="text-sm text-muted-foreground">
            $1-$9 = args, $* = all args, %hp% = GMCP vars, ; = multi-cmd
          </p>
        </div>

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

        <!-- Character Select (only visible when scope is character) -->
        <div v-if="scope === 'character'" class="grid gap-2">
          <Label for="character">Character <span class="text-destructive">*</span></Label>
          <Select v-model="characterName">
            <SelectTrigger id="character">
              <SelectValue placeholder="Select character" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="char in characters"
                :key="char.name"
                :value="char.name"
              >
                {{ char.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Description -->
        <div class="grid gap-2">
          <Label for="description">Description</Label>
          <Input
            id="description"
            v-model="description"
            placeholder="Optional note about this alias"
          />
        </div>

        <!-- Enabled -->
        <div class="flex items-center justify-between">
          <Label for="enabled" class="cursor-pointer">Enabled</Label>
          <Switch id="enabled" v-model="enabled" />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleCancel">Cancel</Button>
        <Button :disabled="!isValid" @click="handleSave">
          {{ mode === 'add' ? 'Add Alias' : 'Save Changes' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Help Dialog -->
  <Dialog v-model:open="showHelp">
    <DialogContent class="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Alias Expansion Help</DialogTitle>
      </DialogHeader>
      <div class="space-y-4 text-sm">
        <div>
          <h4 class="font-semibold mb-2">Argument Variables</h4>
          <p class="text-muted-foreground mb-2">Capture words typed after the alias trigger.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-yellow-400">$1-$9</span> - individual arguments</p>
            <p><span class="text-yellow-400">$*</span> - all arguments combined</p>
            <p class="mt-2">Alias: <span class="text-green-400">kk</span> = <span class="text-green-400">kill $1</span></p>
            <p>Input: <span class="text-cyan-400">kk orc</span></p>
            <p>Result: <span class="text-green-400">kill orc</span></p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Multiple Commands</h4>
          <p class="text-muted-foreground mb-2">Use semicolon to send multiple commands.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p>Alias: <span class="text-green-400">sf</span> = <span class="text-green-400">stand;flee</span></p>
            <p>Result: sends "stand" then "flee"</p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2">GMCP Variables</h4>
          <p class="text-muted-foreground mb-2">Use live character data in expansions.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-cyan-400">%hp%</span> current HP, <span class="text-cyan-400">%maxhp%</span> max HP, <span class="text-cyan-400">%hppct%</span> HP percentage (0-100)</p>
            <p><span class="text-cyan-400">%mana%</span> current mana, <span class="text-cyan-400">%maxmana%</span> max mana, <span class="text-cyan-400">%manapct%</span> mana %</p>
            <p><span class="text-cyan-400">%mv%</span> current move, <span class="text-cyan-400">%maxmv%</span> max move, <span class="text-cyan-400">%mvpct%</span> move %</p>
            <p><span class="text-cyan-400">%exp%</span> current exp, <span class="text-cyan-400">%tnl%</span> exp to next level</p>
            <p><span class="text-cyan-400">%pos%</span> position (standing, sitting, etc.)</p>
            <p><span class="text-cyan-400">%target%</span> current combat target (empty if not fighting)</p>
            <p><span class="text-cyan-400">%plat%</span> <span class="text-cyan-400">%gold%</span> <span class="text-cyan-400">%silver%</span> <span class="text-cyan-400">%copper%</span> - currency</p>
            <p class="mt-2">Example: <span class="text-green-400">rep</span> = <span class="text-green-400">gt HP: %hp%/%maxhp% MV: %mv%/%maxmv%</span></p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2 text-purple-400">Conditionals</h4>
          <p class="text-muted-foreground mb-2">Execute commands based on conditions.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-yellow-400">{if CONDITION}...{endif}</span></p>
            <p><span class="text-yellow-400">{if CONDITION}...{else}...{endif}</span></p>
            <p><span class="text-yellow-400">{if COND}...{elseif COND}...{else}...{endif}</span></p>
            <p class="mt-2">Example: <span class="text-green-400">{if %hppct% &lt; 50}cast heal{else}attack{endif}</span></p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2 text-purple-400">Loops</h4>
          <p class="text-muted-foreground mb-2">Repeat commands multiple times.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-yellow-400">{repeat N}...{/repeat}</span></p>
            <p class="mt-2">Example: <span class="text-green-400">{repeat 3}cast armor{/repeat}</span></p>
            <p>Result: sends "cast armor" 3 times</p>
            <p class="mt-1">Can use arguments: <span class="text-green-400">{repeat $1}attack{/repeat}</span></p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2 text-purple-400">User Variables</h4>
          <p class="text-muted-foreground mb-2">Store and reuse values (saved to browser).</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-yellow-400">{set varname value}</span> - set a variable</p>
            <p><span class="text-yellow-400">%varname%</span> - read a variable</p>
            <p class="mt-2">Example: <span class="text-green-400">tt</span> = <span class="text-green-400">{set target $1}</span></p>
            <p>Example: <span class="text-green-400">kk</span> = <span class="text-green-400">kill %target%</span></p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2 text-purple-400">Math</h4>
          <p class="text-muted-foreground mb-2">Perform calculations.</p>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p><span class="text-yellow-400">{math expression}</span> - +, -, *, /, %</p>
            <p class="mt-2">Example: <span class="text-green-400">{set count {math %count% + 1}}</span></p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Combined Example</h4>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p>Alias: <span class="text-green-400">heal</span></p>
            <p>Expansion: <span class="text-green-400">cast 'heal' $1;gt Healed $1, I have %hppct%% HP</span></p>
            <p>Input: <span class="text-cyan-400">heal Arih</span></p>
            <p>Result: casts heal on Arih and reports HP to group</p>
          </div>
        </div>

        <div>
          <h4 class="font-semibold mb-2">Advanced Example</h4>
          <div class="bg-muted p-2 rounded font-mono text-xs space-y-1">
            <p>Alias: <span class="text-green-400">prep</span></p>
            <p>Expansion: <span class="text-green-400">{repeat 3}cast armor{/repeat};{if %hppct% &lt; 100}cast heal{endif}</span></p>
            <p>Result: casts armor 3x, then heals if HP not full</p>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
