export type HookChannel = 'bridge' | 'pubsub' | 'flatfile' | 'process' | 'terminal'
export type HookDirection = 'mud_to_web' | 'web_to_mud'
export type MudHookState = 'enabled' | 'disabled' | 'not_gated' | 'unknown' | 'unavailable'
export type EffectiveHookState = 'on' | 'off' | 'mismatch' | 'unknown' | 'unavailable'

export interface HookProvenance {
  actor: string | null
  changedAt: string | null
}

export interface HookResourceHealth {
  availability: 'available' | 'unavailable'
  reason: string | null
  droppedInputs: number
  retryAt: string | null
}

export interface HookStatus {
  id: string
  channel: HookChannel
  direction: HookDirection
  alwaysOn: boolean
  description: string
  webEnabled: boolean
  mudState: MudHookState
  provenance: {
    web: HookProvenance
    mud: { source: string | null; reportedAt: string | null }
  }
  lastActivityAt: string | null
  resource: HookResourceHealth | null
  effective: EffectiveHookState
  active: boolean
  reason: string
}

export interface MudTransportStatus {
  scheme: 'ws' | 'wss' | null
  host: string | null
  port: string | null
  loopback: boolean | null
  connected: boolean
  authenticated: boolean
  certificateExpiresAt: string | null
  certificateStatus: 'valid' | 'expired' | 'not_applicable' | 'unknown'
  secretRotatedAt: string | null
  secretAgeDays: number | null
  blocked: boolean
  reason: string | null
}

export interface HooksResponse {
  hooks: HookStatus[]
  transport: MudTransportStatus
  refreshedAt: string
}

export interface ReconcileResponse {
  complete: boolean
  warning: string | null
  hook: HookStatus
}

export interface HookSummary {
  total: number
  active: number
  off: number
  mismatch: number
  unknown: number
}
