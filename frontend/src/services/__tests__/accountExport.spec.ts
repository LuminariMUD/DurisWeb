import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestAccountExport } from '../accountExport'

let csrf: string | undefined = 'synthetic-csrf'
vi.mock('@/services/api', () => ({ getCsrfToken: () => csrf }))
const fetchMock = vi.fn<typeof fetch>()
const payload = {
  accountName: 'Alice',
  schemaVersion: 1,
  scope: 'partial-website-data',
  completeAccountExport: false,
  categories: {},
}

beforeEach(() => {
  csrf = 'synthetic-csrf'
  fetchMock.mockReset().mockResolvedValue(Response.json(payload))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('private account export request', () => {
  it.each(['any', 'timeout', 'both'])(
    'downloads when AbortSignal.%s is unavailable',
    async (missing) => {
      const original = AbortSignal
      vi.stubGlobal('AbortSignal', {
        any: missing === 'timeout' ? original.any.bind(original) : undefined,
        timeout: missing === 'any' ? original.timeout.bind(original) : undefined,
      })
      expect(
        (await requestAccountExport('secret', 'Alice', new AbortController().signal)).size,
      ).toBeGreaterThan(0)
    },
  )
  it('forwards caller cancellation and removes its listener and timeout', async () => {
    vi.useFakeTimers()
    const caller = new AbortController()
    const remove = vi.spyOn(caller.signal, 'removeEventListener')
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Cancelled', 'AbortError')),
          )
        }),
    )
    const pending = requestAccountExport('secret', 'Alice', caller.signal)
    const rejected = pending.catch((error: unknown) => error)
    caller.abort()
    expect(await rejected).toMatchObject({ name: 'AbortError' })
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps the timeout active through response body reading', async () => {
    vi.useFakeTimers()
    const caller = new AbortController()
    const remove = vi.spyOn(caller.signal, 'removeEventListener')
    fetchMock.mockImplementation(async (_url, options) => {
      const response = Response.json(payload)
      vi.spyOn(response, 'text').mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Timed out', 'AbortError')),
            )
          }),
      )
      return response
    })
    const pending = requestAccountExport('secret', 'Alice', caller.signal)
    const rejected = pending.catch((error: unknown) => error)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(20000)
    expect(await rejected).toMatchObject({
      message: 'The download took too long. Please try again.',
    })
    expect(caller.signal.aborted).toBe(false)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each([false, true])(
    'distinguishes a request timeout from concurrent caller cancellation (%s)',
    async (callerCancels) => {
      vi.useFakeTimers()
      const caller = new AbortController()
      fetchMock.mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => {
              if (callerCancels) caller.abort()
              reject(new DOMException('Browser-dependent abort wording', 'AbortError'))
            })
          }),
      )
      const failed = requestAccountExport('secret', 'Alice', caller.signal).catch(
        (error: unknown) => error,
      )
      await vi.advanceTimersByTimeAsync(20000)
      expect(await failed).toMatchObject(
        callerCancels
          ? { name: 'AbortError' }
          : { message: 'The download took too long. Please try again.' },
      )
      expect(vi.getTimerCount()).toBe(0)
    },
  )
  it.each([false, true])('cleans up after a completed request (failure=%s)', async (fail) => {
    vi.useFakeTimers()
    const caller = new AbortController()
    const remove = vi.spyOn(caller.signal, 'removeEventListener')
    if (fail) fetchMock.mockResolvedValue(Response.json({}, { status: 503 }))
    const result = await requestAccountExport('secret', 'Alice', caller.signal).catch(
      (error: unknown) => error,
    )
    expect(result instanceof Error).toBe(fail)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
    const requestSignal = fetchMock.mock.calls[0]?.[1]?.signal
    caller.abort()
    expect(requestSignal?.aborted).toBe(false)
  })
  it('posts only the password with CSRF, credentials and caching/redirect protections', async () => {
    const blob = await requestAccountExport(
      'synthetic-password',
      'ALICE',
      new AbortController().signal,
    )
    expect(blob.type).toBe('application/json')
    expect(blob.size).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/privacy/export'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ password: 'synthetic-password' }),
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'synthetic-csrf' },
      }),
    )
  })
  it('does not send a password without a CSRF token', async () => {
    csrf = undefined
    await expect(
      requestAccountExport('secret', 'Alice', new AbortController().signal),
    ).rejects.toThrow('Refresh this page')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects data for an account different from the visible sign-in', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...payload, accountName: 'Bob' }))
    await expect(
      requestAccountExport('secret', 'Alice', new AbortController().signal),
    ).rejects.toThrow('does not match')
  })
  it.each([401, 403, 413, 429, 503])(
    'reports safe errors for status %s without echoing the server payload',
    async (status) => {
      fetchMock.mockResolvedValue(Response.json({ error: 'SECRET-SERVER-PAYLOAD' }, { status }))
      await expect(
        requestAccountExport('secret', 'Alice', new AbortController().signal),
      ).rejects.not.toThrow('SECRET-SERVER-PAYLOAD')
    },
  )
  it('rejects an HTML response and oversized downloads', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>wrong page</html>', { headers: { 'Content-Type': 'text/html' } }),
    )
    await expect(
      requestAccountExport('secret', 'Alice', new AbortController().signal),
    ).rejects.toThrow('could not be verified')
    fetchMock.mockResolvedValue(
      Response.json(payload, { headers: { 'Content-Length': '4194305' } }),
    )
    await expect(
      requestAccountExport('secret', 'Alice', new AbortController().signal),
    ).rejects.toThrow('could not be verified')
  })
  it('does not expose malformed response contents in an error', async () => {
    fetchMock.mockResolvedValue(
      new Response('SECRET-MALFORMED-RESPONSE', {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(
      requestAccountExport('secret', 'Alice', new AbortController().signal),
    ).rejects.toThrow('could not be verified')
  })
})
