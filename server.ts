import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { getDb } from './server/db.ts';
import { createApiRouter } from './server/routes.ts';
import { runSchedulerTick } from './server/scheduler.ts';

dotenv.config({ quiet: true });

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const httpServer = http.createServer(app);
  const db = getDb();
  app.use('/api', createApiRouter(db));

  const isProd =
    process.env.NODE_ENV === 'production' ||
    process.argv.includes('--production');

  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('/{*splat}', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    } else {
      console.warn(
        'Production dist/ folder not found. Run "npm run build" first.'
      );
    }
  } else {
    const { createServer: createViteServer, loadConfigFromFile } = await import(
      'vite'
    );
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      path.resolve(process.cwd(), 'vite.config.ts')
    );
    const rawViteConfig = loaded?.config ?? {};
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      ...rawViteConfig,
      configFile: false,
      server: {
        ...rawViteConfig.server,
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        ws: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    if (hmrDisabled) {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) { return url; }
export class ErrorOverlay {}
`);
      });
    }

    app.use(vite.middlewares);
  }

  // Run immediate startup recovery to detect any schedules missed while offline
  const recovered = runSchedulerTick(db);
  if (recovered.length > 0) {
    console.log(
      `[Scheduler] Detected ${recovered.length} due/missed reminder(s) on startup.`
    );
  }

  // Check schedules every 15 seconds while running
  const interval = setInterval(() => {
    try {
      runSchedulerTick(db);
    } catch (err) {
      console.error('[Scheduler] Tick failed:', err);
    }
  }, 15_000);
  interval.unref();

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';

  httpServer.listen(port, host, () => {
    console.log(
      `WhatsApp AI Assistant running at http://${
        host === '0.0.0.0' ? '127.0.0.1' : host
      }:${port}`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
