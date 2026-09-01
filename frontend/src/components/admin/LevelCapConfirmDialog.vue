<template>
  <AlertDialog :open="open" @update:open="handleOpenChange">
    <AlertDialogContent class="bg-gray-800 border border-gray-700 max-w-lg">
      <AlertDialogHeader>
        <AlertDialogTitle class="text-white text-xl">
          {{ isReset ? 'Reset Level Cap?' : 'Confirm Level Cap Change' }}
        </AlertDialogTitle>
        <AlertDialogDescription class="text-gray-400">
          {{ isReset
            ? 'This will reset the level cap to defaults and clear racewar progress.'
            : 'You are about to manually override the level cap. This change takes effect immediately.' }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="space-y-4 py-4">
        <!-- Current vs New Values -->
        <div class="bg-gray-900/50 rounded-lg p-3">
          <p class="text-sm text-gray-400 mb-2">{{ isReset ? 'Changes' : 'Level Cap Change' }}</p>
          <div class="flex items-center gap-3">
            <div class="flex-1">
              <p class="text-xs text-gray-500 mb-1">Current</p>
              <p class="text-lg font-mono text-red-400">Level {{ currentLevel }}</p>
              <p class="text-xs text-gray-500 mt-1">
                {{ racewarLabel(currentRacewar) }}
              </p>
            </div>
            <ArrowRight class="w-5 h-5 text-gray-500" />
            <div class="flex-1">
              <p class="text-xs text-gray-500 mb-1">New</p>
              <p class="text-lg font-mono text-green-400">Level {{ newLevel }}</p>
              <p class="text-xs text-gray-500 mt-1">
                {{ newRacewar !== undefined ? racewarLabel(newRacewar) : racewarLabel(currentRacewar) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Warning -->
        <div class="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle class="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-sm text-amber-300 font-medium">Manual Override Warning</p>
            <p class="text-xs text-gray-400 mt-1">
              {{ isReset
                ? 'This will reset all racewar progress and set the level cap back to 25. The auto-update system will resume normal operation.'
                : 'This manual change may conflict with the automatic level cap system. The MUD will continue auto-updating based on frag counts.' }}
            </p>
          </div>
        </div>

        <!-- Notes Field -->
        <div class="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
          <label class="block text-sm text-gray-400 mb-2">
            Reason for {{ isReset ? 'Reset' : 'Change' }} (Required)
          </label>
          <textarea
            v-model="notes"
            rows="3"
            class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
            :placeholder="isReset ? 'e.g., Starting new season, fixing database corruption' : 'e.g., Event override, special gameplay mode, bug fix'"
          ></textarea>
          <p v-if="notesError" class="text-xs text-red-400 mt-1">{{ notesError }}</p>
        </div>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel
          class="bg-gray-700 text-white hover:bg-gray-600 border-gray-600"
          @click="handleCancel"
        >
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction
          :class="isReset
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-blue-600 text-white hover:bg-blue-700'"
          :disabled="saving || !notes.trim()"
          @click="handleConfirm"
        >
          <span v-if="saving" class="flex items-center gap-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            {{ isReset ? 'Resetting...' : 'Updating...' }}
          </span>
          <span v-else>{{ isReset ? 'Reset Level Cap' : 'Confirm Change' }}</span>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ArrowRight, AlertTriangle } from 'lucide-vue-next'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

interface Props {
  open: boolean
  currentLevel: number
  currentRacewar: number
  newLevel: number
  newRacewar?: number
  saving?: boolean
  isReset?: boolean
}

interface Emits {
  (e: 'update:open', value: boolean): void
  (e: 'confirm', notes: string): void
  (e: 'cancel'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const notes = ref('')
const notesError = ref('')

// Reset notes when dialog opens
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      notes.value = ''
      notesError.value = ''
    }
  },
)

const racewarLabel = (racewar: number): string => {
  if (racewar === 1) return 'Good Leading'
  if (racewar === 2) return 'Evil Leading'
  return 'Neutral'
}

const handleOpenChange = (value: boolean) => {
  emit('update:open', value)
}

const handleConfirm = () => {
  if (!notes.value.trim()) {
    notesError.value = 'Please provide a reason for this change'
    return
  }
  emit('confirm', notes.value)
}

const handleCancel = () => {
  emit('cancel')
}
</script>
