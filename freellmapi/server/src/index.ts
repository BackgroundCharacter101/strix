import './env.js';
import { createApp } from './app.js';
import { initDb } from './db/index.js';
import { startHealthChecker } from './services/health.js';

const PORT = process.env.PORT ?? 3001;
// Bind to localhost by default so a per-machine server is NOT reachable from the
// LAN (the /v1 proxy and the unsigned api-key endpoint would otherwise let
// anyone on the network use your AI/provider quota). A team host that wants to
// share it sets HOST=0.0.0.0 explicitly. See docs/TEAM_SETUP.md.
const HOST = process.env.HOST ?? '127.0.0.1';

async function main() {
  await initDb();
  const app = createApp();

  app.listen(Number(PORT), HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log(`Proxy endpoint: http://${HOST}:${PORT}/v1/chat/completions`);
    startHealthChecker();
  });
}

main().catch(console.error);
