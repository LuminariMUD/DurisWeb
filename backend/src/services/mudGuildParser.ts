/**
 * @deprecated Use guildService.ts instead - this file previously read from pfiles which are no longer used.
 * The MUD now writes directly to database.
 *
 * This file re-exports from guildService for backwards compatibility.
 */

// re-export everything from guildService for backwards compat
export {
  GuildData,
  CharacterGuildInfo,
  getGuild,
  parseGuildFile,
  findCharacterGuild,
  getCharacterGuildInfoFromGuild,
  getAllGuilds,
  searchGuilds,
} from './guildService.js';
