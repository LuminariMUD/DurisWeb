import { describe, expect, it } from 'vitest'

import { createClientId } from '@/utils/clientId'

describe('createClientId', () => {
  it('uses randomUUID when the browser provides it', () => {
    const calls: string[] = []
    const id = createClientId([], {
      randomUUID: () => {
        calls.push('randomUUID')
        return 'uuid-from-browser'
      },
    })

    expect(id).toBe('uuid-from-browser')
    expect(calls).toEqual(['randomUUID'])
  })

  it('creates a UUID-shaped id when randomUUID is unavailable', () => {
    const id = createClientId([], {
      getRandomValues: (bytes) => {
        bytes.fill(0)
        return bytes
      },
    })

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('retries a colliding id before returning a new id', () => {
    let call = 0
    const id = createClientId(['duplicate'], {
      randomUUID: () => {
        call += 1
        return call === 1 ? 'duplicate' : 'unique'
      },
    })

    expect(id).toBe('unique')
    expect(call).toBe(2)
  })
})
