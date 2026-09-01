/**
 * Types for the website<->MUD hook registry.
 *
 * Hook ids are the shared vocabulary between this repository and the DurisMUD
 * repository. The same string appears in `web_settings`, in
 * `lib/duris.properties`, in logs, and in the operator console. Ids are
 * permanent once released -- renaming one is a migration on both sides.
 */

/** Transport family a hook travels over. Each has its own trust boundary. */
export type HookChannel =
  | 'bridge'
  | 'pubsub'
  | 'flatfile'
  | 'process'
  | 'terminal';

/** Which system initiates the flow. */
export type HookDirection = 'mud_to_web' | 'web_to_mud';

/** Every registered hook id. The registry is the only place these are defined. */
export type HookId =
  | 'auction_new'
  | 'auction_bid'
  | 'auction_close'
  | 'player_presence'
  | 'mud_shutdown'
  | 'wholist'
  | 'admin_delete_character'
  | 'donation_delivery'
  | 'connection_log'
  | 'flag_parsing'
  | 'guild_parsing'
  | 'zone_builder_parsing'
  | 'process_control'
  | 'terminal';

export interface HookDefinition {
  /** Stable identifier, identical on both ends. */
  readonly id: HookId;
  readonly channel: HookChannel;
  readonly direction: HookDirection;
  /**
   * True only for hooks that must never be disabled. An always-on hook has no
   * toggle on either end; its permission gate is its only control.
   */
  readonly alwaysOn: boolean;
  /** Key in the `web_settings` table. Null only when `alwaysOn`. */
  readonly webSettingKey: string | null;
  /**
   * Key in the MUD's `lib/duris.properties`, always `durisweb.hook.<id>`.
   * Null when the MUD has no side to gate -- a hook the website drives or
   * reads on its own.
   */
  readonly mudPropertyKey: string | null;
  /** durisweb service that owns this hook, repo-relative. */
  readonly owner: string;
  /**
   * MUD-side symbol or file the hook is gated at, for cross-repo work.
   * Null when the hook has no MUD-side implementation.
   */
  readonly mudSite: string | null;
  readonly description: string;
}
