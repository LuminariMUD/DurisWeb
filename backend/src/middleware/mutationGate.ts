import type { NextFunction, Request, Response } from 'express';
import { getBackendConfiguration } from '../config/environment.js';

/**
 * Write paths that mutate MUD-owned state without going through the MUD's
 * transaction, ownership, custody, and ledger contracts. They stay closed
 * unless an operator explicitly enables them, and remain closed by default
 * until the equivalent MUD-authoritative command exists.
 *
 * See docs/ARCHITECTURE.md#mutation-authority-and-default-closed-gates.
 */
export const MUTATION_GATES = [
  'auctionWrites',
  'itemDeletes',
  'playerWipe',
  'databaseRestore',
] as const;

export type MutationGate = (typeof MUTATION_GATES)[number];

const GATE_ENVIRONMENT_VARIABLE: Record<MutationGate, string> = {
  auctionWrites: 'ALLOW_UNSAFE_AUCTION_WRITES',
  itemDeletes: 'ALLOW_UNSAFE_ITEM_DELETES',
  playerWipe: 'ALLOW_UNSAFE_PLAYER_WIPE',
  databaseRestore: 'ALLOW_UNSAFE_DATABASE_RESTORE',
};

const GATE_REASON: Record<MutationGate, string> = {
  auctionWrites:
    'Web auction writes debit the character wallet in a separate committed transaction from the bid and bypass the MUD auction ledger, custody, and revision contract.',
  itemDeletes:
    'Web item deletion bypasses the MUD ownership ledger and quarantine, and can delete every locker copy of an item.',
  playerWipe:
    'The web player wipe carries its own hard-coded table list instead of the MUD season-reset manifest, epoch fencing, and reward policy.',
  databaseRestore:
    'Restore is a row merge over an incomplete table list, decodes binary columns as UTF-8, and has no archive manifest bound to the target.',
};

/** Reports whether an operator has explicitly opened an unsafe mutation path. */
export function isMutationGateOpen(gate: MutationGate): boolean {
  return getBackendConfiguration().unsafeMutations[gate];
}

/**
 * Blocks a gated write path with 503 until the owning contract is in place.
 * Read-only browsing and diagnostics are unaffected.
 */
export function requireMutationGate(gate: MutationGate) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (isMutationGateOpen(gate)) {
      next();
      return;
    }

    res.status(503).json({
      error: 'operation_gated',
      message: GATE_REASON[gate],
      gate,
      enableWith: GATE_ENVIRONMENT_VARIABLE[gate],
    });
  };
}
