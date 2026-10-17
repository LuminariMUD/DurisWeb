import unzipper from 'unzipper';
import fs from 'node:fs';
import {
  collectGeneratedBackupSummarySql,
  parseBackupContentsFromSql,
} from '../services/backupSqlParsing.js';
import { managedArchiveFileSha256 } from '../utils/managedArchiveTarget.js';

// Untrusted ZIP/SQL parsing has no application configuration, SQL credentials or ordinary output.
const startupTimer = setTimeout(() => process.exit(2), 15000);
process.once('disconnect', () => process.exit(2));
process.once('message', (value: unknown) => {
  void inspect(value).catch(() => reply('unconfirmed'));
});
function reply(
  outcome: 'invalid' | 'unconfirmed' | 'valid',
  contents?: ReturnType<typeof parseBackupContentsFromSql>,
) {
  process.send?.({ format: 1, outcome, contents: contents ?? null }, (error) =>
    process.exit(error ? 2 : 0),
  );
}
async function inspect(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    (value.kind !== 'upload' && value.kind !== 'generated') ||
    !('size' in value) ||
    typeof value.size !== 'number' ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0 ||
    !('fileSha256' in value) ||
    typeof value.fileSha256 !== 'string'
  )
    process.exit(2);
  if (value.kind === 'generated') {
    clearTimeout(startupTimer);
    setTimeout(() => process.exit(2), 120000);
  }
  const size = value.size;
  const before = fs.fstatSync(3, { bigint: true });
  if (
    !before.isFile() ||
    Number(before.size) !== value.size ||
    managedArchiveFileSha256(before) !== value.fileSha256
  )
    process.exit(2);
  const directory = await unzipper.Open.custom({
    size: async () => size,
    // Positional readers share the inherited validated fd; they never reopen a path.
    stream: (start, length) =>
      fs.createReadStream('', {
        fd: 3,
        autoClose: false,
        // unzipper destroys individual ranges; the worker, not a range, owns fd 3.
        fs: { read: fs.read, close: (_fd, callback) => callback(null) },
        start,
        end: length ? start + length : undefined,
      }),
  });
  if (directory.files.length > 10000) return reply('unconfirmed');
  const sql = directory.files.filter(
    (file) => file.path === 'database.sql' || /^database\/[^/\\\0]+\.sql$/.test(file.path),
  );
  if (sql.length !== 1) return reply('invalid');
  let text: string;
  if (value.kind === 'generated') {
    text = await collectGeneratedBackupSummarySql(sql[0].stream());
  } else {
    const limit = 64 * 1024 * 1024;
    if (sql[0].uncompressedSize > limit) return reply('unconfirmed');
    const chunks: Buffer[] = [];
    let expandedBytes = 0;
    for await (const chunk of sql[0].stream()) {
      const block: unknown = chunk;
      if (!Buffer.isBuffer(block)) return reply('unconfirmed');
      expandedBytes += block.length;
      if (expandedBytes > limit) return reply('unconfirmed');
      chunks.push(block);
    }
    text = Buffer.concat(chunks, expandedBytes).toString('utf8');
  }
  if (
    !text.includes('CREATE TABLE `account_characters`') ||
    !text.includes('CREATE TABLE `player_data`')
  )
    return reply('invalid');
  const contents = parseBackupContentsFromSql(text);
  if (
    contents.accounts.length > 5000 ||
    contents.characters.length > 5000 ||
    Buffer.byteLength(JSON.stringify(contents)) > 256 * 1024
  )
    return reply('unconfirmed');
  if (
    contents.accounts.some((name) => !name || name.length > 128 || /[\0\r\n]/.test(name)) ||
    contents.characters.some(
      (character) =>
        !Number.isSafeInteger(character.pid) ||
        character.pid <= 0 ||
        !character.name ||
        character.name.length > 128 ||
        /[\0\r\n]/.test(character.name),
    )
  )
    return reply('unconfirmed');
  if (managedArchiveFileSha256(fs.fstatSync(3, { bigint: true })) !== value.fileSha256)
    return reply('unconfirmed');
  reply('valid', contents);
}
