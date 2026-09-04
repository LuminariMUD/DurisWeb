import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import logger from '../../utils/logger.js';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const enabled = new Map<string, boolean>();
const getGuild = jest.fn<(guildId: number) => Promise<unknown>>();
const parseGuildFile = jest.fn<(guildId: number) => Promise<unknown>>();
const findCharacterGuild = jest.fn<(name: string) => Promise<unknown>>();
const getCharacterGuildInfoFromGuild =
  jest.fn<(name: string, guildId: number) => Promise<unknown>>();
const getAllGuilds = jest.fn<() => Promise<Array<{ id: number; name: string }>>>();
const searchGuilds = jest.fn<(query: string, limit?: number) => Promise<string[]>>();

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
}));
jest.unstable_mockModule('../../hooks/hookGate.js', () => ({
  isHookEnabledSync: jest.fn((hookId: string) => enabled.get(hookId) ?? true),
}));
jest.unstable_mockModule('../guildService.js', () => ({
  getGuild,
  parseGuildFile,
  findCharacterGuild,
  getCharacterGuildInfoFromGuild,
  getAllGuilds,
  searchGuilds,
}));

const { MudFlagParser, MudFlagParseError } = await import('../mudFlagParser.js');
const guildParser = await import('../mudGuildParser.js');
const {
  getZoneMapData,
  globalSearch,
  invalidateShopCache,
  invalidateZoneFileMap,
  invalidateZoneIndexCache,
  listZones,
  parseMobFile,
  parseObjFile,
  parseWldFile,
  parseZonFile,
  ZoneSourceParseError,
} = await import('../zoneBuilderParser.js');
const { FlatfileAccessError, probeFlatfileHook, resetFlatfileAccessForTests, setMudRootForTests } =
  await import('../flatfileAccess.js');
const { getFlatfileHookHealth, resetFlatfileHookStateForTests, setFlatfileHookClockForTests } =
  await import('../../hooks/flatfileHookState.js');

let testBase = '';
let mudRoot = '';
let now = 0;

const FLAG_ARRAYS = [
  'wear_bits',
  'extra_bits',
  'extra2_bits',
  'room_bits',
  'action_bits',
  'action2_bits',
  'aggro_bits',
  'aggro2_bits',
  'affected1_bits',
  'affected2_bits',
  'affected3_bits',
  'affected4_bits',
  'affected5_bits',
];

function commonFlagSource(): string {
  const flagArrays = FLAG_ARRAYS.map(
    (name, index) =>
      'flagDef ' +
      name +
      '[] = {\n' +
      '  {"FLAG_' +
      index +
      '", "Flag ' +
      index +
      '", 1, 0},\n' +
      '  {}\n};',
  ).join('\n');

  return [
    flagArrays,
    'const char *item_types[] = {\n  "ITEM",\n};',
    'const char *sector_types[] = {\n  "SECTOR",\n};',
    'const char *apply_types[] = {\n  "APPLY",\n};',
    'const char *apply_names[] = {\n  "Apply",\n};',
    'flagDef weapon_types[] = {\n  {"WEAPON_SWORD", "Sword", 1, WEAPON_SWORD}\n};',
    'const char *craftsmanship_names[] = {\n  "Plain",\n};',
    'struct material_data materials[] = {\n  { "&+WIron&n", { 0 } }\n};',
    'const char *exit_bits[] = {\n  "DOOR",\n};',
    'const struct class_names class_names_table[] = {',
    '  {"None", "&+wNone&n", "No", \'n\'},',
    '  {"Warrior", "&+RWarrior&n", "Wa", \'w\'},',
    '  {NULL, NULL, NULL, 0}',
    '};',
    'const struct race_names race_names_table[3] = {',
    '  { "None", "None", "None", "NO" },',
    '  { "Human", "Human", "&+CHuman&n", "PH" },',
    '  {}',
    '};',
    '',
  ].join('\n');
}

async function write(relativePath: string, content: string): Promise<void> {
  const target = path.join(mudRoot, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function writeFlagFixture(): Promise<void> {
  await Promise.all([
    write('src/core/common.c', commonFlagSource()),
    write(
      'src/combat/fight.c',
      'struct attack_hit_type attack_hit_text[] = {\n' + '  {"hit", "hits", "hit"}\n};\n',
    ),
    write(
      'src/core/constant.c',
      'const char *player_bits[] = {\n  "PLAYER",\n  "\\n" };\n' +
        'const char *player2_bits[] = {\n  "PLAYER2",\n  "\\n" };\n',
    ),
    write('src/core/defines.h', '#define UNUSED_FOR_FIXTURE 1\n'),
  ]);
}

async function writeZoneFixture(): Promise<void> {
  await Promise.all([
    write(
      'areas/zon/fixture.zon',
      '#1\nFixture Zone~\n199 0 50 30 2 0\n' + 'M 0 101 1 100 0 0 0 0\nS\n',
    ),
    write('areas/wld/fixture.wld', '#100\nFixture Room~\nA fixture room.\n~\n1 0 0\nS\n'),
    write(
      'areas/mob/fixture.mob',
      '#101\nfixture mob~\na fixture mob~\nA fixture mob waits here.\n~\n' +
        'A fixture mobile.\n~\n1 0 0 0 S\nPH 0 0\n' +
        '1 0 0 1d1+0 1d1+0\n0 0\n8 8 0\n',
    ),
    write(
      'areas/obj/fixture.obj',
      '#102\nfixture object~\na fixture object~\n' +
        'A fixture object is here.~\n~\n' +
        '1 1 0 0 1 0 0 1 0 0 0\n' +
        '0 0 0 0 0 0 0 0\n1 1 100\n',
    ),
  ]);
}

async function restoreFixtures(): Promise<void> {
  await writeFlagFixture();
  await writeZoneFixture();
}

beforeEach(async () => {
  jest.clearAllMocks();
  enabled.clear();
  resetFlatfileAccessForTests();
  resetFlatfileHookStateForTests();
  invalidateZoneFileMap();
  invalidateZoneIndexCache();
  invalidateShopCache();
  now = 0;
  setFlatfileHookClockForTests(() => now);

  testBase = await fs.mkdtemp(path.join(os.tmpdir(), 'durisweb-parsers-'));
  mudRoot = path.join(testBase, 'mud');
  await fs.mkdir(mudRoot);
  setMudRootForTests(mudRoot);
  await restoreFixtures();

  query.mockResolvedValue([[{ value: 1, short_code: 'PH' }], []]);
  const guild = { guildId: 7, name: 'Fixture Guild' };
  getGuild.mockResolvedValue(guild);
  parseGuildFile.mockResolvedValue(guild);
  getAllGuilds.mockResolvedValue([{ id: 7, name: 'Fixture Guild' }]);
  searchGuilds.mockResolvedValue(['Fixture Guild']);
});

afterEach(async () => {
  resetFlatfileAccessForTests();
  resetFlatfileHookStateForTests();
  invalidateZoneFileMap();
  invalidateZoneIndexCache();
  invalidateShopCache();
  if (testBase) {
    await fs.rm(testBase, { recursive: true, force: true });
  }
});

describe('successful parser integration', () => {
  it('parses a complete synthetic flag source as one aggregate', async () => {
    const results = await new MudFlagParser().parseAllFlags();

    expect(results).toHaveLength(25);
    expect(results.every((result) => result.flags.length > 0)).toBe(true);
    expect(results.map((result) => result.category)).toEqual(
      expect.arrayContaining(['obj_wear', 'mob_race', 'player2_flags']),
    );
  });

  it('parses valid world, mobile, object, and reset records', async () => {
    const [rooms, mobiles, objects, zone] = await Promise.all([
      parseWldFile(1),
      parseMobFile('fixture'),
      parseObjFile('fixture'),
      parseZonFile('fixture'),
    ]);

    expect(rooms.map((room) => room.vnum)).toEqual([100]);
    expect(mobiles.map((mobile) => mobile.vnum)).toEqual([101]);
    expect(objects.map((object) => object.vnum)).toEqual([102]);
    expect(zone.header.number).toBe(1);
    expect(zone.resets).toHaveLength(1);
  });

  it('preserves global-search results through the bounded source prefilter', async () => {
    await expect(globalSearch('fixture room', 'room')).resolves.toMatchObject({
      total: 1,
      results: [expect.objectContaining({ zoneId: 'fixture', vnum: 100 })],
    });
  });

  it('does not reuse a cached zone index after the resolved MUD root changes', async () => {
    await expect(listZones({ limit: 10 })).resolves.toMatchObject({
      zones: [expect.objectContaining({ id: 'fixture', number: 1 })],
    });

    mudRoot = path.join(testBase, 'alternate-mud');
    await fs.mkdir(mudRoot);
    setMudRootForTests(mudRoot);
    await Promise.all([
      write('areas/zon/alternate.zon', '#2\nAlternate Zone~\n299 0 50 30 2 0\nS\n'),
      write('areas/wld/alternate.wld', '#200\nAlternate Room~\nAn alternate room.\n~\n1 0 0\nS\n'),
    ]);

    await expect(listZones({ limit: 10 })).resolves.toMatchObject({
      total: 1,
      zones: [expect.objectContaining({ id: 'alternate', number: 2 })],
    });
  });
});

describe('cached website gates', () => {
  it('suppresses flag, zone, and guild entry points before source work', async () => {
    enabled.set('flag_parsing', false);
    enabled.set('zone_builder_parsing', false);
    enabled.set('guild_parsing', false);
    setMudRootForTests(path.join(testBase, 'missing'));

    await expect(new MudFlagParser().parseAllFlags()).rejects.toBeInstanceOf(MudFlagParseError);
    await expect(parseWldFile(1)).rejects.toThrow(/disabled/i);
    await expect(guildParser.parseGuildFile(7)).resolves.toBeNull();
    expect(parseGuildFile).not.toHaveBeenCalled();
    expect(getFlatfileHookHealth('flag_parsing')?.availability).toBe('available');
    expect(getFlatfileHookHealth('zone_builder_parsing')?.availability).toBe('available');
  });

  it('keeps database-backed guild parsing usable during MUD_DIR loss', async () => {
    setMudRootForTests(path.join(testBase, 'missing'));

    await expect(guildParser.getGuild(7)).resolves.toMatchObject({
      guildId: 7,
    });
    expect(getGuild).toHaveBeenCalledWith(7);
  });
});

describe('unavailable root and recovery', () => {
  it('fails only the addressed filesystem hook and recovers without restart', async () => {
    setMudRootForTests(path.join(testBase, 'missing'));

    await expect(new MudFlagParser().parseAllFlags()).rejects.toBeInstanceOf(FlatfileAccessError);
    expect(getFlatfileHookHealth('flag_parsing')?.availability).toBe('unavailable');
    expect(getFlatfileHookHealth('zone_builder_parsing')?.availability).toBe('available');

    setMudRootForTests(mudRoot);
    now = 1_000;
    await probeFlatfileHook('flag_parsing');
    await expect(new MudFlagParser().parseAllFlags()).resolves.toHaveLength(25);
  });
});

describe('all-or-nothing malformed source rejection', () => {
  it('rejects the complete flag aggregate when one category is missing', async () => {
    await write('src/combat/fight.c', 'struct unrelated { int value; };\n');

    await expect(new MudFlagParser().parseAllFlags()).rejects.toBeInstanceOf(MudFlagParseError);
    expect(getFlatfileHookHealth('flag_parsing')?.droppedInputs).toBeGreaterThan(0);
  });

  it('rejects a truncated world record instead of returning its prefix', async () => {
    await write('areas/wld/fixture.wld', '#100\nFixture Room~\nA fixture room.\n~\n1 0 0\n');
    invalidateZoneFileMap();

    await expect(parseWldFile(1)).rejects.toBeInstanceOf(ZoneSourceParseError);
    expect(getFlatfileHookHealth('zone_builder_parsing')?.droppedInputs).toBe(1);
  });

  it('rejects truncated mobile and object records', async () => {
    await write(
      'areas/mob/fixture.mob',
      '#101\nfixture mob~\na fixture mob~\nlong\n~\ndetail\n~\n' +
        '1 0 0 0 S\nPH 0 0\n1 0 0 1d1+0 1d1+0\n0 0\n',
    );
    await expect(parseMobFile('fixture')).rejects.toBeInstanceOf(ZoneSourceParseError);

    resetFlatfileHookStateForTests();
    setFlatfileHookClockForTests(() => now);
    await write(
      'areas/obj/fixture.obj',
      '#102\nfixture object~\nshort~\nlong~\n~\n' + '1 1 0 0 1 0 0 1 0 0 0\n0 0 0 0 0 0 0 0\n',
    );
    await expect(parseObjFile('fixture')).rejects.toBeInstanceOf(ZoneSourceParseError);
  });

  it('rejects a reset source without an end marker', async () => {
    await write(
      'areas/zon/fixture.zon',
      '#1\nFixture Zone~\n199 0 50 30 2 0\n' + 'M 0 101 1 100 0 0 0 0\n',
    );

    await expect(parseZonFile('fixture')).rejects.toBeInstanceOf(ZoneSourceParseError);
  });

  it('keeps valid zone-number lookups usable when another reset file is malformed', async () => {
    await write('areas/zon/broken.zon', '#2\nBroken Zone~\n299 0 50 30 2 0\n');
    invalidateZoneFileMap();

    await expect(parseWldFile(1)).resolves.toEqual([expect.objectContaining({ vnum: 100 })]);
  });

  it('reports the actual invalid sidecar when a zone index entry is skipped', async () => {
    const warning = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    await fs.writeFile(path.join(mudRoot, 'areas/wld/fixture.wld'), Buffer.from([0xff]));
    invalidateZoneIndexCache();

    await expect(listZones({ limit: 10 })).resolves.toMatchObject({ total: 0, zones: [] });
    expect(warning.mock.calls.map(([message]) => String(message))).toContain(
      'Skipped malformed zone source for fixture.wld.',
    );
  });

  it('skips an unsafe zone filename without collapsing the aggregate index', async () => {
    await write('areas/zon/bad name.zon', '#2\nUnsafe Filename~\n299 0 50 30 2 0\nS\n');
    invalidateZoneIndexCache();

    await expect(listZones({ limit: 10 })).resolves.toMatchObject({
      total: 1,
      zones: [expect.objectContaining({ id: 'fixture', number: 1 })],
    });
  });

  it('preserves optional absent mob and object sidecars', async () => {
    await Promise.all([
      fs.unlink(path.join(mudRoot, 'areas/mob/fixture.mob')),
      fs.unlink(path.join(mudRoot, 'areas/obj/fixture.obj')),
    ]);

    await expect(getZoneMapData('fixture')).resolves.toMatchObject({
      mobs: [],
      objects: [],
    });
    expect(getFlatfileHookHealth('zone_builder_parsing')?.availability).toBe('available');
  });
});
