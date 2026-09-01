import { afterEach, describe, expect, it } from '@jest/globals';

import { getHookLastActivity, recordHookActivity, resetHookActivity } from '../hookActivity.js';

afterEach(() => resetHookActivity());

describe('hook activity telemetry', () => {
  it('records an ISO timestamp only for a registered hook', () => {
    recordHookActivity('auction_new', new Date('2026-09-01T10:00:00.000Z'));
    expect(getHookLastActivity('auction_new')).toBe('2026-09-01T10:00:00.000Z');
    expect(getHookLastActivity('not_registered')).toBeNull();
  });

  it('ignores invalid dates and resets process-local observations', () => {
    recordHookActivity('auction_new', new Date('invalid'));
    expect(getHookLastActivity('auction_new')).toBeNull();
    recordHookActivity('auction_new');
    resetHookActivity();
    expect(getHookLastActivity('auction_new')).toBeNull();
  });
});
