import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './app';
import { openDb } from './db';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dataDir = process.env.WOWG_DATA_DIR ?? `${root}data`;
const treesDir = process.env.WOWG_TREES_DIR ?? `${root}trees`;
const portraitsDir = process.env.WOWG_PORTRAITS_DIR ?? `${root}portraits`;
const webDist = `${root}apps/web/dist`;
const port = Number(process.env.PORT ?? 3001);

mkdirSync(dataDir, { recursive: true });
const db = openDb(`${dataDir}/wowg.sqlite`);

const server = new Hono();
server.route('/', createApp({ db, treesDir, portraitsDir }));

// En usage normal (npm start), le serveur sert aussi le front compilé.
if (existsSync(webDist)) {
  server.use('/*', serveStatic({ root: webDist }));
  server.get('*', serveStatic({ path: `${webDist}/index.html` }));
}

serve({ fetch: server.fetch, hostname: '127.0.0.1', port }, (info) => {
  console.log(`WoWG : http://127.0.0.1:${info.port}`);
});
