<script setup lang="ts">
import { computed } from 'vue'
import type { ForumPost } from '@/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface Props {
  post: ForumPost
  isAuthor: boolean
  isModerator: boolean
  isAuthenticated: boolean
  hideReply?: boolean // Hide the Reply option (for thread opening post)
}

const props = defineProps<Props>()

const emit = defineEmits<{
  edit: []
  delete: []
  reply: []
  quote: []
}>()

// Determine which actions are available
const canEdit = computed(() => props.isAuthor)
const canDelete = computed(() => props.isAuthor || props.isModerator)
const canReply = computed(() => props.isAuthenticated && !props.hideReply)
const canQuote = computed(() => props.isAuthenticated)

// Check if any actions are available
const hasActions = computed(
  () => canEdit.value || canDelete.value || canReply.value || canQuote.value,
)
</script>

<template>
  <DropdownMenu v-if="hasActions">
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="sm" class="h-8 w-8 p-0">
        <span class="text-lg">⋯</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <!-- Reply Action -->
      <DropdownMenuItem v-if="canReply" @click="emit('reply')">
        <span class="mr-2">💬</span>
        Reply
      </DropdownMenuItem>

      <!-- Quote Action -->
      <DropdownMenuItem v-if="canQuote" @click="emit('quote')">
        <span class="mr-2">📋</span>
        Quote
      </DropdownMenuItem>

      <!-- Separator before destructive actions -->
      <DropdownMenuSeparator v-if="(canEdit || canDelete) && (canReply || canQuote)" />

      <!-- Edit Action -->
      <DropdownMenuItem v-if="canEdit" @click="emit('edit')">
        <span class="mr-2">✏️</span>
        Edit
      </DropdownMenuItem>

      <!-- Delete Action -->
      <DropdownMenuItem v-if="canDelete" @click="emit('delete')" class="text-destructive">
        <span class="mr-2">🗑️</span>
        Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
