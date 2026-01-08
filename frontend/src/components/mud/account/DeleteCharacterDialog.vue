<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMudConnection } from '@/composables/useMudConnection'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Trash2, AlertTriangle } from 'lucide-vue-next'
import type { MudCharacterInfo } from '@/types/mud'

const props = defineProps<{
  character: MudCharacterInfo
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'deleted'): void
}>()

const { deleteCharacter } = useMudConnection()

const confirmationText = ref('')
const isDeleting = ref(false)

const isConfirmed = computed(() => {
  return confirmationText.value.toLowerCase() === props.character.name.toLowerCase()
})

const handleDelete = async () => {
  if (!isConfirmed.value) return

  isDeleting.value = true

  try {
    deleteCharacter(props.character.name, true)
    // The deletion will be confirmed by the server response
    // which will update the store
    emit('deleted')
  } finally {
    isDeleting.value = false
    confirmationText.value = ''
  }
}

const handleClose = () => {
  confirmationText.value = ''
  emit('close')
}
</script>

<template>
  <AlertDialog :open="open" @update:open="handleClose">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle class="flex items-center gap-2 text-destructive">
          <Trash2 class="h-5 w-5" />
          Delete Character
        </AlertDialogTitle>
        <AlertDialogDescription>
          <Alert variant="destructive" class="mt-4">
            <AlertTriangle class="h-4 w-4" />
            <AlertDescription>
              <p class="font-medium">This action cannot be undone!</p>
              <p class="mt-1">
                You are about to permanently delete
                <strong>{{ character.name }}</strong>
                (Level {{ character.level }} {{ character.race }} {{ character.class }}).
              </p>
              <p class="mt-1">All equipment, gold, and progress will be lost forever.</p>
            </AlertDescription>
          </Alert>

          <div class="mt-4 space-y-2">
            <Label for="confirm-name">
              Type <strong>{{ character.name }}</strong> to confirm deletion:
            </Label>
            <Input
              id="confirm-name"
              v-model="confirmationText"
              :placeholder="character.name"
              :disabled="isDeleting"
              class="font-mono"
            />
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="isDeleting" @click="handleClose">
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction
          :disabled="!isConfirmed || isDeleting"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          @click="handleDelete"
        >
          <Trash2 class="h-4 w-4 mr-2" />
          {{ isDeleting ? 'Deleting...' : 'Delete Character' }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
