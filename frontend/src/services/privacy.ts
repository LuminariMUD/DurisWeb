import { computed, readonly, ref, watch, type Ref } from 'vue'
import type { Router } from 'vue-router'
import { frontendConfiguration } from '@/config/environment'
import { PRIVACY_NOTICE_VERSION, PRIVACY_CHOICE_VERSION } from '@/config/privacyNotice'
import { getCsrfToken } from './api'
import { clearLegacyAnalyticsSession } from './analytics'

const PREFERENCE_KEY = 'duris_privacy_choice_v1'
const LOCK = 'duris-privacy-choice-v1'
type Decision = 'accepted' | 'refused' | 'withdrawn'
type Phase =
  | 'loading'
  | 'unknown'
  | Decision
  | 'disabled'
  | 'obsolete'
  | 'unavailable'
  | 'saving'
  | 'unsaved'
interface PrivacyStatus {
  noticeVersion: string
  choiceVersion: string
  choicesAvailable: boolean
  collectionAvailable: boolean
  decision: 'unknown' | Decision
  revision: number
  expiresAtEpoch: number | null
  receiptValid: boolean
}
const phase = ref<Phase>('unknown')
const server = ref<PrivacyStatus | null>(null)
const busy = ref(0)
const error = ref('')
const storageReadable = ref(true)
const synchronizationReady = ref(false)
let generation = 0
let visitNonce: string | null = null
let expiryTimer: ReturnType<typeof setTimeout> | undefined
let tracking: AbortController | undefined
let channel: BroadcastChannel | undefined
let router: Router | undefined
let disposeCurrent: (() => void) | undefined

function versionsMatch(value: PrivacyStatus): boolean {
  return (
    value.noticeVersion === PRIVACY_NOTICE_VERSION && value.choiceVersion === PRIVACY_CHOICE_VERSION
  )
}
function parseStatus(input: unknown): PrivacyStatus {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid privacy response')
  const value = input as Record<string, unknown>
  if (
    Object.keys(value).sort().join(',') !==
      'choiceVersion,choicesAvailable,collectionAvailable,decision,expiresAtEpoch,noticeVersion,receiptValid,revision' ||
    typeof value.noticeVersion !== 'string' ||
    !/^[a-zA-Z0-9.-]{1,64}$/.test(value.noticeVersion) ||
    typeof value.choiceVersion !== 'string' ||
    !/^[a-zA-Z0-9.-]{1,64}$/.test(value.choiceVersion) ||
    typeof value.choicesAvailable !== 'boolean' ||
    typeof value.collectionAvailable !== 'boolean' ||
    typeof value.receiptValid !== 'boolean' ||
    typeof value.decision !== 'string' ||
    !['unknown', 'accepted', 'refused', 'withdrawn'].includes(value.decision) ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    value.revision > 4294967294 ||
    (value.expiresAtEpoch !== null &&
      (typeof value.expiresAtEpoch !== 'number' ||
        !Number.isSafeInteger(value.expiresAtEpoch) ||
        value.expiresAtEpoch <= 0 ||
        value.expiresAtEpoch > 253402300799)) ||
    (!value.choicesAvailable && value.collectionAvailable) ||
    (value.receiptValid
      ? value.decision === 'unknown' || value.revision === 0 || value.expiresAtEpoch === null
      : value.decision !== 'unknown' || value.expiresAtEpoch !== null)
  )
    throw new Error('Invalid privacy response')
  return value as unknown as PrivacyStatus
}
function readPreference(): string | null {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY)
    storageReadable.value = value === null || value === 'off' || value === 'accepted'
    return storageReadable.value ? value : null
  } catch {
    storageReadable.value = false
    return null
  }
}
function savePreference(value: 'off' | 'accepted'): boolean {
  try {
    localStorage.setItem(PREFERENCE_KEY, value)
    storageReadable.value = localStorage.getItem(PREFERENCE_KEY) === value
    return storageReadable.value
  } catch {
    storageReadable.value = false
    return false
  }
}
function cancelTracking(): void {
  if (expiryTimer !== undefined) clearTimeout(expiryTimer)
  expiryTimer = undefined
  tracking?.abort()
  tracking = undefined
  visitNonce = null
  clearLegacyAnalyticsSession()
}
function stop(next: Phase = 'unknown'): number {
  generation += 1
  cancelTracking()
  phase.value = next
  return generation
}
function broadcast(type: 'stop' | 'changed' | 'reset'): void {
  try {
    channel?.postMessage({ type })
  } catch {
    synchronizationReady.value = false
    cancelTracking()
    if (phase.value === 'accepted') phase.value = 'unavailable'
  }
}
async function withChoiceLock<T>(action: () => Promise<T>): Promise<T> {
  let locks: LockManager | undefined
  try {
    locks = navigator.locks
  } catch {
    return action()
  }
  if (!locks?.request || typeof AbortSignal.timeout !== 'function') return action()
  return locks.request(LOCK, { signal: AbortSignal.timeout(10000) }, action)
}
/** Necessary preference requests have their own failure UI and never replay an optional event. */
async function requestStatus(body?: Record<string, unknown>): Promise<PrivacyStatus> {
  const csrfToken = body ? getCsrfToken() : undefined
  if (body && !csrfToken) throw new Error('Missing privacy request protection')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(
      `${frontendConfiguration.apiUrl}/api/privacy${body ? '/choice' : ''}`,
      {
        method: body ? 'POST' : 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: body
          ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken! }
          : { Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      },
    )
    if (!response.ok) throw new Error('Privacy choice request failed')
    return parseStatus(await response.json())
  } finally {
    clearTimeout(timeout)
  }
}
function grantCurrent(): boolean {
  const value = server.value
  return (
    phase.value === 'accepted' &&
    !!value &&
    versionsMatch(value) &&
    value.receiptValid &&
    value.decision === 'accepted' &&
    value.collectionAvailable &&
    value.expiresAtEpoch !== null &&
    value.expiresAtEpoch * 1000 > Date.now() &&
    synchronizationReady.value &&
    readPreference() === 'accepted'
  )
}
function scheduleExpiry(): void {
  const expiry = server.value?.expiresAtEpoch
  if (!expiry) return
  if (!grantCurrent()) {
    stop()
    return
  }
  expiryTimer = setTimeout(
    () => {
      expiryTimer = undefined
      if (expiry * 1000 <= Date.now()) {
        stop()
        return
      }
      scheduleExpiry()
    },
    Math.min(expiry * 1000 - Date.now(), 2147483647),
  )
}
const ROUTES: Readonly<Record<string, string>> = Object.freeze({
  home: 'home',
  news: 'news',
  'pvp-list': 'pvp',
  'battle-detail': 'battle',
  stats: 'stats',
  forum: 'forum',
  'forum-category': 'forum',
  'forum-thread': 'thread',
  'wiki-map': 'wiki',
  'wiki-zones': 'wiki',
  'wiki-zone-detail': 'wiki',
  'wiki-objects': 'wiki',
  'wiki-object-detail': 'wiki',
  'wiki-mobs': 'wiki',
  'wiki-mob-detail': 'wiki',
  guide: 'guide',
  status: 'status',
})
async function trackCurrentRoute(): Promise<void> {
  if (!grantCurrent()) {
    if (phase.value === 'accepted') stop()
    return
  }
  if (document.visibilityState === 'hidden') return
  const name = router?.currentRoute.value.name
  if (typeof name !== 'string' || !Object.hasOwn(ROUTES, name)) return
  const ticket = generation
  let controller: AbortController | undefined
  try {
    const csrfToken = getCsrfToken()
    if (!csrfToken) {
      stop('unavailable')
      return
    }
    if (!visitNonce) {
      const bytes = crypto.getRandomValues(new Uint8Array(32))
      visitNonce = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    }
    tracking?.abort()
    controller = new AbortController()
    tracking = controller
    const response = await fetch(`${frontendConfiguration.apiUrl}/api/analytics/track`, {
      method: 'POST',
      credentials: 'include',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({
        route: ROUTES[name],
        visitNonce,
        choiceVersion: server.value!.choiceVersion,
        revision: server.value!.revision,
      }),
    })
    if (ticket === generation && !response.ok) stop('unavailable')
  } catch {
    if (ticket !== generation || controller?.signal.aborted) return
    stop('unavailable')
  } finally {
    if (tracking === controller) tracking = undefined
  }
}
function applyStatus(value: PrivacyStatus): void {
  server.value = value
  if (!versionsMatch(value)) {
    phase.value = 'obsolete'
    return
  }
  if (!value.choicesAvailable) {
    phase.value = 'disabled'
    return
  }
  if (
    !value.collectionAvailable &&
    (value.decision === 'unknown' || value.decision === 'accepted')
  ) {
    phase.value = 'disabled'
    return
  }
  if (
    !value.receiptValid ||
    value.expiresAtEpoch === null ||
    value.expiresAtEpoch * 1000 <= Date.now()
  ) {
    phase.value = 'unknown'
    return
  }
  if (value.decision === 'accepted') {
    phase.value =
      synchronizationReady.value && readPreference() === 'accepted' ? 'accepted' : 'unknown'
    if (phase.value === 'accepted') {
      scheduleExpiry()
      void trackCurrentRoute()
    }
  } else {
    phase.value = value.decision
  }
}
export async function refreshPrivacyChoice(): Promise<void> {
  if (busy.value > 0) return
  const ticket = stop('loading')
  error.value = ''
  readPreference()
  try {
    const value = await withChoiceLock(() => requestStatus())
    if (ticket === generation) applyStatus(value)
  } catch {
    if (ticket === generation) {
      phase.value = 'unavailable'
      error.value = 'Your privacy choice could not be checked. Visit tracking is off.'
    }
  }
}
export async function savePrivacyChoice(decision: Decision): Promise<void> {
  const known = server.value
  if (
    !known ||
    !versionsMatch(known) ||
    !known.choicesAvailable ||
    (decision === 'accepted' && (!known.collectionAvailable || !synchronizationReady.value))
  )
    return
  const ticket = stop('saving')
  error.value = ''
  const savedOff = savePreference('off')
  broadcast('stop')
  if (decision === 'accepted' && !savedOff) {
    phase.value = 'unsaved'
    error.value = 'Your browser cannot save privacy preferences. Visit tracking stays off.'
    return
  }
  busy.value += 1
  let unsuccessful = false
  try {
    await withChoiceLock(async () => {
      const latest = await requestStatus()
      if (ticket !== generation) return
      if (
        !versionsMatch(latest) ||
        !latest.choicesAvailable ||
        (decision === 'accepted' && !latest.collectionAvailable)
      )
        throw new Error('Privacy policy changed')
      const acknowledged = await requestStatus({
        decision,
        revision: latest.revision,
        noticeVersion: latest.noticeVersion,
        choiceVersion: latest.choiceVersion,
      })
      // Confirm the actual HttpOnly cookie via a separate request; browsers may
      // reject Set-Cookie even though the preference transaction was acknowledged.
      const value = await requestStatus()
      if (
        !versionsMatch(value) ||
        value.decision !== decision ||
        !value.receiptValid ||
        value.revision !== acknowledged.revision ||
        value.expiresAtEpoch === null ||
        value.expiresAtEpoch * 1000 <= Date.now()
      )
        throw new Error('Privacy choice was not confirmed')
      if (ticket === generation) {
        if (decision === 'accepted' && !savePreference('accepted'))
          throw new Error('Privacy preference was not saved')
        applyStatus(value)
      }
      broadcast('changed')
    })
  } catch {
    if (ticket === generation) {
      unsuccessful = true
      stop('unsaved')
      savePreference('off')
      error.value = 'Your choice could not be saved. Tracking is off in this tab. Please try again.'
      broadcast('stop')
    }
  } finally {
    busy.value -= 1
    if (!unsuccessful && ticket !== generation && busy.value === 0) void refreshPrivacyChoice()
  }
}
/** Install one browser-wide choice coordinator. The returned cleanup is used by HMR and tests. */
export function initializePrivacyChoices(
  activeRouter: Router,
  accountName: Readonly<Ref<string | null>>,
): () => void {
  disposeCurrent?.()
  router = activeRouter
  stop()
  readPreference()
  try {
    channel = new BroadcastChannel(LOCK)
    synchronizationReady.value =
      typeof navigator.locks?.request === 'function' && typeof AbortSignal.timeout === 'function'
    channel.onmessage = (event) => {
      if (event.data?.type === 'stop') {
        stop()
        savePreference('off')
      } else if (event.data?.type === 'changed') {
        if (busy.value === 0) void refreshPrivacyChoice()
      } else if (event.data?.type === 'reset') {
        stop()
        if (busy.value === 0) void refreshPrivacyChoice()
      }
    }
  } catch {
    synchronizationReady.value = false
  }
  const removeRouteHook = activeRouter.afterEach((_to, _from, failure) => {
    if (!failure) void trackCurrentRoute()
  })
  const stopAccountWatch = watch(
    accountName,
    () => {
      stop()
      broadcast('reset')
      void refreshPrivacyChoice()
    },
    { flush: 'sync' },
  )
  const storageChanged = (event: StorageEvent) => {
    if (event.key === PREFERENCE_KEY || event.key === null) {
      if (event.newValue !== 'accepted') stop()
      if (busy.value === 0) void refreshPrivacyChoice()
    }
  }
  const visibilityChanged = () => {
    if (document.visibilityState === 'hidden') stop()
    else void refreshPrivacyChoice()
  }
  const pageHidden = () => {
    stop()
  }
  const pageShown = () => {
    void refreshPrivacyChoice()
  }
  window.addEventListener('storage', storageChanged)
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('pagehide', pageHidden)
  window.addEventListener('pageshow', pageShown)
  void activeRouter
    .isReady()
    .then(() => {
      if (router === activeRouter) void refreshPrivacyChoice()
    })
    .catch(() => {
      if (router === activeRouter) stop('unavailable')
    })
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    stop()
    server.value = null
    router = undefined
    synchronizationReady.value = false
    removeRouteHook()
    stopAccountWatch()
    channel?.close()
    channel = undefined
    window.removeEventListener('storage', storageChanged)
    document.removeEventListener('visibilitychange', visibilityChanged)
    window.removeEventListener('pagehide', pageHidden)
    window.removeEventListener('pageshow', pageShown)
    disposeCurrent = undefined
  }
  disposeCurrent = dispose
  return dispose
}
export function usePrivacyChoices() {
  return {
    phase: readonly(phase),
    server: readonly(server),
    error: readonly(error),
    busy: readonly(busy),
    storageReadable: readonly(storageReadable),
    synchronizationReady: readonly(synchronizationReady),
    canAccept: computed(
      () =>
        !!server.value &&
        versionsMatch(server.value) &&
        server.value.choicesAvailable &&
        server.value.collectionAvailable &&
        synchronizationReady.value &&
        storageReadable.value &&
        busy.value === 0,
    ),
    canRefuse: computed(
      () => !!server.value && versionsMatch(server.value) && server.value.choicesAvailable,
    ),
    refresh: refreshPrivacyChoice,
    choose: savePrivacyChoice,
  }
}
