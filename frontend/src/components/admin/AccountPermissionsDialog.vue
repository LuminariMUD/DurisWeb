<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ type === 'role' ? 'Assign Role' : 'Grant Permission' }}</DialogTitle>
        <DialogDescription>
          {{ type === 'role'
            ? `Assign a role to ${accountName}`
            : `Grant an individual permission to ${accountName}` }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div>
          <Label>{{ type === 'role' ? 'Select Role' : 'Select Permission' }}</Label>
          <div class="border rounded-md max-h-96 overflow-y-auto mt-2">
            <div
              v-for="item in availableItems"
              :key="item.id"
              @click="selectedId = item.id"
              :class="[
                'p-3 cursor-pointer hover:bg-accent transition-colors',
                selectedId === item.id && 'bg-accent'
              ]"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <p class="font-medium">{{ item.name }}</p>
                  <p v-if="item.description" class="text-sm text-muted-foreground">{{ item.description }}</p>
                  <p v-if="type === 'role' && 'permission_count' in item" class="text-xs text-muted-foreground mt-1">
                    {{ item.permission_count }} permissions
                  </p>
                </div>
                <div
                  v-if="selectedId === item.id"
                  class="w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                >
                  <div class="w-2 h-2 rounded-full bg-white"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p v-if="availableItems.length === 0" class="text-sm text-muted-foreground text-center py-4">
          No available {{ type === 'role' ? 'roles' : 'permissions' }} to assign
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleCancel">Cancel</Button>
        <Button @click="handleAssign" :disabled="!selectedId || isAssigning">
          <Loader2 v-if="isAssigning" class="w-4 h-4 mr-2 animate-spin" />
          {{ type === 'role' ? 'Assign' : 'Grant' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToast } from '@/composables/useToast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-vue-next'
import {
  useAssignRole,
  useGrantPermission,
  type Role,
  type Permission,
} from '@/composables/useAdminPermissions'

interface Props {
  open: boolean
  accountName: string
  type: 'role' | 'permission'
  availableItems: (Role | Permission)[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  assigned: []
}>()

const { success, error } = useToast()
const assignRoleMutation = useAssignRole()
const grantPermissionMutation = useGrantPermission()

const selectedId = ref<number | null>(null)
const isAssigning = ref(false)

// Reset selection when dialog opens/closes
watch(
  () => props.open,
  (newOpen) => {
    if (!newOpen) {
      selectedId.value = null
    }
  },
)

async function handleAssign() {
  if (!selectedId.value || !props.accountName) return

  isAssigning.value = true

  try {
    if (props.type === 'role') {
      await assignRoleMutation.mutateAsync({
        accountName: props.accountName,
        roleId: selectedId.value,
      })
      success('Role assigned successfully', 'Success')
    } else {
      await grantPermissionMutation.mutateAsync({
        accountName: props.accountName,
        permissionId: selectedId.value,
      })
      success('Permission granted successfully', 'Success')
    }

    emit('assigned')
    selectedId.value = null
  } catch (err: any) {
    error(
      err.response?.data?.error ||
        `Failed to ${props.type === 'role' ? 'assign role' : 'grant permission'}`,
      'Error',
    )
  } finally {
    isAssigning.value = false
  }
}

function handleCancel() {
  emit('update:open', false)
}
</script>
