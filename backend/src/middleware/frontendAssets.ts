import express, { type RequestHandler } from 'express';
import path from 'node:path';

// Vite's generated assets use an eight-character content hash. Unversioned
// files (including HTML and worker entry points) retain normal revalidation.
const FINGERPRINTED_FILE = /^\/[^/]+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;

export function fingerprintedFrontendAssets(frontendDistPath: string): RequestHandler {
  const serve = express.static(path.join(frontendDistPath, 'assets'), {
    index: false,
    maxAge: '1y',
    immutable: true,
  });
  return (req, res, next) => {
    if (!FINGERPRINTED_FILE.test(req.path)) return next();
    return serve(req, res, next);
  };
}
