import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  getFlatfileHookHealth,
  markFlatfileUnavailable,
  resetFlatfileHookStateForTests,
  setFlatfileHookClockForTests,
} from '../../hooks/flatfileHookState.js';
import {
  FlatfileAccessError,
  probeFlatfileHook,
  readMudTextFile,
  resetFlatfileAccessForTests,
  setFlatfileReadInterlockForTests,
  setMudRootForTests,
} from '../flatfileAccess.js';

let testBase = '';
let mudRoot = '';
let now = 0;

async function write(relativePath: string, content: string | Buffer): Promise<string> {
  const target = path.join(mudRoot, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
  return target;
}

beforeEach(async () => {
  resetFlatfileAccessForTests();
  resetFlatfileHookStateForTests();
  now = 0;
  setFlatfileHookClockForTests(() => now);
  testBase = await fs.mkdtemp(path.join(os.tmpdir(), 'durisweb-flatfile-'));
  mudRoot = path.join(testBase, 'mud');
  await fs.mkdir(mudRoot);
  setMudRootForTests(mudRoot);
});

afterEach(async () => {
  resetFlatfileAccessForTests();
  resetFlatfileHookStateForTests();
  if (testBase) {
    await fs.rm(testBase, { recursive: true, force: true });
  }
});

describe('contained flatfile reads', () => {
  it('reads a regular UTF-8 file and normalizes line endings', async () => {
    await write('logs/log/comm', 'first\r\nsecond\rlast');

    await expect(
      readMudTextFile('connection_log', 'logs/log/comm'),
    ).resolves.toBe('first\nsecond\nlast');
  });

  it('rejects lexical traversal and counts the dropped input', async () => {
    await expect(
      readMudTextFile('connection_log', '../outside.txt'),
    ).rejects.toMatchObject({
      code: 'invalid_path',
    });
    expect(getFlatfileHookHealth('connection_log')?.droppedInputs).toBe(1);
  });

  it('rejects a symlink that resolves outside MUD_DIR', async () => {
    const outside = path.join(testBase, 'outside.txt');
    await fs.writeFile(outside, 'outside');
    await fs.symlink(outside, path.join(mudRoot, 'escape'));

    await expect(
      readMudTextFile('connection_log', 'escape'),
    ).rejects.toMatchObject({
      code: 'invalid_path',
    });
    expect(getFlatfileHookHealth('connection_log')?.droppedInputs).toBe(1);
  });

  it('returns null for an optional absent leaf under a readable root', async () => {
    await expect(
      readMudTextFile('zone_builder_parsing', 'areas/mob/absent.mob', {
        optional: true,
      }),
    ).resolves.toBeNull();
    expect(getFlatfileHookHealth('zone_builder_parsing')?.availability).toBe(
      'available',
    );
  });

  it('does not mistake an absent root for an optional absent leaf', async () => {
    await fs.rm(mudRoot, { recursive: true });

    await expect(
      readMudTextFile('zone_builder_parsing', 'areas/mob/absent.mob', {
        optional: true,
      }),
    ).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(getFlatfileHookHealth('zone_builder_parsing')?.availability).toBe(
      'unavailable',
    );
  });
});

describe('flatfile content limits', () => {
  it('rejects oversized files before reading their contents', async () => {
    await write('src/core/common.c', '12345');

    await expect(
      readMudTextFile('flag_parsing', 'src/core/common.c', { maxBytes: 4 }),
    ).rejects.toMatchObject({
      code: 'too_large',
    });
    expect(getFlatfileHookHealth('flag_parsing')?.droppedInputs).toBe(1);
  });

  it('rejects a file that grows beyond the limit after inspection', async () => {
    const sourcePath = await write('src/core/common.c', '1234');
    setFlatfileReadInterlockForTests(async () => {
      setFlatfileReadInterlockForTests(null);
      await fs.appendFile(sourcePath, '5');
    });

    await expect(
      readMudTextFile('flag_parsing', 'src/core/common.c', { maxBytes: 4 }),
    ).rejects.toMatchObject({
      code: 'too_large',
    });
    expect(getFlatfileHookHealth('flag_parsing')?.droppedInputs).toBe(1);
  });

  it('rejects NUL-bearing input', async () => {
    await write('src/core/common.c', Buffer.from([65, 0, 66]));

    await expect(
      readMudTextFile('flag_parsing', 'src/core/common.c'),
    ).rejects.toMatchObject({
      code: 'invalid_content',
    });
    expect(getFlatfileHookHealth('flag_parsing')?.droppedInputs).toBe(1);
  });

  it('rejects invalid UTF-8 without poisoning a later valid decode', async () => {
    const sourcePath = await write(
      'src/core/common.c',
      Buffer.from([0xc3, 0x28]),
    );

    await expect(
      readMudTextFile('flag_parsing', 'src/core/common.c'),
    ).rejects.toMatchObject({
      code: 'invalid_content',
    });
    await fs.writeFile(sourcePath, 'valid');
    await expect(
      readMudTextFile('flag_parsing', 'src/core/common.c'),
    ).resolves.toBe('valid');
  });
});

describe('unavailable backoff and recovery', () => {
  it('rejects an escaping required symlink and reports the hook unavailable', async () => {
    const outside = path.join(testBase, 'outside-comm');
    await fs.writeFile(outside, 'outside');
    await fs.mkdir(path.join(mudRoot, 'logs/log'), { recursive: true });
    await fs.symlink(outside, path.join(mudRoot, 'logs/log/comm'));

    await expect(probeFlatfileHook('connection_log')).rejects.toMatchObject({
      code: 'invalid_path',
    });
    expect(getFlatfileHookHealth('connection_log')).toMatchObject({
      availability: 'unavailable',
      droppedInputs: 1,
      consecutiveFailures: 1,
    });
  });

  it('suppresses access during backoff', async () => {
    await write('logs/log/comm', 'ready');
    markFlatfileUnavailable(
      'connection_log',
      'Required MUD filesystem resource is unavailable.',
    );

    await expect(
      readMudTextFile('connection_log', 'logs/log/comm'),
    ).rejects.toBeInstanceOf(FlatfileAccessError);
    await expect(
      readMudTextFile('connection_log', 'logs/log/comm'),
    ).rejects.toMatchObject({
      code: 'backoff',
    });
  });

  it('does not clear hook-wide failure after only one required file succeeds', async () => {
    await write('src/core/common.c', 'ready');
    markFlatfileUnavailable(
      'flag_parsing',
      'Required MUD filesystem resource is unavailable.',
    );
    now = 1_000;

    await expect(
      readMudTextFile('flag_parsing', 'src/core/common.c'),
    ).resolves.toBe('ready');
    expect(getFlatfileHookHealth('flag_parsing')).toMatchObject({
      availability: 'unavailable',
      consecutiveFailures: 1,
    });
  });

  it('recovers after the retry window when required resources return', async () => {
    setMudRootForTests(path.join(testBase, 'missing-mud'));
    await expect(probeFlatfileHook('connection_log')).rejects.toMatchObject({
      code: 'unavailable',
    });

    const recoveredRoot = path.join(testBase, 'missing-mud');
    await fs.mkdir(path.join(recoveredRoot, 'logs/log'), { recursive: true });
    await fs.writeFile(path.join(recoveredRoot, 'logs/log/comm'), 'ready');
    now = 1_000;

    await expect(probeFlatfileHook('connection_log')).resolves.toBeUndefined();
    expect(getFlatfileHookHealth('connection_log')).toMatchObject({
      availability: 'available',
      consecutiveFailures: 0,
      retryAt: null,
    });
  });
});
