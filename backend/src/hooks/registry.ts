/**
 * The website<->MUD hook registry.
 *
 * This module is the single source of truth for hook ids. No other file may
 * define a hook id as a literal -- import from here instead. The module has no
 * I/O and no service dependencies, so it is safe to import from anywhere
 * without creating a cycle.
 *
 * Lookups are built once at module load and are pure in-memory reads, so a
 * toggle check on an event path never touches the database or disk.
 */

import type { HookChannel, HookDefinition, HookId } from './types.js';

const MUD_PROPERTY_PREFIX = 'durisweb.hook.';
const WEB_SETTING_PREFIX = 'hook_enabled_';

function mudKey(id: HookId): string {
  return `${MUD_PROPERTY_PREFIX}${id}`;
}

function webKey(id: HookId): string {
  return `${WEB_SETTING_PREFIX}${id}`;
}

const DEFINITIONS: readonly HookDefinition[] = Object.freeze([
  // --- channel: bridge (authenticated WebSocket, port 4050) ---
  {
    id: 'auction_new',
    channel: 'bridge',
    direction: 'mud_to_web',
    alwaysOn: false,
    webSettingKey: webKey('auction_new'),
    mudPropertyKey: mudKey('auction_new'),
    owner: 'backend/src/services/mudAuctionClient.ts',
    mudSite: 'src/net/ws_handlers.c:ws_broadcast_auction_new',
    description: 'New auction listings broadcast from the MUD.',
  },
  {
    id: 'auction_bid',
    channel: 'bridge',
    direction: 'mud_to_web',
    alwaysOn: false,
    webSettingKey: webKey('auction_bid'),
    mudPropertyKey: mudKey('auction_bid'),
    owner: 'backend/src/services/mudAuctionClient.ts',
    mudSite: 'src/net/ws_handlers.c:ws_broadcast_auction_bid',
    description: 'Auction bid events broadcast from the MUD.',
  },
  {
    id: 'auction_close',
    channel: 'bridge',
    direction: 'mud_to_web',
    alwaysOn: false,
    webSettingKey: webKey('auction_close'),
    mudPropertyKey: mudKey('auction_close'),
    owner: 'backend/src/services/mudAuctionClient.ts',
    mudSite: 'src/net/ws_handlers.c:ws_broadcast_auction_close',
    description: 'Auction close and settlement events from the MUD.',
  },
  {
    id: 'player_presence',
    channel: 'bridge',
    direction: 'mud_to_web',
    alwaysOn: false,
    webSettingKey: webKey('player_presence'),
    mudPropertyKey: mudKey('player_presence'),
    owner: 'backend/src/services/playerEventSubscriber.ts',
    mudSite: 'src/net/ws_handlers.c:ws_broadcast_player_login,ws_broadcast_player_logout',
    description:
      'Player login and logout presence. One hook covers both MUD emitters; ' +
      'presence also has a Redis current-state feed read by onlinePlayersService. ' +
      'Payloads omit account names and IPs unless DURISWEB_PRIVATE_PRESENCE is TRUE.',
  },
  {
    id: 'mud_shutdown',
    channel: 'bridge',
    direction: 'mud_to_web',
    alwaysOn: false,
    webSettingKey: webKey('mud_shutdown'),
    mudPropertyKey: mudKey('mud_shutdown'),
    owner: 'backend/src/services/mudAuctionClient.ts',
    mudSite: 'src/net/ws_handlers.c:ws_broadcast_mud_shutdown',
    description: 'MUD shutdown and crash notifications.',
  },
  {
    id: 'wholist',
    channel: 'bridge',
    direction: 'mud_to_web',
    alwaysOn: false,
    webSettingKey: webKey('wholist'),
    mudPropertyKey: mudKey('wholist'),
    owner: 'backend/src/services/mudAuctionClient.ts',
    mudSite: 'src/net/ws_handlers.c:ws_send_wholist_to_client',
    description:
      'Online player list served in response to request_wholist. Registered on ' +
      'the response, which is what an operator would cut.',
  },
  {
    id: 'admin_delete_character',
    channel: 'bridge',
    direction: 'web_to_mud',
    alwaysOn: false,
    webSettingKey: webKey('admin_delete_character'),
    mudPropertyKey: mudKey('admin_delete_character'),
    owner: 'backend/src/services/userManagementService.ts',
    mudSite: 'src/net/ws_handlers.c:ws_cmd_admin_delete_character',
    description: 'Administrative character deletion requested by the website.',
  },

  // --- channel: pubsub (scoped Redis) ---
  {
    id: 'donation_delivery',
    channel: 'pubsub',
    direction: 'web_to_mud',
    alwaysOn: false,
    webSettingKey: webKey('donation_delivery'),
    mudPropertyKey: mudKey('donation_delivery'),
    owner: 'backend/src/services/donationOutboxService.ts',
    mudSite: 'src/redis/redis_donation_worker.c',
    description:
      'Signed donation events delivered to the MUD over scoped Redis. The MUD ' +
      'side is a Redis worker, not a WebSocket emitter.',
  },

  // --- channel: flatfile (filesystem, unauthenticated by construction) ---
  {
    id: 'connection_log',
    channel: 'flatfile',
    direction: 'mud_to_web',
    alwaysOn: false,
    webSettingKey: webKey('connection_log'),
    mudPropertyKey: null,
    owner: 'backend/src/services/mudConnectionLogSync.ts',
    mudSite: null,
    description:
      'Connection login and logout records tailed from the MUD comm log. ' +
      'Website-side only: the lines durisweb parses are ordinary LOG_COMM ' +
      'operational logs the MUD writes for its own purposes, so gating them ' +
      'on the MUD would delete admin-facing records to control a web hook. ' +
      'The toggle stops durisweb ingesting, not the MUD logging.',
  },
  {
    id: 'flag_parsing',
    channel: 'flatfile',
    direction: 'mud_to_web',
    alwaysOn: false,
    webSettingKey: webKey('flag_parsing'),
    mudPropertyKey: null,
    owner: 'backend/src/services/mudFlagParser.ts',
    mudSite: null,
    description:
      'Builder flag definitions read from MUD source files. Website-side read; ' +
      'the MUD has no emitter to gate.',
  },
  {
    id: 'guild_parsing',
    channel: 'flatfile',
    direction: 'mud_to_web',
    alwaysOn: false,
    webSettingKey: webKey('guild_parsing'),
    mudPropertyKey: null,
    owner: 'backend/src/services/mudGuildParser.ts',
    mudSite: null,
    description:
      'Guild definitions read from MUD data files. Website-side read; the MUD ' +
      'has no emitter to gate.',
  },
  {
    id: 'zone_builder_parsing',
    channel: 'flatfile',
    direction: 'mud_to_web',
    alwaysOn: false,
    webSettingKey: webKey('zone_builder_parsing'),
    mudPropertyKey: null,
    owner: 'backend/src/services/zoneBuilderParser.ts',
    mudSite: null,
    description:
      'Zone and area files parsed for the builder tools. Website-side read; the ' +
      'MUD has no emitter to gate.',
  },

  // --- channel: process (web drives host processes) ---
  {
    id: 'process_control',
    channel: 'process',
    direction: 'web_to_mud',
    alwaysOn: false,
    webSettingKey: webKey('process_control'),
    mudPropertyKey: null,
    owner: 'backend/src/services/mudControlService.ts',
    mudSite: null,
    description:
      'Start, stop, and reboot of the MUD process from the website. Gated by ' +
      'the mud_control permission; the MUD has no in-process side to toggle.',
  },

  // --- channel: terminal (always on) ---
  {
    id: 'terminal',
    channel: 'terminal',
    direction: 'web_to_mud',
    alwaysOn: true,
    webSettingKey: null,
    mudPropertyKey: null,
    owner: 'backend/src/services/terminalService.ts',
    mudSite: null,
    description:
      'Sandboxed interactive shell for operators. Deliberately not toggleable: ' +
      'it is the recovery path when other hooks fail. Its terminal_access ' +
      'permission gate is its only control.',
  },
] as const satisfies readonly HookDefinition[]);

const BY_ID: ReadonlyMap<string, HookDefinition> = new Map(
  DEFINITIONS.map((hook) => [hook.id, hook]),
);

const BY_CHANNEL: ReadonlyMap<HookChannel, readonly HookDefinition[]> = (() => {
  const grouped = new Map<HookChannel, HookDefinition[]>();
  for (const hook of DEFINITIONS) {
    const existing = grouped.get(hook.channel);
    if (existing) {
      existing.push(hook);
    } else {
      grouped.set(hook.channel, [hook]);
    }
  }
  return new Map(
    [...grouped].map(([channel, hooks]) => [channel, Object.freeze(hooks)]),
  );
})();

/** Every registered hook, including the always-on terminal. */
export function getAllHooks(): readonly HookDefinition[] {
  return DEFINITIONS;
}

/**
 * True when the value names a registered hook. Use this to narrow untrusted
 * input before calling requireHook.
 */
export function isHookId(value: unknown): value is HookId {
  return typeof value === 'string' && BY_ID.has(value);
}

/**
 * Look up a hook, or undefined when the id is unregistered.
 *
 * Callers deciding whether to deliver an event must not treat undefined as
 * enabled -- an unregistered id is a bug, not an open gate. Prefer requireHook
 * on any path where the id is expected to exist.
 */
export function getHook(id: string): HookDefinition | undefined {
  return BY_ID.get(id);
}

/**
 * Look up a hook, throwing when the id is unregistered. Use this on internal
 * paths so a typo fails loudly at the call site instead of silently reading as
 * an enabled hook downstream.
 */
export function requireHook(id: string): HookDefinition {
  const hook = BY_ID.get(id);
  if (!hook) {
    throw new Error(
      `Unregistered hook id: ${JSON.stringify(id)}. Hook ids are defined only in backend/src/hooks/registry.ts.`,
    );
  }
  return hook;
}

/** Hooks that have a toggle. Excludes always-on hooks. */
export function getToggleableHooks(): readonly HookDefinition[] {
  return DEFINITIONS.filter((hook) => !hook.alwaysOn);
}

/** Hooks on one channel, empty when the channel has none. */
export function getHooksByChannel(
  channel: HookChannel,
): readonly HookDefinition[] {
  return BY_CHANNEL.get(channel) ?? [];
}

/**
 * Hooks with a MUD-side gate. Session 02 iterates this to generate the
 * duris.properties block, so the two sides cannot drift.
 */
export function getMudGatedHooks(): readonly HookDefinition[] {
  return DEFINITIONS.filter((hook) => hook.mudPropertyKey !== null);
}
