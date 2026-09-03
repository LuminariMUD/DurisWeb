interface ApiErrorResponse {
  status?: unknown
  data?: { code?: unknown }
}

/** Narrow an unknown client error to one stable backend error contract. */
export function hasApiErrorCode(error: unknown, status: number, code: string): boolean {
  if (!error || typeof error !== 'object' || !('response' in error)) return false
  const response = (error as { response?: ApiErrorResponse }).response
  return response?.status === status && response.data?.code === code
}
