import { describe, expect, it } from '@jest/globals';
import { getPrivacyPolicy, privacyCollectionEnabled } from '../privacyPolicy.js';

describe('unapproved privacy policy release gate', () => {
  it('cannot issue preferences or collect visits in the prepared source', () => {
    expect(getPrivacyPolicy()).toMatchObject({
      approved: false,
      collectionEnabled: false,
      retentionReady: false,
    });
    expect(privacyCollectionEnabled()).toBe(false);
    expect(Object.isFrozen(getPrivacyPolicy())).toBe(true);
  });
});
