/**
 * @jest-environment node
 */
import { describe, it, expect, afterAll } from '@jest/globals';
import { pool } from '../../db/connection.js';
import redis from '../../db/redis.js';
import {
  ALL_RESTORE_TABLES,
  CATEGORY_TABLES,
  PER_ACCOUNT_TABLES,
  FILTER_COLUMN_MAP,
  extractInsertBlocks,
  parseCreateTableColumns,
  parseMultiValueInsert,
  buildFilterColumnIndex,
  parseDumpIntoRowMap,
  filterTableRows,
  resolveCascadeKeys,
  buildRestoreSql,
} from '../backupService.js';

describe('backupService', () => {
  afterAll(async () => {
    await pool.end();
    await redis.quit();
  });

  describe('table existence verification', () => {
    const EXPECTED_TABLES = [
      'player_data',
      'account_characters',
      'player_items',
      'player_item_affects',
      'player_skills',
      'player_spellbooks',
      'player_affects',
      'player_timers',
      'progress',
      'epic_gain',
      'epic_bonus',
      'boons',
      'boons_progress',
      'auction_money_pickups',
      'auction_item_pickups',
      'guild_members',
      'pkill_info',
      'pkill_event',
      'frag_leaderboard',
      'player_pets',
      'player_pet_items',
      'player_pet_item_affects',
      'offline_messages',
    ];

    it.each(EXPECTED_TABLES)('table %s should exist', async (tableName) => {
      const [rows] = (await pool.query(
        'SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        [process.env.DB_NAME || 'duris_dev', tableName],
      )) as any;
      expect(rows.length).toBe(1);
    });
  });

  describe('restore-tables constants', () => {
    it('ALL_RESTORE_TABLES contains every EXPECTED_TABLES entry', () => {
      const expected = [
        'player_data',
        'account_characters',
        'player_items',
        'player_item_affects',
        'player_skills',
        'player_spellbooks',
        'player_affects',
        'player_timers',
        'progress',
        'epic_gain',
        'epic_bonus',
        'boons',
        'boons_progress',
        'auction_money_pickups',
        'auction_item_pickups',
        'guild_members',
        'pkill_info',
        'pkill_event',
        'frag_leaderboard',
        'player_pets',
        'player_pet_items',
        'player_pet_item_affects',
        'offline_messages',
      ];
      for (const tbl of expected) {
        expect(ALL_RESTORE_TABLES).toContain(tbl);
      }
    });

    it('has no hallucinated tables', () => {
      const hallucinated = [
        'player_inventory',
        'player_equipment',
        'player_banks',
        'player_spells',
        'player_cooldowns',
        'player_achievements',
        'player_quests',
        'player_titles',
        'player_aliases',
        'player_mail',
        'player_notes',
      ];
      for (const tbl of hallucinated) {
        expect(ALL_RESTORE_TABLES).not.toContain(tbl);
      }
    });

    it('every restore table has a filter-column mapping', () => {
      for (const tbl of ALL_RESTORE_TABLES) {
        expect(FILTER_COLUMN_MAP[tbl]).toBeDefined();
      }
    });

    it('PER_ACCOUNT_TABLES matches the spec', () => {
      expect(PER_ACCOUNT_TABLES).toEqual(['accounts', 'account_ips', 'account_banks']);
    });

    it('CATEGORY_TABLES covers all 12 categories', () => {
      const keys = Object.keys(CATEGORY_TABLES);
      expect(keys).toHaveLength(12);
    });
  });

  describe('extractInsertBlocks', () => {
    it('extracts a single single-line INSERT block', () => {
      const sql = "INSERT INTO `player_data` VALUES (1,'alice'),(2,'bob');";
      const result = extractInsertBlocks(sql, 'player_data');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("(1,'alice'),(2,'bob')");
    });

    it('extracts multiple INSERT blocks for the same table', () => {
      const sql = [
        "INSERT INTO `pkill_info` VALUES (1,10,5,'KILLER','');",
        "INSERT INTO `pkill_info` VALUES (2,11,6,'VICTIM','');",
      ].join('\n');
      const result = extractInsertBlocks(sql, 'pkill_info');
      expect(result).toHaveLength(2);
      expect(result[0]).toBe("(1,10,5,'KILLER','')");
      expect(result[1]).toBe("(2,11,6,'VICTIM','')");
    });

    it('returns empty array when table has no INSERT', () => {
      const sql = "INSERT INTO `other` VALUES (1,'x');";
      const result = extractInsertBlocks(sql, 'player_data');
      expect(result).toHaveLength(0);
    });

    it('ignores INSERT for a different table with similar name', () => {
      const sql = "INSERT INTO `player_data_backup` VALUES (1,'a');";
      const result = extractInsertBlocks(sql, 'player_data');
      expect(result).toHaveLength(0);
    });

    it('extracts a multiline INSERT block spanning many lines', () => {
      const sql = [
        'INSERT INTO `player_items` VALUES',
        "(1,100,'sword'),",
        "(2,100,'shield'),",
        "(3,200,'staff');",
      ].join('\n');
      const result = extractInsertBlocks(sql, 'player_items');
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("(1,100,'sword')");
      expect(result[0]).toContain("(3,200,'staff')");
    });

    it('handles quoted strings containing semicolons and parens', () => {
      const sql = "INSERT INTO `offline_messages` VALUES (1,42,'hello; (world)');";
      const result = extractInsertBlocks(sql, 'offline_messages');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("(1,42,'hello; (world)')");
    });
  });

  describe('parseCreateTableColumns', () => {
    it('extracts columns in order from a simple CREATE TABLE', () => {
      const sql = [
        'CREATE TABLE `player_data` (',
        '  `id` int NOT NULL AUTO_INCREMENT,',
        '  `name` varchar(30) NOT NULL,',
        '  `level` int DEFAULT 1,',
        '  PRIMARY KEY (`id`)',
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
      ].join('\n');
      const result = parseCreateTableColumns(sql, 'player_data');
      expect(result).toEqual(['id', 'name', 'level']);
    });

    it('ignores KEY, UNIQUE KEY, PRIMARY KEY, FOREIGN KEY, CONSTRAINT lines', () => {
      const sql = [
        'CREATE TABLE `player_items` (',
        '  `id` int NOT NULL,',
        '  `pid` int NOT NULL,',
        '  `vnum` int NOT NULL,',
        '  PRIMARY KEY (`id`),',
        '  UNIQUE KEY `uk_name` (`pid`,`vnum`),',
        '  KEY `idx_pid` (`pid`),',
        '  CONSTRAINT `fk_pid` FOREIGN KEY (`pid`) REFERENCES `player_data`(`id`)',
        ');',
      ].join('\n');
      const result = parseCreateTableColumns(sql, 'player_items');
      expect(result).toEqual(['id', 'pid', 'vnum']);
    });

    it('returns empty array when table not found', () => {
      const sql = 'CREATE TABLE `other` (`x` int);';
      const result = parseCreateTableColumns(sql, 'player_data');
      expect(result).toEqual([]);
    });

    it('works when multiple CREATE TABLEs are present in the same dump', () => {
      const sql = [
        'CREATE TABLE `accounts` (',
        '  `name` varchar(30) NOT NULL,',
        '  `password` varchar(64),',
        '  PRIMARY KEY (`name`)',
        ');',
        'CREATE TABLE `player_data` (',
        '  `id` int NOT NULL,',
        '  `name` varchar(30)',
        ');',
      ].join('\n');
      expect(parseCreateTableColumns(sql, 'accounts')).toEqual(['name', 'password']);
      expect(parseCreateTableColumns(sql, 'player_data')).toEqual(['id', 'name']);
    });
  });

  describe('parseMultiValueInsert', () => {
    it('splits simple rows', () => {
      const rows = parseMultiValueInsert("(1,'a'),(2,'b')");
      expect(rows).toEqual(["(1,'a')", "(2,'b')"]);
    });

    it('handles quoted commas', () => {
      const rows = parseMultiValueInsert("(1,'hello, world'),(2,'ok')");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toBe("(1,'hello, world')");
    });

    it('handles escaped quotes', () => {
      const rows = parseMultiValueInsert("(1,'it\\'s fine'),(2,'ok')");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toBe("(1,'it\\'s fine')");
    });

    it('returns [] for empty input', () => {
      expect(parseMultiValueInsert('')).toEqual([]);
    });
  });

  describe('buildFilterColumnIndex', () => {
    const sampleDump = [
      'CREATE TABLE `player_data` (',
      '  `pid` int NOT NULL,',
      '  `name` varchar(30),',
      '  `level` int,',
      '  PRIMARY KEY (`pid`)',
      ');',
      'CREATE TABLE `player_items` (',
      '  `id` int NOT NULL,',
      '  `pid` int NOT NULL,',
      '  `vnum` int',
      ');',
      'CREATE TABLE `pkill_info` (',
      '  `id` int NOT NULL,',
      '  `event_id` int,',
      '  `pid` int',
      ');',
      'CREATE TABLE `pkill_event` (',
      '  `id` int NOT NULL,',
      '  `stamp` datetime',
      ');',
    ].join('\n');

    it('maps each restore table to its filter-column index', () => {
      const idx = buildFilterColumnIndex(sampleDump);
      expect(idx.player_data.filterColIndex).toBe(0);
      expect(idx.player_items.filterColIndex).toBe(1);
      expect(idx.pkill_info.filterColIndex).toBe(2);
      expect(idx.pkill_event.filterColIndex).toBe(0);
    });

    it('records the id column index for cascade usage', () => {
      const idx = buildFilterColumnIndex(sampleDump);
      expect(idx.player_items.columns[0]).toBe('id');
      expect(idx.pkill_info.columns[1]).toBe('event_id');
    });

    it('skips tables whose CREATE TABLE block is missing from the dump', () => {
      const idx = buildFilterColumnIndex('CREATE TABLE `player_data` (`pid` int);');
      expect(idx.player_data).toBeDefined();
      expect(idx.player_items).toBeUndefined();
    });

    it('rejects an archive whose present table lacks its configured filter column', () => {
      // player_data.id was never a real column; silently skipping the table
      // dropped the character's core row from a "successful" restore.
      expect(() => buildFilterColumnIndex('CREATE TABLE `player_data` (`id` int);')).toThrow(
        /player_data\.pid/,
      );
    });
  });

  describe('parseDumpIntoRowMap', () => {
    it('parses a dump into {tableName: rowString[]}', () => {
      const sql = [
        "INSERT INTO `player_data` VALUES (1,'alice'),(2,'bob');",
        "INSERT INTO `player_items` VALUES (10,1,'sword');",
        "INSERT INTO `other_ignored` VALUES (99,'x');",
      ].join('\n');
      const rowMap = parseDumpIntoRowMap(sql);
      expect(rowMap.player_data).toEqual(["(1,'alice')", "(2,'bob')"]);
      expect(rowMap.player_items).toEqual(["(10,1,'sword')"]);
      expect(rowMap.other_ignored).toBeUndefined();
    });

    it('merges multiple INSERT blocks for the same table', () => {
      const sql = [
        "INSERT INTO `player_data` VALUES (1,'alice');",
        "INSERT INTO `player_data` VALUES (2,'bob');",
      ].join('\n');
      const rowMap = parseDumpIntoRowMap(sql);
      expect(rowMap.player_data).toEqual(["(1,'alice')", "(2,'bob')"]);
    });
  });

  describe('filterTableRows', () => {
    const columnInfo = { columns: ['id', 'pid', 'name'], filterColIndex: 1 };

    it('keeps rows whose filter-col value is in the key set', () => {
      const rows = ["(1,10,'sword')", "(2,20,'shield')", "(3,10,'staff')"];
      const kept = filterTableRows(rows, columnInfo, new Set(['10']));
      expect(kept).toEqual(["(1,10,'sword')", "(3,10,'staff')"]);
    });

    it('drops rows whose filter-col value is not in the key set', () => {
      const rows = ["(1,10,'sword')", "(2,20,'shield')"];
      const kept = filterTableRows(rows, columnInfo, new Set(['30']));
      expect(kept).toEqual([]);
    });

    it('quoted string keys compare by unquoted content', () => {
      const nameInfo = { columns: ['id', 'player_name', 'x'], filterColIndex: 1 };
      const rows = ["(1,'alice','x')", "(2,'bob','y')"];
      const kept = filterTableRows(rows, nameInfo, new Set(['alice']));
      expect(kept).toEqual(["(1,'alice','x')"]);
    });

    it('unescapes mysqldump backslash-escaped quotes before comparing', () => {
      const nameInfo = { columns: ['id', 'player_name'], filterColIndex: 1 };
      const rows = ["(1,'O\\'Brien')"];
      const kept = filterTableRows(rows, nameInfo, new Set(["O'Brien"]));
      expect(kept).toEqual(["(1,'O\\'Brien')"]);
    });

    it('unescapes backslash-escaped backslash', () => {
      const nameInfo = { columns: ['id', 'player_name'], filterColIndex: 1 };
      const rows = ["(1,'a\\\\b')"];
      const kept = filterTableRows(rows, nameInfo, new Set(['a\\b']));
      expect(kept).toEqual(["(1,'a\\\\b')"]);
    });
  });

  describe('resolveCascadeKeys', () => {
    it('collects the parent-key-col values from surviving parent rows', () => {
      const parentRows = ["(100,7,'sword')", "(200,7,'shield')", "(300,9,'dagger')"];
      const parentInfo = { columns: ['id', 'pid', 'name'], filterColIndex: 1 };
      const keys = resolveCascadeKeys(parentRows, parentInfo, new Set(['7']), 'id');
      expect(keys).toEqual(new Set(['100', '200']));
    });

    it('uses a different column for cascade-out (pkill_info.event_id)', () => {
      const parentRows = ["(1,50,42,'KILLER')", "(2,51,42,'VICTIM')", "(3,60,99,'KILLER')"];
      const parentInfo = { columns: ['id', 'event_id', 'pid', 'pk_type'], filterColIndex: 2 };
      const keys = resolveCascadeKeys(parentRows, parentInfo, new Set(['42']), 'event_id');
      expect(keys).toEqual(new Set(['50', '51']));
    });
  });

  describe('buildRestoreSql', () => {
    it('wraps in SET FOREIGN_KEY_CHECKS toggle and transaction', () => {
      const filtered = { player_data: ["(1,'alice')"] };
      const sql = buildRestoreSql(filtered);
      expect(sql).toContain('SET FOREIGN_KEY_CHECKS=0');
      expect(sql).toContain('START TRANSACTION');
      expect(sql).toContain('COMMIT');
      expect(sql).toContain('SET FOREIGN_KEY_CHECKS=1');
    });

    it('emits REPLACE INTO statement per non-empty table', () => {
      const filtered = {
        player_data: ["(1,'alice')", "(2,'bob')"],
        player_items: ["(10,1,'sword')"],
      };
      const sql = buildRestoreSql(filtered);
      expect(sql).toContain("REPLACE INTO `player_data` VALUES (1,'alice'),(2,'bob');");
      expect(sql).toContain("REPLACE INTO `player_items` VALUES (10,1,'sword');");
    });

    it('skips tables with zero filtered rows', () => {
      const filtered = { player_data: ["(1,'alice')"], player_items: [] };
      const sql = buildRestoreSql(filtered);
      expect(sql).toContain('player_data');
      expect(sql).not.toContain('`player_items`');
    });

    it('produces no REPLACE INTOs when all tables are empty', () => {
      const sql = buildRestoreSql({});
      expect(sql).not.toContain('REPLACE INTO');
      expect(sql).toContain('SET FOREIGN_KEY_CHECKS=0');
    });
  });

  describe('filterDumpForCharacterRestore', () => {
    const miniDump = [
      'CREATE TABLE `player_data` (',
      '  `pid` int, `name` varchar(30), `level` int',
      ');',
      'CREATE TABLE `player_items` (',
      '  `id` int, `pid` int, `vnum` int',
      ');',
      'CREATE TABLE `player_item_affects` (',
      '  `item_id` int, `location` int, `modifier` int',
      ');',
      "INSERT INTO `player_data` VALUES (7,'alice',50),(9,'stranger',30);",
      "INSERT INTO `player_items` VALUES (100,7,'sword'),(101,7,'shield'),(200,9,'dagger');",
      'INSERT INTO `player_item_affects` VALUES (100,1,5),(101,1,3),(200,1,7);',
    ].join('\n');

    it('keeps only selected pid rows and cascades', async () => {
      const { filterDumpForCharacterRestore } = await import('../backupService.js');
      const filtered = filterDumpForCharacterRestore(miniDump, new Set(['7']), { inventory: true });
      expect(filtered.player_items).toHaveLength(2);
      expect(filtered.player_item_affects).toHaveLength(2);
    });

    it('omits tables whose category is unchecked', async () => {
      const { filterDumpForCharacterRestore } = await import('../backupService.js');
      const filtered = filterDumpForCharacterRestore(miniDump, new Set(['7']), {});
      expect(filtered.player_items).toBeUndefined();
    });

    it('correctly cascades through level-2 chains (lockers → locker_items → locker_item_affects)', async () => {
      const { filterDumpForCharacterRestore } = await import('../backupService.js');
      // alice has locker 700 with item 7000 (affect: +5 hp). stranger has locker 900
      // with item 9000 (affect: +3 str). restore alice only. alice's locker affects
      // must come through the cascade; stranger's must not.
      const dump = [
        'CREATE TABLE `lockers` (`id` int,`owner_pid` int,`owner_assoc_id` int);',
        'CREATE TABLE `locker_items` (`id` int,`locker_id` int,`vnum` int);',
        'CREATE TABLE `locker_item_affects` (`item_id` int,`location` int,`modifier` int);',
        'INSERT INTO `lockers` VALUES (700,7,0),(900,9,0);',
        "INSERT INTO `locker_items` VALUES (7000,700,'sword'),(9000,900,'dagger');",
        'INSERT INTO `locker_item_affects` VALUES (7000,1,5),(9000,1,3);',
      ].join('\n');

      const filtered = filterDumpForCharacterRestore(dump, new Set(['7']), { lockers: true });

      expect(filtered.lockers).toEqual(['(700,7,0)']);
      expect(filtered.locker_items).toEqual(["(7000,700,'sword')"]);
      expect(filtered.locker_item_affects).toEqual(['(7000,1,5)']);
    });

    it('cascades level-3 through player_pets → player_pet_items → player_pet_item_affects', async () => {
      const { filterDumpForCharacterRestore } = await import('../backupService.js');
      const dump = [
        'CREATE TABLE `player_pets` (`id` int,`owner_pid` int);',
        'CREATE TABLE `player_pet_items` (`id` int,`pet_id` int,`vnum` int);',
        'CREATE TABLE `player_pet_item_affects` (`item_id` int,`loc` int,`mod` int);',
        'INSERT INTO `player_pets` VALUES (50,7),(60,9);',
        "INSERT INTO `player_pet_items` VALUES (500,50,'saddle'),(600,60,'reins');",
        'INSERT INTO `player_pet_item_affects` VALUES (500,1,5),(600,2,7);',
      ].join('\n');

      const filtered = filterDumpForCharacterRestore(dump, new Set(['7']), { pets: true });

      expect(filtered.player_pets).toEqual(['(50,7)']);
      expect(filtered.player_pet_items).toEqual(["(500,50,'saddle')"]);
      expect(filtered.player_pet_item_affects).toEqual(['(500,1,5)']);
    });
  });

  describe('filterDumpForFullRestore', () => {
    it('keeps every row of every restore table', async () => {
      const { filterDumpForFullRestore } = await import('../backupService.js');
      const dump = [
        'CREATE TABLE `player_data` (`id` int, `name` varchar(30));',
        "INSERT INTO `player_data` VALUES (1,'alice'),(2,'bob');",
      ].join('\n');
      const filtered = filterDumpForFullRestore(dump);
      expect(filtered.player_data).toEqual(["(1,'alice')", "(2,'bob')"]);
    });
  });

  describe('filterDumpForAccountRestore', () => {
    it('resolves pids from account_characters and cascades per-character', async () => {
      const { filterDumpForAccountRestore } = await import('../backupService.js');
      const dump = [
        'CREATE TABLE `account_characters` (',
        '  `account_name` varchar(30), `char_name` varchar(30), `pid` int, `login_count` int',
        ');',
        'CREATE TABLE `accounts` (',
        '  `account_name` varchar(30), `password` varchar(64)',
        ');',
        'CREATE TABLE `player_data` (',
        '  `pid` int, `name` varchar(30)',
        ');',
        'CREATE TABLE `player_items` (',
        '  `id` int, `pid` int, `vnum` int',
        ');',
        "INSERT INTO `account_characters` VALUES ('acc1','alice',10,0),('acc2','bob',20,0);",
        "INSERT INTO `accounts` VALUES ('acc1','pw1'),('acc2','pw2');",
        "INSERT INTO `player_data` VALUES (10,'alice'),(20,'bob');",
        "INSERT INTO `player_items` VALUES (100,10,'sword'),(200,20,'shield');",
      ].join('\n');
      const filtered = filterDumpForAccountRestore(dump, new Set(['acc1']));
      expect(filtered.accounts).toEqual(["('acc1','pw1')"]);
      expect(filtered.player_data).toEqual(["(10,'alice')"]);
      expect(filtered.player_items).toEqual(["(100,10,'sword')"]);
    });
  });

  describe('parseBackupContentsFromSql', () => {
    it('extracts accounts and characters from account_characters inserts', async () => {
      const { parseBackupContentsFromSql } = await import('../backupService.js');
      const dump = [
        'CREATE TABLE `account_characters` (',
        '  `account_name` varchar(30),',
        '  `char_name` varchar(30),',
        '  `pid` int,',
        '  `login_count` int',
        ');',
        "INSERT INTO `account_characters` VALUES ('acc1','alice',10,0),('acc1','alicealt',11,0),('acc2','bob',20,0);",
      ].join('\n');
      const contents = parseBackupContentsFromSql(dump);
      expect(contents.accounts).toEqual(['acc1', 'acc2']);
      expect(contents.characters).toEqual([
        { pid: 10, name: 'alice' },
        { pid: 11, name: 'alicealt' },
        { pid: 20, name: 'bob' },
      ]);
    });

    it('returns empty arrays when no account_characters rows exist', async () => {
      const { parseBackupContentsFromSql } = await import('../backupService.js');
      const contents = parseBackupContentsFromSql('');
      expect(contents).toEqual({ accounts: [], characters: [] });
    });
  });

  describe('integration: end-to-end character restore SQL output', () => {
    it('produces the correct REPLACE INTO set for a single-pid character restore with all categories checked', async () => {
      const { filterDumpForCharacterRestore, buildRestoreSql } = await import(
        '../backupService.js'
      );
      const dump = [
        'CREATE TABLE `player_data` (`pid` int, `name` varchar(30));',
        'CREATE TABLE `account_characters` (`account_name` varchar(30),`char_name` varchar(30),`pid` int,`login_count` int);',
        'CREATE TABLE `player_affects` (`pid` int,`type` int,`duration` int);',
        'CREATE TABLE `player_timers` (`pid` int,`timer_type` int,`value` int);',
        'CREATE TABLE `player_languages` (`pid` int,`language` int);',
        'CREATE TABLE `player_intros` (`pid` int,`introed_pid` int);',
        'CREATE TABLE `player_undead_slots` (`pid` int,`slot` int);',
        'CREATE TABLE `player_granted_cmds` (`pid` int,`cmd` varchar(30));',
        'CREATE TABLE `player_items` (`id` int,`pid` int,`vnum` int);',
        'CREATE TABLE `player_item_affects` (`item_id` int,`loc` int,`mod` int);',
        'CREATE TABLE `player_item_extra_descr` (`item_id` int,`key` varchar(30));',
        'CREATE TABLE `player_forged_items` (`pid` int,`vnum` int);',
        'CREATE TABLE `artifact_bind` (`owner_pid` int,`vnum` int,`timer` int);',
        'CREATE TABLE `lockers` (`id` int,`owner_pid` int,`owner_assoc_id` int,`racewar` int,`race` int);',
        'CREATE TABLE `locker_items` (`id` int,`locker_id` int,`vnum` int);',
        'CREATE TABLE `locker_item_affects` (`item_id` int,`loc` int,`mod` int);',
        'CREATE TABLE `private_chests` (`id` int,`locker_id` int,`name` varchar(30));',
        'CREATE TABLE `private_chest_log` (`chest_id` int,`when` int,`what` varchar(30));',
        'CREATE TABLE `player_skills` (`pid` int,`skill` int,`pct` int);',
        'CREATE TABLE `player_spellbooks` (`pid` int,`mob_vnum` int);',
        'CREATE TABLE `player_recipes` (`pid` int,`recipe_vnum` int);',
        'CREATE TABLE `player_shapechanges` (`pid` int,`form` int);',
        'CREATE TABLE `player_witnesses` (`pid` int,`witness_pid` int);',
        'CREATE TABLE `progress` (`pid` int,`step` int);',
        'CREATE TABLE `epic_gain` (`pid` int,`amount` int);',
        'CREATE TABLE `epic_bonus` (`pid` int,`bonus` int);',
        'CREATE TABLE `boons` (`pid` int,`boon` int);',
        'CREATE TABLE `boons_progress` (`pid` int,`boon` int,`val` int);',
        'CREATE TABLE `world_quest_accomplished` (`pid` int,`timestamp` datetime,`q` int);',
        'CREATE TABLE `auction_money_pickups` (`pid` int,`amt` int);',
        'CREATE TABLE `auction_item_pickups` (`pid` int,`item_id` int);',
        'CREATE TABLE `auction_bid_history` (`bidder_pid` int,`amt` int);',
        'CREATE TABLE `guild_members` (`guild_id` int,`player_name` varchar(30),`player_pid` int,`bits` int,`debt` int);',
        'CREATE TABLE `pkill_info` (`id` int,`event_id` int,`pid` int,`level` int);',
        'CREATE TABLE `pkill_event` (`id` int,`stamp` datetime);',
        'CREATE TABLE `frag_leaderboard` (`pid` int,`frags` int);',
        'CREATE TABLE `player_pets` (`id` int,`owner_pid` int);',
        'CREATE TABLE `player_pet_items` (`id` int,`pet_id` int,`vnum` int);',
        'CREATE TABLE `player_pet_item_affects` (`item_id` int,`loc` int,`mod` int);',
        'CREATE TABLE `player_pet_item_extra_descr` (`item_id` int,`key` varchar(30));',
        'CREATE TABLE `ships` (`id` int,`owner_name` varchar(30),`name` varchar(30));',
        'CREATE TABLE `ship_armor` (`ship_id` int,`side` int,`armor` int);',
        'CREATE TABLE `ship_crew` (`ship_id` int,`idx` int);',
        'CREATE TABLE `ship_slots` (`ship_id` int,`idx` int);',
        'CREATE TABLE `corpses` (`id` int,`player_name` varchar(30),`save_id` int);',
        'CREATE TABLE `corpse_items` (`id` int,`corpse_id` int,`vnum` int);',
        'CREATE TABLE `corpse_item_affects` (`item_id` int,`loc` int,`mod` int);',
        'CREATE TABLE `offline_messages` (`id` int,`pid` int,`msg` text);',
        "INSERT INTO `player_data` VALUES (7,'alice'),(9,'stranger');",
        "INSERT INTO `account_characters` VALUES ('acc1','alice',7,0),('acc2','stranger',9,0);",
        "INSERT INTO `player_items` VALUES (70,7,'sword'),(71,7,'shield'),(90,9,'dagger');",
        'INSERT INTO `player_item_affects` VALUES (70,1,5),(71,1,3),(90,1,7);',
        'INSERT INTO `lockers` VALUES (700,7,0,0,0),(900,9,0,0,0);',
        "INSERT INTO `locker_items` VALUES (7000,700,'rope'),(9000,900,'boots');",
        'INSERT INTO `pkill_info` VALUES (1,100,7,50),(2,101,7,50),(3,200,9,30);',
        "INSERT INTO `pkill_event` VALUES (100,'2026-01-01 00:00:00'),(101,'2026-01-02 00:00:00'),(200,'2026-01-03 00:00:00');",
        "INSERT INTO `corpses` VALUES (5000,'alice',1),(5001,'stranger',1);",
        "INSERT INTO `ships` VALUES (999,'alice','albatross'),(998,'stranger','wreck');",
      ].join('\n');

      const allChecked = {
        coreData: true,
        inventory: true,
        lockers: true,
        skills: true,
        progression: true,
        auction: true,
        guild: true,
        pvpHistory: true,
        pets: true,
        ships: true,
        corpses: true,
        mail: true,
      };

      const filtered = filterDumpForCharacterRestore(
        dump,
        new Set(['7']),
        allChecked,
        new Set(['alice']),
      );

      expect(filtered.player_data).toEqual(["(7,'alice')"]);
      expect(filtered.player_items).toEqual(["(70,7,'sword')", "(71,7,'shield')"]);
      expect(filtered.player_item_affects).toHaveLength(2);
      expect(filtered.lockers).toEqual(['(700,7,0,0,0)']);
      expect(filtered.locker_items).toEqual(["(7000,700,'rope')"]);
      expect(filtered.pkill_info).toHaveLength(2);
      expect(filtered.pkill_event).toHaveLength(2);
      expect(filtered.corpses).toEqual(["(5000,'alice',1)"]);
      expect(filtered.ships).toEqual(["(999,'alice','albatross')"]);

      const sql = buildRestoreSql(filtered);
      expect(sql).not.toContain('stranger');
      expect(sql).not.toContain('(90,9');
      expect(sql).not.toContain('(900,9');
      expect(sql).not.toContain('(200,');
      expect(sql).toContain('START TRANSACTION');
      expect(sql).toContain('COMMIT');
    });
  });
});
