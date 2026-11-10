import logger from './utils/logger.js';
import { mudHookStateProvider } from './hooks/mudHookStateClient.js';
import { refreshHookState, setMudHookStateProvider } from './hooks/hookSettingsService.js';
import { getBackendConfiguration } from './config/environment.js';
import { createApp } from './app.js';
import { startServer } from './runtime/startServer.js';
import {
  createShutdown,
  installSignalHandlers,
  type RuntimeResources,
} from './runtime/shutdown.js';

// Executable entry: compose the app, launch once, install signals once, decide process exit.
const environment = getBackendConfiguration();
const app = createApp();

// Hook state: MUD-reported state comes from the bridge; website toggles are
// loaded once here so the event-path gate never awaits a database read.
setMudHookStateProvider(mudHookStateProvider);
void refreshHookState().catch((error) => {
  logger.error('[hooks] Initial hook state load failed', error);
});

const resources: RuntimeResources = {};
const shutdown = createShutdown(resources);

async function exitAfterShutdown(code: number): Promise<void> {
  await shutdown();
  process.exit(code);
}

let shuttingDown = false;
installSignalHandlers(() => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('\nReceived shutdown signal, closing server gracefully...');
  void exitAfterShutdown(0);
});

// Only start server if not in test mode
if (environment.environment !== 'test') {
  startServer(app, resources).catch((error) => {
    logger.error('Failed to start server:', error);
    // Release only what this startup acquired, but never let a failed start hang in cleanup.
    setTimeout(() => process.exit(1), 2000);
    void exitAfterShutdown(1);
  });
}
