export const MAX_CLIENT_SETTINGS_IMPORT_CHARS = 1_000_000
export const MAX_CLIENT_SETTINGS_ITEMS = 1_000

export function parseClientSettingsDocument(json: unknown): Record<string, unknown> {
  if (typeof json !== 'string') {
    throw new Error('Client settings import must be a JSON string')
  }

  if (json.length > MAX_CLIENT_SETTINGS_IMPORT_CHARS) {
    throw new Error(
      `Client settings import exceeds the maximum size of ${MAX_CLIENT_SETTINGS_IMPORT_CHARS} characters`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Client settings import is not valid JSON')
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Client settings import must contain a JSON object')
  }

  return parsed as Record<string, unknown>
}

export function parseClientSettingsCollection(json: unknown, collectionKey: string): unknown[] {
  const document = parseClientSettingsDocument(json)
  const collection = document[collectionKey]

  if (!Array.isArray(collection)) {
    throw new Error(`Invalid client settings data: ${collectionKey} must be an array`)
  }

  if (collection.length > MAX_CLIENT_SETTINGS_ITEMS) {
    throw new Error(
      `Client settings import contains more than ${MAX_CLIENT_SETTINGS_ITEMS} ${collectionKey}`,
    )
  }

  return collection
}
