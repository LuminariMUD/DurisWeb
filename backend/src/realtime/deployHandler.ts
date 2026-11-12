import { safeFailureCode } from '../utils/safeFailureCode.js';
import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';
import { verifyWebSocketToken } from '../middleware/auth.js';
import { parseAccountFile } from '../services/accountService.js';
import { hasActiveWebSession } from '../services/sessionService.js';
import { getUserPermissions } from '../services/permissionService.js';
import {
  deployToCommit,
  determineDeployAction,
  type DeploymentContext,
} from '../services/deploymentService.js';
import { getCurrentCommitHash } from '../services/gitService.js';
import { sendApplicationMessage } from '../utils/applicationWebSocket.js';
import type { MessageHandler } from './clientState.js';

/** Website deployment (overlord only); progress streams over the socket. */
export const deployHandlers: Record<string, MessageHandler> = {
  DEPLOY_START: async (ws, data) => {
    try {
      const { token, targetHash } = data;

      // Validate hash format
      if (!targetHash || !/^[a-f0-9]{40}$/.test(targetHash)) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'DEPLOY_ERROR',
            message: 'Invalid commit hash format',
          }),
        );
        return;
      }

      // Verify the short-lived application WebSocket capability.
      const payload = verifyWebSocketToken(token);
      if (!payload) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'DEPLOY_ERROR',
            message: 'Invalid or expired token',
          }),
        );
        return;
      }

      if (!payload.sid || !(await hasActiveWebSession(payload.accountName, payload.sid))) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'DEPLOY_ERROR',
            message: 'Session is no longer active',
          }),
        );
        return;
      }

      // Parse account and check permissions
      const accountData = await parseAccountFile(payload.accountName);
      if (!accountData) {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'DEPLOY_ERROR',
            message: 'Account not found',
          }),
        );
        return;
      }

      const permissions = await getUserPermissions(payload.accountName, accountData.characters);

      // Require Overlord role for deployment
      if (permissions.role !== 'overlord') {
        sendApplicationMessage(
          ws,
          JSON.stringify({
            type: 'DEPLOY_ERROR',
            message: 'Overlord access required for deployment',
          }),
        );
        return;
      }

      // Get current hash and determine action
      const currentCommit = await getCurrentCommitHash();
      const action = await determineDeployAction(currentCommit.full, targetHash);

      // Create deployment context
      const ctx: DeploymentContext = {
        ws,
        accountName: payload.accountName,
        ipAddress: 'websocket',
        targetHash,
        fromHash: currentCommit.full,
        action,
        logs: { git: '', compile: '' },
      };

      // Confirm deployment started
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'DEPLOY_STARTED',
          action,
          fromHash: currentCommit.short,
          toHash: targetHash.substring(0, 7),
        }),
      );

      // Start deployment (async, streams progress via WebSocket)
      await deployToCommit(ctx);
    } catch (error) {
      const reference = randomUUID();
      logger.error('Deployment WebSocket error:', { reference, code: safeFailureCode(error) });
      sendApplicationMessage(
        ws,
        JSON.stringify({
          type: 'DEPLOY_ERROR',
          message: `Deployment failed (reference ${reference})`,
        }),
      );
    }
  },
};
