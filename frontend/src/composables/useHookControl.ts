import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hookApiError, hooksApi } from '@/services/hooksApi'
import type { HookStatus, HooksResponse, HookSummary, ReconcileResponse } from '@/types/hooks'

export interface HookControlOptions {
  poll?: boolean
  syncQuery?: boolean
}

export function useHookControl(options: HookControlOptions = {}) {
  const route = useRoute()
  const router = useRouter()
  const data = ref<HooksResponse | null>(null)
  const loading = ref(true)
  const loadError = ref<string | null>(null)
  const filter = ref('')
  const selectedId = ref<string | null>(null)
  const pending = ref<Set<string>>(new Set())
  const rowErrors = ref<Record<string, string>>({})
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const hooks = computed(() => data.value?.hooks ?? [])
  const selectedHook = computed(
    () => hooks.value.find((hook) => hook.id === selectedId.value) ?? null,
  )
  const filteredHooks = computed(() => {
    const query = filter.value.trim().toLowerCase()
    if (!query) return hooks.value
    return hooks.value.filter((hook) =>
      [hook.id, hook.channel, hook.direction, hook.description, hook.effective].some((value) =>
        value.toLowerCase().includes(query),
      ),
    )
  })
  const summary = computed<HookSummary>(() => ({
    total: hooks.value.length,
    active: hooks.value.filter((hook) => hook.active).length,
    off: hooks.value.filter((hook) => hook.effective === 'off').length,
    mismatch: hooks.value.filter((hook) => hook.effective === 'mismatch').length,
    unknown: hooks.value.filter((hook) => ['unknown', 'unavailable'].includes(hook.effective))
      .length,
  }))

  function replaceHook(hook: HookStatus) {
    if (!data.value) return
    const index = data.value.hooks.findIndex((candidate) => candidate.id === hook.id)
    if (index >= 0) data.value.hooks.splice(index, 1, hook)
  }

  async function refresh(initial = false) {
    if (initial) loading.value = true
    try {
      data.value = await hooksApi.getAll()
      loadError.value = null
      if (selectedId.value && !hooks.value.some((hook) => hook.id === selectedId.value)) {
        await selectHook(null)
      }
    } catch (error) {
      loadError.value = hookApiError(error)
    } finally {
      if (initial) loading.value = false
    }
  }

  async function reconcile(id: string, enabled: boolean): Promise<ReconcileResponse> {
    pending.value = new Set(pending.value).add(id)
    const nextErrors = { ...rowErrors.value }
    delete nextErrors[id]
    rowErrors.value = nextErrors
    try {
      const result = await hooksApi.reconcile(id, enabled)
      replaceHook(result.hook)
      if (!result.complete || result.warning) {
        rowErrors.value = {
          ...rowErrors.value,
          [id]: result.warning ?? 'Both ends did not confirm.',
        }
      }
      await refresh(false)
      return result
    } catch (error) {
      const message = hookApiError(error)
      rowErrors.value = { ...rowErrors.value, [id]: message }
      throw error
    } finally {
      const next = new Set(pending.value)
      next.delete(id)
      pending.value = next
    }
  }

  async function selectHook(id: string | null) {
    selectedId.value = id
    if (options.syncQuery === false) return
    const query = { ...route.query }
    if (id) query.hook = id
    else delete query.hook
    await router.replace({ query })
  }

  if (options.syncQuery !== false) {
    watch(
      () => [route.query.hook, hooks.value.length] as const,
      async ([raw]) => {
        const id = typeof raw === 'string' ? raw : null
        if (!id) {
          selectedId.value = null
        } else if (hooks.value.some((hook) => hook.id === id)) {
          selectedId.value = id
        } else if (hooks.value.length > 0) {
          await selectHook(null)
        }
      },
      { immediate: true },
    )
  }

  onMounted(() => {
    void refresh(true)
    if (options.poll !== false) pollTimer = setInterval(() => void refresh(false), 5_000)
  })
  onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer)
  })

  return {
    data,
    hooks,
    filteredHooks,
    selectedHook,
    loading,
    loadError,
    filter,
    pending,
    rowErrors,
    summary,
    refresh,
    reconcile,
    selectHook,
  }
}
