import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const logger = {
  error: jest.fn<(...args: unknown[]) => void>(),
  info: jest.fn<(...args: unknown[]) => void>(),
  warn: jest.fn<(...args: unknown[]) => void>(),
};
const analyzeAndFlagAccount = jest.fn<(accountName: string) => Promise<void>>();
const broadcastConnectionEvent = jest.fn<(...args: unknown[]) => void>();
const readMudTextFile = jest.fn<(...args: unknown[]) => Promise<string>>();
const getReadableMudPath = jest.fn<(...args: unknown[]) => Promise<string>>();
const probeFlatfileHook = jest.fn<(...args: unknown[]) => Promise<void>>();
const registerFlatfileRecoveryHandler =
  jest.fn<(hookId: string, handler: () => Promise<void>) => void>();
const unregisterFlatfileRecoveryHandler = jest.fn<(hookId: string) => void>();
let hookEnabled = true;

class MockFlatfileAccessError extends Error {
  constructor(
    readonly hookId: string,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type TailHandler = (...args: unknown[]) => void;
class MockTail {
  readonly handlers = new Map<string, TailHandler>();
  readonly unwatch = jest.fn<() => void>();

  constructor(
    readonly filePath: string,
    readonly options: unknown,
  ) {
    tailInstances.push(this);
  }

  on(event: string, handler: TailHandler): this {
    this.handlers.set(event, handler);
    return this;
  }
}
const tailInstances: MockTail[] = [];

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query },
}));
jest.unstable_mockModule('../../hooks/hookGate.js', () => ({
  isHookEnabledSync: jest.fn(() => hookEnabled),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: logger,
}));
jest.unstable_mockModule('../multiAccountDetectionService.js', () => ({
  analyzeAndFlagAccount,
}));
jest.unstable_mockModule('../../index.js', () => ({
  broadcastConnectionEvent,
}));
jest.unstable_mockModule('../flatfileAccess.js', () => ({
  FlatfileAccessError: MockFlatfileAccessError,
  getReadableMudPath,
  probeFlatfileHook,
  readMudTextFile,
  registerFlatfileRecoveryHandler,
  unregisterFlatfileRecoveryHandler,
}));
jest.unstable_mockModule('tail', () => ({
  Tail: MockTail,
}));

const {
  importHistoricalLogs,
  parseConnectionLogLine,
  startRealtimeMonitoring,
  stopRealtimeMonitoring,
} = await import('../mudConnectionLogSync.js');
const { getFlatfileHookHealth, resetFlatfileHookStateForTests } = await import(
  '../../hooks/flatfileHookState.js'
);

const IPV4_LOGIN = 'Wed Nov  5 00:15:03 2025::Ubak [127.0.0.1] has connected.';
const IPV6_LOGIN = 'Wed Nov  5 00:15:03 2025::Ubak [2001:db8::1] has reconnected.';

beforeEach(() => {
  jest.clearAllMocks();
  hookEnabled = true;
  tailInstances.length = 0;
  resetFlatfileHookStateForTests();
  getReadableMudPath.mockResolvedValue('/contained/logs/log/comm');
  probeFlatfileHook.mockResolvedValue(undefined);
  analyzeAndFlagAccount.mockResolvedValue(undefined);
  query.mockImplementation(async (...args: unknown[]) => {
    const sql = String(args[0]);
    if (sql.includes('SELECT account_name')) {
      return [[{ account_name: 'account-one' }], []];
    }
    return [[], []];
  });
});

afterEach(() => {
  stopRealtimeMonitoring();
  resetFlatfileHookStateForTests();
});

describe('strict connection line parsing', () => {
  it.each([
    [IPV4_LOGIN, 4],
    [IPV6_LOGIN, 6],
  ])('accepts a valid IP line', (line, ipVersion) => {
    const parsed = parseConnectionLogLine(line);
    expect(parsed.kind).toBe('event');
    if (parsed.kind === 'event') {
      expect(parsed.event.characterName).toBe('Ubak');
      expect(parsed.event.status).toBe('login');
      expect(parsed.event.ipAddress.includes(':') ? 6 : 4).toBe(ipVersion);
    }
  });

  it.each([
    [`${IPV4_LOGIN} hostile-suffix`, 'format'],
    ['Wed Nov  5 00:15:03 2025::Ubak [127.0.0.1] has connected', 'format'],
    ['Wed Nov  5 00:15:03 2025::Ubak2 [127.0.0.1] has connected.', 'character_name'],
    ['Wed Nov  5 00:15:03 2025::Ubak\u00e9 [127.0.0.1] has connected.', 'character_name'],
    ['Wed Nov  5 00:15:03 2025::Abcdefghijklm [127.0.0.1] has connected.', 'character_name'],
    ['Wed Nov  5 00:15:03 2025::Ubak [999.0.0.1] has connected.', 'ip_address'],
    ['Thu Nov  5 00:15:03 2025::Ubak [127.0.0.1] has connected.', 'timestamp'],
  ])('rejects a malformed candidate with a stable reason', (line, reason) => {
    expect(parseConnectionLogLine(line)).toEqual({
      kind: 'malformed',
      reason,
    });
  });

  it('ignores an unrelated operational line', () => {
    expect(parseConnectionLogLine('Wed Nov  5 00:15:03 2025::The weather changes.')).toEqual({
      kind: 'ignored',
    });
  });
});

describe('historical ingestion gate and privacy', () => {
  it('does no read or database work when disabled', async () => {
    hookEnabled = false;

    await expect(importHistoricalLogs()).resolves.toEqual({
      imported: 0,
      skippedOld: 0,
      droppedMalformed: 0,
      unavailable: false,
    });
    expect(readMudTextFile).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('counts malformed candidates without logging source addresses', async () => {
    readMudTextFile.mockResolvedValue(
      [
        IPV4_LOGIN,
        `${IPV4_LOGIN} hostile-suffix`,
        'Wed Nov  5 00:15:03 2025::The weather changes.',
      ].join('\n'),
    );

    await expect(importHistoricalLogs(1_000)).resolves.toMatchObject({
      imported: 1,
      droppedMalformed: 1,
      unavailable: false,
    });
    expect(getFlatfileHookHealth('connection_log')?.droppedInputs).toBe(1);

    const logged = [...logger.info.mock.calls, ...logger.warn.mock.calls]
      .flat()
      .map(String)
      .join('\n');
    expect(logged).not.toContain('127.0.0.1');
    expect(logged).not.toContain('hostile-suffix');
  });
});

describe('realtime watcher lifecycle', () => {
  it('shares concurrent starts and installs one watcher', async () => {
    const first = startRealtimeMonitoring();
    const second = startRealtimeMonitoring();

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(tailInstances).toHaveLength(1);
    expect(getReadableMudPath).toHaveBeenCalledTimes(1);
    expect(registerFlatfileRecoveryHandler).toHaveBeenCalledTimes(1);
  });

  it('moves watcher failure into one registered recovery path', async () => {
    await startRealtimeMonitoring();
    const firstTail = tailInstances[0];
    firstTail.handlers.get('error')?.(new Error('source detail'));

    expect(firstTail.unwatch).toHaveBeenCalledTimes(1);
    expect(getFlatfileHookHealth('connection_log')).toMatchObject({
      availability: 'unavailable',
      consecutiveFailures: 1,
    });
    expect(registerFlatfileRecoveryHandler).toHaveBeenCalledTimes(1);
    const recovery = registerFlatfileRecoveryHandler.mock.calls[0][1];
    expect(recovery).toEqual(expect.any(Function));
  });

  it('cleans up the watcher and recovery registration', async () => {
    await startRealtimeMonitoring();
    const tail = tailInstances[0];

    stopRealtimeMonitoring();

    expect(tail.unwatch).toHaveBeenCalledTimes(1);
    expect(unregisterFlatfileRecoveryHandler).toHaveBeenCalledWith('connection_log');
  });
});
