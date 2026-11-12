import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import type * as ForumService from '../../../services/forumService.js';
import type * as StorageService from '../../../services/r2Service.js';
import { stubModule } from '../../../test/stubModule.js';

const getUserProfile = jest.fn<typeof ForumService.getUserProfile>();
const updateUserProfile = jest.fn<typeof ForumService.updateUserProfile>();
const uploadAvatar = jest.fn<typeof StorageService.uploadAvatar>();
const deleteAvatarByUrl = jest.fn<typeof StorageService.deleteAvatarByUrl>();
let storageConfigured = true;
jest.unstable_mockModule(
  '../../../services/forumService.js',
  stubModule(new URL('../../../services/forumService.js', import.meta.url), {
    getUserProfile,
    updateUserProfile,
  }),
);
jest.unstable_mockModule(
  '../../../services/r2Service.js',
  stubModule(new URL('../../../services/r2Service.js', import.meta.url), {
    uploadAvatar,
    deleteAvatarByUrl,
    isR2Configured: () => storageConfigured,
    validateAvatarFile: () => ({ valid: true }),
  }),
);
jest.unstable_mockModule(
  '../../../services/accountService.js',
  stubModule(new URL('../../../services/accountService.js', import.meta.url)),
);
jest.unstable_mockModule('../../../middleware/auth.js', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { user: { accountName: 'Operator' } });
    next();
  },
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
const { forumProfileRoutes } = await import('../profileRoutes.js');
const app = express();
app.set('trust proxy', 1);
app.use('/api/forum', forumProfileRoutes);
let client = 0;

describe.each([
  { path: '/users/me/avatar', kind: 'avatar', field: 'avatarUrl', account: 'Operator' },
  { path: '/users/Other/avatar', kind: 'avatar', field: 'avatarUrl', account: 'Other' },
  { path: '/users/me/banner', kind: 'banner', field: 'bannerUrl', account: 'Operator' },
  { path: '/users/Other/banner', kind: 'banner', field: 'bannerUrl', account: 'Other' },
] as const)('profile image publication $path', ({ path, kind, field, account }) => {
  const previousUrl = 'https://images.test.invalid/previous.webp';
  const newUrl = 'https://images.test.invalid/new.webp';
  const events: string[] = [];
  beforeEach(() => {
    storageConfigured = true;
    events.length = 0;
    client++;
    getUserProfile.mockReset().mockResolvedValue({
      accountName: account,
      bio: null,
      avatarUrl: previousUrl,
      bannerUrl: previousUrl,
      website: null,
      location: null,
      createdAt: new Date(0),
      lastSeenAt: new Date(0),
      stats: {
        totalPosts: 0,
        totalThreads: 0,
        totalReactionsReceived: 0,
        reputationScore: 0,
        firstPostAt: null,
        lastPostAt: null,
        characterCount: 0,
        totalFrags: 0,
        totalDeaths: 0,
        totalWealth: 0,
      },
    });
    uploadAvatar.mockReset().mockImplementation(async () => {
      events.push('upload');
      return newUrl;
    });
    updateUserProfile.mockReset().mockImplementation(async () => {
      events.push('publish');
    });
    deleteAvatarByUrl.mockReset().mockImplementation(async () => {
      events.push('delete');
    });
  });
  const upload = () =>
    request(app)
      .post('/api/forum' + path)
      .set('X-Forwarded-For', '192.0.2.' + client)
      .attach(kind, Buffer.from('synthetic image'), {
        filename: 'image.png',
        contentType: 'image/png',
      });

  it('keeps the previous object when upload fails', async () => {
    uploadAvatar.mockRejectedValueOnce(new Error('Synthetic upload failure'));
    expect((await upload()).status).toBe(500);
    expect(updateUserProfile).not.toHaveBeenCalled();
    expect(deleteAvatarByUrl).not.toHaveBeenCalled();
  });
  it('keeps the previous object when publication fails', async () => {
    updateUserProfile.mockRejectedValueOnce(new Error('Synthetic publication failure'));
    expect((await upload()).status).toBe(500);
    expect(deleteAvatarByUrl).not.toHaveBeenCalled();
  });
  it('publishes before deleting only the previous object', async () => {
    const response = await upload();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ [field]: newUrl });
    expect(events).toEqual(['upload', 'publish', 'delete']);
    expect(updateUserProfile).toHaveBeenCalledWith(account, { [field]: newUrl });
    expect(deleteAvatarByUrl).toHaveBeenCalledWith(previousUrl, account, kind);
  });
  it('does not remove the object when clearing its profile field fails', async () => {
    updateUserProfile.mockRejectedValueOnce(new Error('Synthetic publication failure'));
    expect((await request(app).delete('/api/forum' + path)).status).toBe(500);
    expect(deleteAvatarByUrl).not.toHaveBeenCalled();
  });
  it('clears the field before explicit deletion', async () => {
    expect((await request(app).delete('/api/forum' + path)).status).toBe(200);
    expect(updateUserProfile).toHaveBeenCalledWith(account, { [field]: null });
    expect(deleteAvatarByUrl).toHaveBeenCalledWith(previousUrl, account, kind);
    expect(events).toEqual(['publish', 'delete']);
  });
  it('refuses image deletion before touching persistence when storage is disabled', async () => {
    storageConfigured = false;
    expect((await request(app).delete('/api/forum' + path)).status).toBe(503);
    expect(getUserProfile).not.toHaveBeenCalled();
    expect(updateUserProfile).not.toHaveBeenCalled();
    expect(deleteAvatarByUrl).not.toHaveBeenCalled();
  });
});
