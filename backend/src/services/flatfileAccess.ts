import { constants } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TextDecoder } from 'util';

import {
  canAttemptFlatfileHook,
  getFlatfileHookHealth,
  getFilesystemHookIds,
  markFlatfileAvailable,
  markFlatfileUnavailable,
  recordDroppedFlatfileInput,
  type FilesystemHookId,
} from '../hooks/flatfileHookState.js';
import { recordHookActivity } from '../hooks/hookActivity.js';

export type FlatfileAccessErrorCode =
  | 'backoff'
  | 'invalid_content'
  | 'invalid_path'
  | 'not_found'
  | 'too_large'
  | 'unavailable';

export class FlatfileAccessError extends Error {
  constructor(
    readonly hookId: FilesystemHookId,
    readonly code: FlatfileAccessErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FlatfileAccessError';
  }
}

export interface ReadMudTextOptions {
  readonly maxBytes?: number;
  readonly optional?: boolean;
}

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

type RequiredProbePath = Readonly<{
  path: string;
  kind: 'directory' | 'file';
}>;

const REQUIRED_PROBE_PATHS: Readonly<Record<FilesystemHookId, readonly RequiredProbePath[]>> =
  Object.freeze({
    connection_log: Object.freeze([Object.freeze({ path: 'logs/log/comm', kind: 'file' })]),
    flag_parsing: Object.freeze([
      Object.freeze({ path: 'src/core/common.c', kind: 'file' }),
      Object.freeze({ path: 'src/combat/fight.c', kind: 'file' }),
      Object.freeze({ path: 'src/core/constant.c', kind: 'file' }),
      Object.freeze({ path: 'src/core/defines.h', kind: 'file' }),
    ]),
    zone_builder_parsing: Object.freeze([
      Object.freeze({ path: 'areas/zon', kind: 'directory' }),
      Object.freeze({ path: 'areas/wld', kind: 'directory' }),
      Object.freeze({ path: 'areas/mob', kind: 'directory' }),
      Object.freeze({ path: 'areas/obj', kind: 'directory' }),
    ]),
  });

let testMudRoot: string | null = null;
let testReadInterlock: (() => Promise<void> | void) | null = null;
const recoveryHandlers = new Map<FilesystemHookId, () => Promise<void>>();

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function unavailable(hookId: FilesystemHookId, reason: string): FlatfileAccessError {
  markFlatfileUnavailable(hookId, reason);
  return new FlatfileAccessError(hookId, 'unavailable', reason);
}

function configuredMudRoot(hookId: FilesystemHookId): string {
  const configured = testMudRoot ?? process.env.MUD_DIR?.trim();
  if (!configured) {
    throw unavailable(hookId, 'MUD_DIR is not configured.');
  }
  if (!path.isAbsolute(configured)) {
    throw unavailable(hookId, 'MUD_DIR must be an absolute path.');
  }
  return path.resolve(configured);
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function resolveContainedPath(
  hookId: FilesystemHookId,
  relativeOrAbsolutePath: string,
): { root: string; target: string } {
  const root = configuredMudRoot(hookId);
  const target = path.isAbsolute(relativeOrAbsolutePath)
    ? path.resolve(relativeOrAbsolutePath)
    : path.resolve(root, relativeOrAbsolutePath);
  if (!isWithinRoot(root, target)) {
    recordDroppedFlatfileInput(hookId);
    throw new FlatfileAccessError(
      hookId,
      'invalid_path',
      'Flatfile path must remain inside MUD_DIR.',
    );
  }
  return { root, target };
}

function assertAttemptAllowed(hookId: FilesystemHookId): void {
  if (canAttemptFlatfileHook(hookId)) {
    return;
  }
  const retryAt = getFlatfileHookHealth(hookId)?.retryAt;
  throw new FlatfileAccessError(
    hookId,
    'backoff',
    retryAt
      ? `Flatfile access is backing off until ${retryAt}.`
      : 'Flatfile access is backing off.',
  );
}

async function assertRealPathContained(
  hookId: FilesystemHookId,
  root: string,
  target: string,
  optional: boolean,
): Promise<string | null> {
  let realRoot: string;
  try {
    realRoot = await fs.realpath(root);
  } catch {
    throw unavailable(hookId, 'Required MUD filesystem resource is unavailable.');
  }

  try {
    const realTarget = await fs.realpath(target);
    if (!isWithinRoot(realRoot, realTarget)) {
      recordDroppedFlatfileInput(hookId);
      throw new FlatfileAccessError(
        hookId,
        'invalid_path',
        'Flatfile path resolves outside MUD_DIR.',
      );
    }
    return realTarget;
  } catch (error) {
    if (error instanceof FlatfileAccessError) {
      throw error;
    }
    if (optional && errorCode(error) === 'ENOENT') {
      return null;
    }
    if (errorCode(error) === 'ENOENT') {
      throw unavailable(hookId, 'Required MUD filesystem resource is missing.');
    }
    throw unavailable(hookId, 'Required MUD filesystem resource is unavailable.');
  }
}

export function getMudRoot(hookId: FilesystemHookId): string {
  return configuredMudRoot(hookId);
}

export function getMudAreasRoot(): string {
  return path.join(configuredMudRoot('zone_builder_parsing'), 'areas');
}

export function readMudTextFile(
  hookId: FilesystemHookId,
  relativeOrAbsolutePath: string,
  options?: ReadMudTextOptions & { readonly optional?: false },
): Promise<string>;
export function readMudTextFile(
  hookId: FilesystemHookId,
  relativeOrAbsolutePath: string,
  options: ReadMudTextOptions & { readonly optional: true },
): Promise<string | null>;
export async function readMudTextFile(
  hookId: FilesystemHookId,
  relativeOrAbsolutePath: string,
  options: ReadMudTextOptions = {},
): Promise<string | null> {
  assertAttemptAllowed(hookId);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('Flatfile maxBytes must be a positive safe integer.');
  }

  const { root, target } = resolveContainedPath(hookId, relativeOrAbsolutePath);
  const realTarget = await assertRealPathContained(hookId, root, target, options.optional === true);
  if (realTarget === null) {
    return null;
  }

  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    handle = await fs.open(realTarget, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) {
      recordDroppedFlatfileInput(hookId);
      throw new FlatfileAccessError(
        hookId,
        'invalid_content',
        'Flatfile input must be a regular file.',
      );
    }
    if (stat.size > maxBytes) {
      recordDroppedFlatfileInput(hookId);
      throw new FlatfileAccessError(
        hookId,
        'too_large',
        `Flatfile input exceeds the ${maxBytes}-byte limit.`,
      );
    }

    await testReadInterlock?.();

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    while (totalBytes <= maxBytes) {
      const remaining = maxBytes + 1 - totalBytes;
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, remaining));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) {
        break;
      }
      chunks.push(chunk.subarray(0, bytesRead));
      totalBytes += bytesRead;
    }
    if (totalBytes > maxBytes) {
      recordDroppedFlatfileInput(hookId);
      throw new FlatfileAccessError(
        hookId,
        'too_large',
        `Flatfile input exceeds the ${maxBytes}-byte limit.`,
      );
    }

    const bytes = Buffer.concat(chunks, totalBytes);
    if (bytes.includes(0)) {
      recordDroppedFlatfileInput(hookId);
      throw new FlatfileAccessError(
        hookId,
        'invalid_content',
        'Flatfile input contains a NUL byte.',
      );
    }

    let content: string;
    try {
      content = UTF8_DECODER.decode(bytes);
    } catch {
      recordDroppedFlatfileInput(hookId);
      throw new FlatfileAccessError(
        hookId,
        'invalid_content',
        'Flatfile input is not valid UTF-8.',
      );
    }

    recordHookActivity(hookId);
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  } catch (error) {
    if (error instanceof FlatfileAccessError) {
      throw error;
    }
    throw unavailable(hookId, 'Required MUD file could not be read.');
  } finally {
    await handle?.close();
  }
}

export async function getReadableMudPath(
  hookId: FilesystemHookId,
  relativeOrAbsolutePath: string,
): Promise<string> {
  assertAttemptAllowed(hookId);
  const { root, target } = resolveContainedPath(hookId, relativeOrAbsolutePath);
  const realTarget = await assertRealPathContained(hookId, root, target, false);
  try {
    await fs.access(realTarget!, constants.R_OK);
    return realTarget!;
  } catch {
    throw unavailable(hookId, 'Required MUD path is not readable.');
  }
}

export async function listMudDirectory(
  hookId: FilesystemHookId,
  relativeOrAbsolutePath: string,
): Promise<string[]> {
  assertAttemptAllowed(hookId);
  const { root, target } = resolveContainedPath(hookId, relativeOrAbsolutePath);
  const realTarget = await assertRealPathContained(hookId, root, target, false);
  try {
    const entries = await fs.readdir(realTarget!);
    return entries;
  } catch {
    throw unavailable(hookId, 'Required MUD directory could not be read.');
  }
}

export async function statMudPath(
  hookId: FilesystemHookId,
  relativeOrAbsolutePath: string,
): Promise<Awaited<ReturnType<typeof fs.stat>>> {
  assertAttemptAllowed(hookId);
  const { root, target } = resolveContainedPath(hookId, relativeOrAbsolutePath);
  const realTarget = await assertRealPathContained(hookId, root, target, false);
  try {
    const result = await fs.stat(realTarget!);
    return result;
  } catch {
    throw unavailable(hookId, 'Required MUD path could not be inspected.');
  }
}

export async function mudPathExists(
  hookId: FilesystemHookId,
  relativeOrAbsolutePath: string,
): Promise<boolean> {
  assertAttemptAllowed(hookId);
  const { root, target } = resolveContainedPath(hookId, relativeOrAbsolutePath);
  return (await assertRealPathContained(hookId, root, target, true)) !== null;
}

export async function probeFlatfileHook(hookId: FilesystemHookId): Promise<void> {
  assertAttemptAllowed(hookId);
  const root = configuredMudRoot(hookId);
  try {
    const realRoot = await fs.realpath(root);
    await fs.access(realRoot, constants.R_OK | constants.X_OK);
    for (const required of REQUIRED_PROBE_PATHS[hookId]) {
      const { target } = resolveContainedPath(hookId, required.path);
      const realTarget = await assertRealPathContained(hookId, root, target, false);
      const stat = await fs.stat(realTarget!);
      const hasExpectedKind = required.kind === 'file' ? stat.isFile() : stat.isDirectory();
      if (!hasExpectedKind) {
        recordDroppedFlatfileInput(hookId);
        throw new FlatfileAccessError(
          hookId,
          'invalid_content',
          `Required MUD ${required.kind} has the wrong filesystem type.`,
        );
      }
      await fs.access(
        realTarget!,
        constants.R_OK | (required.kind === 'directory' ? constants.X_OK : 0),
      );
    }
    markFlatfileAvailable(hookId);
  } catch (error) {
    if (error instanceof FlatfileAccessError) {
      if (error.code !== 'backoff' && error.code !== 'unavailable') {
        markFlatfileUnavailable(hookId, error.message);
      }
      throw error;
    }
    throw unavailable(hookId, 'Required MUD filesystem resource is unavailable.');
  }
}

export async function probeAllFlatfileHooks(): Promise<void> {
  await Promise.allSettled(getFilesystemHookIds().map((hookId) => probeFlatfileHook(hookId)));
}

export function registerFlatfileRecoveryHandler(
  hookId: FilesystemHookId,
  handler: () => Promise<void>,
): void {
  recoveryHandlers.set(hookId, handler);
}

export function unregisterFlatfileRecoveryHandler(hookId: FilesystemHookId): void {
  recoveryHandlers.delete(hookId);
}

export async function recoverFlatfileHook(hookId: FilesystemHookId): Promise<void> {
  const handler = recoveryHandlers.get(hookId);
  if (handler) {
    await handler();
    return;
  }
  await probeFlatfileHook(hookId);
}

export function setMudRootForTests(root: string | null): void {
  testMudRoot = root;
}

export function setFlatfileReadInterlockForTests(
  interlock: (() => Promise<void> | void) | null,
): void {
  testReadInterlock = interlock;
}

export function resetFlatfileAccessForTests(): void {
  testMudRoot = null;
  testReadInterlock = null;
  recoveryHandlers.clear();
}
