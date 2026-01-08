<script setup lang="ts">
import { computed } from 'vue';
import { type ZoneStats, EPIC_TYPE_LABELS } from '@/composables/useZones';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Pie } from 'vue-chartjs';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, type ChartData, type ChartOptions } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);

const props = defineProps<{
  stats?: ZoneStats;
}>();

// Epic Type Distribution Chart
const epicTypeChartData = computed<ChartData<'pie'>>(() => {
  if (!props.stats) {
    return { labels: [], datasets: [] };
  }

  return {
    labels: props.stats.epicTypeDistribution.map(item => EPIC_TYPE_LABELS[item.type as 0 | 1 | 2 | 3].name),
    datasets: [
      {
        data: props.stats.epicTypeDistribution.map(item => item.count),
        backgroundColor: [
          'rgba(156, 163, 175, 0.8)', // Gray for None
          'rgba(59, 130, 246, 0.8)',  // Blue for Small
          'rgba(139, 92, 246, 0.8)',  // Purple for Large
          'rgba(236, 72, 153, 0.8)',  // Pink for Monolith
        ],
        borderColor: [
          'rgba(156, 163, 175, 1)',
          'rgba(59, 130, 246, 1)',
          'rgba(139, 92, 246, 1)',
          'rgba(236, 72, 153, 1)',
        ],
        borderWidth: 2,
      },
    ],
  };
});

// Alignment Distribution Chart
const alignmentChartData = computed<ChartData<'pie'>>(() => {
  if (!props.stats || !props.stats.alignmentDistribution.length) {
    return { labels: [], datasets: [] };
  }

  // Group alignments: Evil (-5 to -1), Neutral (0), Good (1 to 5)
  const evil = props.stats.alignmentDistribution.filter(item => item.alignment < 0).reduce((sum, item) => sum + item.count, 0);
  const neutral = props.stats.alignmentDistribution.find(item => item.alignment === 0)?.count || 0;
  const good = props.stats.alignmentDistribution.filter(item => item.alignment > 0).reduce((sum, item) => sum + item.count, 0);

  return {
    labels: ['Evil', 'Neutral', 'Good'],
    datasets: [
      {
        data: [evil, neutral, good],
        backgroundColor: [
          'rgba(239, 68, 68, 0.8)',   // Red for Evil
          'rgba(156, 163, 175, 0.8)', // Gray for Neutral
          'rgba(59, 130, 246, 0.8)',  // Blue for Good
        ],
        borderColor: [
          'rgba(239, 68, 68, 1)',
          'rgba(156, 163, 175, 1)',
          'rgba(59, 130, 246, 1)',
        ],
        borderWidth: 2,
      },
    ],
  };
});

const chartOptions: ChartOptions<'pie'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        color: 'rgb(156, 163, 175)',
        padding: 10,
      },
    },
    tooltip: {
      callbacks: {
        label: function(context) {
          const label = context.label || '';
          const value = context.parsed || 0;
          const total = context.dataset.data.reduce((a, b) => (a as number) + (b as number), 0) as number;
          const percentage = ((value / total) * 100).toFixed(1);
          return `${label}: ${value} (${percentage}%)`;
        },
      },
    },
    datalabels: {
      color: '#fff',
      font: {
        weight: 'bold',
        size: 14,
      },
      formatter: (value: number, context: any) => {
        const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
        const percentage = ((value / total) * 100).toFixed(1);
        return `${percentage}%`;
      },
    },
  },
};

// Format percentage
function formatPercentage(value: number, total: number): string {
  return ((value / total) * 100).toFixed(1);
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Zone Statistics</CardTitle>
      <CardDescription>Overview of zone epic settings</CardDescription>
    </CardHeader>
    <CardContent>
      <!-- Loading State -->
      <div v-if="!stats" class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Skeleton class="h-24" v-for="i in 4" :key="i" />
      </div>

      <!-- Stats Grid -->
      <div v-else class="space-y-6">
        <!-- Summary Stats -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="flex items-center justify-between p-4 border rounded-lg">
            <p class="text-sm text-muted-foreground">Total Zones</p>
            <p class="text-2xl font-bold">{{ stats.totalZones }}</p>
          </div>

          <div class="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p class="text-sm text-muted-foreground">With Epic Stones</p>
              <p class="text-xs text-muted-foreground">
                {{ formatPercentage(stats.epicZones, stats.totalZones) }}%
              </p>
            </div>
            <p class="text-2xl font-bold">{{ stats.epicZones }}</p>
          </div>

          <div class="flex items-center justify-between p-4 border rounded-lg">
            <p class="text-sm text-muted-foreground">Avg Difficulty</p>
            <p class="text-2xl font-bold">{{ Number(stats.avgDifficulty).toFixed(1) }}/10</p>
          </div>
        </div>

        <!-- Charts -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Epic Type Pie Chart -->
          <div class="border rounded-lg p-4">
            <h3 class="font-medium mb-4">Epic Type Distribution</h3>
            <div class="h-64">
              <Pie :data="epicTypeChartData" :options="chartOptions" />
            </div>
          </div>

          <!-- Alignment Pie Chart -->
          <div class="border rounded-lg p-4">
            <h3 class="font-medium mb-4">Alignment Distribution</h3>
            <div class="h-64">
              <Pie :data="alignmentChartData" :options="chartOptions" />
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
