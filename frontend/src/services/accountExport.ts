import { frontendConfiguration } from '@/config/environment'
import { getCsrfToken } from './api'

const MAX_BYTES = 4 * 1024 * 1024

export async function requestAccountExport(
  password: string,
  expectedAccount: string,
  signal: AbortSignal,
): Promise<Blob> {
  const csrf = getCsrfToken()
  if (!csrf) throw new Error('Refresh this page before downloading your data.')
  const response = await fetch(`${frontendConfiguration.apiUrl}/api/privacy/export`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: 'Enter your current password.',
      401: 'Your sign-in or password could not be verified. Sign in again and retry.',
      403: 'Refresh this page and try again.',
      413: 'Your data exceeds the download limit. Contact the privacy contact below for assistance.',
      429: 'Too many download attempts. Please wait 15 minutes before trying again.',
    }
    throw new Error(
      messages[response.status] ?? 'Your data could not be downloaded. Please try again later.',
    )
  }
  if (
    !response.headers.get('content-type')?.startsWith('application/json') ||
    Number(response.headers.get('content-length')) > MAX_BYTES
  )
    throw new Error('The download response could not be verified.')
  const payload = await response.text()
  const blob = new Blob([payload], { type: 'application/json' })
  if (blob.size > MAX_BYTES) throw new Error('The download exceeds the supported size.')
  let data: unknown
  try {
    data = JSON.parse(payload)
  } catch {
    throw new Error('The download response could not be verified.')
  }
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !('accountName' in data) ||
    typeof data.accountName !== 'string' ||
    data.accountName.toLowerCase() !== expectedAccount.toLowerCase() ||
    !('schemaVersion' in data) ||
    data.schemaVersion !== 1 ||
    !('scope' in data) ||
    data.scope !== 'partial-website-data' ||
    !('completeAccountExport' in data) ||
    data.completeAccountExport !== false
  )
    throw new Error('The download does not match your signed-in account.')
  return blob
}
