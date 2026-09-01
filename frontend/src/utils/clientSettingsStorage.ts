export class ClientSettingsStorageError extends Error {
  readonly cause?: unknown

  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'ClientSettingsStorageError'
    if (options?.cause !== undefined) {
      this.cause = options.cause
    }
  }
}

export function writeClientSettings(key: string | null, data: unknown): void {
  if (!key) {
    throw new ClientSettingsStorageError('No active MUD account is available for client settings.')
  }

  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (cause) {
    throw new ClientSettingsStorageError(
      'Client settings could not be saved in this browser. Check storage permissions or available space and try again.',
      { cause },
    )
  }
}
