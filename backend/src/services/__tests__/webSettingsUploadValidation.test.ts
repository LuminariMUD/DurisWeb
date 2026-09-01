import { beforeAll, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query: jest.fn(), execute: jest.fn() },
}));

let validateHeroFile: typeof import('../webSettingsService.js')['validateHeroFile'];
let validateLogoFile: typeof import('../webSettingsService.js')['validateLogoFile'];

beforeAll(async () => {
  const service = await import('../webSettingsService.js');
  validateHeroFile = service.validateHeroFile;
  validateLogoFile = service.validateLogoFile;
});

describe('web settings image upload validation', () => {
  it('rejects raw SVG logos to avoid storing executable markup', () => {
    const result = validateLogoFile({
      mimetype: 'image/svg+xml',
      size: 1024,
    } as Express.Multer.File);

    expect(result.valid).toBe(false);
  });

  it('continues accepting bounded raster logos and heroes', () => {
    expect(
      validateLogoFile({
        mimetype: 'image/png',
        size: 1024,
      } as Express.Multer.File).valid,
    ).toBe(true);
    expect(
      validateHeroFile({
        mimetype: 'image/webp',
        size: 1024,
      } as Express.Multer.File).valid,
    ).toBe(true);
  });
});
