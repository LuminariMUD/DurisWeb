import { describe, expect, it, jest } from '@jest/globals';
import { generateVAPIDKeys } from 'web-push';

// web-push 4 is ESM-only with no default export, so the service must load its
// named functions; a default import leaves setVapidDetails undefined and throws
// at module load whenever VAPID keys are configured.
const vapidKeys = generateVAPIDKeys();

jest.unstable_mockModule('../../config/environment.js', () => ({
  getBackendConfiguration: () => ({
    features: { push: true },
    push: {
      subject: 'mailto:push@example.test',
      publicKey: vapidKeys.publicKey,
      privateKey: vapidKeys.privateKey,
    },
  }),
}));
jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query: jest.fn() },
}));
jest.unstable_mockModule('../webSettingsService.js', () => ({
  getWebSettings: jest.fn(),
}));

describe('push notification service VAPID setup', () => {
  it('configures the VAPID details when push is enabled', async () => {
    const service = await import('../pushNotificationService.js');

    expect(service.isPushEnabled()).toBe(true);
    expect(service.getVapidPublicKey()).toBe(vapidKeys.publicKey);
  });
});
