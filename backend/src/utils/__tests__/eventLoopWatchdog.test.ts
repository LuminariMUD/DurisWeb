import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const fixture = fileURLToPath(new URL('./fixtures/eventLoopWatchdog.fixture.ts', import.meta.url));

/** Real child processes prove diagnostics arrive while the monitored loop cannot run. */
async function observeStall(mode: 'permanent' | 'temporary'): Promise<string> {
  const child = spawn(process.execPath, [fixture, mode], { env: {}, stdio: 'pipe' });
  const closed = once(child, 'close');
  let output = '';
  let releaseProfile: () => void = () => {};
  const profiled = new Promise<void>((resolve) => {
    releaseProfile = resolve;
  });
  child.stderr.on('data', (data: Buffer) => {
    output += data.toString();
    if (output.includes('"event":"event_loop_profile"')) releaseProfile();
  });
  const deadline = setTimeout(() => child.kill('SIGKILL'), 15_000);
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      closed.then(() => {
        throw new Error(`Child exited before readiness: ${output}`);
      }),
    ]);
    child.stdin.write('block');
    if (mode === 'permanent') {
      await Promise.race([
        profiled,
        closed.then(() => {
          throw new Error('No profile before child exit');
        }),
      ]);
      // There is no opportunity for the fixture to flush buffered worker console messages.
      expect(child.exitCode).toBeNull();
      child.kill('SIGKILL');
    }
    const [code] = await closed;
    if (mode === 'temporary') expect(code).toBe(0);
    return output;
  } finally {
    clearTimeout(deadline);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
  }
}

describe('event-loop stall diagnostics', () => {
  it('reports a permanent stall and its hot code location before the process is killed', async () => {
    const output = await observeStall('permanent');
    const records = output
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(records.filter((record) => record.event === 'event_loop_stall')).toHaveLength(1);
    const sample = records.find((record) => record.event === 'event_loop_profile');
    expect(sample.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'utils/__tests__/fixtures/eventLoopWatchdog.fixture.ts',
        }),
      ]),
    );
    expect(output).not.toContain('file://');
    expect(output).not.toContain('/home/');
    expect(output).not.toContain('event_loop_recovered');
  });

  it('reports recovery after a temporary stall without repeating the stall alert', async () => {
    const output = await observeStall('temporary');
    const records = output
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(records.filter((record) => record.event === 'event_loop_stall')).toHaveLength(1);
    expect(records.filter((record) => record.event === 'event_loop_recovered')).toHaveLength(1);
    expect(
      records.find((record) => record.event === 'event_loop_stall').blockedMs,
    ).toBeGreaterThanOrEqual(5_000);
  });

  it('does not keep an otherwise idle process alive or report a healthy loop as stalled', async () => {
    const child = spawn(process.execPath, [fixture, 'idle'], { env: {}, stdio: 'pipe' });
    let output = '';
    child.stderr.on('data', (data: Buffer) => {
      output += data.toString();
    });
    const deadline = setTimeout(() => child.kill('SIGKILL'), 5_000);
    try {
      const [code] = await once(child, 'close');
      expect(code).toBe(0);
      expect(output).toBe('');
    } finally {
      clearTimeout(deadline);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  });
});
