import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, jest } from '@jest/globals';

import { requireWebSettingAuthorization } from '../webSettingsAuthorization.js';
import type { UserPermissions } from '../../services/permissionService.js';

function permissions(role: UserPermissions['role']): UserPermissions {
  return {
    accountName: 'Operator',
    role,
    immortalLevel: role === 'overlord' ? 62 : null,
    maxLevel: role === 'overlord' ? 62 : 1,
    canAccessImmortalForum: false,
    canAccessGodForum: false,
    guilds: [],
    canModerate: false,
    canBan: false,
    canEditPosts: false,
    canDeletePosts: false,
    canPinThreads: false,
    canLockThreads: false,
    adminPermissions: ['manage_front_page'],
  };
}

function requestFor(key: string, role: UserPermissions['role']): Request {
  return {
    params: { key },
    user: {
      accountName: 'Operator',
      email: 'operator@example.invalid',
      sessionId: 'session-id',
      permissions: permissions(role),
      adminPermissions: new Set(['manage_front_page']),
    },
  } as unknown as Request;
}

function responseRecorder(): { response: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { response: { status } as unknown as Response, status, json };
}

describe('web settings authorization', () => {
  it('denies delegated front-page managers from changing the credential destination', () => {
    const { response, status, json } = responseRecorder();
    const next = jest.fn() as NextFunction;

    requireWebSettingAuthorization(requestFor('mud_ws_url', 'player'), response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'Overlord access required for this setting' });
    expect(next).not.toHaveBeenCalled();
  });

  it('denies the protected key before later route sanitizers trim it', () => {
    const { response, status } = responseRecorder();
    const next = jest.fn() as NextFunction;

    requireWebSettingAuthorization(requestFor('  mud_ws_url  ', 'player'), response, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows an Overlord to change the browser MUD endpoint', () => {
    const { response } = responseRecorder();
    const next = jest.fn() as NextFunction;

    requireWebSettingAuthorization(requestFor('mud_ws_url', 'overlord'), response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('preserves delegated updates for ordinary front-page settings', () => {
    const { response } = responseRecorder();
    const next = jest.fn() as NextFunction;

    requireWebSettingAuthorization(requestFor('front_page_hero_title', 'player'), response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
