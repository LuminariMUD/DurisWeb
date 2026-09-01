<script setup lang="ts">
import { computed } from 'vue'
import type { TriggerAction, TriggerHighlightColor, TriggerSound } from '@/types/trigger'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Terminal, Highlighter, Volume2, EyeOff, MessageSquare } from 'lucide-vue-next'

const props = defineProps<{
  action: TriggerAction
  index: number
}>()

const emit = defineEmits<{
  update: [index: number, action: TriggerAction]
  remove: [index: number]
}>()

const highlightColors: { value: TriggerHighlightColor; label: string; class: string }[] = [
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
  { value: 'cyan', label: 'Cyan', class: 'bg-cyan-500' },
  { value: 'white', label: 'White', class: 'bg-gray-300' },
]

const sounds: { value: TriggerSound; label: string }[] = [
  { value: 'beep', label: 'Beep' },
  { value: 'chime', label: 'Chime' },
  { value: 'alert', label: 'Alert' },
  { value: 'ding', label: 'Ding' },
  { value: 'bell', label: 'Bell' },
  { value: 'custom', label: 'Custom URL' },
]

const actionIcon = computed(() => {
  switch (props.action.type) {
    case 'command':
      return Terminal
    case 'highlight':
      return Highlighter
    case 'sound':
      return Volume2
    case 'gag':
      return EyeOff
    case 'echo':
      return MessageSquare
    default:
      return Terminal
  }
})

const actionTitle = computed(() => {
  switch (props.action.type) {
    case 'command':
      return 'Send Command'
    case 'highlight':
      return 'Highlight Line'
    case 'sound':
      return 'Play Sound'
    case 'gag':
      return 'Gag (Hide) Line'
    case 'echo':
      return 'Echo Text'
    default:
      return 'Unknown Action'
  }
})

function updateAction(updates: Partial<TriggerAction>) {
  emit('update', props.index, { ...props.action, ...updates } as TriggerAction)
}
</script>

<template>
  <Card class="relative">
    <Button
      variant="ghost"
      size="icon"
      class="absolute top-2 right-2 h-6 w-6"
      @click="emit('remove', index)"
    >
      <X class="h-4 w-4" />
    </Button>

    <CardHeader class="pb-2">
      <CardTitle class="text-sm flex items-center gap-2">
        <component :is="actionIcon" class="h-4 w-4" />
        {{ actionTitle }}
      </CardTitle>
    </CardHeader>

    <CardContent class="space-y-3">
      <!-- Command Action -->
      <template v-if="action.type === 'command'">
        <div class="space-y-2">
          <Label>Commands (separate with ;)</Label>
          <Textarea
            :model-value="action.commands"
            placeholder="cast 'heal' $1; say Healed $1!"
            rows="2"
            @update:model-value="(val) => updateAction({ commands: val as string })"
          />
          <p class="text-xs text-muted-foreground">
            Use $0 for full match, $1-$9 for capture groups, $* for all captures
          </p>
        </div>
        <div class="space-y-2">
          <Label>Delay (ms)</Label>
          <Input
            type="number"
            :model-value="action.delay ?? 0"
            min="0"
            max="10000"
            step="100"
            @update:model-value="(val) => updateAction({ delay: Number(val) })"
          />
        </div>
      </template>

      <!-- Highlight Action -->
      <template v-else-if="action.type === 'highlight'">
        <div class="space-y-2">
          <Label>Background Color</Label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="color in highlightColors"
              :key="color.value"
              type="button"
              class="w-8 h-8 rounded-md border-2 transition-all"
              :class="[
                color.class,
                action.backgroundColor === color.value
                  ? 'border-white ring-2 ring-primary'
                  : 'border-transparent',
              ]"
              :title="color.label"
              @click="updateAction({ backgroundColor: color.value })"
            />
          </div>
        </div>
      </template>

      <!-- Sound Action -->
      <template v-else-if="action.type === 'sound'">
        <div class="space-y-2">
          <Label>Sound</Label>
          <Select
            :model-value="action.sound"
            @update:model-value="(val) => updateAction({ sound: val as TriggerSound })"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="sound in sounds" :key="sound.value" :value="sound.value">
                {{ sound.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="action.sound === 'custom'" class="space-y-2">
          <Label>Custom Sound URL</Label>
          <Input
            :model-value="action.customUrl ?? ''"
            placeholder="https://example.com/sound.mp3"
            @update:model-value="(val) => updateAction({ customUrl: val as string })"
          />
        </div>

        <div class="space-y-2">
          <Label>Volume: {{ Math.round((action.volume ?? 0.5) * 100) }}%</Label>
          <Slider
            :model-value="[(action.volume ?? 0.5) * 100]"
            :min="0"
            :max="100"
            :step="5"
            @update:model-value="(val) => updateAction({ volume: (val?.[0] ?? 50) / 100 })"
          />
        </div>
      </template>

      <!-- Gag Action -->
      <template v-else-if="action.type === 'gag'">
        <p class="text-sm text-muted-foreground">
          This line will be hidden from the activity log when the trigger matches.
        </p>
      </template>

      <!-- Echo Action -->
      <template v-else-if="action.type === 'echo'">
        <div class="space-y-2">
          <Label>Text to display</Label>
          <Textarea
            :model-value="action.text"
            placeholder="&+RWarning:&n HP is low! Current: $0"
            rows="2"
            @update:model-value="(val) => updateAction({ text: val as string })"
          />
          <p class="text-xs text-muted-foreground">
            Supports ANSI colors (&amp;+R, &amp;+G, etc.), $0-$9 capture groups, and %hp% GMCP variables
          </p>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
