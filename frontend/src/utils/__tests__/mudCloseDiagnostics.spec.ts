import { describe, expect, it } from 'vitest'
import {
  buildMudCloseDiagnostic,
  explainMudClose,
  formatMudCloseDiagnostic,
  type MudCloseInput,
} from '../mudCloseDiagnostics'

const now = Date.parse('2026-11-12T18:10:07Z')
const base: MudCloseInput = {
  code: 1006,
  reason: '',
  wasClean: false,
  state: 'in_game',
  now,
  openedAt: now - 600_000,
  lastSentAt: now - 12_000,
  lastReceivedAt: now - 61_000,
  hiddenSince: now - 320_000,
  online: true,
}

describe('mudCloseDiagnostics', () => {
  it('reports 1006 as an unknown cause, never a server reason', () => {
    const diagnostic = buildMudCloseDiagnostic(base)
    expect(diagnostic.category).toBe('abnormal')
    expect(explainMudClose(diagnostic)).toMatch(/cause is unknown/)
    expect(formatMudCloseDiagnostic(diagnostic)).toBe(
      'time=2026-11-12T18:10:07.000Z code=1006 clean=false category=abnormal state=in_game ' +
        'connected=600s last_sent=12s last_received=61s page_hidden=true (320s) online=true',
    )
  })

  it('maps only exact MUD reasons and drops arbitrary peer text', () => {
    const category = (code: number, reason: string) =>
      buildMudCloseDiagnostic({ ...base, code, reason }).category
    expect(category(1001, 'Ping timeout')).toBe('heartbeat_timeout')
    expect(category(1000, 'Reconnected')).toBe('session_replaced')
    expect(category(1008, 'Not authorized')).toBe('not_authorized')
    expect(category(1009, 'Message too big')).toBe('protocol_error')
    expect(category(1000, 'player@example.test said hi')).toBe('normal')
    expect(category(4000, 'token=abc')).toBe('other')

    const text = JSON.stringify(
      buildMudCloseDiagnostic({ ...base, code: 4000, reason: 'token=abc', state: 'x'.repeat(500) }),
    )
    expect(text).not.toContain('token')
    expect(text.length).toBeLessThan(400)
  })

  it.each(['__proto__', 'constructor', 'toString'])(
    'rejects inherited reason property %s',
    (reason) => {
      const diagnostic = buildMudCloseDiagnostic({ ...base, code: 4000, reason })
      expect(diagnostic.category).toBe('other')
      expect(explainMudClose(diagnostic)).toBe('The connection was closed.')
    },
  )

  it('handles a socket that never opened while visible', () => {
    const diagnostic = buildMudCloseDiagnostic({
      ...base,
      openedAt: null,
      lastSentAt: null,
      lastReceivedAt: null,
      hiddenSince: null,
    })
    expect(formatMudCloseDiagnostic(diagnostic)).toContain(
      'connected=n/a last_sent=n/a last_received=n/a page_hidden=false online=true',
    )
  })
})
