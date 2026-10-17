import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectManagedArchive } from '../utils/managedArchiveTarget.js';
import type { BackupContents } from './backupSqlParsing.js';

export interface BackupInspection {
  outcome: 'valid' | 'invalid' | 'unconfirmed';
  contents: BackupContents | null;
}
function parse(value: unknown): BackupInspection | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'contents,format,outcome' ||
    !('format' in value) ||
    value.format !== 1 ||
    !('outcome' in value) ||
    !('contents' in value)
  )
    return null;
  if (value.outcome === 'invalid' || value.outcome === 'unconfirmed')
    return value.contents === null ? { outcome: value.outcome, contents: null } : null;
  const data = value.contents;
  if (
    value.outcome !== 'valid' ||
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).sort().join(',') !== 'accounts,characters' ||
    !('accounts' in data) ||
    !Array.isArray(data.accounts) ||
    !('characters' in data) ||
    !Array.isArray(data.characters) ||
    data.accounts.length > 5000 ||
    data.characters.length > 5000
  )
    return null;
  const accounts: string[] = [];
  const characters: Array<{ pid: number; name: string }> = [];
  for (const name of data.accounts) {
    if (typeof name !== 'string' || !name || name.length > 128 || /[\0\r\n]/.test(name))
      return null;
    accounts.push(name);
  }
  for (const character of data.characters) {
    if (
      !character ||
      typeof character !== 'object' ||
      Array.isArray(character) ||
      Object.keys(character).sort().join(',') !== 'name,pid' ||
      !('pid' in character) ||
      typeof character.pid !== 'number' ||
      !Number.isSafeInteger(character.pid) ||
      character.pid <= 0 ||
      !('name' in character) ||
      typeof character.name !== 'string' ||
      !character.name ||
      character.name.length > 128 ||
      /[\0\r\n]/.test(character.name)
    )
      return null;
    characters.push({ pid: character.pid, name: character.name });
  }
  return { outcome: 'valid', contents: { accounts, characters } };
}
/** Exit, memory and response limits apply even when untrusted parsing blocks its own event loop. */
export async function inspectBackupArchive(
  root: string,
  filename: string,
): Promise<BackupInspection> {
  let target: ReturnType<typeof inspectManagedArchive>;
  try {
    target = inspectManagedArchive(root, filename);
    if (target.fileSha256 === null) return { outcome: 'unconfirmed', contents: null };
  } catch {
    return { outcome: 'unconfirmed', contents: null };
  }
  const extension = path.extname(fileURLToPath(import.meta.url));
  const child = fork(
    fileURLToPath(new URL(`../scripts/backupInspectionWorker${extension}`, import.meta.url)),
    [],
    {
      execArgv: [
        '--max-old-space-size=192',
        ...(extension === '.ts'
          ? [
              '--import',
              fileURLToPath(new URL('../../node_modules/tsx/dist/loader.mjs', import.meta.url)),
            ]
          : []),
      ],
      env: {},
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      windowsHide: true,
    },
  );
  return new Promise((resolve) => {
    let result: BackupInspection | null = null,
      invalid = false,
      settled = false;
    const finish = (value: BackupInspection) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      invalid = true;
      // This fresh read-only child is owned by this request, never recovered from a stored PID.
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      finish({ outcome: 'unconfirmed', contents: null });
    }, 16000);
    child.on('message', (value: unknown) => {
      try {
        if (result !== null || Buffer.byteLength(JSON.stringify(value)) > 256 * 1024 + 256) {
          invalid = true;
          return;
        }
        result = parse(value);
        if (result === null) invalid = true;
      } catch {
        invalid = true;
      }
    });
    child.once('error', () => {
      invalid = true;
      if (!child.pid) finish({ outcome: 'unconfirmed', contents: null });
    });
    child.once('exit', (code) => {
      finish(
        code === 0 && !invalid && result ? result : { outcome: 'unconfirmed', contents: null },
      );
    });
    child.send(
      {
        root: target.root,
        filename: target.filename,
        rootSha256: target.rootSha256,
        fileSha256: target.fileSha256,
      },
      (error) => {
        if (error) {
          invalid = true;
          if (child.connected) child.disconnect();
        }
      },
    );
  });
}
