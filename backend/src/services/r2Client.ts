import { S3Client } from '@aws-sdk/client-s3';

import { getBackendConfiguration, type R2Configuration } from '../config/environment.js';

interface R2Storage {
  client: S3Client;
  configuration: R2Configuration;
}

let storage: R2Storage | null = null;

export function isR2Enabled(): boolean {
  return getBackendConfiguration().features.r2;
}

export function requireR2Storage(): R2Storage {
  if (storage) return storage;
  const configuration = getBackendConfiguration().r2;
  if (!configuration) throw new Error('R2 storage is disabled');

  storage = {
    configuration,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${configuration.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
    }),
  };
  return storage;
}
