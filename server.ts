import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createLocalD1Database } from './src/d1.js';
import { initDatabase } from './src/repository.js';
import { handleRequest } from './src/worker.js';
import type { D1Database, Env } from './src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(__dirname, 'data', 'bidpilot_d1.sqlite3');

const app = express();

// Disable X-Frame-Options to allow embedding in preview environment
app.use((_req, res, next) => {
  res.removeHeader('X-Frame-Options');
  next();
});

// Serve static assets first
app.use(express.static(PUBLIC_DIR));

let d1Db: D1Database;
let env: Env;

async function bootstrap() {
  // Ensure data directory exists
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Load seeds if available
  let seedOpps: any[] = [];
  let seedSources: any[] = [];
  try {
    const oppFile = path.join(__dirname, 'data', 'seed.json');
    if (fs.existsSync(oppFile)) {
      seedOpps = JSON.parse(fs.readFileSync(oppFile, 'utf-8'));
    }
    const srcFile = path.join(__dirname, 'data', 'sources.json');
    if (fs.existsSync(srcFile)) {
      seedSources = JSON.parse(fs.readFileSync(srcFile, 'utf-8'));
    }
  } catch (err) {
    console.warn('Warning loading seeds:', err);
  }

  // Initialize SQLite D1 instance
  d1Db = await createLocalD1Database(DB_FILE);
  await initDatabase(d1Db, seedOpps, seedSources);

  // Use env token if at least 32 chars, otherwise use development secret
  const envToken = process.env.BIDPILOT_ADMIN_TOKEN;
  const adminToken = (envToken && envToken.length >= 32)
    ? envToken
    : 'local_admin_dev_token_at_least_32_characters_secret';
  env = {
    DB: d1Db,
    BIDPILOT_ADMIN_TOKEN: adminToken,
    ZERO_COST_ONLY: 'true',
  };

  console.log('Persistent Cloudflare D1 local database initialized at:', DB_FILE);
}

// Delegate /api/* requests to Cloudflare Worker handleRequest
app.all('/api/*', async (req, res) => {
  try {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const url = `${protocol}://${host}${req.originalUrl}`;

    // Read body if available
    let body: any = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    }

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val !== undefined) {
        if (Array.isArray(val)) {
          for (const v of val) headers.append(key, v);
        } else {
          headers.set(key, val);
        }
      }
    }

    const webRequest = new Request(url, {
      method: req.method,
      headers,
      body: body && body.length > 0 ? body : undefined,
    });

    const webResponse = await handleRequest(webRequest, env);

    res.status(webResponse.status);
    webResponse.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const respBuffer = Buffer.from(await webResponse.arrayBuffer());
    res.send(respBuffer);
  } catch (err: any) {
    console.error('Error handling API request:', err);
    res.status(500).json({ error: 'Internal server error: ' + (err.message || String(err)) });
  }
});

// Client-side routes fallback to public/index.html
const SPA_ROUTES = [
  '/',
  '/dashboard',
  '/tenders',
  '/hotels',
  '/manpower',
  '/housekeeping',
  '/construction',
  '/maintenance',
  '/services',
  '/subcontracts',
  '/suppliers',
  '/saved',
  '/tracking',
  '/sources',
  '/company',
];

app.get(SPA_ROUTES, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/tenders/:id', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Unknown non-API routes fallback to index.html
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

bootstrap().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`Saudi BidPilot serving on http://${HOST}:${PORT}`);
  });
}).catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
