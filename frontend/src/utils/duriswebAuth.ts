// Default secret (fallback if env var not set) - must match MUD server
const DEFAULT_SECRET = 'Dur1sM4pK3y2025xYz!'
const SECRET = import.meta.env.VITE_GMCP_SECRET || DEFAULT_SECRET

export async function generateDurisWebSignature(): Promise<string> {
  const minute = Math.floor(Date.now() / 60000)
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(String(minute)))

  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
