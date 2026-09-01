/**
 * MUD Source Code Parser
 *
 * Parses flag definitions from DurisMUD source files (common.c, fight.c, etc.)
 * to populate the builder_flags database table.
 *
 * Uses MUD_DIR from environment variables - NEVER hardcodes paths!
 */

import { isHookEnabledSync } from '../hooks/hookGate.js';
import { recordDroppedFlatfileInput } from '../hooks/flatfileHookState.js';
import logger from '../utils/logger.js';
import { readMudTextFile } from './flatfileAccess.js';

export interface ParsedFlag {
  name: string;
  value: number;
  description?: string;
  ansiName?: string;
  shortCode?: string;
  sourceFile?: string;
}

export interface ParseResult {
  category: string;
  flags: ParsedFlag[];
  sourceFile: string;
}

const CURRENT_SOURCE_PATHS: Readonly<Record<string, string>> = Object.freeze({
  'src/common.c': 'src/core/common.c',
  'src/fight.c': 'src/combat/fight.c',
  'src/constant.c': 'src/core/constant.c',
  'src/defines.h': 'src/core/defines.h',
});

export class MudFlagParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MudFlagParseError';
  }
}

export class MudFlagParser {
  /**
   * Parse all flag categories from MUD source
   */
  async parseAllFlags(): Promise<ParseResult[]> {
    if (!isHookEnabledSync('flag_parsing')) {
      throw new MudFlagParseError('flag_parsing is disabled on the website.');
    }
    const results: ParseResult[] = [];

    // Object flags
    results.push(await this.parseWearBits());
    results.push(await this.parseExtraBits());
    results.push(await this.parseExtra2Bits());
    results.push(await this.parseItemTypes());
    results.push(await this.parseApplyTypes());
    results.push(await this.parseWeaponTypes());
    results.push(await this.parseWeaponDamageTypes());
    results.push(await this.parseCraftsmanship());
    results.push(await this.parseMaterials());
    // Note: obj_class_restrict and obj_race_restrict removed - use mob_class and mob_race instead
    // The bitvector value can be calculated as (1 << index) when needed for object restrictions

    // NOTE: ITEM_ANTI_*, ITEM_ANTI2_*, ITEM_ALLOW2_* defines EXIST in defines.h but are NEVER USED in .c files
    // The actual restriction system uses obj->anti_flags (class) and obj->anti2_flags (race) directly:
    // - handler.c line 3988: IS_SET(obj->anti_flags, ch->player.m_class) - class bitfield check
    // - handler.c line 3948: IS_SET(obj->anti2_flags, 1 << (GET_RACE(ch) - 1)) - race converted to bit

    // Room flags
    results.push(await this.parseRoomBits());
    results.push(await this.parseSectorTypes());
    results.push(await this.parseExitBits());

    // Mob flags
    results.push(await this.parseActionBits());
    results.push(await this.parseAction2Bits());
    results.push(await this.parseAggroBits());
    results.push(await this.parseAggro2Bits());

    // Class and Race
    results.push(await this.parseClassNames());
    results.push(await this.parseRaceNames());

    // Affected flags
    results.push(await this.parseAffected1Bits());
    results.push(await this.parseAffected2Bits());
    results.push(await this.parseAffected3Bits());
    results.push(await this.parseAffected4Bits());
    results.push(await this.parseAffected5Bits());

    // Player flags (from constant.c)
    results.push(await this.parsePlayerBits());
    results.push(await this.parsePlayer2Bits());

    return this.validateResults(results);
  }

  /**
   * Read a source file
   */
  private async readSourceFile(relativePath: string): Promise<string> {
    return readMudTextFile(
      'flag_parsing',
      CURRENT_SOURCE_PATHS[relativePath] ?? relativePath,
    );
  }

  private validateResults(results: ParseResult[]): ParseResult[] {
    const seenCategories = new Set<string>();
    let rejected = 0;
    const rejectedCategories = new Set<string>();
    const normalized = results.map((result) => {
      const sourceFile = CURRENT_SOURCE_PATHS[result.sourceFile] ?? result.sourceFile;
      if (!result.category || seenCategories.has(result.category) || result.flags.length === 0) {
        rejected += 1;
        rejectedCategories.add(result.category || 'unknown');
      }
      seenCategories.add(result.category);

      const seenNames = new Set<string>();
      const flags = result.flags.map((flag) => {
        const flagSource = CURRENT_SOURCE_PATHS[flag.sourceFile ?? sourceFile] ??
          (flag.sourceFile ?? sourceFile);
        if (
          !flag.name ||
          seenNames.has(flag.name) ||
          !Number.isSafeInteger(flag.value)
        ) {
          rejected += 1;
          rejectedCategories.add(result.category || 'unknown');
        }
        seenNames.add(flag.name);
        return { ...flag, sourceFile: flagSource };
      });

      return { ...result, sourceFile, flags };
    });

    if (rejected > 0) {
      recordDroppedFlatfileInput('flag_parsing', rejected);
      throw new MudFlagParseError(
        `Flag source validation rejected ${rejected} record(s) in: ` +
        [...rejectedCategories].sort().join(', '),
      );
    }
    return normalized;
  }

  /**
   * Parse flagDef arrays from common.c
   * Format: {"SHORT", "Long description", editable, default}
   */
  private async parseFlagDefArray(
    arrayName: string,
    category: string
  ): Promise<ParseResult> {
    const content = await this.readSourceFile('src/common.c');
    const flags: ParsedFlag[] = [];

    // Find the array - handle multiline with proper regex
    const arrayRegex = new RegExp(
      `flagDef\\s+${arrayName}\\s*\\[[^\\]]*\\]\\s*=\\s*\\{([\\s\\S]*?)\\{\\s*\\}`,
      'm'
    );
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      logger.warn(`Array ${arrayName} not found in common.c`);
      return { category, flags: [], sourceFile: 'src/common.c' };
    }

    // Parse each entry
    const entryRegex = /\{\s*"([^"]+)",\s*"([^"]+)",\s*(\d+),\s*(\d+)\s*\}/g;
    let match;
    let index = 0;

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      flags.push({
        name: match[1],
        value: 1 << index, // BIT_N = 2^(index)
        description: match[2],
        sourceFile: 'src/common.c',
      });
      index++;
    }

    return { category, flags, sourceFile: 'src/common.c' };
  }

  /**
   * Parse simple string arrays from common.c
   * Format: "STRING", "STRING2", ...
   */
  private async parseStringArray(
    arrayName: string,
    category: string
  ): Promise<ParseResult> {
    const content = await this.readSourceFile('src/common.c');
    const flags: ParsedFlag[] = [];

    // Find the array - handle with size specifier like [NUM_SECT_TYPES + 1]
    const arrayRegex = new RegExp(
      `const\\s+char\\s*\\*\\s*${arrayName}\\s*\\[[^\\]]*\\]\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`,
      'm'
    );
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      logger.warn(`String array ${arrayName} not found in common.c`);
      return { category, flags: [], sourceFile: 'src/common.c' };
    }

    // Parse each string entry
    const entryRegex = /"([^"]+)"/g;
    let match;
    let index = 0;

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      // Skip terminator entries
      if (match[1] === '\\n' || match[1] === '\n') break;

      flags.push({
        name: match[1].toUpperCase().replace(/[^A-Z0-9]/g, '_'),
        value: index,
        description: match[1],
        sourceFile: 'src/common.c',
      });
      index++;
    }

    return { category, flags, sourceFile: 'src/common.c' };
  }

  // ============ OBJECT FLAGS ============

  async parseWearBits(): Promise<ParseResult> {
    return this.parseFlagDefArray('wear_bits', 'obj_wear');
  }

  async parseExtraBits(): Promise<ParseResult> {
    return this.parseFlagDefArray('extra_bits', 'obj_extra');
  }

  async parseExtra2Bits(): Promise<ParseResult> {
    return this.parseFlagDefArray('extra2_bits', 'obj_extra2');
  }

  async parseItemTypes(): Promise<ParseResult> {
    return this.parseStringArray('item_types', 'obj_type');
  }

  async parseApplyTypes(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/common.c');
    const flags: ParsedFlag[] = [];

    // Parse apply_types array for short names
    const typesRegex =
      /const\s+char\s*\*\s*apply_types\s*\[\]\s*=\s*\{([\s\S]*?)\n\};/m;
    const typesMatch = content.match(typesRegex);

    // Parse apply_names array for descriptions
    const namesRegex =
      /const\s+char\s*\*\s*apply_names\s*\[\]\s*=\s*\{([\s\S]*?)\n\};/m;
    const namesMatch = content.match(namesRegex);

    if (!typesMatch) {
      return { category: 'obj_apply', flags: [], sourceFile: 'src/common.c' };
    }

    const shortNames: string[] = [];
    const longNames: string[] = [];

    // Extract short names
    const shortRegex = /"([^"]+)"/g;
    let match;
    while ((match = shortRegex.exec(typesMatch[1])) !== null) {
      if (match[1] === '\\n' || match[1] === '\n') break;
      shortNames.push(match[1]);
    }

    // Extract long names if available
    if (namesMatch) {
      const longRegex = /"([^"]+)"/g;
      while ((match = longRegex.exec(namesMatch[1])) !== null) {
        if (match[1] === '\\n' || match[1] === '\n') break;
        longNames.push(match[1]);
      }
    }

    // Combine
    for (let i = 0; i < shortNames.length; i++) {
      flags.push({
        name: shortNames[i],
        value: i,
        description: longNames[i] || shortNames[i],
        sourceFile: 'src/common.c',
      });
    }

    return { category: 'obj_apply', flags, sourceFile: 'src/common.c' };
  }

  async parseWeaponTypes(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/common.c');
    const flags: ParsedFlag[] = [];

    // Find weapon_types array - uses different format with 4 fields
    const arrayRegex =
      /flagDef\s+weapon_types\s*\[[^\]]*\]\s*=\s*\{([\s\S]*?)\n\};/m;
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      return { category: 'weapon_type', flags: [], sourceFile: 'src/common.c' };
    }

    // Parse: {"WEAPON_NAME", "description", editable, value}
    const entryRegex =
      /\{\s*"([^"]+)",\s*"([^"]+)",\s*\d+,\s*(?:WEAPON_[A-Z0-9_]+|(\d+))\s*\}/g;
    let match;
    let index = 0;

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      flags.push({
        name: match[1].replace('WEAPON_', ''),
        value: index,
        description: match[2],
        sourceFile: 'src/common.c',
      });
      index++;
    }

    return { category: 'weapon_type', flags, sourceFile: 'src/common.c' };
  }

  async parseWeaponDamageTypes(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/fight.c');
    const flags: ParsedFlag[] = [];

    // Find attack_hit_text array
    const arrayRegex =
      /struct\s+attack_hit_type\s+attack_hit_text\s*\[\]\s*=\s*\{([\s\S]*?)\n\};/m;
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      return {
        category: 'weapon_damage',
        flags: [],
        sourceFile: 'src/fight.c',
      };
    }

    // Parse: {"singular", "plural", "past"}
    const entryRegex = /\{\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\s*\}/g;
    let match;
    let index = 0;

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      flags.push({
        name: match[1].toUpperCase(),
        value: index,
        description: `${match[1]}/${match[2]}`,
        sourceFile: 'src/fight.c',
      });
      index++;
    }

    return { category: 'weapon_damage', flags, sourceFile: 'src/fight.c' };
  }

  async parseCraftsmanship(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/common.c');
    const flags: ParsedFlag[] = [];

    // Find craftsmanship_names array
    const arrayRegex =
      /const\s+char\s*\*\s*craftsmanship_names\s*\[[^\]]*\]\s*=\s*\{([\s\S]*?)\n\};/m;
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      return {
        category: 'obj_craftsmanship',
        flags: [],
        sourceFile: 'src/common.c',
      };
    }

    const entryRegex = /"([^"]+)"/g;
    let match;
    let index = 0;

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      if (match[1] === '\\n' || match[1] === '\n') break;
      flags.push({
        name: `CRAFT_${index}`,
        value: index,
        description: match[1],
        sourceFile: 'src/common.c',
      });
      index++;
    }

    return { category: 'obj_craftsmanship', flags, sourceFile: 'src/common.c' };
  }

  async parseMaterials(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/common.c');
    const flags: ParsedFlag[] = [];

    // Find materials struct array
    const arrayRegex =
      /struct\s+material_data\s+materials\s*\[[^\]]*\]\s*=\s*\{([\s\S]*?)\n\};/m;
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      return {
        category: 'obj_material',
        flags: [],
        sourceFile: 'src/common.c',
      };
    }

    // Parse: {"&+Lname&n", {values...}}
    // Each entry spans multiple lines, so we need to match the name string
    const entryRegex = /\{\s*"([^"]+)"/g;
    let match;
    let index = 0;

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      // Extract name, strip ANSI codes for the name field
      const ansiName = match[1];
      const plainName = ansiName
        .replace(/&[+=-][A-Za-z]/g, '')
        .replace(/&n/g, '')
        .trim();

      flags.push({
        name: plainName.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
        value: index,
        description: plainName,
        ansiName: ansiName,
        sourceFile: 'src/common.c',
      });
      index++;
    }

    return { category: 'obj_material', flags, sourceFile: 'src/common.c' };
  }

  async parseClassRestrictions(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/common.c');
    const flags: ParsedFlag[] = [];

    // Class restriction flags are derived from class_names_table
    // The class bitvector uses CLASS_* defines: CLASS_WARRIOR=BIT_1, etc.
    // Can be used as "anti-class" OR "allowed-class" depending on ITEM_ALLOWED_CLASSES flag
    const arrayRegex =
      /const\s+struct\s+class_names\s+class_names_table\s*\[\]\s*=\s*\{([\s\S]*?)NULL,\s*NULL,\s*NULL/m;
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      return {
        category: 'obj_class_restrict',
        flags: [],
        sourceFile: 'src/common.c',
      };
    }

    // Parse: {"Name", "&+Color&n", "Short", 'c'}
    const entryRegex =
      /\{\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*'([^']+)'\s*\}/g;
    let match;
    let index = 0;

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      const className = match[1];
      // Skip CLASS_NONE (index 0)
      if (index === 0) {
        index++;
        continue;
      }

      flags.push({
        name: className.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
        value: 1 << (index - 1), // BIT_1 = 1, BIT_2 = 2, etc.
        description: className,
        ansiName: match[2],
        shortCode: match[3],
        sourceFile: 'src/common.c',
      });
      index++;
    }

    return { category: 'obj_class_restrict', flags, sourceFile: 'src/common.c' };
  }

  /**
   * Parse ITEM_ANTI_* race flags from anti_flags field (BIT_18-30)
   * These are the first 13 playable races stored in anti_flags
   */
  async parseAntiRaceFlags(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/defines.h');
    const flags: ParsedFlag[] = [];

    // Parse ITEM_ANTI_* from defines.h (in anti_flags field, BIT_18-30)
    // Format: #define ITEM_ANTI_HUMAN BIT_18
    const antiRegex = /#define\s+ITEM_ANTI_([A-Z0-9_]+)\s+BIT_(\d+)/g;

    let match;
    while ((match = antiRegex.exec(content)) !== null) {
      const name = match[1];
      const bitNum = parseInt(match[2], 10);
      flags.push({
        name: name,
        value: 1 << (bitNum - 1), // BIT_N = 2^(N-1)
        description: `Anti-${name.charAt(0) + name.slice(1).toLowerCase().replace(/_/g, ' ')}`,
        sourceFile: 'src/defines.h',
      });
    }

    return { category: 'obj_anti_race', flags, sourceFile: 'src/defines.h' };
  }

  /**
   * Parse ITEM_ANTI2_* race flags from anti2_flags field
   * These are additional races that didn't fit in anti_flags
   */
  async parseAnti2RaceFlags(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/defines.h');
    const flags: ParsedFlag[] = [];

    // ITEM_ANTI2_* races: Thri-Kreen, Centaur, Githyanki, Minotaur, AquaElf, Sahuagin, Goblin, Lich, etc.
    const raceNames = [
      'THRIKREEN', 'CENTAUR', 'GITHYANKI', 'MINOTAUR',
      'AQUAELF', 'SAHUAGIN', 'GOBLIN', 'LICH', 'PVAMPIRE', 'PSBEAST',
      'PDKNIGHT', 'SGIANT', 'WIGHT', 'PHANTOM'
    ];

    const anti2Regex = /#define\s+ITEM_ANTI2_([A-Z0-9_]+)\s+BIT_(\d+)/g;

    let match;
    while ((match = anti2Regex.exec(content)) !== null) {
      const name = match[1];
      // Only include if it's a race (not gender or class)
      if (raceNames.includes(name)) {
        const bitNum = parseInt(match[2], 10);
        flags.push({
          name: name,
          value: 1 << (bitNum - 1), // BIT_N = 2^(N-1)
          description: `Anti-${name.charAt(0) + name.slice(1).toLowerCase().replace(/_/g, ' ')}`,
          sourceFile: 'src/defines.h',
        });
      }
    }

    return { category: 'obj_anti2_race', flags, sourceFile: 'src/defines.h' };
  }

  /**
   * Parse ITEM_ANTI2_* gender flags from anti2_flags field
   * Gender restrictions: Male, Female, Neuter
   */
  async parseAnti2GenderFlags(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/defines.h');
    const flags: ParsedFlag[] = [];

    const genderNames = ['MALE', 'FEMALE', 'NEUTER'];
    const anti2Regex = /#define\s+ITEM_ANTI2_([A-Z0-9_]+)\s+BIT_(\d+)/g;

    let match;
    while ((match = anti2Regex.exec(content)) !== null) {
      const name = match[1];
      if (genderNames.includes(name)) {
        const bitNum = parseInt(match[2], 10);
        flags.push({
          name: name,
          value: 1 << (bitNum - 1), // BIT_N = 2^(N-1)
          description: `Anti-${name.charAt(0) + name.slice(1).toLowerCase()}`,
          sourceFile: 'src/defines.h',
        });
      }
    }

    return { category: 'obj_anti2_gender', flags, sourceFile: 'src/defines.h' };
  }

  /**
   * Parse ITEM_ALLOW2_* class flags from anti2_flags field
   * Newer classes added after the original anti_flags ran out of bits
   */
  async parseAllow2ClassFlags(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/defines.h');
    const flags: ParsedFlag[] = [];

    // ITEM_ALLOW2_* classes: Warlock, Mindflayer, Illusionist, Berserker, Reaver, Alchemist, Dreadlord
    const allow2Regex = /#define\s+ITEM_ALLOW2_([A-Z0-9_]+)\s+BIT_(\d+)/g;

    let match;
    while ((match = allow2Regex.exec(content)) !== null) {
      const name = match[1];
      if (name === 'UNUSED') continue; // Skip placeholder
      const bitNum = parseInt(match[2], 10);
      flags.push({
        name: name,
        value: 1 << (bitNum - 1), // BIT_N = 2^(N-1)
        description: `Allow ${name.charAt(0) + name.slice(1).toLowerCase()}`,
        sourceFile: 'src/defines.h',
      });
    }

    return { category: 'obj_allow2_class', flags, sourceFile: 'src/defines.h' };
  }

  async parseRaceRestrictions(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/common.c');
    const flags: ParsedFlag[] = [];

    // Race restriction flags are derived from race_names_table
    // Uses bitvector for allowed/anti races (1 << race_index)
    const arrayRegex =
      /const\s+struct\s+race_names\s+race_names_table\s*\[[^\]]*\]\s*=\s*\{([\s\S]*?)\{\s*\}/m;
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      return {
        category: 'obj_race_restrict',
        flags: [],
        sourceFile: 'src/common.c',
      };
    }

    // Parse: {"Name", "NoSpaceName", "&+Ansi&n", "XX"}
    const entryRegex =
      /\{\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\}/g;
    let match;
    let index = 0;

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      const raceName = match[1];
      // Skip RACE_NONE (index 0) - empty name
      if (!raceName || raceName.trim() === '') {
        index++;
        continue;
      }

      flags.push({
        name: match[2] || raceName.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
        value: 1 << index, // Bitvector: BIT_1 = 1, BIT_2 = 2, etc.
        description: raceName,
        ansiName: match[3],
        shortCode: match[4],
        sourceFile: 'src/common.c',
      });
      index++;
    }

    return { category: 'obj_race_restrict', flags, sourceFile: 'src/common.c' };
  }

  // ============ ROOM FLAGS ============

  async parseRoomBits(): Promise<ParseResult> {
    return this.parseFlagDefArray('room_bits', 'room_flags');
  }

  async parseSectorTypes(): Promise<ParseResult> {
    return this.parseStringArray('sector_types', 'room_sector');
  }

  async parseExitBits(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/common.c');
    const flags: ParsedFlag[] = [];

    // Exit bits are a simple string array
    const arrayRegex =
      /const\s+char\s*\*\s*exit_bits\s*\[\]\s*=\s*\{([\s\S]*?)\n\};/m;
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      return { category: 'exit_flags', flags: [], sourceFile: 'src/common.c' };
    }

    const entryRegex = /"([^"]+)"/g;
    let match;
    let index = 0;

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      if (match[1] === '\\n' || match[1] === '\n') break;
      flags.push({
        name: match[1].replace(/-/g, '_'),
        value: 1 << index, // Bitvector
        description: match[1],
        sourceFile: 'src/common.c',
      });
      index++;
    }

    return { category: 'exit_flags', flags, sourceFile: 'src/common.c' };
  }

  // ============ MOB FLAGS ============

  async parseActionBits(): Promise<ParseResult> {
    return this.parseFlagDefArray('action_bits', 'mob_action');
  }

  async parseAction2Bits(): Promise<ParseResult> {
    return this.parseFlagDefArray('action2_bits', 'mob_action2');
  }

  async parseAggroBits(): Promise<ParseResult> {
    return this.parseFlagDefArray('aggro_bits', 'mob_aggro');
  }

  async parseAggro2Bits(): Promise<ParseResult> {
    return this.parseFlagDefArray('aggro2_bits', 'mob_aggro2');
  }

  // ============ CLASS AND RACE ============

  async parseClassNames(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/common.c');
    const flags: ParsedFlag[] = [];

    // Find class_names_table array
    const arrayRegex =
      /const\s+struct\s+class_names\s+class_names_table\s*\[\]\s*=\s*\{([\s\S]*?)NULL,\s*NULL,\s*NULL/m;
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      return { category: 'mob_class', flags: [], sourceFile: 'src/common.c' };
    }

    // Parse: {"Name", "&+Color&n", "Short", 'c'}
    const entryRegex = /\{\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*'([^']+)'\s*\}/g;
    let match;
    let index = 0;

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      flags.push({
        name: match[1].toUpperCase().replace(/[^A-Z0-9]/g, '_'),
        value: index === 0 ? 0 : 1 << (index - 1), // CLASS_NONE=0, CLASS_WARRIOR=BIT_1, etc.
        description: match[1],
        ansiName: match[2],
        shortCode: match[3],
        sourceFile: 'src/common.c',
      });
      index++;
    }

    return { category: 'mob_class', flags, sourceFile: 'src/common.c' };
  }

  async parseRaceNames(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/common.c');
    const flags: ParsedFlag[] = [];

    // Find race_names_table array
    const arrayRegex =
      /const\s+struct\s+race_names\s+race_names_table\s*\[[^\]]*\]\s*=\s*\{([\s\S]*?)\{\s*\}/m;
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      return { category: 'mob_race', flags: [], sourceFile: 'src/common.c' };
    }

    // Parse: {"Name", "NoSpaceName", "&+Ansi&n", "XX"}
    const entryRegex =
      /\{\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)"\s*\}/g;
    let match;
    let index = 0;
    const seenNames = new Set<string>();

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      const baseName =
        match[2] || match[1].toUpperCase().replace(/[^A-Z0-9]/g, '_');
      const name = seenNames.has(baseName)
        ? `${baseName}_${match[4] || index}`
        : baseName;
      seenNames.add(name);
      flags.push({
        name,
        value: index, // Sequential: RACE_NONE=0, RACE_HUMAN=1, etc.
        description: match[1],
        ansiName: match[3],
        shortCode: match[4],
        sourceFile: 'src/common.c',
      });
      index++;
    }

    return { category: 'mob_race', flags, sourceFile: 'src/common.c' };
  }

  // ============ AFFECTED FLAGS ============

  async parseAffected1Bits(): Promise<ParseResult> {
    return this.parseFlagDefArray('affected1_bits', 'mob_affected1');
  }

  async parseAffected2Bits(): Promise<ParseResult> {
    return this.parseFlagDefArray('affected2_bits', 'mob_affected2');
  }

  async parseAffected3Bits(): Promise<ParseResult> {
    return this.parseFlagDefArray('affected3_bits', 'mob_affected3');
  }

  async parseAffected4Bits(): Promise<ParseResult> {
    return this.parseFlagDefArray('affected4_bits', 'mob_affected4');
  }

  async parseAffected5Bits(): Promise<ParseResult> {
    return this.parseFlagDefArray('affected5_bits', 'mob_affected5');
  }

  // ============ PLAYER FLAGS (from constant.c) ============

  /**
   * Parse player_bits string array from constant.c
   * Format: "FLAG_NAME", "FLAG_NAME2", ...
   */
  async parsePlayerBits(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/constant.c');
    const flags: ParsedFlag[] = [];

    // Find the player_bits array
    const arrayRegex = /const\s+char\s*\*\s*player_bits\s*\[\]\s*=\s*\{([\s\S]*?)"\\n"\s*\};/m;
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      logger.warn('player_bits array not found in constant.c');
      return { category: 'player_flags', flags: [], sourceFile: 'src/constant.c' };
    }

    // Parse each string entry
    const entryRegex = /"([^"\\]+)"/g;
    let match;
    let index = 0;

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      // Skip terminator entries
      if (match[1] === '\\n' || match[1] === '\n') break;

      flags.push({
        name: match[1],
        value: 1 << index, // Bitvector
        description: match[1].replace(/-/g, ' '),
        sourceFile: 'src/constant.c',
      });
      index++;
    }

    return { category: 'player_flags', flags, sourceFile: 'src/constant.c' };
  }

  /**
   * Parse player2_bits string array from constant.c
   * Format: "FLAG_NAME", "FLAG_NAME2", ...
   */
  async parsePlayer2Bits(): Promise<ParseResult> {
    const content = await this.readSourceFile('src/constant.c');
    const flags: ParsedFlag[] = [];

    // Find the player2_bits array
    const arrayRegex = /const\s+char\s*\*\s*player2_bits\s*\[\]\s*=\s*\{([\s\S]*?)"\\n"\s*\};/m;
    const arrayMatch = content.match(arrayRegex);

    if (!arrayMatch) {
      logger.warn('player2_bits array not found in constant.c');
      return { category: 'player2_flags', flags: [], sourceFile: 'src/constant.c' };
    }

    // Parse each string entry
    const entryRegex = /"([^"\\]+)"/g;
    let match;
    let index = 0;

    while ((match = entryRegex.exec(arrayMatch[1])) !== null) {
      // Skip terminator entries and UNUSED placeholders
      if (match[1] === '\\n' || match[1] === '\n') break;
      if (match[1].startsWith('UNUSED')) {
        index++;
        continue;
      }

      flags.push({
        name: match[1],
        value: 1 << index, // Bitvector
        description: match[1].replace(/-/g, ' ').replace(/_/g, ' '),
        sourceFile: 'src/constant.c',
      });
      index++;
    }

    return { category: 'player2_flags', flags, sourceFile: 'src/constant.c' };
  }
}

export default MudFlagParser;
