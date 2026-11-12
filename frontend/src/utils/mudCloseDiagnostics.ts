/** Allowlisted close categories; raw peer reason text is never retained or displayed. */
export type MudCloseCategory =
  | 'abnormal'
  | 'heartbeat_timeout'
  | 'session_replaced'
  | 'not_authorized'
  | 'protocol_error'
  | 'normal'
  | 'going_away'
  | 'other'

/** One bounded summary of the most recent game-socket closure. */
export interface MudCloseDiagnostic {
  closedAt: string
  code: number
  wasClean: boolean
  category: MudCloseCategory
  state: string
  connectedForMs: number | null
  lastSentAgoMs: number | null
  lastReceivedAgoMs: number | null
  pageHidden: boolean
  hiddenForMs: number | null
  online: boolean
}

export interface MudCloseInput {
  code: number
  reason: string
  wasClean: boolean
  state: string
  now: number
  openedAt: number | null
  lastSentAt: number | null
  lastReceivedAt: number | null
  hiddenSince: number | null
  online: boolean
}

// Exact reasons the MUD sends (src/net/comm.c, websocket.c, ws_handlers.c).
const REASON_CATEGORIES: Record<string, MudCloseCategory> = {
  'Ping timeout': 'heartbeat_timeout',
  'Duplicate session': 'session_replaced',
  Reconnected: 'session_replaced',
  'New connection': 'session_replaced',
  'Not authorized': 'not_authorized',
  'Protocol error': 'protocol_error',
  'Invalid data': 'protocol_error',
  'Message too big': 'protocol_error',
  'Internal error': 'protocol_error',
}

const EXPLANATIONS: Record<MudCloseCategory, string> = {
  abnormal:
    'The connection ended without a closing message (code 1006). The cause is unknown: it can come from the network, a proxy, the browser, or the server.',
  heartbeat_timeout:
    'The server stopped hearing from this browser and closed the connection (heartbeat timeout).',
  session_replaced: 'This session was replaced by a newer connection to your account.',
  not_authorized: 'The server refused this connection.',
  protocol_error: 'The server closed the connection after a protocol error.',
  normal: 'The connection was closed.',
  going_away: 'The server or browser closed the connection while going away.',
  other: 'The connection was closed.',
}

const ageMs = (now: number, at: number | null) => (at === null ? null : Math.max(0, now - at))

/** Classifies a close event into a bounded, payload-free diagnostic summary. */
export function buildMudCloseDiagnostic(input: MudCloseInput): MudCloseDiagnostic {
  const category: MudCloseCategory =
    input.code === 1006
      ? 'abnormal'
      : (REASON_CATEGORIES[input.reason] ??
        (input.code === 1000 ? 'normal' : input.code === 1001 ? 'going_away' : 'other'))
  return {
    closedAt: new Date(input.now).toISOString(),
    code: Number.isInteger(input.code) && input.code >= 0 && input.code <= 4999 ? input.code : 0,
    wasClean: input.wasClean,
    category,
    state: input.state.slice(0, 32),
    connectedForMs: ageMs(input.now, input.openedAt),
    lastSentAgoMs: ageMs(input.now, input.lastSentAt),
    lastReceivedAgoMs: ageMs(input.now, input.lastReceivedAt),
    pageHidden: input.hiddenSince !== null,
    hiddenForMs: ageMs(input.now, input.hiddenSince),
    online: input.online,
  }
}

/** Plain-language explanation for the reconnect dialog. */
export function explainMudClose(diagnostic: MudCloseDiagnostic): string {
  return EXPLANATIONS[diagnostic.category]
}

const seconds = (ms: number | null) => (ms === null ? 'n/a' : `${Math.round(ms / 1000)}s`)

/** Copyable plain-text summary for player reports; contains no identifiers or payloads. */
export function formatMudCloseDiagnostic(diagnostic: MudCloseDiagnostic): string {
  return [
    `time=${diagnostic.closedAt}`,
    `code=${diagnostic.code}`,
    `clean=${diagnostic.wasClean}`,
    `category=${diagnostic.category}`,
    `state=${diagnostic.state}`,
    `connected=${seconds(diagnostic.connectedForMs)}`,
    `last_sent=${seconds(diagnostic.lastSentAgoMs)}`,
    `last_received=${seconds(diagnostic.lastReceivedAgoMs)}`,
    `page_hidden=${diagnostic.pageHidden}${diagnostic.pageHidden ? ` (${seconds(diagnostic.hiddenForMs)})` : ''}`,
    `online=${diagnostic.online}`,
  ].join(' ')
}
