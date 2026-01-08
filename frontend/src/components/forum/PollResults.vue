<template>
  <div class="space-y-4">
    <!-- Chart Toggle -->
    <div class="flex justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        @click="showChart = !showChart"
      >
        {{ showChart ? 'Hide Chart' : 'Show Chart' }}
      </Button>
      <Button
        v-if="isActive"
        variant="outline"
        size="sm"
        @click="$emit('change-vote')"
      >
        Change Vote
      </Button>
    </div>

    <!-- Chart Display -->
    <PollResultsChart
      v-if="showChart"
      :options="options"
      :total-votes="totalVotes"
      :user-votes="userVotes"
    />

    <!-- Voters List (if public poll) -->
    <div v-if="!poll.isAnonymous" class="space-y-2 mt-4">
      <div v-for="option in options" :key="option.id">
        <div v-if="option.voters && option.voters.length > 0">
          <button
            @click="expandedOption = expandedOption === option.id ? null : option.id"
            class="text-sm text-muted-foreground hover:underline"
          >
            {{ expandedOption === option.id ? '▼' : '▶' }} <strong>{{ option.optionText }}</strong> voters ({{ option.voters.length }})
          </button>
          <div v-if="expandedOption === option.id" class="mt-2 ml-4 space-y-1">
            <div v-for="voter in option.voters" :key="voter" class="text-sm text-muted-foreground">
              • {{ voter }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Total Votes Footer -->
    <div class="pt-2 border-t text-sm text-muted-foreground">
      Total votes: {{ totalVotes }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import PollResultsChart from './PollResultsChart.vue'
import type { ForumPoll, PollOption } from '@/types'

defineProps<{
  poll: ForumPoll
  options: PollOption[]
  totalVotes: number
  userVotes: number[]
  isActive: boolean
}>()

defineEmits<{
  'change-vote': []
}>()

const showChart = ref(true)
const expandedOption = ref<number | null>(null)
</script>
