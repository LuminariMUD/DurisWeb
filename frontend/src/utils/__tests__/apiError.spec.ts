import { describe, expect, it } from 'vitest'

import { hasApiErrorCode } from '../apiError'

describe('API error code narrowing', () => {
  it('matches only the requested status and stable code', () => {
    const error = {
      response: { status: 503, data: { code: 'WIKI_OBJECT_REFERENCE_UNAVAILABLE' } },
    }

    expect(hasApiErrorCode(error, 503, 'WIKI_OBJECT_REFERENCE_UNAVAILABLE')).toBe(true)
    expect(hasApiErrorCode(error, 500, 'WIKI_OBJECT_REFERENCE_UNAVAILABLE')).toBe(false)
    expect(hasApiErrorCode(error, 503, 'OTHER')).toBe(false)
    expect(hasApiErrorCode(new Error('network'), 503, 'WIKI_OBJECT_REFERENCE_UNAVAILABLE')).toBe(
      false,
    )
  })
})
