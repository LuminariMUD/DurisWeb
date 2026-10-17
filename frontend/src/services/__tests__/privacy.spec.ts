import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

vi.mock('../api', () => ({ getCsrfToken: () => 'f'.repeat(64) }))
const VERSION = '2026-10-16-draft-1'
const PREFERENCE = 'duris_privacy_choice_v1'
type Status = {
  noticeVersion: string
  choiceVersion: string
  choicesAvailable: boolean
  collectionAvailable: boolean
  decision: string
  revision: number
  expiresAtEpoch: number | null
  receiptValid: boolean
}
let status: Status
let cookieReadable = true
let failChoice = false
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
let privacy: typeof import('../privacy')
let router: Router
let dispose: (() => void) | undefined
let queue: Promise<unknown>
const account = ref<string | null>(null)
const peers = new Set<FakeChannel>()
class FakeChannel {
  onmessage: ((event: MessageEvent) => void) | null = null
  constructor(readonly name: string) {
    peers.add(this)
  }
  postMessage(value: unknown) {
    for (const peer of peers)
      if (peer !== this && peer.name === this.name)
        queueMicrotask(() => peer.onmessage?.(new MessageEvent('message', { data: value })))
  }
  close() {
    peers.delete(this)
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  return {
    promise: new Promise<T>((r) => {
      resolve = r
    }),
    resolve: (value: T) => resolve(value),
  }
}
function events() {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/analytics/track'))
}
async function settle() {
  await flushPromises()
  await flushPromises()
}
async function boot() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/news', name: 'news', component: { template: '<div />' } },
      { path: '/pvp/:id', name: 'battle-detail', component: { template: '<div />' } },
      { path: '/privacy', name: 'privacy', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  privacy = await import('../privacy')
  dispose = privacy.initializePrivacyChoices(router, account)
  await settle()
}
beforeEach(() => {
  vi.resetModules()
  account.value = null
  queue = Promise.resolve()
  cookieReadable = true
  failChoice = false
  status = {
    noticeVersion: VERSION,
    choiceVersion: VERSION,
    choicesAvailable: true,
    collectionAvailable: true,
    decision: 'unknown',
    revision: 0,
    expiresAtEpoch: null,
    receiptValid: false,
  }
  vi.stubGlobal('BroadcastChannel', FakeChannel)
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, _options: unknown, action: () => Promise<unknown>) => {
        const result = queue.then(action)
        queue = result.catch(() => {})
        return result
      },
    },
  })
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
    if (String(url).endsWith('/api/privacy/choice')) {
      if (failChoice) return Response.json({ error: 'Unavailable' }, { status: 503 })
      const body = JSON.parse(String(options?.body)) as Record<string, unknown>
      if (
        Object.keys(body).sort().join(',') !== 'choiceVersion,decision,noticeVersion,revision' ||
        body.noticeVersion !== VERSION ||
        body.choiceVersion !== VERSION ||
        new Headers(options?.headers).get('X-CSRF-Token') !== 'f'.repeat(64)
      )
        throw new Error('Invalid synthetic choice action')
      status = {
        ...status,
        decision: String(body.decision),
        revision: status.revision + 1,
        expiresAtEpoch: Math.floor(Date.now() / 1000) + 3600,
        receiptValid: true,
      }
      return Response.json(status)
    }
    if (String(url).endsWith('/api/privacy'))
      return Response.json(
        cookieReadable
          ? status
          : { ...status, decision: 'unknown', expiresAtEpoch: null, receiptValid: false },
      )
    if (String(url).endsWith('/api/analytics/track')) return Response.json({ success: true })
    throw new Error('Unexpected fixture request')
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  dispose?.()
  dispose = undefined
  peers.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  localStorage.clear()
})

describe('privacy choices and optional browser collection', () => {
  it('preserves the original refusal when another action arrives while its save is pending', async () => {
    await boot()
    const original = fetchMock.getMockImplementation()!
    const gate = deferred<void>()
    let posts = 0
    fetchMock.mockImplementation(async (url, options) => {
      if (String(url).endsWith('/api/privacy/choice')) {
        posts++
        if (posts === 1) await gate.promise
      }
      return original(url, options)
    })
    const first = privacy.savePrivacyChoice('refused')
    await settle()
    const canRefuseDuringSave = privacy.usePrivacyChoices().canRefuse.value
    const second = privacy.savePrivacyChoice('withdrawn')
    gate.resolve()
    await Promise.all([first, second])
    await settle()
    expect(canRefuseDuringSave).toBe(false)
    expect(posts).toBe(1)
    expect(status.decision).toBe('refused')
    expect(privacy.usePrivacyChoices().phase.value).toBe('refused')
  })
  it('keeps the visit and avoids another page view across temporary hiding', async () => {
    await boot()
    await privacy.savePrivacyChoice('accepted')
    await settle()
    const first = JSON.parse(String(events()[0]![1]?.body))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(events()).toHaveLength(1)
    await router.push('/news')
    await settle()
    expect(events()).toHaveLength(2)
    expect(JSON.parse(String(events()[1]![1]?.body)).visitNonce).toBe(first.visitNonce)
  })
  it('records a navigation made while hidden once on return, using the same visit', async () => {
    await boot()
    await privacy.savePrivacyChoice('accepted')
    await settle()
    const first = JSON.parse(String(events()[0]![1]?.body))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await router.push('/news')
    await settle()
    const whileHidden = events().length
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(whileHidden).toBe(1)
    expect(events()).toHaveLength(2)
    expect(JSON.parse(String(events()[1]![1]?.body)).visitNonce).toBe(first.visitNonce)
  })
  it('revalidates a withdrawn server choice before resuming after hiding', async () => {
    await boot()
    await privacy.savePrivacyChoice('accepted')
    await settle()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    status = { ...status, decision: 'withdrawn', revision: status.revision + 1 }
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(privacy.usePrivacyChoices().phase.value).toBe('withdrawn')
    await router.push('/news')
    await settle()
    expect(events()).toHaveLength(1)
  })
  it('records the first visible view when an accepted page initialized while hidden', async () => {
    status = {
      ...status,
      decision: 'accepted',
      revision: 1,
      receiptValid: true,
      expiresAtEpoch: Math.floor(Date.now() / 1000) + 3600,
    }
    localStorage.setItem(PREFERENCE, 'accepted')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await boot()
    const before = events().length
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await settle()
    expect(before).toBe(0)
    expect(events()).toHaveLength(1)
  })
  it('is silent before choice and after refusal, without new identifiers or leftover timers', async () => {
    localStorage.setItem('analytics_session_id', 'legacy-sentinel')
    const random = vi.spyOn(crypto, 'getRandomValues')
    await boot()
    expect(localStorage.getItem('analytics_session_id')).toBeNull()
    expect(localStorage.getItem(PREFERENCE)).toBeNull()
    await router.push('/news?private=sentinel#private')
    await settle()
    expect(events()).toHaveLength(0)
    expect(random).not.toHaveBeenCalled()
    await privacy.savePrivacyChoice('refused')
    await settle()
    expect(privacy.usePrivacyChoices().phase.value).toBe('refused')
    await router.push('/')
    await settle()
    expect(events()).toHaveLength(0)
    expect(random).not.toHaveBeenCalled()
  })

  it('keeps the shipped unapproved state disabled and cannot be enabled by a local accepted marker', async () => {
    status = { ...status, choicesAvailable: false, collectionAvailable: false }
    localStorage.setItem(PREFERENCE, 'accepted')
    const random = vi.spyOn(crypto, 'getRandomValues')
    await boot()
    await privacy.savePrivacyChoice('accepted')
    await router.push('/news')
    await settle()
    expect(privacy.usePrivacyChoices().phase.value).toBe('disabled')
    expect(events()).toHaveLength(0)
    expect(random).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith('/api/privacy'))).toBe(true)
  })

  it('confirms the real receipt before creating an in-memory nonce and sends only a canonical route family', async () => {
    await boot()
    await router.push('/pvp/123?token=private-sentinel#private-sentinel')
    await privacy.savePrivacyChoice('accepted')
    await settle()
    expect(privacy.usePrivacyChoices().phase.value).toBe('accepted')
    const choice = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/privacy/choice'))
    expect(JSON.parse(String(choice?.[1]?.body))).toEqual({
      decision: 'accepted',
      revision: 0,
      noticeVersion: VERSION,
      choiceVersion: VERSION,
    })
    expect(new Headers(choice?.[1]?.headers).get('X-CSRF-Token')).toBe('f'.repeat(64))
    const [[url, options]] = events()
    expect(String(url)).toBe('http://api.test.invalid/api/analytics/track')
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['choiceVersion', 'revision', 'route', 'visitNonce'])
    expect(body).toMatchObject({ route: 'battle', revision: 1, choiceVersion: VERSION })
    expect(body.visitNonce).toMatch(/^[a-f0-9]{64}$/)
    expect(options?.referrerPolicy).toBe('no-referrer')
    expect(JSON.stringify(options)).not.toContain('private-sentinel')
    expect(Object.keys(localStorage)).toEqual([PREFERENCE])
    expect(localStorage.getItem(PREFERENCE)).toBe('accepted')
    expect(events()).toHaveLength(1)
    await router.push('/news?secret=private-sentinel')
    await settle()
    expect(events()).toHaveLength(2)
    expect(JSON.parse(String(events()[1][1]?.body)).visitNonce).toBe(body.visitNonce)
  })

  it('does not collect when the browser rejects the issued HttpOnly cookie', async () => {
    await boot()
    cookieReadable = false
    const random = vi.spyOn(crypto, 'getRandomValues')
    await privacy.savePrivacyChoice('accepted')
    await settle()
    expect(privacy.usePrivacyChoices().phase.value).toBe('unsaved')
    expect(events()).toHaveLength(0)
    expect(random).not.toHaveBeenCalled()
    expect(localStorage.getItem(PREFERENCE)).toBe('off')
  })

  it('stops and aborts an in-flight request on withdrawal, then reaccepts with a fresh visit', async () => {
    const waiting = deferred<Response>()
    const defaultFetch = fetchMock.getMockImplementation()!
    let signal: AbortSignal | undefined
    fetchMock.mockImplementation((url, options) => {
      if (String(url).endsWith('/api/analytics/track')) {
        signal = options?.signal ?? undefined
        signal?.addEventListener('abort', () =>
          waiting.resolve(Response.json({ success: false }, { status: 403 })),
        )
        return waiting.promise
      }
      return defaultFetch(url, options)
    })
    await boot()
    await privacy.savePrivacyChoice('accepted')
    await settle()
    const first = JSON.parse(String(events()[0][1]?.body)).visitNonce
    await privacy.savePrivacyChoice('withdrawn')
    await settle()
    expect(signal?.aborted).toBe(true)
    expect(privacy.usePrivacyChoices().phase.value).toBe('withdrawn')
    await router.push('/news')
    await settle()
    expect(events()).toHaveLength(1)
    fetchMock.mockImplementation(defaultFetch)
    await privacy.savePrivacyChoice('accepted')
    await settle()
    expect(events()).toHaveLength(2)
    expect(JSON.parse(String(events()[1][1]?.body)).visitNonce).not.toBe(first)
  })

  it('does not re-enable a previous grant after a failed withdrawal or a later status refresh', async () => {
    await boot()
    await privacy.savePrivacyChoice('accepted')
    await settle()
    failChoice = true
    await privacy.savePrivacyChoice('withdrawn')
    await settle()
    expect(privacy.usePrivacyChoices().phase.value).toBe('unsaved')
    expect(privacy.usePrivacyChoices().error.value).toContain('could not be saved')
    const count = events().length
    await privacy.refreshPrivacyChoice()
    await router.push('/news')
    await settle()
    expect(events()).toHaveLength(count)
    expect(localStorage.getItem(PREFERENCE)).toBe('off')
  })

  it('uses the cross-tab stop signal immediately and checks the new server choice afterward', async () => {
    await boot()
    await privacy.savePrivacyChoice('accepted')
    await settle()
    const peer = new FakeChannel('duris-privacy-choice-v1')
    peer.postMessage({ type: 'stop' })
    await settle()
    const count = events().length
    await router.push('/news')
    await settle()
    expect(events()).toHaveLength(count)
    status = { ...status, decision: 'withdrawn', revision: 2 }
    peer.postMessage({ type: 'changed' })
    await settle()
    expect(privacy.usePrivacyChoices().phase.value).toBe('withdrawn')
    expect(localStorage.getItem(PREFERENCE)).toBe('off')
  })

  it('serializes a pending acceptance and a later withdrawal without collecting from the late response', async () => {
    await boot()
    const waiting = deferred<Response>()
    const defaultFetch = fetchMock.getMockImplementation()!
    let held = false
    fetchMock.mockImplementation(async (url, options) => {
      if (String(url).endsWith('/api/privacy/choice') && !held) {
        held = true
        const reply = await defaultFetch(url, options)
        await waiting.promise
        return reply
      }
      return defaultFetch(url, options)
    })
    const accepted = privacy.savePrivacyChoice('accepted')
    await settle()
    const withdrawn = privacy.savePrivacyChoice('withdrawn')
    await settle()
    expect(events()).toHaveLength(0)
    waiting.resolve(Response.json({}))
    await accepted
    await withdrawn
    await settle()
    expect(privacy.usePrivacyChoices().phase.value).toBe('withdrawn')
    expect(events()).toHaveLength(0)
  })

  it('keeps storage-denied browsers off while allowing an authoritative refusal', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError')
    })
    const random = vi.spyOn(crypto, 'getRandomValues')
    await boot()
    await privacy.savePrivacyChoice('accepted')
    await settle()
    expect(events()).toHaveLength(0)
    expect(random).not.toHaveBeenCalled()
    await privacy.savePrivacyChoice('refused')
    await settle()
    expect(privacy.usePrivacyChoices().phase.value).toBe('refused')
    expect(events()).toHaveLength(0)
  })

  it('keeps unsupported synchronization off while still saving refusal', async () => {
    vi.stubGlobal('navigator', {})
    await boot()
    await privacy.savePrivacyChoice('accepted')
    await settle()
    expect(events()).toHaveLength(0)
    await privacy.savePrivacyChoice('refused')
    await settle()
    expect(privacy.usePrivacyChoices().phase.value).toBe('refused')
  })

  it.each(['expired', 'obsolete', 'malformed', 'failed'] as const)(
    'does not trust %s privacy metadata',
    async (kind) => {
      status = {
        ...status,
        decision: 'accepted',
        revision: 1,
        expiresAtEpoch: Math.floor(Date.now() / 1000) + 3600,
        receiptValid: true,
      }
      localStorage.setItem(PREFERENCE, 'accepted')
      if (kind === 'expired') status.expiresAtEpoch = Math.floor(Date.now() / 1000) - 1
      if (kind === 'obsolete') status.noticeVersion = 'new-version'
      if (kind === 'malformed') status.revision = -1
      if (kind === 'failed')
        fetchMock.mockResolvedValue(Response.json({ error: 'Unavailable' }, { status: 503 }))
      const random = vi.spyOn(crypto, 'getRandomValues')
      await boot()
      await router.push('/news')
      await settle()
      expect(events()).toHaveLength(0)
      expect(random).not.toHaveBeenCalled()
    },
  )

  it('never treats login as consent and rotates the visit after login/logout with an existing grant', async () => {
    await boot()
    account.value = 'First'
    await settle()
    expect(events()).toHaveLength(0)
    await privacy.savePrivacyChoice('accepted')
    await settle()
    account.value = null
    await settle()
    account.value = 'Second'
    await settle()
    const nonces = events().map(([, options]) => JSON.parse(String(options?.body)).visitNonce)
    expect(nonces).toHaveLength(3)
    expect(new Set(nonces).size).toBe(3)
    expect(JSON.stringify(events())).not.toContain('First')
    expect(JSON.stringify(events())).not.toContain('Second')
  })

  it('stops at expiry without waiting for another navigation', async () => {
    await boot()
    vi.useFakeTimers()
    const current = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url, options) => {
      const response = await current(url, options)
      if (String(url).endsWith('/api/privacy/choice'))
        status.expiresAtEpoch = Math.floor(Date.now() / 1000) + 1
      return String(url).endsWith('/api/privacy/choice') ? Response.json(status) : response
    })
    await privacy.savePrivacyChoice('accepted')
    await settle()
    const count = events().length
    await vi.advanceTimersByTimeAsync(1100)
    expect(privacy.usePrivacyChoices().phase.value).toBe('unknown')
    await router.push('/news')
    await settle()
    expect(events()).toHaveLength(count)
  })

  it('keeps the current coordinator active if a retired cleanup runs again', async () => {
    await boot()
    await privacy.savePrivacyChoice('accepted')
    await settle()
    const retired = dispose!
    dispose = privacy.initializePrivacyChoices(router, account)
    await settle()
    retired()
    const count = events().length
    await router.push('/news')
    await settle()
    expect(privacy.usePrivacyChoices().phase.value).toBe('accepted')
    expect(events()).toHaveLength(count + 1)
  })

  it('fails closed without an unhandled rejection when initial navigation cannot become ready', async () => {
    await boot()
    dispose?.()
    vi.spyOn(router, 'isReady').mockRejectedValue(new Error('Synthetic navigation failure'))
    dispose = privacy.initializePrivacyChoices(router, account)
    await settle()
    expect(privacy.usePrivacyChoices().phase.value).toBe('unavailable')
    expect(events()).toHaveLength(0)
  })
})
