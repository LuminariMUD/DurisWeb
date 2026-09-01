// Browser player connections must not carry the privileged DurisWeb service
// secret. The MUD receives this informational identity without authentication.
export function buildDurisWebClientInfo(): { client: string; version: string } {
  return { client: 'DurisWeb', version: '1.0.0' }
}
