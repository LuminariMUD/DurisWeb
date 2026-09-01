/**
 * @deprecated Use guildService.ts instead.
 *
 * This compatibility facade preserves the historical parser API while the MUD
 * now writes guild data directly to the shared database. The website hook gate
 * is intentionally checked before any database-backed service call.
 */

import { isHookEnabledSync } from '../hooks/hookGate.js';
import { recordHookActivity } from '../hooks/hookActivity.js';
import * as guildService from './guildService.js';

export type {
  CharacterGuildInfo,
  GuildData,
} from './guildService.js';

export async function getGuild(
  guildId: number,
): ReturnType<typeof guildService.getGuild> {
  if (!isHookEnabledSync('guild_parsing')) return null;
  const result = await guildService.getGuild(guildId);
  recordHookActivity('guild_parsing');
  return result;
}

export async function parseGuildFile(
  guildId: number,
): ReturnType<typeof guildService.parseGuildFile> {
  if (!isHookEnabledSync('guild_parsing')) return null;
  const result = await guildService.parseGuildFile(guildId);
  recordHookActivity('guild_parsing');
  return result;
}

export async function findCharacterGuild(
  characterName: string,
): ReturnType<typeof guildService.findCharacterGuild> {
  if (!isHookEnabledSync('guild_parsing')) return null;
  const result = await guildService.findCharacterGuild(characterName);
  recordHookActivity('guild_parsing');
  return result;
}

export async function getCharacterGuildInfoFromGuild(
  characterName: string,
  guildId: number,
): ReturnType<typeof guildService.getCharacterGuildInfoFromGuild> {
  if (!isHookEnabledSync('guild_parsing')) return null;
  const result = await guildService.getCharacterGuildInfoFromGuild(characterName, guildId);
  recordHookActivity('guild_parsing');
  return result;
}

export async function getAllGuilds(): ReturnType<typeof guildService.getAllGuilds> {
  if (!isHookEnabledSync('guild_parsing')) return [];
  const result = await guildService.getAllGuilds();
  recordHookActivity('guild_parsing');
  return result;
}

export async function searchGuilds(
  query: string,
  limit?: number,
): ReturnType<typeof guildService.searchGuilds> {
  if (!isHookEnabledSync('guild_parsing')) return [];
  const result = await guildService.searchGuilds(query, limit);
  recordHookActivity('guild_parsing');
  return result;
}
