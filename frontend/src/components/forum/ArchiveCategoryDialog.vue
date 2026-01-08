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
  isOpen.value = true
}

function close() {
  isOpen.value = false
}

function handleConfirm() {
  emit('confirm')
  close()
}

function handleCancel() {
  emit('cancel')
  close()
}

defineExpose({ open, close })
</script>

<template>
  <AlertDialog v-model:open="isOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Archive Category?</AlertDialogTitle>
        <AlertDialogDescription>
          <div class="space-y-2">
            <p>
              Are you sure you want to archive the category
              <strong class="text-foreground">{{ category?.name }}</strong>?
            </p>
            <p class="text-sm text-muted-foreground">
              Archived categories are hidden from users but can be restored later.
            </p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="handleCancel">Cancel</AlertDialogCancel>
        <AlertDialogAction @click="handleConfirm">
          Archive Category
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
