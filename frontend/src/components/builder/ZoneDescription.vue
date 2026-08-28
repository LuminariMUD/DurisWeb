<script setup lang="ts">
import { ref } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { builderApi } from '@/services/api'
import { useToast } from '@/composables/useToast'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import TipTapEditor from '@/components/forum/editor/TipTapEditor.vue'
import { Edit, Save, X, AlertCircle } from 'lucide-vue-next'
import type { ZoneInfoUpdate } from '@/types'
import { sanitizeChangelogContent } from '@/utils/sanitizeChangelogContent'

const props = defineProps<{
  zoneId: string
  zoneName: string
  canEdit: boolean
}>()

const toast = useToast()
const queryClient = useQueryClient()

// Edit mode state
const isEditing = ref(false)
const editContent = ref('')

// Fetch zone info
const { data: zoneInfo, isLoading, error } = useQuery({
  queryKey: ['zone-info', props.zoneId],
  queryFn: () => builderApi.getZoneInfo(props.zoneId),
})

// Save mutation
const saveMutation = useMutation({
  mutationFn: (update: ZoneInfoUpdate) => builderApi.updateZoneInfo(props.zoneId, update),
  onSuccess: () => {
    toast.success('Zone description saved')
    queryClient.invalidateQueries({ queryKey: ['zone-info', props.zoneId] })
    isEditing.value = false
  },
  onError: (err: Error) => {
    toast.error(`Failed to save: ${err.message}`)
  },
})

// Start editing
function startEdit() {
  editContent.value = zoneInfo.value?.descriptionHtml || ''
  isEditing.value = true
}

// Cancel editing
function cancelEdit() {
  isEditing.value = false
  editContent.value = ''
}

// Save changes
function saveChanges() {
  saveMutation.mutate({
    description: editContent.value.replace(/<[^>]+>/g, ''), // Strip HTML for plain text
    descriptionHtml: editContent.value,
  })
}
</script>

<template>
  <div class="p-6">
    <!-- Loading -->
    <div v-if="isLoading">
      <Skeleton class="h-6 w-32 mb-4" />
      <Skeleton class="h-48 w-full" />
    </div>

    <!-- Error -->
    <Alert v-else-if="error" variant="destructive">
      <AlertCircle class="h-4 w-4" />
      <AlertDescription>
        Failed to load zone description.
      </AlertDescription>
    </Alert>

    <!-- Content -->
    <div v-else>
      <!-- Header with edit button -->
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Zone Description</h3>
        <div v-if="canEdit && !isEditing">
          <Button variant="outline" size="sm" @click="startEdit">
            <Edit class="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
        <div v-else-if="isEditing" class="flex gap-2">
          <Button variant="outline" size="sm" @click="cancelEdit" :disabled="saveMutation.isPending.value">
            <X class="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button size="sm" @click="saveChanges" :disabled="saveMutation.isPending.value">
            <Save class="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      <!-- Edit mode -->
      <div v-if="isEditing" class="space-y-4">
        <TipTapEditor
          v-model="editContent"
          placeholder="Describe this zone... You can use MUD color codes for formatting."
          :max-length="10000"
        />
        <p class="text-xs text-muted-foreground">
          Use the MUD Colors button in the toolbar to add color formatting that will render in the zone builder.
        </p>
      </div>

      <!-- View mode -->
      <div v-else>
        <div
          v-if="zoneInfo?.descriptionHtml"
          class="prose prose-invert max-w-none p-4 bg-muted/30 rounded-lg"
          v-html="sanitizeChangelogContent(zoneInfo.descriptionHtml)"
        />
        <div v-else class="text-muted-foreground text-center py-12 bg-muted/30 rounded-lg">
          <p class="mb-2">No description has been added for this zone yet.</p>
          <Button v-if="canEdit" variant="outline" size="sm" @click="startEdit">
            <Edit class="h-4 w-4 mr-2" />
            Add Description
          </Button>
        </div>
      </div>

      <!-- Zone metadata -->
      <div v-if="zoneInfo" class="mt-6 pt-6 border-t">
        <h4 class="text-sm font-medium mb-3">Zone Information</h4>
        <dl class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt class="text-muted-foreground">Owner</dt>
            <dd class="font-medium">{{ zoneInfo.ownerAccount }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Created</dt>
            <dd>{{ new Date(zoneInfo.createdAt).toLocaleDateString() }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Last Updated</dt>
            <dd>{{ new Date(zoneInfo.updatedAt).toLocaleDateString() }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>
