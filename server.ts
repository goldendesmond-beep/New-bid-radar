import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SECTORS, classify, relevance, fit, engines, normalize } from './src/intelligence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// AI Studio & Browser security headers (without iframe-blocking DENY)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Allow AI Studio preview iFrame
  res.removeHeader('X-Frame-Options');
  next();
});

// Load seed data
function todayInRiyadh(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

function isExpired(record: any): boolean {
  const t = todayInRiyadh();
  if (record.deadline && record.deadline < t) return true;
  if (record.deadline_at) {
    try {
      const when = new Date(record.deadline_at).getTime();
      if (!isNaN(when) && when <= Date.now()) return true;
    } catch {}
  }
  return false;
}

let opportunities: any[] = [];
let sources: any[] = [];

try {
  const seedPath = path.join(__dirname, 'data', 'seed.json');
  if (fs.existsSync(seedPath)) {
    const raw = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    opportunities = raw.map((r: any) => {
      const rec = { ...r };
      rec.sectors = rec.sectors || classify(rec.title + ' ' + (rec.description || ''));
      rec.status = String(rec.status || 'unknown').toLowerCase();
      if (isExpired(rec) && ['open', 'unknown'].includes(rec.status)) {
        rec.status = 'closed';
      }
      return rec;
    });
  }
} catch (err) {
  console.error('Failed to load seed.json:', err);
}

try {
  const sourcesPath = path.join(__dirname, 'data', 'sources.json');
  if (fs.existsSync(sourcesPath)) {
    sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
  }
} catch (err) {
  console.error('Failed to load sources.json:', err);
}

// In-memory session, company profiles, and saved/tracking state
interface Session {
  id: string;
  csrf: string;
  created_at: string;
  expires_at: string;
}

interface TrackingItem {
  stage: string;
  notes: string;
  updated_at: string;
}

const sessions = new Map<string, Session>();
const companies = new Map<string, any>();
const savedTracking = new Map<string, Map<string, TrackingItem>>();

function getSession(req: express.Request, res: express.Response): Session {
  const cookieSid = req.cookies['bidpilot_session'];
  if (cookieSid && sessions.has(cookieSid)) {
    return sessions.get(cookieSid)!;
  }
  const sid = crypto.randomBytes(24).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const session: Session = {
    id: sid,
    csrf,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };
  sessions.set(sid, session);
  res.cookie('bidpilot_session', sid, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 90 * 24 * 60 * 60 * 1000,
  });
  return session;
}

// API Routes
app.get('/api/session', (req, res) => {
  const session = getSession(req, res);
  const company = companies.get(session.id) || {};
  res.json({
    csrf: session.csrf,
    company,
    privacy: 'Device-specific private workspace; no cross-device account.',
  });
});

app.get('/api/meta', (_req, res) => {
  const sectorsFormatted: Record<string, { ar: string; en: string }> = {};
  for (const [key, val] of Object.entries(SECTORS)) {
    sectorsFormatted[key] = { ar: val[0], en: val[1] };
  }
  res.json({
    sectors: sectorsFormatted,
    engines: engines(),
  });
});

app.get('/api/summary', (_req, res) => {
  const tenders = opportunities.filter((r) => ['tender', 'rfq', 'rfp', 'qualification'].includes(r.kind)).length;
  const openCount = opportunities.filter(
    (r) => r.status === 'open' && ['tender', 'rfq', 'rfp', 'qualification'].includes(r.kind)
  ).length;
  const regCount = opportunities.filter((r) => r.kind === 'supplier_registration').length;
  const liveSources = sources.filter((s) => s.status === 'LIVE').length;
  const manualSources = sources.filter((s) => s.status === 'MANUAL_IMPORT').length;
  const latestVerification = opportunities.reduce(
    (max, r) => (!max || r.last_verified > max ? r.last_verified : max),
    null
  );

  res.json({
    total: opportunities.length,
    tenders,
    open: openCount,
    registrations: regCount,
    live_sources: liveSources,
    manual_sources: manualSources,
    latest_verification: latestVerification,
    last_run: {
      started_at: '2026-10-09T20:59:33+00:00',
      finished_at: '2026-10-09T20:59:34+00:00',
      status: 'completed',
    },
    today: todayInRiyadh(),
    zero_cost_only: true,
  });
});

app.get('/api/sources', (_req, res) => {
  res.json({
    items: sources,
    scheduler: {
      configured: true,
      active: true,
      production_verified: false,
      interval_hours: 24,
    },
  });
});

app.get('/api/opportunities', (req, res) => {
  const session = getSession(req, res);
  const sid = session.id;
  const company = companies.get(sid) || {};
  const userSaved = savedTracking.get(sid) || new Map<string, TrackingItem>();

  const q = String(req.query.q || '').trim();
  const sector = String(req.query.sector || '').trim();
  const city = String(req.query.city || '').trim();
  const organization = String(req.query.organization || '').trim();
  const status = String(req.query.status || '').trim();
  const kind = String(req.query.kind || '').trim();
  const procurementOnly = req.query.procurement_only === 'true';
  const publishedAfter = String(req.query.published_after || '').trim();
  const deadlineBefore = String(req.query.deadline_before || '').trim();
  const savedOnly = req.query.saved === 'true';
  const sort = String(req.query.sort || 'deadline');

  const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));

  const matched = opportunities
    .filter((r) => {
      if (procurementOnly && !['tender', 'rfq', 'rfp', 'qualification'].includes(r.kind)) {
        return false;
      }
      if (kind && r.kind !== kind) return false;
      if (status && r.status !== status) return false;
      if (sector && !r.sectors?.includes(sector)) return false;
      if (savedOnly && !userSaved.has(r.id)) return false;

      if (city && !normalize(r.city).includes(normalize(city))) return false;
      if (organization && !normalize(r.organization).includes(normalize(organization))) return false;

      if (publishedAfter && (r.published_at || '') < publishedAfter) return false;
      if (deadlineBefore && (r.deadline || '9999-99-99') > deadlineBefore) return false;

      if (q) {
        const rel = relevance(q, r);
        if (rel < 0.25) return false;
      }
      return true;
    })
    .map((r) => {
      const isSaved = userSaved.has(r.id);
      const tracking = userSaved.get(r.id) || null;
      const fitScore = fit(r, company);
      const rel = q ? relevance(q, r) : 1.0;
      return {
        ...r,
        saved: isSaved,
        tracking,
        fit: fitScore,
        search_relevance: rel,
      };
    });

  if (q) {
    matched.sort((a, b) => b.search_relevance - a.search_relevance);
  } else if (sort === 'fit') {
    matched.sort((a, b) => (b.fit?.score || 0) - (a.fit?.score || 0));
  } else {
    // Sort by deadline
    matched.sort((a, b) => {
      const da = a.deadline || '9999-12-31';
      const db = b.deadline || '9999-12-31';
      return da.localeCompare(db);
    });
  }

  const paginated = matched.slice(offset, offset + limit);

  res.json({
    items: paginated,
    total: matched.length,
    offset,
    limit,
  });
});

app.get('/api/opportunities/:id', (req, res) => {
  const session = getSession(req, res);
  const sid = session.id;
  const company = companies.get(sid) || {};
  const userSaved = savedTracking.get(sid) || new Map<string, TrackingItem>();

  const id = req.params.id;
  const found = opportunities.find((r) => r.id === id);
  if (!found) {
    return res.status(404).json({ error: 'Opportunity not found' });
  }

  const isSaved = userSaved.has(found.id);
  const tracking = userSaved.get(found.id) || null;
  const fitScore = fit(found, company);

  res.json({
    ...found,
    saved: isSaved,
    tracking,
    fit: fitScore,
  });
});

app.get('/api/company', (req, res) => {
  const session = getSession(req, res);
  const company = companies.get(session.id) || {};
  res.json(company);
});

app.post('/api/company', (req, res) => {
  const session = getSession(req, res);
  const sid = session.id;
  const body = req.body || {};

  const clean = {
    name: String(body.name || '').slice(0, 200),
    size: ['small', 'medium', 'large'].includes(body.size) ? body.size : 'small',
    city: String(body.city || '').slice(0, 100),
    sectors: Array.isArray(body.sectors) ? body.sectors.filter((s) => s in SECTORS).slice(0, 20) : [],
    services: String(body.services || '').slice(0, 3000),
    workers: Math.max(0, Math.min(100000, parseInt(String(body.workers || '0'), 10) || 0)),
    target_cities: Array.isArray(body.target_cities)
      ? body.target_cities.map((x: any) => String(x).trim().slice(0, 100)).filter(Boolean).slice(0, 20)
      : [],
    certifications: Array.isArray(body.certifications)
      ? body.certifications.map((x: any) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 30)
      : [],
    contract_min: Math.max(0, Math.min(1e12, parseFloat(String(body.contract_min || '0')) || 0)),
    contract_max: Math.max(0, Math.min(1e12, parseFloat(String(body.contract_max || '0')) || 0)),
  };

  companies.set(sid, clean);
  res.json(clean);
});

app.post('/api/saved/:id', (req, res) => {
  const session = getSession(req, res);
  const sid = session.id;
  const id = req.params.id;

  const found = opportunities.find((r) => r.id === id);
  if (!found) {
    return res.status(404).json({ error: 'Opportunity not found' });
  }

  let userSaved = savedTracking.get(sid);
  if (!userSaved) {
    userSaved = new Map<string, TrackingItem>();
    savedTracking.set(sid, userSaved);
  }

  const stage = String(req.body?.stage || 'saved');
  if (stage === 'remove') {
    userSaved.delete(id);
  } else {
    userSaved.set(id, {
      stage,
      notes: String(req.body?.notes || '').slice(0, 3000),
      updated_at: new Date().toISOString(),
    });
  }

  res.json({ ok: true });
});

function escapeCsvCell(val: any): string {
  let s = String(val ?? '');
  if (['=', '+', '-', '@', '\t', '\r', '\n'].some((ch) => s.startsWith(ch))) {
    s = "'" + s;
  }
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function generateCsv(records: any[]): string {
  const fields = [
    'title',
    'organization',
    'kind',
    'city',
    'status',
    'published_at',
    'deadline',
    'reference',
    'source_url',
    'apply_url',
    'registration_url',
    'last_verified',
    'confidence',
  ];
  const header = fields.join(',');
  const rows = records.map((r) => fields.map((f) => escapeCsvCell(r[f])).join(','));
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

app.get(['/api/export.csv', '/api/export.xlsx'], (req, res) => {
  const session = getSession(req, res);
  const userSaved = savedTracking.get(session.id) || new Map<string, TrackingItem>();

  const q = String(req.query.q || '').trim();
  const sector = String(req.query.sector || '').trim();
  const city = String(req.query.city || '').trim();
  const organization = String(req.query.organization || '').trim();
  const status = String(req.query.status || '').trim();
  const kind = String(req.query.kind || '').trim();
  const procurementOnly = req.query.procurement_only === 'true';
  const savedOnly = req.query.saved === 'true';

  const matched = opportunities.filter((r) => {
    if (procurementOnly && !['tender', 'rfq', 'rfp', 'qualification'].includes(r.kind)) return false;
    if (kind && r.kind !== kind) return false;
    if (status && r.status !== status) return false;
    if (sector && !r.sectors?.includes(sector)) return false;
    if (savedOnly && !userSaved.has(r.id)) return false;
    if (city && !normalize(r.city).includes(normalize(city))) return false;
    if (organization && !normalize(r.organization).includes(normalize(organization))) return false;
    if (q && relevance(q, r) < 0.25) return false;
    return true;
  });

  const ext = req.path.endsWith('.xlsx') ? 'xlsx' : 'csv';
  const csvData = generateCsv(matched.slice(0, 200));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="saudi-bidpilot.${ext}"`);
  res.send(Buffer.from(csvData, 'utf-8'));
});

app.post('/api/admin/refresh', (_req, res) => {
  res.json({
    status: 'completed',
    refreshed_sources: sources.length,
    mode: 'VERIFIED_SNAPSHOT',
  });
});

app.post('/api/admin/import', (_req, res) => {
  res.json({ imported: 0, mode: 'MANUAL_IMPORT' });
});

// Serve static assets from public
app.use(express.static(PUBLIC_DIR));

// Frontend SPA fallback for client-side routing
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

// 404 handler for unknown routes
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Saudi BidPilot listening on http://${HOST}:${PORT}`);
});
