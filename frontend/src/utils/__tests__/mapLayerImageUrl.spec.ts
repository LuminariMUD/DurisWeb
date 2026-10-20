import { describe, expect, it } from 'vitest'

import { resolveMapLayerImageUrl } from '@/utils/mapLayerImageUrl'

describe('map layer image URL', () => {
  it('uses the on-demand API image when no separate static origin is configured', () => {
    const configuration = {
      apiUrl: 'https://site.test.invalid',
      staticUrl: 'https://site.test.invalid',
    }
    expect(resolveMapLayerImageUrl(configuration, 0)).toBe(
      'https://site.test.invalid/api/wiki/map/image?layer=0&revision=20261020',
    )
    expect(resolveMapLayerImageUrl(configuration, -2)).toBe(
      'https://site.test.invalid/api/wiki/map/image?layer=-2&revision=20261020',
    )
  })

  it('ignores a trailing slash when comparing the two origins', () => {
    expect(
      resolveMapLayerImageUrl(
        { apiUrl: 'https://site.test.invalid/', staticUrl: 'https://site.test.invalid' },
        1,
      ),
    ).toBe('https://site.test.invalid/api/wiki/map/image?layer=1&revision=20261020')
  })

  it('keeps the pre-rendered object path on a separate static origin', () => {
    expect(
      resolveMapLayerImageUrl(
        { apiUrl: 'https://api.test.invalid', staticUrl: 'https://static.test.invalid' },
        -1,
      ),
    ).toBe('https://static.test.invalid/duris/maps/layer--1.png?revision=20261020')
  })

  it('rejects a non-integer layer instead of building a malformed URL', () => {
    const configuration = {
      apiUrl: 'https://site.test.invalid',
      staticUrl: 'https://site.test.invalid',
    }
    expect(() => resolveMapLayerImageUrl(configuration, 0.5)).toThrow(RangeError)
    expect(() => resolveMapLayerImageUrl(configuration, Number.NaN)).toThrow(RangeError)
  })
})
