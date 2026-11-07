import { loadConfig } from '@quidsin/config';
import { createApp } from './app.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

const config = loadConfig();
const app = createApp();

app.listen(config.WORKER_PORT, () => {
  console.log(`[worker] listening on port ${config.WORKER_PORT}`);
});

setInterval(() => {
  console.log('[worker] heartbeat: alive');
}, HEARTBEAT_INTERVAL_MS);
