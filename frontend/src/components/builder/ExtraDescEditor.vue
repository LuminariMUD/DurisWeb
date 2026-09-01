<script setup lang="ts">
import { ref } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import { Plus, Trash2, ChevronDown, ChevronRight, FileText } from 'lucide-vue-next'
import AnsiEditor from '@/components/builder/AnsiEditor.vue'
import type { ExtraDescription } from '@/types'

const props = defineProps<{
  extras: ExtraDescription[]
}>()

const emit = defineEmits<{
  (e: 'update', extras: ExtraDescription[]): void
}>()

// Track which extras are expanded
const expandedExtras = ref<Set<number>>(new Set([0])) // First one expanded by default

// Delete confirmation
const deleteDialogOpen = ref(false)
const deletingIndex = ref<number | null>(null)

// Toggle expand/collapse
function toggleExtra(index: number) {
  if (expandedExtras.value.has(index)) {
    expandedExtras.value.delete(index)
  } else {
    expandedExtras.value.add(index)
  }
  // Force reactivity
  expandedExtras.value = new Set(expandedExtras.value)
}

// Add new extra description
function addExtra() {
  const newExtras = [...props.extras, { keywords: '', description: '' }]
  emit('update', newExtras)
  // Expand the new one
  expandedExtras.value.add(newExtras.length - 1)
  expandedExtras.value = new Set(expandedExtras.value)
}

// Update keywords
function updateKeywords(index: number, value: string) {
  const newExtras = [...props.extras]
  if (newExtras[index]) {
    newExtras[index] = { ...newExtras[index], keywords: value }
    emit('update', newExtras)
  }
}

// Update description
function updateDescription(index: number, value: string) {
  const newExtras = [...props.extras]
  if (newExtras[index]) {
    newExtras[index] = { ...newExtras[index], description: value }
    emit('update', newExtras)
  }
}

// Confirm delete
function confirmDelete(index: number) {
  deletingIndex.value = index
  deleteDialogOpen.value = true
}

// Delete extra description
function deleteExtra() {
  if (deletingIndex.value === null) return

  const newExtras = props.extras.filter((_, i) => i !== deletingIndex.value)
  emit('update', newExtras)

  // Update expanded set (shift indices down)
  const newExpanded = new Set<number>()
  for (const idx of expandedExtras.value) {
    if (idx < deletingIndex.value) {
      newExpanded.add(idx)
    } else if (idx > deletingIndex.value) {
      newExpanded.add(idx - 1)
    }
  }
  expandedExtras.value = newExpanded

  deleteDialogOpen.value = false
  deletingIndex.value = null
}

// Get preview text for collapsed state
function getPreviewText(extra: ExtraDescription): string {
  const stripped = extra.description.replace(/&[+=-][A-Za-z]|&[nN]/g, '')
  if (stripped.length <= 60) return stripped
  return stripped.substring(0, 60) + '...'
}
</script>

<template>
  <div class="space-y-3">
    <!-- Empty State -->
    <div
      v-if="extras.length === 0"
      class="text-center py-8 border-2 border-dashed rounded-lg"
    >
      <FileText class="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
      <p class="text-muted-foreground mb-4">No extra descriptions defined</p>
      <Button variant="outline" @click="addExtra">
        <Plus class="h-4 w-4 mr-2" />
        Add Extra Description
      </Button>
    </div>

    <!-- Extra Descriptions List -->
    <template v-else>
      <Card v-for="(extra, index) in extras" :key="index">
        <Collapsible :open="expandedExtras.has(index)">
          <CollapsibleTrigger
            class="w-full"
            @click="toggleExtra(index)"
          >
            <div class="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <ChevronDown v-if="expandedExtras.has(index)" class="h-4 w-4 shrink-0" />
                <ChevronRight v-else class="h-4 w-4 shrink-0" />
                <div class="min-w-0 flex-1 text-left">
                  <div class="flex items-center gap-2">
                    <code class="text-sm bg-muted px-2 py-0.5 rounded truncate">
                      {{ extra.keywords || '(no keywords)' }}
                    </code>
                  </div>
                  <p v-if="!expandedExtras.has(index)" class="text-xs text-muted-foreground truncate mt-1">
                    {{ getPreviewText(extra) || '(no description)' }}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 shrink-0 text-destructive"
                @click.stop="confirmDelete(index)"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent class="pt-0 space-y-4">
              <!-- Keywords -->
              <div class="space-y-2">
                <Label :for="`extra-keywords-${index}`">Keywords</Label>
                <Input
                  :id="`extra-keywords-${index}`"
                  :model-value="extra.keywords"
                  @update:model-value="updateKeywords(index, String($event))"
                  placeholder="painting mural artwork..."
                />
                <p class="text-xs text-muted-foreground">
                  Space-separated keywords that trigger this description (e.g., "look painting")
                </p>
              </div>

              <!-- Description -->
              <div class="space-y-2">
                <Label>Description</Label>
                <AnsiEditor
                  :model-value="extra.description"
                  @update:model-value="updateDescription(index, $event)"
                  placeholder="Enter the detailed description..."
                  min-height="150px"
                />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <!-- Add Button -->
      <Button variant="outline" size="sm" @click="addExtra" class="w-full">
        <Plus class="h-4 w-4 mr-2" />
        Add Extra Description
      </Button>
    </template>

    <!-- Delete Confirmation Dialog -->
    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Extra Description</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this extra description? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="deleteExtra" class="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
