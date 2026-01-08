<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Newspaper } from 'lucide-vue-next'

const router = useRouter()

const isOpen = ref(false)
const newsDate = ref('')
const newsItems = ref<string[]>([])

const STORAGE_KEY = 'lastSeenNewsDate'

function handleNewsUpdate(event: CustomEvent<{ date: string; items: string[] }>) {
  const { date, items } = event.detail

  // check if user has already seen this news
  const lastSeen = localStorage.getItem(STORAGE_KEY)
  if (lastSeen === date) {
    return
  }

  newsDate.value = date
  newsItems.value = items
  isOpen.value = true
}

function handleClose() {
  // mark as read
  if (newsDate.value) {
    localStorage.setItem(STORAGE_KEY, newsDate.value)
  }
  isOpen.value = false
}

function viewAllNews() {
  handleClose()
  router.push('/news')
}

onMounted(() => {
  window.addEventListener('news-updated', handleNewsUpdate as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('news-updated', handleNewsUpdate as EventListener)
})
</script>

<template>
  <Dialog :open="isOpen" @update:open="handleClose">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Newspaper class="h-5 w-5 text-blue-400" />
          News Update ({{ newsDate }})
        </DialogTitle>
        <DialogDescription>
          New updates have been posted!
        </DialogDescription>
      </DialogHeader>

      <div class="max-h-80 overflow-y-auto">
        <ul class="space-y-2 text-sm text-gray-300">
          <li
            v-for="(item, index) in newsItems"
            :key="index"
            class="flex items-start gap-2"
          >
            <span class="text-blue-400 mt-0.5">{{ item.startsWith('*') ? '  ' : '' }}{{ item.startsWith('*') ? '•' : '•' }}</span>
            <span>{{ item.replace(/^[-*]\s*/, '') }}</span>
          </li>
        </ul>
      </div>

      <DialogFooter class="flex-col sm:flex-row gap-2">
        <Button variant="outline" @click="handleClose" class="w-full sm:w-auto">
          Close
        </Button>
        <Button @click="viewAllNews" class="w-full sm:w-auto">
          View All News
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
