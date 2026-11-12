import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { stubModule } from '../../test/stubModule.js';

const query = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const send = jest.fn<(command: unknown) => Promise<unknown>>();
jest.unstable_mockModule(
  '../r2Client.js',
  stubModule(new URL('../r2Client.js', import.meta.url), {
    isR2Enabled: () => true,
    requireR2Storage: () => ({
      client: { send },
      configuration: { bucketName: 'synthetic', publicUrl: 'https://images.test.invalid' },
    }),
  }),
);

jest.unstable_mockModule('../../db/connection.js', () => ({
  pool: { query, execute: query },
}));

let validateHeroFile: typeof import('../webSettingsService.js')['validateHeroFile'];
let validateLogoFile: typeof import('../webSettingsService.js')['validateLogoFile'];
let service: typeof import('../webSettingsService.js');
let image: Buffer;

beforeAll(async () => {
  service = await import('../webSettingsService.js');
  validateHeroFile = service.validateHeroFile;
  validateLogoFile = service.validateLogoFile;
  image = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } })
    .png()
    .toBuffer();
});

describe.each([
  {
    kind: 'logo',
    key: 'site_logo_url',
    upload: () => service.uploadSiteLogo(image, 'image/png', 'Operator'),
    remove: () => service.deleteSiteLogo('Operator'),
  },
  {
    kind: 'hero',
    key: 'front_page_hero_image_url',
    upload: () => service.uploadHeroImage(image, 'image/png', 'Operator'),
    remove: () => service.deleteHeroImage('Operator'),
  },
])('site $kind publication ownership', ({ kind, key, upload, remove }) => {
  let currentUrl: string;
  let oldKey: string;
  const objects = new Set<string>();
  const events: string[] = [];
  let failWrite = false;
  let failPut = false;
  let failDelete = false;
  let beforePut: (() => Promise<void>) | undefined;

  beforeEach(() => {
    oldKey = `duris/site/${kind}_old.webp`;
    currentUrl = `https://images.test.invalid/${oldKey}`;
    objects.clear();
    objects.add(oldKey);
    events.length = 0;
    failWrite = false;
    failPut = false;
    failDelete = false;
    beforePut = undefined;
    query.mockReset().mockImplementation(async (sql, values) => {
      if (String(sql).startsWith('SELECT setting_value')) return [[{ setting_value: currentUrl }]];
      if (failWrite) throw new Error('Synthetic SQL write failure');
      if (!Array.isArray(values) || values[0] !== key) throw new Error('Unexpected fixture write');
      currentUrl = String(values[1]);
      events.push('write');
      return [{}];
    });
    send.mockReset().mockImplementation(async (command) => {
      if (command instanceof ListObjectsV2Command)
        return { Contents: [...objects].map((Key) => ({ Key })) };
      if (command instanceof PutObjectCommand) {
        if (failPut) throw new Error('Synthetic storage upload failure');
        objects.add(command.input.Key!);
        events.push('put');
        await beforePut?.();
        return {};
      }
      if (command instanceof DeleteObjectCommand) {
        if (failDelete) throw new Error('Synthetic cleanup failure');
        objects.delete(command.input.Key!);
        events.push('delete');
        return {};
      }
      throw new Error('Unexpected fixture storage command');
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the published image when replacement upload fails', async () => {
    failPut = true;
    await expect(upload()).rejects.toThrow('Synthetic storage upload failure');
    expect(objects.has(oldKey)).toBe(true);
    expect(currentUrl).toContain(oldKey);
    expect(events).not.toContain('delete');
  });
  it('keeps the published image when the new URL cannot be committed', async () => {
    failWrite = true;
    await expect(upload()).rejects.toThrow('Synthetic SQL write failure');
    expect(objects.has(oldKey)).toBe(true);
    expect(currentUrl).toContain(oldKey);
    expect(events).not.toContain('delete');
  });
  it('publishes the replacement before deleting only the previous owned object', async () => {
    const url = await upload();
    expect(currentUrl).toBe(url);
    expect(objects.has(url.replace('https://images.test.invalid/', ''))).toBe(true);
    expect(objects.has(oldKey)).toBe(false);
    expect(events).toEqual(['put', 'write', 'delete']);
    expect(
      send.mock.calls.filter(([command]) => command instanceof ListObjectsV2Command),
    ).toHaveLength(0);
  });
  it('keeps interleaved uploads immutable even at the same timestamp', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234567890);
    let started = 0;
    let release: () => void = () => {};
    const bothStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    beforePut = async () => {
      if (++started === 2) release();
      await bothStarted;
    };
    const urls = await Promise.all([upload(), upload()]);
    expect(new Set(urls).size).toBe(2);
    expect(objects.has(currentUrl.replace('https://images.test.invalid/', ''))).toBe(true);
    expect(urls.every((url) => objects.has(url.replace('https://images.test.invalid/', '')))).toBe(
      true,
    );
  });
  it('does not delete the existing asset if clearing its URL fails', async () => {
    failWrite = true;
    await expect(remove()).rejects.toThrow('Synthetic SQL write failure');
    expect(objects.has(oldKey)).toBe(true);
    expect(events).not.toContain('delete');
  });
  it('clears the URL before explicit object deletion', async () => {
    await remove();
    expect(currentUrl).toBe('');
    expect(objects.has(oldKey)).toBe(false);
    expect(events).toEqual(['write', 'delete']);
  });
  it('keeps a published replacement when obsolete-object cleanup fails', async () => {
    failDelete = true;
    const url = await upload();
    expect(currentUrl).toBe(url);
    expect(objects.has(url.replace('https://images.test.invalid/', ''))).toBe(true);
    expect(objects.has(oldKey)).toBe(true);
  });
  it('does not delete external or differently-owned URLs', async () => {
    currentUrl = 'https://external.test.invalid/custom.webp';
    await upload();
    expect(events).not.toContain('delete');
  });
});

describe.each(['pvp_delay_minutes', 'max_hourly_backups'])('strict numeric setting %s', (key) => {
  it.each(['1.5', '1garbage', '1e2', ' 1', '+1'])('rejects %s before a write', async (value) => {
    query.mockReset().mockResolvedValue([{}]);
    await expect(service.updateWebSetting(key, value, 'Operator')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(query).not.toHaveBeenCalled();
  });
});

describe.each(['avatar', 'banner'] as const)('profile storage ownership: %s', (kind) => {
  it('uploads immutable objects without deleting a published image first', async () => {
    const storage = await import('../r2Service.js');
    send.mockReset().mockResolvedValue({ Contents: [{ Key: 'existing-image' }] });
    jest.spyOn(Date, 'now').mockReturnValue(1234567890);
    try {
      const urls = await Promise.all([
        storage.uploadAvatar(image, 'Operator', 'image/png', kind),
        storage.uploadAvatar(image, 'Operator', 'image/png', kind),
      ]);
      expect(new Set(urls).size).toBe(2);
      expect(send.mock.calls.every(([command]) => command instanceof PutObjectCommand)).toBe(true);
    } finally {
      jest.restoreAllMocks();
    }
  });
  it('only cleans up a matching account and image-type object', async () => {
    const storage = await import('../r2Service.js');
    send.mockReset().mockResolvedValue({});
    const folder = kind === 'avatar' ? 'avatars' : 'banners';
    const ownKey = `duris/${folder}/operator_old.webp`;
    await storage.deleteAvatarByUrl('https://images.test.invalid/' + ownKey, 'Operator', kind);
    await storage.deleteAvatarByUrl(
      `https://images.test.invalid/duris/${folder}/other_old.webp`,
      'Operator',
      kind,
    );
    await storage.deleteAvatarByUrl(
      `https://images.test.invalid.evil.invalid/${ownKey}`,
      'Operator',
      kind,
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((send.mock.calls[0]?.[0] as DeleteObjectCommand).input.Key).toBe(ownKey);
  });
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
