<template>
  <AlertDialog :open="open" @update:open="handleOpenChange">
    <AlertDialogContent class="bg-gray-800 border border-gray-700 max-w-md">
      <AlertDialogHeader>
        <AlertDialogTitle class="text-white text-xl">Confirm Property Change</AlertDialogTitle>
        <AlertDialogDescription class="text-gray-400">
          You are about to modify a game property. This change will be saved immediately.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="space-y-4 py-4">
        <!-- Property Key -->
        <div class="bg-gray-900/50 rounded-lg p-3">
          <p class="text-sm text-gray-400 mb-1">Property</p>
          <p class="text-sm font-mono text-white">{{ propertyKey }}</p>
        </div>

        <!-- Value Change -->
        <div class="bg-gray-900/50 rounded-lg p-3">
          <p class="text-sm text-gray-400 mb-2">Value Change</p>
          <div class="flex items-center gap-3">
            <div class="flex-1">
              <p class="text-xs text-gray-500">Current</p>
              <p class="text-lg font-mono text-blue-400">{{ oldValue }}</p>
            </div>
            <ArrowRight class="w-5 h-5 text-gray-500" />
            <div class="flex-1">
              <p class="text-xs text-gray-500">New</p>
              <p class="text-lg font-mono text-green-400">{{ newValue }}</p>
            </div>
          </div>
        </div>

        <!-- Warning -->
        <div class="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle class="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-sm text-amber-300 font-medium">MUD Restart Required</p>
            <p class="text-xs text-gray-400 mt-1">
              You must restart the MUD server for this change to take effect.
            </p>
          </div>
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
          class="bg-blue-600 text-white hover:bg-blue-700"
          :disabled="saving"
          @click="handleConfirm"
        >
          <span v-if="saving" class="flex items-center gap-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Saving...
          </span>
          <span v-else>Confirm Change</span>
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { ArrowRight, AlertTriangle } from 'lucide-vue-next';
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
  propertyKey: string;
  oldValue: number;
  newValue: number;
  saving?: boolean;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

const handleOpenChange = (value: boolean) => {
  emit('update:open', value);
};

const handleConfirm = () => {
  emit('confirm');
};

const handleCancel = () => {
  emit('cancel');
};
</script>
