import { describe, expect, it } from 'vitest'
import {
  normalizeGroupActionImport,
  normalizeMobActionImport,
} from '../clientSettingsValidation'

describe('client settings imported action validation', () => {
  it('normalizes a group action to known bounded fields', () => {
    expect(normalizeGroupActionImport({
      id: 'source-id',
      label: '  Assist  ',
      command: 'assist $1',
      unexpected: 'discarded',
    }, 0, 'generated-id')).toEqual({
      id: 'generated-id',
      label: 'Assist',
      command: 'assist $1',
    })
  })

  it('rejects a malformed mob action command', () => {
    expect(() => normalizeMobActionImport({
      id: 'source-id',
      label: 'Assist',
      command: 123,
    }, 0, 'generated-id')).toThrow(/mob action.*command must be a string/i)
  })
})
