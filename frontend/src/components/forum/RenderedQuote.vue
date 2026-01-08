<script setup lang="ts">
import PostContent from './PostContent.vue'

interface Props {
  author: string
  content: string
}

defineProps<Props>()
</script>

<template>
  <div class="border-l-4 border-primary bg-muted/20 p-3 rounded mb-3">
    <div class="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
      <span>💬</span>
      <span>Quoting {{ author }}:</span>
    </div>
    <div class="text-sm italic text-muted-foreground">
      <PostContent :content="content" />
    </div>
  </div>
</template>
