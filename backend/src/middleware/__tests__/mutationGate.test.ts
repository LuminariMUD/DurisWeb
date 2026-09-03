/**
 * @jest-environment node
 */
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const getBackendConfiguration =
  jest.fn<() => { unsafeMutations: Record<string, boolean> }>();

jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration,
}));

const { requireMutationGate } = await import('../mutationGate.js');

function respond(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }) as unknown as Response);
  return {
    res: { status } as unknown as Response,
    status: status as jest.Mock,
    json,
  };
}

describe('requireMutationGate', () => {
  beforeEach(() => {
    getBackendConfiguration.mockReset();
  });

  it('rejects a gated mutation with 503 and the variable that opens it', () => {
    getBackendConfiguration.mockReturnValue({
      unsafeMutations: {
        auctionWrites: false,
        itemDeletes: false,
        playerWipe: false,
        databaseRestore: false,
      },
    });
    const next = jest.fn() as unknown as NextFunction;
    const { res, status, json } = respond();

    requireMutationGate('auctionWrites')({} as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'operation_gated',
        gate: 'auctionWrites',
        enableWith: 'ALLOW_UNSAFE_AUCTION_WRITES',
      }),
    );
  });

  it('only opens the gate the operator explicitly enabled', () => {
    getBackendConfiguration.mockReturnValue({
      unsafeMutations: {
        auctionWrites: true,
        itemDeletes: false,
        playerWipe: false,
        databaseRestore: false,
      },
    });
    const next = jest.fn() as unknown as NextFunction;
    const blocked = jest.fn() as unknown as NextFunction;
    const open = respond();
    const closed = respond();

    requireMutationGate('auctionWrites')({} as Request, open.res, next);
    requireMutationGate('itemDeletes')({} as Request, closed.res, blocked);

    expect(next).toHaveBeenCalledTimes(1);
    expect(open.status).not.toHaveBeenCalled();
    expect(blocked).not.toHaveBeenCalled();
    expect(closed.status).toHaveBeenCalledWith(503);
  });
});
