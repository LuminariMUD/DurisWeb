import { afterAll, afterEach, describe, expect, it, jest } from '@jest/globals';
import { fork as realFork, type ChildProcess, type ForkOptions } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { inspectManagedArchive } from '../../utils/managedArchiveTarget.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'durisweb-archive-worker-'));
const fixturePath = path.join(directory, 'early-result.mjs');
const identityPath = new URL('../../utils/archiveWorkerIdentity.ts', import.meta.url).href;
fs.writeFileSync(
  fixturePath,
  `
import {unlink} from 'node:fs/promises';
import {captureArchiveWorker} from ${JSON.stringify(identityPath)};
const timer=setTimeout(()=>process.exit(2),5000);
process.once('disconnect',()=>process.exit(2));
process.once('message',message=>{
  process.send({format:1,type:'result',operationId:message.operationId,outcome:'removed'});
  process.once('message',async()=>{await unlink(message.root+'/'+message.filename);clearTimeout(timer);process.exit(0);});
});
process.send({format:1,type:'ready',worker:await captureArchiveWorker(process.pid)});
`,
);
let early = false;
const children: Array<{ child: ChildProcess; closed: Promise<void> }> = [];
const fork = jest.fn((modulePath: string | URL, args: string[], options: ForkOptions) => {
  const child = realFork(early ? fixturePath : modulePath, args, options);
  children.push({
    child,
    closed: new Promise<void>((resolve) => child.once('exit', () => resolve())),
  });
  return child;
});
jest.unstable_mockModule('node:child_process', () => ({ fork }));
const { startArchiveUnlinkWorker } = await import('../archiveUnlinkProcess.js');
afterEach(async () => {
  const pending = children.splice(0);
  early = false;
  for (const entry of pending) {
    if (entry.child.connected) entry.child.disconnect();
    await entry.closed;
  }
});
afterAll(() => fs.rmSync(directory, { recursive: true }));

describe('one-shot archive unlink worker', () => {
  it('does nothing before authorization, then confirms unlink only after exit', async () => {
    const filename = 'duris-mud-worker.zip';
    fs.writeFileSync(path.join(directory, filename), 'synthetic archive');
    const target = inspectManagedArchive(directory, filename);
    const worker = startArchiveUnlinkWorker();
    try {
      await worker.ready();
      expect(worker.identity().pid).toBe(children[0].child.pid);
      expect(fs.existsSync(target.filePath)).toBe(true);
      expect(fork.mock.calls.at(-1)?.[2]).toMatchObject({
        env: {},
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      await worker.authorize(randomUUID(), target);
      expect(await worker.result()).toBe('removed');
      expect(fs.existsSync(target.filePath)).toBe(false);
    } finally {
      worker.disconnect();
    }
  });
  it('retains a file whose identity changed after inspection', async () => {
    const filename = 'duris-mud-changed.zip';
    fs.writeFileSync(path.join(directory, filename), 'before');
    const target = inspectManagedArchive(directory, filename);
    fs.writeFileSync(target.filePath, 'different replacement data');
    const worker = startArchiveUnlinkWorker();
    try {
      await worker.ready();
      await worker.authorize(randomUUID(), target);
      expect(await worker.result()).toBe('refused');
      expect(fs.readFileSync(target.filePath, 'utf8')).toBe('different replacement data');
    } finally {
      worker.disconnect();
    }
  });
  it('exits without unlink when its parent disconnects before authorization', async () => {
    const filename = 'duris-mud-not-authorized.zip';
    fs.writeFileSync(path.join(directory, filename), 'preserve');
    const worker = startArchiveUnlinkWorker();
    await worker.ready();
    worker.disconnect();
    expect(await worker.result()).toBeNull();
    expect(fs.readFileSync(path.join(directory, filename), 'utf8')).toBe('preserve');
  });
  it('does not accept an early result until the worker actually stops', async () => {
    early = true;
    const filename = 'duris-mud-early.zip';
    fs.writeFileSync(path.join(directory, filename), 'preserve until worker exit');
    const target = inspectManagedArchive(directory, filename);
    const worker = startArchiveUnlinkWorker();
    try {
      await worker.ready();
      const resultReceived = new Promise<void>((resolve) =>
        children[0].child.once('message', () => resolve()),
      );
      await worker.authorize(randomUUID(), target);
      await resultReceived;
      let settled = false;
      const result = worker.result().then((value) => {
        settled = true;
        return value;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      expect(fs.existsSync(target.filePath)).toBe(true);
      children[0].child.send({ finish: true });
      expect(await result).toBe('removed');
      expect(fs.existsSync(target.filePath)).toBe(false);
    } finally {
      worker.disconnect();
    }
  });
  it('confirms an already absent owned path without creating or deleting another file', async () => {
    const target = inspectManagedArchive(directory, 'duris-mud-absent.zip');
    const worker = startArchiveUnlinkWorker();
    try {
      await worker.ready();
      await worker.authorize(randomUUID(), target);
      expect(await worker.result()).toBe('absent');
      expect(fs.existsSync(target.filePath)).toBe(false);
    } finally {
      worker.disconnect();
    }
  });
  it('self-exits on its idle deadline without ever receiving unlink authority', async () => {
    const worker = startArchiveUnlinkWorker();
    try {
      await worker.ready();
      await children[0].closed;
      expect(await worker.result()).toBeNull();
      expect(children[0].child.exitCode).toBe(2);
    } finally {
      worker.disconnect();
    }
  });
});
