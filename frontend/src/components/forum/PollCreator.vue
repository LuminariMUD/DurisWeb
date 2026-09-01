<template>
  <div class="space-y-4">
    <!-- Poll Question -->
    <div class="space-y-2">
      <Label for="poll-question">Poll Question</Label>
      <Textarea
        id="poll-question"
        v-model="question"
        placeholder="What would you like to ask?"
        rows="2"
        maxlength="500"
      />
      <p class="text-xs text-muted-foreground">
        {{ question.length }}/500 characters
      </p>
    </div>

    <!-- Poll Options -->
    <div class="space-y-2">
      <Label>Options ({{ options.length }}/10)</Label>
      <div class="space-y-2">
        <div
          v-for="(option, index) in options"
          :key="index"
          class="flex items-center gap-2"
        >
          <Input
            v-model="options[index]"
            :placeholder="`Option ${index + 1}`"
            maxlength="200"
          />
          <Button
            v-if="options.length > 2"
            variant="ghost"
            size="icon"
            @click="removeOption(index)"
          >
            ✕
          </Button>
        </div>
      </div>
      <Button
        v-if="options.length < 10"
        variant="outline"
        size="sm"
        @click="addOption"
        class="w-full"
      >
        + Add Option
      </Button>
    </div>

    <!-- Poll Settings -->
    <div class="space-y-4 pt-4 border-t">
      <h4 class="font-semibold">Poll Settings</h4>

      <!-- Multiple Choice Toggle -->
      <div class="flex items-center justify-between">
        <div>
          <Label>Allow Multiple Choices</Label>
          <p class="text-xs text-muted-foreground">
            Users can select more than one option
          </p>
        </div>
        <Switch v-model="isMultipleChoice" />
      </div>

      <!-- Min/Max Choices (only for multiple choice) -->
      <div v-if="isMultipleChoice" class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <Label for="min-choices">Minimum Choices</Label>
          <Input
            id="min-choices"
            v-model.number="minChoices"
            type="number"
            min="1"
            :max="options.length"
          />
        </div>
        <div class="space-y-2">
          <Label for="max-choices">Maximum Choices</Label>
          <Input
            id="max-choices"
            v-model.number="maxChoices"
            type="number"
            :min="minChoices"
            :max="options.length"
          />
        </div>
      </div>

      <!-- Anonymous Voting Toggle -->
      <div class="flex items-center justify-between">
        <div>
          <Label>Anonymous Voting</Label>
          <p class="text-xs text-muted-foreground">
            Hide who voted for what option
          </p>
        </div>
        <Switch v-model="isAnonymous" />
      </div>

      <!-- Results Visibility -->
      <div class="space-y-2">
        <Label for="results-visibility">Results Visibility</Label>
        <select
          id="results-visibility"
          v-model="resultsVisibility"
          class="w-full px-3 py-2 border rounded-md bg-background"
        >
          <option value="always">Always visible</option>
          <option value="after_voting">After voting</option>
          <option value="after_expiration">After expiration</option>
        </select>
        <p class="text-xs text-muted-foreground">
          {{ visibilityDescription }}
        </p>
      </div>

      <!-- Expiration Date -->
      <div class="space-y-2">
        <Label for="expires-at">Expiration Date (Optional)</Label>
        <div class="relative">
          <input
            ref="expiresAtInput"
            id="expires-at"
            v-model="expiresAt"
            type="text"
            placeholder="Select expiration date and time..."
            class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 pr-10 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
            <CalendarIcon :size="16" />
          </div>
        </div>
        <p class="text-xs text-muted-foreground">
          Leave empty for no expiration
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CalendarIcon } from 'lucide-vue-next'
import type { PollCreationData } from '@/types'
import flatpickr from 'flatpickr'
import 'flatpickr/dist/flatpickr.min.css'
import 'flatpickr/dist/themes/dark.css'

const emit = defineEmits<{
  'update:pollData': [data: PollCreationData | null]
}>()

const question = ref('')
const options = ref(['', ''])
const isMultipleChoice = ref(false)
const minChoices = ref(1)
const maxChoices = ref(1)
const isAnonymous = ref(true)
const resultsVisibility = ref<'always' | 'after_voting' | 'after_expiration'>('always')
const expiresAt = ref('')

// Flatpickr instance
const expiresAtInput = ref<HTMLInputElement | null>(null)
let expiresAtPicker: flatpickr.Instance | null = null

const visibilityDescription = computed(() => {
  switch (resultsVisibility.value) {
    case 'always':
      return 'Anyone can see results at any time'
    case 'after_voting':
      return 'Users must vote before seeing results'
    case 'after_expiration':
      return 'Results are visible only after poll expires'
    default:
      return ''
  }
})

function addOption() {
  if (options.value.length < 10) {
    options.value.push('')
  }
}

function removeOption(index: number) {
  if (options.value.length > 2) {
    options.value.splice(index, 1)
  }
}

// Watch for changes and emit poll data
watch(
  [
    question,
    options,
    isMultipleChoice,
    minChoices,
    maxChoices,
    isAnonymous,
    resultsVisibility,
    expiresAt,
  ],
  () => {
    // Validate poll data
    const validOptions = options.value.filter((opt) => opt.trim().length > 0)

    if (question.value.trim().length < 5 || validOptions.length < 2) {
      emit('update:pollData', null)
      return
    }

    // Build poll data
    const pollData: PollCreationData = {
      question: question.value.trim(),
      options: validOptions,
      isMultipleChoice: isMultipleChoice.value,
      minChoices: isMultipleChoice.value ? minChoices.value : 1,
      maxChoices: isMultipleChoice.value ? maxChoices.value : 1,
      isAnonymous: isAnonymous.value,
      resultsVisibility: resultsVisibility.value,
    }

    // Add expiration if set
    if (expiresAt.value) {
      // Convert flatpickr format (Y-m-d H:i) to ISO string
      pollData.expiresAt = new Date(expiresAt.value.replace(' ', 'T')).toISOString()
    }

    emit('update:pollData', pollData)
  },
  { deep: true },
)

// Sync max choices with number of options
watch(
  options,
  (newOptions) => {
    const validCount = newOptions.filter((opt) => opt.trim().length > 0).length
    if (maxChoices.value > validCount) {
      maxChoices.value = validCount
    }
  },
  { deep: true },
)

// Sync min/max choices when toggling multiple choice
watch(isMultipleChoice, (isMultiple) => {
  if (!isMultiple) {
    minChoices.value = 1
    maxChoices.value = 1
  } else {
    const validCount = options.value.filter((opt) => opt.trim().length > 0).length
    maxChoices.value = Math.min(maxChoices.value, validCount)
  }
})

// Initialize flatpickr for expiration date
function initializeDatePicker() {
  if (!expiresAtInput.value || expiresAtPicker) {
    return
  }

  try {
    expiresAtPicker = flatpickr(
      expiresAtInput.value as HTMLElement,
      {
        enableTime: true,
        dateFormat: 'Y-m-d H:i',
        time_24hr: true,
        minDate: 'today',
        onChange: (_selectedDates: any, dateStr: string) => {
          expiresAt.value = dateStr
        },
      } as any,
    )
  } catch {}
}

// Initialize on mount
onMounted(async () => {
  await nextTick()
  initializeDatePicker()
})

// Cleanup on unmount
onBeforeUnmount(() => {
  if (expiresAtPicker) {
    expiresAtPicker.destroy()
    expiresAtPicker = null
  }
})
</script>
