<script setup lang="ts">
import { ref } from 'vue'
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
import type { ForumCategory } from '@/types'

defineProps<{
  category: ForumCategory | null
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const isOpen = ref(false)

function open() {
  console.log('[DIALOG] open() called')
  isOpen.value = true
  console.log('[DIALOG] isOpen set to true')
}

function close() {
  console.log('[DIALOG] close() called')
  isOpen.value = false
  console.log('[DIALOG] isOpen set to false')
}

function handleConfirm() {
  console.log('[DIALOG] handleConfirm called')
  emit('confirm')
  console.log('[DIALOG] confirm event emitted')
  close()
}

function handleCancel() {
  console.log('[DIALOG] handleCancel called')
  emit('cancel')
  console.log('[DIALOG] cancel event emitted')
  close()
}

defineExpose({ open, close })
</script>

<template>
  <AlertDialog v-model:open="isOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Category?</AlertDialogTitle>
        <AlertDialogDescription>
          <div class="space-y-2">
            <p>
              Are you sure you want to permanently delete the category
              <strong class="text-foreground">{{ category?.name }}</strong>?
            </p>
            <p class="text-destructive font-semibold">
              This action cannot be undone!
            </p>
            <p class="text-sm text-muted-foreground">
              Note: Categories with child categories or threads cannot be deleted.
            </p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="handleCancel">Cancel</AlertDialogCancel>
        <AlertDialogAction
          @click="handleConfirm"
          class="bg-destructive hover:bg-destructive/90"
        >
          Delete Category
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
