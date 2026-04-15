<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="bg-gray-800 border border-red-500 max-w-2xl">
      <DialogHeader>
        <DialogTitle class="text-white text-2xl flex items-center gap-2">
          <AlertTriangle class="w-6 h-6 text-red-500" />
          CONFIRM PLAYER WIPE
        </DialogTitle>
        <DialogDescription class="text-red-400 font-semibold">
          This action is EXTREMELY DANGEROUS and cannot be undone!
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-6 py-4">
        <!-- Warning Banner -->
        <div class="bg-red-900/30 border-2 border-red-500 rounded-lg p-4">
          <div class="flex items-start gap-3">
            <AlertTriangle class="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div class="space-y-2">
              <p class="text-red-300 font-semibold">You are about to wipe ALL player data!</p>
              <ul class="text-sm text-red-200 space-y-1 list-disc list-inside">
                <li>All character data, items, lockers, pets, skills, and mail will be hard-deleted</li>
                <li>Accounts are NOT touched — players can log in and re-roll</li>
                <li>This operation is logged and irreversible</li>
                <li v-if="excludedCount > 0" class="text-yellow-300 font-semibold">
                  {{ excludedCount }} player(s) will be EXCLUDED from this wipe
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Excluded Players Display (if any) -->
        <div v-if="excludedCount > 0" class="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-4">
          <div class="flex items-center gap-2 mb-2">
            <Shield class="w-5 h-5 text-yellow-400" />
            <h3 class="text-yellow-300 font-semibold">Protected Players ({{ excludedCount }})</h3>
          </div>
          <p class="text-sm text-gray-400 mb-3">
            The following players will NOT be affected by the wipe:
          </p>
          <div class="max-h-40 overflow-y-auto space-y-1">
            <div
              v-for="player in excludedPlayers"
              :key="player.pid"
              class="text-sm bg-gray-900/50 px-3 py-1.5 rounded"
            >
              <span class="font-mono text-white">[{{ player.level }}] {{ player.name }}</span>
              (<span v-html="player.classHtml"></span>)
            </div>
          </div>
        </div>

        <!-- Reason Input -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-300">
            Reason for Wipe <span class="text-red-400">*</span>
          </label>
          <Textarea
            v-model="reason"
            placeholder="Provide a detailed explanation for why this wipe is necessary..."
            :disabled="saving"
            class="bg-gray-900 border-gray-700 text-white placeholder-gray-500 min-h-[100px]"
          />
          <p v-if="reasonError" class="text-sm text-red-400">{{ reasonError }}</p>
        </div>

        <!-- Typed Confirmation -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-300">
            Type <span class="font-mono text-red-400">WIPE PLAYERS</span> to confirm <span class="text-red-400">*</span>
          </label>
          <Input
            v-model="confirmText"
            placeholder="Type WIPE PLAYERS here"
            :disabled="saving"
            class="bg-gray-900 border-gray-700 text-white placeholder-gray-500 font-mono text-lg"
          />
        </div>

        <!-- Countdown Timer (after all fields filled) -->
        <div
          v-if="isFormValid && countdown > 0"
          class="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Clock class="w-5 h-5 text-yellow-400" />
              <span class="text-yellow-300 font-semibold">Safety Countdown</span>
            </div>
            <span class="text-2xl font-bold text-yellow-400 font-mono">{{ countdown }}s</span>
          </div>
          <p class="text-sm text-gray-400 mt-2">
            Please wait {{ countdown }} seconds before executing the wipe.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          @click="handleCancel"
          :disabled="saving"
          class="border-gray-600 text-gray-300 hover:bg-gray-700"
        >
          Cancel
        </Button>
        <Button
          @click="handleConfirm"
          :disabled="!canExecute || saving"
          class="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
        >
          <Loader2 v-if="saving" class="w-4 h-4 mr-2 animate-spin" />
          {{ saving ? 'Executing Wipe...' : 'Execute Wipe' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Shield, Clock, Loader2 } from 'lucide-vue-next';

interface Player {
  pid: number;
  name: string;
  level: number;
  class: string;
  classHtml: string;
  spec: string;
  specHtml: string;
  race: string;
  raceHtml: string;
  guild: string;
  guildHtml: string;
  wealth: number;
}

interface Props {
  open: boolean;
  excludedPlayers: Player[];
  saving: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  'confirm': [reason: string];
  'cancel': [];
}>();

const reason = ref('');
const confirmText = ref('');
const countdown = ref(10);
const reasonError = ref('');

const excludedCount = computed(() => props.excludedPlayers.length);

const isFormValid = computed(() => {
  return reason.value.trim().length >= 10 && confirmText.value === 'WIPE PLAYERS';
});

const canExecute = computed(() => {
  return isFormValid.value && countdown.value === 0 && !props.saving;
});

let countdownInterval: ReturnType<typeof setInterval> | null = null;

const stopCountdown = () => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
};

watch(isFormValid, (valid) => {
  if (valid && countdown.value === 10 && !countdownInterval) {
    countdownInterval = setInterval(() => {
      countdown.value--;
      if (countdown.value <= 0) {
        stopCountdown();
      }
    }, 1000);
  }
});

watch(() => props.open, (open) => {
  if (!open) {
    stopCountdown();
    reason.value = '';
    confirmText.value = '';
    countdown.value = 10;
    reasonError.value = '';
  }
});

onBeforeUnmount(() => {
  stopCountdown();
});

const handleConfirm = () => {
  if (reason.value.trim().length < 10) {
    reasonError.value = 'Reason must be at least 10 characters';
    return;
  }
  if (confirmText.value !== 'WIPE PLAYERS') return;
  if (countdown.value > 0) return;

  reasonError.value = '';
  emit('confirm', reason.value.trim());
};

const handleCancel = () => {
  emit('cancel');
  emit('update:open', false);
};
</script>
