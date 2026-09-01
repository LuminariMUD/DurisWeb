import { describe, expect, it } from 'vitest'
import {
  MAX_CLIENT_SETTINGS_IMPORT_CHARS,
  MAX_CLIENT_SETTINGS_ITEMS,
  parseClientSettingsCollection,
  parseClientSettingsDocument,
} from '../clientSettingsImport'

describe('client settings import bounds', () => {
  it('rejects an oversized document before JSON parsing', () => {
    expect(() =>
      parseClientSettingsDocument('x'.repeat(MAX_CLIENT_SETTINGS_IMPORT_CHARS + 1)),
    ).toThrow(/maximum size/i)
  })

  it('rejects non-object JSON documents', () => {
    expect(() => parseClientSettingsDocument('[]')).toThrow(/JSON object/i)
  })

  it('rejects missing collections', () => {
    expect(() => parseClientSettingsCollection(JSON.stringify({}), 'aliases')).toThrow(
      /must be an array/i,
    )
  })

  it('rejects collections over the item cap', () => {
    const aliases = Array.from({ length: MAX_CLIENT_SETTINGS_ITEMS + 1 }, () => ({ id: 'alias' }))
    expect(() => parseClientSettingsCollection(JSON.stringify({ aliases }), 'aliases')).toThrow(
      new RegExp(`more than ${MAX_CLIENT_SETTINGS_ITEMS}`),
    )
  })

  it('returns a bounded collection unchanged', () => {
    const aliases = [{ id: 'alias-1' }]
    expect(parseClientSettingsCollection(JSON.stringify({ aliases }), 'aliases')).toEqual(aliases)
  })
})
