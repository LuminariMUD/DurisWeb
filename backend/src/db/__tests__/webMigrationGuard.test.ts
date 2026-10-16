import { describe, expect, it } from '@jest/globals';
import { assertWebForwardSql } from '../webMigrationGuard.js';
const declared = new Set(['web_sessions', 'web_added']);
describe('forward migration emitted SQL boundary', () => {
  it.each([
    'ALTER TABLE accounts ADD COLUMN forbidden INT',
    '/* ordinary comment */ ALTER TABLE `accounts` ADD COLUMN forbidden INT',
    'ALTER/**/TABLE accounts ADD COLUMN forbidden INT',
    'ALTER TABLE web_sessions RENAME TO accounts',
    'RENAME TABLE web_sessions TO web_added, web_added TO accounts',
    'DROP TABLE IF EXISTS web_added, accounts',
    'TRUNCATE TABLE accounts',
    'CREATE UNIQUE INDEX forbidden ON accounts (id)',
    'DROP INDEX forbidden ON accounts',
    'ALTER TABLE web_sessions ADD FOREIGN KEY (id) REFERENCES accounts(id)',
    'ALTER TABLE web_sessions EXCHANGE PARTITION p0 WITH TABLE accounts',
    'CREATE TABLE accounts (id INT)',
  ])('refuses undeclared targets in %s', (sql) => {
    expect(() => assertWebForwardSql(sql, declared)).toThrow('forward_schema_undeclared_table');
  });
  it.each([
    'ALTER TABLE other_db.web_sessions ADD COLUMN forbidden INT',
    '/*!80000 ALTER TABLE accounts ADD COLUMN forbidden INT */',
    '/*M! ALTER TABLE accounts ADD COLUMN forbidden INT */',
    'SELECT 1; ALTER TABLE accounts ADD COLUMN forbidden INT',
    'CALL unsafe_schema_change()',
    'PREPARE unsafe FROM @statement',
    'EXECUTE unsafe',
    'CREATE TRIGGER unsafe BEFORE INSERT ON web_sessions FOR EACH ROW SET @x=1',
    'CREATE DATABASE unsafe',
  ])('fails closed on unsupported or indirect DDL in %s', (sql) => {
    expect(() => assertWebForwardSql(sql, declared)).toThrow('forward_schema_unsupported_sql');
  });
  it.each([
    'ALTER TABLE `web_sessions` ADD COLUMN forward_value INT',
    "ALTER TABLE web_sessions ADD COLUMN label TEXT COMMENT 'not SQL; ALTER TABLE accounts'",
    'ALTER TABLE web_sessions RENAME COLUMN old_value TO forward_value',
    'ALTER TABLE web_sessions RENAME INDEX old_index TO new_index',
    'ALTER TABLE web_sessions RENAME TO web_added',
    'CREATE TABLE IF NOT EXISTS web_added (id INT PRIMARY KEY)',
    'CREATE UNIQUE INDEX new_index ON web_sessions (id)',
    'DROP INDEX new_index ON web_sessions',
    'DROP TABLE IF EXISTS web_added',
    'TRUNCATE web_added;',
    'RENAME TABLE web_sessions TO web_added',
    'SELECT 1',
  ])('permits declared canonical SQL in %s', (sql) => {
    expect(() => assertWebForwardSql(sql, declared)).not.toThrow();
  });
  it('permits a data-only contract while refusing every DDL target', () => {
    expect(() => assertWebForwardSql('SELECT 1', new Set())).not.toThrow();
    expect(() =>
      assertWebForwardSql('ALTER TABLE web_sessions ADD COLUMN value INT', new Set()),
    ).toThrow('forward_schema_undeclared_table');
  });
});
