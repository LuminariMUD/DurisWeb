<script setup lang="ts">
import { computed } from 'vue'
import { useMudStore } from '@/stores/mudStore'
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
import { Skull, DoorOpen, AlertTriangle, LogOut } from 'lucide-vue-next'

const store = useMudStore()

const isOpen = computed(() => store.showReturnDialog)
const reason = computed(() => store.accountMenuReason)

const reasonConfig = computed(() => {
  switch (reason.value) {
    case 'death':
      return {
        icon: Skull,
        title: 'You Have Died',
        description: 'Your character has fallen in battle.',
        iconClass: 'text-red-500',
      }
    case 'rent':
      return {
        icon: DoorOpen,
        title: 'Character Rented',
        description: 'Your character has safely rented at an inn.',
        iconClass: 'text-green-500',
      }
    case 'quit':
      return {
        icon: LogOut,
        title: 'Character Quit',
        description: 'Your character has left the game.',
        iconClass: 'text-blue-500',
      }
    case 'suicide':
      return {
        icon: AlertTriangle,
        title: 'Character Deleted',
        description: 'Your character has been permanently deleted.',
        iconClass: 'text-yellow-500',
      }
    default:
      return {
        icon: DoorOpen,
        title: 'Return to Menu',
        description: 'Your character has left the game.',
        iconClass: 'text-muted-foreground',
      }
  }
})

const handleContinue = () => {
  store.confirmReturnToMenu()
}

const handleCancel = () => {
  store.cancelReturnToMenu()
}
</script>

<template>
  <AlertDialog :open="isOpen">
    <AlertDialogContent class="max-w-md">
      <AlertDialogHeader>
        <div class="flex flex-col items-center text-center gap-4">
          <div :class="['p-4 rounded-full bg-muted', reasonConfig.iconClass]">
            <component :is="reasonConfig.icon" class="h-12 w-12" />
          </div>
          <AlertDialogTitle class="text-2xl">
            {{ reasonConfig.title }}
          </AlertDialogTitle>
          <AlertDialogDescription class="text-base">
            {{ reasonConfig.description }}
          </AlertDialogDescription>
        </div>
      </AlertDialogHeader>
      <AlertDialogFooter class="mt-6 sm:justify-center gap-2">
        <AlertDialogCancel @click="handleCancel" class="!bg-destructive !text-white !border-destructive hover:!bg-red-700">
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction @click="handleContinue">
          Continue to Account Menu
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
