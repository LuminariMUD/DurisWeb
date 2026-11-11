import logger from './utils/logger.js';
import { mudHookStateProvider } from './hooks/mudHookStateClient.js';
import { refreshHookState, setMudHookStateProvider } from './hooks/hookSettingsService.js';
import { getBackendConfiguration } from './config/environment.js';
import { createApp } from './app.js';
import { startServer } from './runtime/startServer.js';
import {
  createShutdown,
  exitAfterShutdown,
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

// One exit decision per process: a signal during failed-start cleanup cannot turn it into exit 0.
let shuttingDown = false;
installSignalHandlers(() => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('\nReceived shutdown signal, closing server gracefully...');
  void exitAfterShutdown(shutdown, 0);
});

// Only start server if not in test mode
if (environment.environment !== 'test') {
  startServer(app, resources).catch((error) => {
    logger.error('Failed to start server:', error);
    if (shuttingDown) return;
    shuttingDown = true;
    // Release only what this startup acquired, but never let a failed start hang in cleanup.
    void exitAfterShutdown(shutdown, 1, { deadlineMs: 2000 });
  });
}
