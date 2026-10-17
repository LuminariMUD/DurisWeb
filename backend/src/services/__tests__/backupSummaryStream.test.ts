import { describe, expect, it } from '@jest/globals';
import {
  collectGeneratedBackupSummarySql,
  parseBackupContentsFromSql,
} from '../backupSqlParsing.js';

const schema =
  'CREATE TABLE `player_data` (`pid` int);\nCREATE TABLE `account_characters` (\n`account_name` varchar(50),\n`char_name` varchar(50),\n`pid` int\n) ENGINE=InnoDB;\n';
const rows = "INSERT INTO `account_characters` VALUES ('Alphé','O\\'Brien;二',1);\n";
async function* chunks(value: string, size: number) {
  const bytes = Buffer.from(value);
  for (let offset = 0; offset < bytes.length; offset += size)
    yield bytes.subarray(offset, offset + size);
}

describe('generated backup summary streaming', () => {
  it.each([1, 7, 128, 65536])(
    'preserves UTF-8, escaped strings and definitions across %i-byte chunks',
    async (size) => {
      const dump =
        '-- Header\n' +
        schema +
        "INSERT INTO `account_characters_backup` VALUES ('Hidden','Wrong',2);\n" +
        "INSERT INTO `unrelated` VALUES ('INSERT INTO `account_characters` VALUES (fake);');\n" +
        rows;
      const selected = await collectGeneratedBackupSummarySql(chunks(dump, size));
      expect(parseBackupContentsFromSql(selected)).toEqual({
        accounts: ['Alphé'],
        characters: [{ pid: 1, name: "O'Brien;二" }],
      });
      expect(selected).not.toContain('Hidden');
      expect(selected).not.toContain('unrelated');
    },
  );
  it('streams past a single unrelated INSERT larger than the upload budget', async () => {
    async function* dump() {
      yield Buffer.from("INSERT INTO `unrelated` VALUES ('");
      const block = Buffer.alloc(1024 * 1024, 'x');
      for (let index = 0; index < 65; index++) yield block;
      yield Buffer.from("');\n" + schema + rows);
    }
    const selected = await collectGeneratedBackupSummarySql(dump());
    expect(Buffer.byteLength(selected)).toBeLessThan(1024);
    expect(parseBackupContentsFromSql(selected).accounts).toEqual(['Alphé']);
  });
  it('retains the selected-summary byte bound even when total dump size is unrestricted', async () => {
    async function* dump() {
      yield Buffer.from("INSERT INTO `account_characters` VALUES ('");
      const block = Buffer.alloc(1024 * 1024, 'x');
      for (let index = 0; index < 65; index++) yield block;
    }
    await expect(collectGeneratedBackupSummarySql(dump())).rejects.toThrow('exceeds its budget');
  });
  it('refuses an unfinished table definition instead of returning a partial summary', async () => {
    await expect(
      collectGeneratedBackupSummarySql(chunks('CREATE TABLE `account_characters` (\n', 3)),
    ).rejects.toThrow('incomplete');
  });
});
