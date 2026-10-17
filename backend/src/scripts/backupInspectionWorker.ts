import unzipper from 'unzipper';
import { parseBackupContentsFromSql } from '../services/backupSqlParsing.js';
import { inspectManagedArchive } from '../utils/managedArchiveTarget.js';

// Untrusted ZIP/SQL parsing has no application configuration, SQL credentials or ordinary output.
setTimeout(() => process.exit(2), 15000);
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
    !('root' in value) ||
    typeof value.root !== 'string' ||
    !('filename' in value) ||
    typeof value.filename !== 'string' ||
    !('rootSha256' in value) ||
    typeof value.rootSha256 !== 'string' ||
    !('fileSha256' in value) ||
    typeof value.fileSha256 !== 'string'
  )
    process.exit(2);
  const target = inspectManagedArchive(value.root, value.filename);
  if (target.rootSha256 !== value.rootSha256 || target.fileSha256 !== value.fileSha256)
    process.exit(2);
  const directory = await unzipper.Open.file(target.filePath);
  if (directory.files.length > 10000) return reply('unconfirmed');
  const sql = directory.files.filter(
    (file) => file.path === 'database.sql' || /^database\/[^/\\\0]+\.sql$/.test(file.path),
  );
  if (sql.length !== 1) return reply('invalid');
  const limit = 64 * 1024 * 1024;
  if (sql[0].uncompressedSize > limit) return reply('unconfirmed');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of sql[0].stream()) {
    const block: unknown = chunk;
    if (!Buffer.isBuffer(block)) return reply('unconfirmed');
    size += block.length;
    if (size > limit) return reply('unconfirmed');
    chunks.push(block);
  }
  const text = Buffer.concat(chunks, size).toString('utf8');
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
  const after = inspectManagedArchive(value.root, value.filename);
  if (after.rootSha256 !== target.rootSha256 || after.fileSha256 !== target.fileSha256)
    return reply('unconfirmed');
  reply('valid', contents);
}
