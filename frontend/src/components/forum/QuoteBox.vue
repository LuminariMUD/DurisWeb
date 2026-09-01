<script setup lang="ts">
interface Props {
  authorName?: string
  content: string
}

withDefaults(defineProps<Props>(), {
  authorName: 'Unknown',
})
</script>

<template>
  <div class="border-l-4 border-primary bg-muted/30 p-3 rounded mb-3">
    <div class="text-xs text-muted-foreground mb-1">
      <span class="font-semibold">{{ authorName }}</span> wrote:
    </div>
    <div class="text-sm text-muted-foreground italic line-clamp-3">
      {{ content }}
    </div>
  </div>
</template>
