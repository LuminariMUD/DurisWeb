/**
 * @jest-environment node
 */
import { describe, it, expect, afterAll, beforeAll } from '@jest/globals';
import { pool } from '../../db/connection.js';
import redis from '../../db/redis.js';

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
      const [rows] = await pool.query(
        'SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        [process.env.DB_NAME || 'duris_dev', tableName]
      ) as any;

      expect(rows.length).toBe(1);
    });
  });

  describe('parseMultiValueInsert', () => {
    let parseMultiValueInsert: (valuesStr: string) => string[];

    beforeAll(async () => {
      const mod = await import('../backupService.js');
      parseMultiValueInsert = mod.parseMultiValueInsert;
    });

    it('should parse simple rows', () => {
      const input = "(1,'test'),(2,'test2')";
      const result = parseMultiValueInsert(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe("(1,'test')");
      expect(result[1]).toBe("(2,'test2')");
    });

    it('should handle quoted strings with commas', () => {
      const input = "(1,'hello, world'),(2,'foo')";
      const result = parseMultiValueInsert(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe("(1,'hello, world')");
    });

    it('should handle escaped quotes', () => {
      const input = "(1,'it\\'s fine'),(2,'ok')";
      const result = parseMultiValueInsert(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe("(1,'it\\'s fine')");
    });

    it('should handle nested parens in strings', () => {
      const input = "(1,'(nested)'),(2,'normal')";
      const result = parseMultiValueInsert(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe("(1,'(nested)')");
    });

    it('should return empty array for empty input', () => {
      const result = parseMultiValueInsert('');
      expect(result).toHaveLength(0);
    });
  });

  describe('extractInsertBlocks', () => {
    let extractInsertBlocks: (sqlContent: string, tableName: string) => string[];

    beforeAll(async () => {
      const mod = await import('../backupService.js');
      extractInsertBlocks = mod.extractInsertBlocks;
    });

    it('should extract insert blocks for a table', () => {
      const sql = `
        INSERT INTO \`player_data\` VALUES (1,'test');
        INSERT INTO \`other_table\` VALUES (2,'foo');
        INSERT INTO \`player_data\` VALUES (3,'bar');
      `;

      const result = extractInsertBlocks(sql, 'player_data');

      expect(result).toHaveLength(2);
      expect(result[0]).toContain("(1,'test')");
      expect(result[1]).toContain("(3,'bar')");
    });

    it('should return empty array if no matches', () => {
      const sql = "INSERT INTO `other_table` VALUES (1,'x');";
      const result = extractInsertBlocks(sql, 'player_data');

      expect(result).toHaveLength(0);
    });

    it('should handle multiline values', () => {
      const sql = `INSERT INTO \`player_data\` VALUES
        (1,'test'),
        (2,'test2');`;

      const result = extractInsertBlocks(sql, 'player_data');

      expect(result).toHaveLength(1);
      expect(result[0]).toContain("(1,'test')");
      expect(result[0]).toContain("(2,'test2')");
    });
  });

  describe('restore table configuration', () => {
    // these tables were hallucinated and should NOT exist in the config
    const HALLUCINATED_TABLES = [
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

    let ALL_RESTORE_TABLES: string[];
    let CATEGORY_TABLES_FLAT: string[];

    beforeAll(async () => {
      // read the file and extract the constants
      const fs = await import('fs');
      const path = await import('path');
      const content = fs.readFileSync(
        path.join(process.cwd(), 'src/services/backupService.ts'),
        'utf-8'
      );

      // extract ALL_RESTORE_TABLES array
      const allTablesMatch = content.match(/const ALL_RESTORE_TABLES = \[([\s\S]*?)\];/);
      if (allTablesMatch) {
        ALL_RESTORE_TABLES = allTablesMatch[1]
          .split('\n')
          .map(line => line.match(/'([^']+)'/g) || [])
          .flat()
          .map(s => s.replace(/'/g, ''));
      }

      // extract CATEGORY_TABLES - flatten all tables
      const categoryMatch = content.match(/const CATEGORY_TABLES[^=]*= \{([\s\S]*?)\};/);
      if (categoryMatch) {
        const tables: string[] = [];
        const matches = categoryMatch[1].matchAll(/'([^']+)'/g);
        for (const m of matches) {
          tables.push(m[1]);
        }
        CATEGORY_TABLES_FLAT = tables;
      }
    });

    it.each(HALLUCINATED_TABLES)(
      'hallucinated table %s should NOT be in ALL_RESTORE_TABLES',
      (tableName) => {
        expect(ALL_RESTORE_TABLES).not.toContain(tableName);
      }
    );

    it.each(HALLUCINATED_TABLES)(
      'hallucinated table %s should NOT be in CATEGORY_TABLES',
      (tableName) => {
        expect(CATEGORY_TABLES_FLAT).not.toContain(tableName);
      }
    );
  });
});
