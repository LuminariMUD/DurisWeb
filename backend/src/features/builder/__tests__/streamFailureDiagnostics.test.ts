import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PassThrough } from 'node:stream';
import express from 'express';
import request from 'supertest';
import { stubModule } from '../../../test/stubModule.js';

const countZoneItems =
  jest.fn<typeof import('../../../services/zoneBuilderStreamer.js').countZoneItems>();
let afterHeaders = false;
const createReadStream = jest.fn(() => {
  const stream = new PassThrough();
  setImmediate(() => {
    if (afterHeaders) stream.write('partial zone');
    setImmediate(() => stream.destroy(new Error('ZONE_READ_PRIVATE_SENTINEL')));
  });
  return stream;
});
class SyntheticArchive extends PassThrough {
  file() {
    return this;
  }
  abort() {
    this.destroy();
    return this;
  }
  async finalize() {
    setImmediate(() => this.destroy(new Error('ZIP_PRIVATE_SENTINEL')));
  }
}
jest.unstable_mockModule('fs', () => ({ existsSync: () => true, createReadStream }));
jest.unstable_mockModule('archiver', () => ({ ZipArchive: SyntheticArchive }));
const stub = (specifier: string, overrides: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));
stub('../../../utils/safeZonePath.js', { resolveSafeZoneFilePath: () => '/synthetic/zone.wld' });
stub('../../../services/zoneBuilderStreamer.js', { countZoneItems });
stub('../shared.js', { logBuilderActivity: async () => undefined });
const { AppError } = await import('../../../middleware/errorHandler.js');
const { default: logger } = await import('../../../utils/logger.js');
const { builderStreamExportRoutes } = await import('../streamExportRoutes.js');
const app = express();
app.use('/api/builder', builderStreamExportRoutes);

describe('builder stream failure boundaries', () => {
  beforeEach(() => {
    afterHeaders = false;
    countZoneItems.mockReset();
    createReadStream.mockClear();
  });
  it.each([new Error('SSE_PRIVATE_SENTINEL'), new AppError('Zone source not found', 404)])(
    'keeps safe SSE error text and a logged reference: %s',
    async (error) => {
      const log = jest.spyOn(logger, 'error').mockImplementation(() => logger);
      try {
        countZoneItems.mockRejectedValueOnce(error);
        const response = await request(app).get('/api/builder/zones/zone-a/stream/rooms');
        expect(response.status).toBe(200);
        expect(response.text).toContain('event: error');
        expect(response.text).not.toContain('SSE_PRIVATE_SENTINEL');
        expect(response.text).toContain(
          error instanceof AppError ? 'Zone source not found' : 'reference',
        );
        expect(log.mock.calls).toEqual([
          [
            'Zone SSE stream failed',
            {
              reference: expect.any(String),
              code: 'unclassified',
            },
          ],
        ]);
        expect(log).toHaveBeenCalledTimes(1);
      } finally {
        log.mockRestore();
      }
    },
  );
  it.each(['wld', 'all'])(
    'contains a pre-header %s download failure in fixed JSON',
    async (type) => {
      const log = jest.spyOn(logger, 'error').mockImplementation(() => logger);
      try {
        const response = await request(app).get('/api/builder/zones/zone-a/download/' + type);
        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          error: 'Failed to download zone file',
          reference: expect.any(String),
        });
        expect(response.headers['content-disposition']).toBeUndefined();
        expect(log.mock.calls).toEqual([
          [
            'Zone download failed',
            {
              reference: response.body.reference,
              code: 'unclassified',
            },
          ],
        ]);
        expect(log).toHaveBeenCalledTimes(1);
      } finally {
        log.mockRestore();
      }
    },
  );
  it('terminates a failed download after headers through the shared helper', async () => {
    afterHeaders = true;
    const log = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    try {
      const result: unknown = await request(app)
        .get('/api/builder/zones/zone-a/download/wld')
        .timeout({ deadline: 1000 })
        .then(
          () => null,
          (error: unknown) => error,
        );
      expect(result).toMatchObject({ code: 'ECONNRESET' });
      expect(log.mock.calls).toEqual([
        [
          'Zone download failed',
          {
            reference: expect.any(String),
            code: 'unclassified',
          },
        ],
      ]);
    } finally {
      log.mockRestore();
    }
  });
});
