import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readStatus } from './status.js';
import { lane } from './lane.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';
import { registerDigestRoutes } from './digest/routes.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  registerDigestRoutes(app, config);

  return app;
}
