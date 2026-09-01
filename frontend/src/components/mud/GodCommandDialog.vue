<script setup lang="ts">
import { ref, watch, provide } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import GodCommandPalette from './GodCommandPalette.vue'
import GodCommandForm from './GodCommandForm.vue'
import { useGodCommands } from './god-commands/useGodCommands'
import type { GodCommand, RecentGodCommand } from './god-commands/types'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const godCommands = useGodCommands()

// Provide god commands to child components
provide('godCommands', godCommands)

// View state: 'palette' | 'form'
const view = ref<'palette' | 'form'>('palette')

// Confirmation dialog for dangerous commands
const showConfirmation = ref(false)

// Reset state when dialog closes
watch(
  () => props.open,
  (open) => {
    if (open) {
      // Refresh WHO list when dialog opens
      godCommands.refreshWhoList()
    } else {
      view.value = 'palette'
      godCommands.searchQuery.value = ''
      godCommands.cancelExecution()
    }
  },
)

function handleCommandSelect(command: GodCommand) {
  godCommands.selectCommand(command)

  if (command.params.length > 0) {
    // Has parameters, show form
    view.value = 'form'
  } else {
    // No parameters, execute immediately (or confirm if dangerous)
    if (command.dangerous) {
      showConfirmation.value = true
    } else {
      executeAndClose()
    }
  }
}

function handleBack() {
  view.value = 'palette'
  godCommands.cancelExecution()
}

function handleExecute() {
  const command = godCommands.execution.value?.command
  if (command?.dangerous) {
    showConfirmation.value = true
  } else {
    executeAndClose()
  }
}

function executeAndClose() {
  if (godCommands.executeCommand()) {
    emit('update:open', false)
  }
}

function handleConfirmExecute() {
  showConfirmation.value = false
  executeAndClose()
}

function handleCancelConfirm() {
  showConfirmation.value = false
}

function handleRecentExecute(recent: RecentGodCommand) {
  godCommands.executeRecent(recent)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[600px] max-h-[80vh] p-0 overflow-hidden gap-0">
      <!-- Header -->
      <DialogHeader class="px-4 py-3 border-b">
        <DialogTitle class="text-lg font-semibold flex items-center gap-2">
          <template v-if="view === 'palette'">
            God Commands
          </template>
          <template v-else-if="godCommands.execution.value">
            <button
              class="text-muted-foreground hover:text-foreground transition-colors"
              @click="handleBack"
            >
              &larr;
            </button>
            {{ godCommands.execution.value.command.name.toUpperCase() }}
          </template>
        </DialogTitle>
      </DialogHeader>

      <!-- Content -->
      <div class="overflow-hidden">
        <!-- Palette View -->
        <GodCommandPalette
          v-if="view === 'palette'"
          @select="handleCommandSelect"
          @execute-recent="handleRecentExecute"
        />

        <!-- Form View -->
        <GodCommandForm
          v-else-if="godCommands.execution.value"
          @back="handleBack"
          @execute="handleExecute"
        />
      </div>
    </DialogContent>
  </Dialog>

  <!-- Confirmation Dialog for Dangerous Commands -->
  <AlertDialog :open="showConfirmation">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirm Dangerous Command</AlertDialogTitle>
        <AlertDialogDescription>
          <p class="mb-2">You are about to execute a dangerous command:</p>
          <code class="block bg-muted px-3 py-2 rounded text-sm font-mono">
            {{ godCommands.execution.value?.preview }}
          </code>
          <p v-if="godCommands.execution.value?.command.help" class="mt-2 text-yellow-600 dark:text-yellow-400">
            {{ godCommands.execution.value.command.help }}
          </p>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="handleCancelConfirm">Cancel</AlertDialogCancel>
        <AlertDialogAction
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          @click="handleConfirmExecute"
        >
          Execute
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
