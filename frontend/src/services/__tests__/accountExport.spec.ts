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
afterEach(() => vi.unstubAllGlobals())

describe('private account export request', () => {
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
