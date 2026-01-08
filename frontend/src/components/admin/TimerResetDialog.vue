<template>
  <AlertDialog :open="open" @update:open="handleOpenChange">
    <AlertDialogContent class="bg-gray-800 border border-gray-700 max-w-lg">
      <AlertDialogHeader>
        <AlertDialogTitle class="text-white text-xl">
          {{ isResetAll ? 'Reset All Timers?' : `Reset ${timerNames.length} Timer(s)?` }}
        </AlertDialogTitle>
        <AlertDialogDescription class="text-gray-400">
          {{ isResetAll
            ? 'This will reset ALL game timers to the current time.'
            : 'This will reset the selected timer(s) to the current time.' }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="space-y-4 py-4">
        <!-- Timers List -->
        <div class="bg-gray-900/50 rounded-lg p-3 max-h-48 overflow-y-auto">
          <p class="text-sm text-gray-400 mb-2">
            {{ isResetAll ? 'All Timers' : 'Timers to Reset' }}
          </p>
          <ul class="space-y-1">
            <li
              v-for="timer in timerNames"
              :key="timer"
              class="text-sm font-mono text-white flex items-center gap-2"
            >
              <Clock class="w-3 h-3 text-blue-400" />
              {{ timer }}
            </li>
          </ul>
        </div>

        <!-- Warning -->
        <div class="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle class="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-sm text-amber-300 font-medium">Game Impact Warning</p>
            <p class="text-xs text-gray-400 mt-1">
              {{ isResetAll
                ? 'Resetting all timers may trigger multiple game events simultaneously. This could impact server performance and player experience.'
                : 'Resetting these timers will trigger their associated game events earlier than scheduled.' }}
            </p>
          </div>
        </div>

        <!-- Notes Field -->
        <div class="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
          <label class="block text-sm text-gray-400 mb-2">
            Reason for Reset (Required)
          </label>
          <textarea
            v-model="notes"
            rows="3"
            class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
            :placeholder="isResetAll
              ? 'e.g., Starting new event, fixing stuck timers, server maintenance'
              : 'e.g., Manual event trigger, fixing timer bug, special event'"
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
          :class="isResetAll
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-blue-600 text-white hover:bg-blue-700'"
          :disabled="saving || !notes.trim()"
          @click="handleConfirm"
        >
          <span v-if="saving" class="flex items-center gap-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Resetting...
          </span>
          <span v-else>{{ isResetAll ? 'Reset All Timers' : 'Reset Timers' }}</span>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Clock, AlertTriangle } from 'lucide-vue-next';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  timerNames: string[];
  saving?: boolean;
  isResetAll?: boolean;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'confirm', notes: string): void;
  (e: 'cancel'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const notes = ref('');
const notesError = ref('');

// Reset notes when dialog opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    notes.value = '';
    notesError.value = '';
  }
});

const handleOpenChange = (value: boolean) => {
  emit('update:open', value);
};

const handleConfirm = () => {
  if (!notes.value.trim()) {
    notesError.value = 'Please provide a reason for resetting these timers';
    return;
  }
  emit('confirm', notes.value);
};

const handleCancel = () => {
  emit('cancel');
};
</script>
