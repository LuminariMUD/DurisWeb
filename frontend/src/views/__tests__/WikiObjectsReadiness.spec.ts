import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Wiki Objects unavailable state', () => {
  it('distinguishes an unpublished generation from an empty filtered result', () => {
    const view = fs.readFileSync(
      path.resolve(process.cwd(), 'src/views/wiki/WikiObjectsView.vue'),
      'utf8',
    )

    expect(view).toContain("hasApiErrorCode(e, 503, 'WIKI_OBJECT_REFERENCE_UNAVAILABLE')")
    expect(view).toContain('v-else-if="referenceUnavailable"')
    expect(view).toContain('Object reference data is temporarily unavailable.')
    expect(view).toContain('No objects found matching your criteria.')
  })
})
