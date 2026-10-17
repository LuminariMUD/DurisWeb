import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspect } from 'node:util';
import * as childProcesses from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import unzipper from 'unzipper';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-stream-archive-'));
const fixture = path.join(root, 'dump.mjs');
const release = path.join(root, 'release');
fs.writeFileSync(
  fixture,
  `
import fs from 'node:fs';
const [mode,pass,release]=process.argv.slice(2);
if((mode==='fail_data'&&pass==='data')||(mode==='fail_schema'&&pass==='schema')){
 process.stdout.write('partial synthetic dump');process.stderr.write('private-password-sql-sentinel');process.exit(7);
}else {
 process.stdout.write(pass==='data'?'ordinary synthetic rows\\n':'CREATE TABLE web_sessions(id INT);\\n');
 if(mode==='wait'){
  const poll=setInterval(()=>{if(fs.existsSync(release)){clearInterval(poll);process.stdout.end();}},10);
 }else process.stdout.end();
}
`,
);
const realSpawn = childProcesses.spawn;
const realWriteStream = fs.createWriteStream.bind(fs);
let output: fs.WriteStream | undefined;
let mode = 'ok';
const children: Array<Promise<void>> = [];
const spawn = jest.fn<
  (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess
>((_command, args, options) => {
  const values = Array.isArray(args) ? args : [];
  const child =
    mode === 'spawn_error'
      ? realSpawn('/nonexistent/durisweb-dump-fixture', [], options)
      : realSpawn(
          process.execPath,
          [fixture, mode, values.includes('--no-data') ? 'schema' : 'data', release],
          options,
        );
  children.push(new Promise<void>((resolve) => child.once('close', () => resolve())));
  return child;
});
jest.unstable_mockModule('node:child_process', () => ({ ...childProcesses, spawn }));
jest.unstable_mockModule('node:fs', () => ({
  ...fs,
  default: fs,
  createWriteStream: (...args: Parameters<typeof fs.createWriteStream>) => {
    output = realWriteStream(...args);
    return output;
  },
}));
const { writeDatabaseBackupArchive, BackupCreationError } = await import(
  '../databaseBackupArchive.js'
);
const configuration = {
  host: 'fixture.invalid',
  port: 3306,
  database: 'fixture_db',
  user: 'fixture',
  password: 'private-password-sql-sentinel',
};
const archive = path.join(root, 'snapshot.zip');
beforeEach(() => {
  mode = 'ok';
  spawn.mockClear();
  for (const file of [archive, release]) if (fs.existsSync(file)) fs.unlinkSync(file);
});
afterEach(async () => {
  fs.writeFileSync(release, '');
  await Promise.all(children.splice(0));
});
afterAll(() => fs.rmSync(root, { recursive: true }));
describe('one-file streamed database archive', () => {
  it('combines both passes in one private ZIP without extra SQL files or credential arguments', async () => {
    await writeDatabaseBackupArchive(configuration, archive, ['fixture_view'], true);
    const zip = await unzipper.Open.file(archive);
    expect(zip.files.map((file) => file.path)).toEqual(['database/database.sql']);
    expect((await zip.files[0].buffer()).toString('utf8')).toBe(
      'ordinary synthetic rows\nCREATE TABLE web_sessions(id INT);\n',
    );
    expect(fs.statSync(archive).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(root).sort()).toEqual(['dump.mjs', 'snapshot.zip']);
    expect(spawn.mock.calls.length).toBe(2);
    for (const [command, args, options] of spawn.mock.calls) {
      expect(command).toBe('mysqldump');
      expect(args).not.toContain(configuration.password);
      expect(options.shell).toBe(false);
      expect(options.stdio).toEqual(['ignore', 'pipe', 'ignore']);
      expect(options.env?.MYSQL_PWD).toBe(configuration.password);
    }
    expect(spawn.mock.calls[0][1]).toContain('--ignore-table=fixture_db.web_sessions');
    expect(spawn.mock.calls[1][1]).toContain('--no-data');
  });
  it('uses one pass for a source without the session table', async () => {
    await writeDatabaseBackupArchive(configuration, archive, [], false);
    expect(spawn.mock.calls.length).toBe(1);
    const zip = await unzipper.Open.file(archive);
    expect((await zip.files[0].buffer()).toString('utf8')).toBe('ordinary synthetic rows\n');
  });
  it.each(['fail_data', 'fail_schema', 'spawn_error'])(
    'retains and closes an unconfirmed archive after %s',
    async (failureMode) => {
      mode = failureMode;
      let error: unknown;
      try {
        await writeDatabaseBackupArchive(configuration, archive, [], true);
      } catch (value) {
        error = value;
      }
      expect(error).toBeInstanceOf(BackupCreationError);
      expect(inspect(error)).not.toContain('private-password-sql-sentinel');
      expect(fs.existsSync(archive)).toBe(true);
      const before = fs.statSync(archive).size;
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(fs.statSync(archive).size).toBe(before);
      expect(
        fs.readdirSync(root).some((file) => file.endsWith('.sql') || file.startsWith('temp_')),
      ).toBe(false);
    },
  );
  it('does not overwrite an existing archive or start a dump when exclusive open fails', async () => {
    fs.writeFileSync(archive, 'keep existing archive');
    await expect(
      writeDatabaseBackupArchive(configuration, archive, [], true),
    ).rejects.toBeInstanceOf(BackupCreationError);
    expect(fs.readFileSync(archive, 'utf8')).toBe('keep existing archive');
    expect(spawn.mock.calls.length).toBe(0);
  });
  it('does not acknowledge completion while a dump process can still write', async () => {
    mode = 'wait';
    let complete = false;
    const work = writeDatabaseBackupArchive(configuration, archive, [], false).then(() => {
      complete = true;
    });
    while (!spawn.mock.calls.length) await new Promise((resolve) => setTimeout(resolve, 5));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(complete).toBe(false);
    fs.writeFileSync(release, '');
    await work;
    expect(complete).toBe(true);
  });
  it('closes the output and reaps its dump before refusing a mid-stream filesystem failure', async () => {
    mode = 'wait';
    const work = writeDatabaseBackupArchive(configuration, archive, [], false);
    const refused = expect(work).rejects.toBeInstanceOf(BackupCreationError);
    while (!spawn.mock.calls.length) await new Promise((resolve) => setTimeout(resolve, 5));
    output!.destroy(new Error('private-filesystem-path-sentinel'));
    await refused;
    expect(output!.closed).toBe(true);
    await Promise.all(children);
    expect(fs.existsSync(archive)).toBe(true);
  });
});
