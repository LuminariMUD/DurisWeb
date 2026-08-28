export interface ClientIdRuntime {
  /** Browser-native UUID generator when available (secure contexts). */
  randomUUID?: () => string
  /** Browser random byte source, available more broadly than randomUUID. */
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

function browserRuntime(): ClientIdRuntime {
  if (typeof globalThis === 'undefined' || !globalThis.crypto) {
    return {}
  }

  const cryptoApi = globalThis.crypto
  return {
    randomUUID:
      typeof cryptoApi.randomUUID === 'function'
        ? () => cryptoApi.randomUUID()
        : undefined,
    getRandomValues:
      typeof cryptoApi.getRandomValues === 'function'
        ? (array) => cryptoApi.getRandomValues(array)
        : undefined,
  }
}

function fallbackUuid(runtime: ClientIdRuntime): string {
  const bytes = new Uint8Array(16)

  if (runtime.getRandomValues) {
    runtime.getRandomValues(bytes)
  } else {
    // These IDs are local record identifiers, never authentication material.
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  // RFC 4122 version 4 / variant 1 bits.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Create a unique local record ID on both secure and insecure browser origins.
 *
 * The existing IDs are checked so a weak/mocked/browser fallback source cannot
 * silently overwrite an existing alias, trigger, group, timer, or action.
 */
export function createClientId(
  existingIds: Iterable<string> = [],
  runtime: ClientIdRuntime = browserRuntime(),
): string {
  const usedIds = new Set(existingIds)

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = runtime.randomUUID?.() ?? fallbackUuid(runtime)
    if (!usedIds.has(candidate)) {
      return candidate
    }
  }

  throw new Error('Unable to generate a unique client ID')
}
