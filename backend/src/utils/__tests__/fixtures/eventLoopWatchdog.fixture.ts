import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extension = path.extname(fileURLToPath(import.meta.url));
const { startEventLoopWatchdog } = (await import(
  new URL(`../../eventLoopWatchdog${extension}`, import.meta.url).href
)) as typeof import('../../eventLoopWatchdog.js');

const stop = await startEventLoopWatchdog();
const mode = process.argv[2];
if (mode === 'idle') {
  // Unreferenced diagnostic handles must not keep the application alive.
} else {
  process.stdout.write('ready\n');
  let started = false;
  process.stdin.on('data', () => {
    if (started) return;
    started = true;
    if (mode === 'permanent') {
      spinForever();
    } else {
      blockTemporarily();
      setTimeout(() => {
        void stop().then(() => process.stdin.destroy());
      }, 1_500);
    }
  });
}

function spinForever(): never {
  while (true) Math.sqrt(Math.random());
}

function blockTemporarily(): void {
  const until = process.hrtime.bigint() + 6_500_000_000n;
  while (process.hrtime.bigint() < until) Math.sqrt(Math.random());
}
