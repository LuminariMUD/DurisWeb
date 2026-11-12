import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PassThrough } from 'node:stream';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { stubModule } from '../../../test/stubModule.js';

const createReadStream = jest.fn<() => PassThrough>();
jest.unstable_mockModule('fs', () => ({ createReadStream }));
jest.unstable_mockModule(
  '../../../services/logService.js',
  stubModule(new URL('../../../services/logService.js', import.meta.url), {
    getLogFilePath: () => '/synthetic/log',
  }),
);
jest.unstable_mockModule('../../../middleware/auth.js', () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
jest.unstable_mockModule('../../../utils/logger.js', () => ({
  default: { error: jest.fn() },
}));
const { adminLogRoutes } = await import('../logRoutes.js');
const app = express();
app.use('/api/admin', adminLogRoutes);

describe('log download stream failures', () => {
  beforeEach(() => {
    createReadStream.mockReset();
  });
  it('returns a fixed failure before headers and removes the download disposition', async () => {
    createReadStream.mockImplementation(() => {
      const stream = new PassThrough();
      setImmediate(() => stream.destroy(new Error('PRIVATE_READ_FAILURE')));
      return stream;
    });
    const response = await request(app).get('/api/admin/logs/runtime/log/download');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to download log file' });
    expect(response.headers['content-disposition']).toBeUndefined();
  });
  it('terminates a failed download after sending data instead of leaving it open', async () => {
    createReadStream.mockImplementation(() => {
      const stream = new PassThrough();
      setImmediate(() => {
        stream.write('partial log');
        setImmediate(() => stream.destroy(new Error('PRIVATE_READ_FAILURE')));
      });
      return stream;
    });
    const result: unknown = await request(app)
      .get('/api/admin/logs/runtime/log/download')
      .timeout({ deadline: 1000 })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(result).toMatchObject({ code: 'ECONNRESET' });
  });
});
