import type { HookStatus, HooksResponse, MudTransportStatus } from '@/types/hooks'

export const transport: MudTransportStatus = {
  scheme: 'wss',
  host: 'mud.example.test',
  port: '4050',
  loopback: false,
  connected: true,
  authenticated: true,
  certificateExpiresAt: '2027-01-01T00:00:00.000Z',
  certificateStatus: 'valid',
  secretRotatedAt: '2026-08-01T00:00:00.000Z',
  secretAgeDays: 31,
  blocked: false,
  reason: null,
}

export function hook(overrides: Partial<HookStatus> = {}): HookStatus {
  return {
    id: 'auction_new',
    channel: 'bridge',
    direction: 'mud_to_web',
    alwaysOn: false,
    description: 'New auction listings broadcast from the MUD.',
    webEnabled: true,
    mudState: 'enabled',
    provenance: {
      web: { actor: 'Cwial', changedAt: '2026-09-01T10:00:00.000Z' },
      mud: { source: 'authenticated_bridge', reportedAt: '2026-09-01T10:00:01.000Z' },
    },
    lastActivityAt: '2026-09-01T10:01:00.000Z',
    resource: null,
    effective: 'on',
    active: true,
    reason: 'Enabled on both ends.',
    ...overrides,
  }
}

const hookInventory = [
  ['auction_new', 'bridge'], ['auction_bid', 'bridge'], ['auction_close', 'bridge'],
  ['player_presence', 'bridge'], ['mud_shutdown', 'bridge'], ['wholist', 'bridge'],
  ['admin_delete_character', 'bridge'], ['donation_delivery', 'pubsub'],
  ['connection_log', 'flatfile'], ['flag_parsing', 'flatfile'],
  ['guild_parsing', 'flatfile'], ['zone_builder_parsing', 'flatfile'],
  ['process_control', 'process'], ['terminal', 'terminal'],
] as const

export const allHooks: HookStatus[] = hookInventory.map(([id, channel]) => hook({
  id,
  channel: channel as HookStatus['channel'],
  alwaysOn: id === 'terminal',
  mudState: ['connection_log', 'flag_parsing', 'guild_parsing', 'zone_builder_parsing', 'process_control', 'terminal'].includes(id)
    ? 'not_gated'
    : 'enabled',
  reason: id === 'terminal' ? 'Always on; not toggleable.' : 'Enabled.',
}))

export const response: HooksResponse = {
  hooks: allHooks,
  transport,
  refreshedAt: '2026-09-01T10:02:00.000Z',
}
