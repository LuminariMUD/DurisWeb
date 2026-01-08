// Global Progress State for Top Progress Bar
// Singleton pattern for managing multiple concurrent progress tasks

import { ref, computed, type Ref, type ComputedRef } from 'vue'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

// Configure NProgress
NProgress.configure({
  showSpinner: false,
  trickle: true,
  trickleSpeed: 200,
  minimum: 0.08,
  easing: 'ease',
  speed: 350,
})

export interface ProgressTask {
  id: string
  label: string
  progress: number // 0-100
  isIndeterminate: boolean
}

// Singleton state - shared across all consumers
const tasks: Ref<Map<string, ProgressTask>> = ref(new Map())

export interface UseGlobalProgressReturn {
  tasks: Ref<Map<string, ProgressTask>>
  addTask: (id: string, label: string, isIndeterminate?: boolean) => void
  updateTask: (id: string, progress: number) => void
  completeTask: (id: string) => void
  removeTask: (id: string) => void
  hasActiveTasks: ComputedRef<boolean>
  aggregateProgress: ComputedRef<number>
  startTopBar: () => void
  finishTopBar: () => void
  failTopBar: () => void
}

// Control the top progress bar using NProgress
const startTopBar = (): void => {
  NProgress.start()
}

const finishTopBar = (): void => {
  NProgress.done()
}

const failTopBar = (): void => {
  // NProgress doesn't have a fail method, so we just complete it
  // We can add custom styling for errors if needed
  NProgress.done()
}

export function useGlobalProgress(): UseGlobalProgressReturn {
  // Add a new task to track
  const addTask = (id: string, label: string, isIndeterminate = false): void => {
    tasks.value.set(id, {
      id,
      label,
      progress: 0,
      isIndeterminate,
    })
    // Start top bar if this is the first task
    if (tasks.value.size === 1) {
      startTopBar()
    }
  }

  // Update progress for a task
  const updateTask = (id: string, progress: number): void => {
    const task = tasks.value.get(id)
    if (task) {
      task.progress = Math.min(100, Math.max(0, progress))
      tasks.value.set(id, task)
      // Update NProgress with aggregate progress
      const aggregate = aggregateProgress.value
      if (aggregate > 0) {
        NProgress.set(aggregate / 100)
      }
    }
  }

  // Mark a task as complete and remove it
  const completeTask = (id: string): void => {
    tasks.value.delete(id)
    // Finish top bar if no more tasks
    if (tasks.value.size === 0) {
      finishTopBar()
    }
  }

  // Remove a task without completion animation
  const removeTask = (id: string): void => {
    tasks.value.delete(id)
    if (tasks.value.size === 0) {
      failTopBar()
    }
  }

  // Check if there are any active tasks
  const hasActiveTasks = computed(() => tasks.value.size > 0)

  // Calculate aggregate progress from all tasks
  const aggregateProgress = computed(() => {
    if (tasks.value.size === 0) return 0

    let totalProgress = 0
    let count = 0

    tasks.value.forEach((task) => {
      if (!task.isIndeterminate) {
        totalProgress += task.progress
        count++
      }
    })

    return count > 0 ? Math.round(totalProgress / count) : 0
  })

  return {
    tasks,
    addTask,
    updateTask,
    completeTask,
    removeTask,
    hasActiveTasks,
    aggregateProgress,
    startTopBar,
    finishTopBar,
    failTopBar,
  }
}
