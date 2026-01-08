import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import { pool } from '../db/connection.js';
import { refreshGitCache, getCurrentCommitHash } from './gitService.js';
import logger, { getErrorMessage } from '../utils/logger.js';

// Get MUD_DIR from environment - validated at startup in index.ts
const MUD_DIR = process.env.MUD_DIR!;
const SRC_DIR = `${MUD_DIR}/src`;

/**
 * Validate git commit hash format (defense-in-depth)
 * Primary validation occurs at WebSocket entry point, but services should validate too
 */
function validateCommitHash(hash: string): boolean {
  return typeof hash === 'string' && /^[a-f0-9]{40}$/.test(hash);
}

export interface DeploymentContext {
  ws: WebSocket;
  accountName: string;
  ipAddress: string;
  targetHash: string;
  fromHash: string;
  action: 'deploy' | 'rollback';
  logs: {
    git: string;
    compile: string;
  };
}

/**
 * Send progress message to WebSocket client
 */
function sendProgress(ws: WebSocket, progressType: string, message: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'DEPLOY_PROGRESS',
      progressType,
      message,
    }));
  }
}

/**
 * Run a command with streaming output to WebSocket
 */
async function runCommandWithStream(
  ws: WebSocket,
  command: string,
  args: string[],
  cwd: string,
  progressType: string = 'output'
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let output = '';
    const proc = spawn(command, args, { cwd });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      sendProgress(ws, progressType, text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      sendProgress(ws, progressType, text);
    });

    proc.on('close', (code) => {
      resolve({ output, exitCode: code ?? 1 });
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Log deployment to database
 */
async function logDeployment(
  ctx: DeploymentContext,
  compileSuccess: boolean
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO deployment_log
       (account_name, ip_address, action, from_hash, to_hash, git_output, compile_success, compile_output)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ctx.accountName,
        ctx.ipAddress,
        ctx.action,
        ctx.fromHash,
        ctx.targetHash,
        ctx.logs.git,
        compileSuccess ? 1 : 0,
        ctx.logs.compile,
      ]
    );
  } catch (error) {
    logger.error('Failed to log deployment:', error);
  }
}

/**
 * Main deployment function - orchestrates git checkout and make
 */
export async function deployToCommit(ctx: DeploymentContext): Promise<void> {
  const { ws, targetHash } = ctx;

  // Defense-in-depth: validate hash format even though entry point already did
  if (!validateCommitHash(targetHash)) {
    sendProgress(ws, 'error', 'Invalid commit hash format');
    ws.send(JSON.stringify({
      type: 'DEPLOY_COMPLETE',
      success: false,
      error: 'Invalid commit hash format',
    }));
    return;
  }

  try {
    // Step 1: Get current hash
    const current = await getCurrentCommitHash();
    ctx.fromHash = current.full;
    sendProgress(ws, 'info', `Current commit: ${current.short}`);
    sendProgress(ws, 'info', `Target commit: ${targetHash.substring(0, 7)}`);
    sendProgress(ws, 'info', '');

    // Step 2: Git fetch
    sendProgress(ws, 'step', '>>> Fetching latest from origin...');
    const fetchResult = await runCommandWithStream(
      ws,
      'git',
      ['fetch', 'origin', '--verbose'],
      MUD_DIR,
      'output'
    );
    ctx.logs.git = fetchResult.output;

    if (fetchResult.exitCode !== 0) {
      sendProgress(ws, 'error', `Git fetch failed with exit code ${fetchResult.exitCode}`);
      ws.send(JSON.stringify({
        type: 'DEPLOY_COMPLETE',
        success: false,
        error: 'Git fetch failed',
      }));
      await logDeployment(ctx, false);
      return;
    }

    sendProgress(ws, 'info', '');

    // Step 3: Git checkout
    sendProgress(ws, 'step', `>>> Checking out ${targetHash.substring(0, 7)}...`);
    const checkoutResult = await runCommandWithStream(
      ws,
      'git',
      ['checkout', targetHash],
      MUD_DIR,
      'output'
    );
    ctx.logs.git += '\n' + checkoutResult.output;

    if (checkoutResult.exitCode !== 0) {
      sendProgress(ws, 'error', `Git checkout failed with exit code ${checkoutResult.exitCode}`);
      ws.send(JSON.stringify({
        type: 'DEPLOY_COMPLETE',
        success: false,
        error: 'Git checkout failed',
      }));
      await logDeployment(ctx, false);
      return;
    }

    sendProgress(ws, 'info', '');

    // Step 4: Clean build artifacts
    sendProgress(ws, 'step', '>>> Running make clean...');
    const cleanResult = await runCommandWithStream(
      ws,
      'make',
      ['clean'],
      SRC_DIR,
      'compile'
    );
    ctx.logs.compile = cleanResult.output;

    // Don't fail on make clean errors - some commits might not have clean target
    if (cleanResult.exitCode !== 0) {
      sendProgress(ws, 'info', '(make clean returned non-zero, continuing anyway)');
    }

    sendProgress(ws, 'info', '');

    // Step 5: Compile with make
    sendProgress(ws, 'step', '>>> Running make...');
    const makeResult = await runCommandWithStream(
      ws,
      'make',
      [],
      SRC_DIR,
      'compile'
    );
    ctx.logs.compile += '\n' + makeResult.output;

    sendProgress(ws, 'info', '');

    // Step 5: Log to database
    await logDeployment(ctx, makeResult.exitCode === 0);

    // Step 6: Invalidate git cache
    try {
      await refreshGitCache();
    } catch (error) {
      logger.error('Failed to refresh git cache:', error);
    }

    // Step 7: Send final result
    if (makeResult.exitCode === 0) {
      sendProgress(ws, 'success', '>>> Deployment complete!');
      sendProgress(ws, 'success', '>>> Remember to shutdown/copyover the MUD to load the new binary.');
    } else {
      sendProgress(ws, 'error', `>>> Compilation failed with exit code ${makeResult.exitCode}`);
      sendProgress(ws, 'error', '>>> The code has been checked out but the binary was not updated.');
    }

    ws.send(JSON.stringify({
      type: 'DEPLOY_COMPLETE',
      success: makeResult.exitCode === 0,
      fromHash: ctx.fromHash,
      toHash: targetHash,
    }));

  } catch (error) {
    logger.error('Deployment error:', error);
    sendProgress(ws, 'error', `>>> Deployment failed: ${getErrorMessage(error)}`);
    ws.send(JSON.stringify({
      type: 'DEPLOY_COMPLETE',
      success: false,
      error: getErrorMessage(error),
    }));

    // Try to log the failure
    try {
      await logDeployment(ctx, false);
    } catch {
      // Ignore logging errors
    }
  }
}

/**
 * Determine if this is a deploy (forward) or rollback (backward) action
 * by comparing commit positions in the git log
 */
export async function determineDeployAction(
  currentHash: string,
  targetHash: string
): Promise<'deploy' | 'rollback'> {
  // Defense-in-depth: validate hash formats
  if (!validateCommitHash(currentHash) || !validateCommitHash(targetHash)) {
    throw new Error('Invalid commit hash format');
  }

  try {
    // Check if target is ancestor of current (rollback) or descendant (deploy)
    const proc = spawn('git', [
      '-C', MUD_DIR,
      'merge-base', '--is-ancestor', targetHash, currentHash
    ]);

    return new Promise((resolve) => {
      proc.on('close', (code) => {
        // Exit code 0 means targetHash is ancestor of currentHash (rollback)
        // Exit code 1 means targetHash is NOT ancestor (deploy/forward)
        resolve(code === 0 ? 'rollback' : 'deploy');
      });
      proc.on('error', () => {
        // Default to deploy on error
        resolve('deploy');
      });
    });
  } catch {
    return 'deploy';
  }
}

/**
 * Get recent deployment history
 */
export async function getDeploymentHistory(
  limit: number = 20
): Promise<Array<{
  id: number;
  accountName: string;
  action: string;
  fromHash: string;
  toHash: string;
  compileSuccess: boolean;
  createdAt: Date;
}>> {
  const [rows] = await pool.query<any[]>(
    `SELECT id, account_name as accountName, action, from_hash as fromHash,
            to_hash as toHash, compile_success as compileSuccess, created_at as createdAt
     FROM deployment_log
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}
