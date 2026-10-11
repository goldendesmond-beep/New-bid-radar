/**
 * Repository layer for Cloudflare D1 persistent storage.
 */
import crypto from 'node:crypto';
import type { D1Database, OpportunityRecord, SourceRecord, SessionRecord, CompanyProfile, TrackingRecord } from './types.js';
import { SECTORS, classify, relevance, fit, normalize } from './intelligence.js';
import { runAllConnectors, type ConnectorResult } from './connectors.js';

export function todayInRiyadh(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

export function isExpired(record: any): boolean {
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

export function normalizeRecord(raw: any): OpportunityRecord {
  const r: any = { ...raw };
  const mapping: Record<string, string> = {
    issuer: 'organization',
    issuerEn: 'organization_en',
    titleEn: 'title_en',
    descriptionEn: 'description_en',
    sourceUrl: 'source_url',
    lastVerifiedAt: 'last_verified',
    loginRequired: 'login_required',
    requiredDocuments: 'documents',
    publishedAt: 'published_at',
    closingDate: 'deadline',
    sourceId: 'source_id',
    applicationUrl: 'apply_url',
    referenceNumber: 'reference',
    actionUrl: 'registration_url',
  };
  for (const [a, b] of Object.entries(mapping)) {
    if (r[a] !== undefined && r[b] === undefined) {
      r[b] = r[a];
    }
  }
  r.kind = String(r.kind || r.type || 'tender').toLowerCase();
  r.title = String(r.title || '').trim();
  r.organization = String(r.organization || r.issuer || '').trim();
  r.city = r.city || 'السعودية';
  r.sectors = r.sectors || classify(r.title + ' ' + (r.description || ''));
  r.status = String(r.status || 'unknown').toLowerCase();
  if (r.kind === 'supplier_registration' && r.registration_url) {
    r.status = 'registration_available';
  }
  if (isExpired(r) && ['open', 'unknown'].includes(r.status)) {
    r.status = 'closed';
  }
  return r as OpportunityRecord;
}

/**
 * Initializes schema and runs seeds if database is uninitialized.
 */
export async function initDatabase(db: D1Database, seedOpportunities?: any[], seedSources?: any[]): Promise<void> {
  // Ensure tables exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      fingerprint TEXT UNIQUE NOT NULL,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      deadline TEXT,
      title TEXT NOT NULL,
      city TEXT,
      organization TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_opportunities_status_kind ON opportunities(status, kind, deadline);
    CREATE INDEX IF NOT EXISTS idx_opportunities_source ON opportunities(source_id);

    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunity_id TEXT NOT NULL,
      data TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      data TEXT NOT NULL,
      last_attempt TEXT,
      last_success TEXT
    );

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      target TEXT,
      occurred_at TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      csrf TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS companies (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      stage TEXT NOT NULL DEFAULT 'saved',
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (session_id, opportunity_id)
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  // Check if opportunities table has records
  const countRow = await db.prepare('SELECT COUNT(*) as count FROM opportunities').first<{ count: number }>();
  if (!countRow || countRow.count === 0) {
    if (seedSources && seedSources.length > 0) {
      for (const s of seedSources) {
        await db.prepare(`
          INSERT OR REPLACE INTO sources (id, name, url, status, data, last_attempt, last_success)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          s.id,
          s.name,
          s.url,
          s.status,
          JSON.stringify(s),
          s.last_attempt || null,
          s.last_success || null
        ).run();
      }
    }

    if (seedOpportunities && seedOpportunities.length > 0) {
      for (const raw of seedOpportunities) {
        const rec = normalizeRecord(raw);
        const fingerprint = crypto.createHash('sha256').update(
          rec.source_id + '|' + (rec.reference || rec.source_url) + '|' + rec.title
        ).digest('hex');
        const now = new Date().toISOString();
        await db.prepare(`
          INSERT OR REPLACE INTO opportunities (id, fingerprint, source_id, kind, status, deadline, title, city, organization, data, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          rec.id,
          fingerprint,
          rec.source_id,
          rec.kind || 'tender',
          rec.status,
          rec.deadline || null,
          rec.title,
          rec.city || 'السعودية',
          rec.organization,
          JSON.stringify(rec),
          rec.last_verified || now,
          now
        ).run();
      }
    }
  }
}

export async function getSession(db: D1Database, sid?: string): Promise<{ session: SessionRecord; isNew: boolean }> {
  const now = new Date().toISOString();
  if (sid) {
    const row = await db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?').bind(sid, now).first<SessionRecord>();
    if (row) {
      return { session: row, isNew: false };
    }
  }

  const newSid = crypto.randomBytes(24).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const newSession: SessionRecord = {
    id: newSid,
    csrf,
    created_at: now,
    expires_at: expiresAt,
  };

  await db.prepare(`
    INSERT INTO sessions (id, csrf, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).bind(newSid, csrf, now, expiresAt).run();

  return { session: newSession, isNew: true };
}

export async function getCompany(db: D1Database, sid: string): Promise<CompanyProfile | Record<string, never>> {
  const row = await db.prepare('SELECT data FROM companies WHERE session_id = ?').bind(sid).first<{ data: string }>();
  if (!row) return {};
  try {
    return JSON.parse(row.data);
  } catch {
    return {};
  }
}

export async function saveCompany(db: D1Database, sid: string, body: any): Promise<CompanyProfile> {
  const clean: CompanyProfile = {
    name: String(body.name || '').slice(0, 200),
    size: ['small', 'medium', 'large'].includes(body.size) ? body.size : 'small',
    city: String(body.city || '').slice(0, 100),
    sectors: Array.isArray(body.sectors) ? body.sectors.filter((s: string) => s in SECTORS).slice(0, 20) : [],
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

  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO companies (session_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).bind(sid, JSON.stringify(clean), now).run();

  await db.prepare(`
    INSERT INTO audit_logs (event, target, occurred_at, data)
    VALUES (?, ?, ?, ?)
  `).bind(
    'company_updated',
    crypto.createHash('sha256').update(sid).digest('hex').slice(0, 16),
    now,
    '{}'
  ).run();

  return clean;
}

export async function saveTracking(db: D1Database, sid: string, oppId: string, data: any): Promise<{ ok: boolean }> {
  // Check if opportunity exists
  const opp = await db.prepare('SELECT id FROM opportunities WHERE id = ?').bind(oppId).first();
  if (!opp) {
    throw new Error('Opportunity not found');
  }

  const stage = String(data.stage || 'saved');
  if (stage === 'remove') {
    await db.prepare('DELETE FROM saved WHERE session_id = ? AND opportunity_id = ?').bind(sid, oppId).run();
  } else {
    const validStages = ['saved', 'reviewing', 'preparing', 'submitted', 'won', 'lost'];
    const safeStage = validStages.includes(stage) ? stage : 'saved';
    const notes = String(data.notes || '').slice(0, 3000);
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO saved (session_id, opportunity_id, stage, notes, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id, opportunity_id) DO UPDATE SET
        stage = excluded.stage,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).bind(sid, oppId, safeStage, notes, now).run();
  }
  return { ok: true };
}

export async function getSources(db: D1Database): Promise<SourceRecord[]> {
  const result = await db.prepare('SELECT * FROM sources ORDER BY name ASC').all<any>();
  return (result.results || []).map((row) => {
    let extra = {};
    try {
      extra = JSON.parse(row.data);
    } catch {}
    return {
      ...extra,
      id: row.id,
      name: row.name,
      url: row.url,
      status: row.status,
      last_attempt: row.last_attempt,
      last_success: row.last_success,
    };
  });
}

export async function getSummary(db: D1Database): Promise<any> {
  const rows = await db.prepare('SELECT id, kind, status, data FROM opportunities').all<any>();
  const opps = (rows.results || []).map((r) => {
    try {
      const parsed = JSON.parse(r.data);
      return { ...parsed, id: r.id, kind: r.kind, status: r.status };
    } catch {
      return r;
    }
  });

  const tenders = opps.filter((r) => ['tender', 'rfq', 'rfp', 'qualification'].includes(r.kind)).length;
  const openCount = opps.filter((r) => r.status === 'open' && ['tender', 'rfq', 'rfp', 'qualification'].includes(r.kind)).length;
  const regCount = opps.filter((r) => r.kind === 'supplier_registration').length;

  const sourcesList = await getSources(db);
  const liveSources = sourcesList.filter((s) => s.status === 'LIVE').length;
  const manualSources = sourcesList.filter((s) => s.status === 'MANUAL_IMPORT').length;

  let latestVerification: string | null = null;
  for (const r of opps) {
    if (r.last_verified && (!latestVerification || r.last_verified > latestVerification)) {
      latestVerification = r.last_verified;
    }
  }

  // Real last run from runs table, no hardcoded claims
  const lastRunRow = await db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').first<any>();
  let lastRunSummary: any = null;
  if (lastRunRow?.data) {
    try {
      lastRunSummary = JSON.parse(lastRunRow.data);
    } catch {
      lastRunSummary = {};
    }
  }

  return {
    total: opps.length,
    tenders,
    open: openCount,
    registrations: regCount,
    live_sources: liveSources,
    manual_sources: manualSources,
    latest_verification: latestVerification,
    last_run: lastRunRow ? {
      id: lastRunRow.id,
      started_at: lastRunRow.started_at,
      finished_at: lastRunRow.finished_at,
      status: lastRunRow.status,
      summary: lastRunSummary,
    } : null,
    today: todayInRiyadh(),
    zero_cost_only: true,
  };
}

export async function getOpportunities(
  db: D1Database,
  params: any,
  sid?: string
): Promise<{ items: any[]; total: number; offset: number; limit: number }> {
  const company = sid ? await getCompany(db, sid) : {};
  let userSaved = new Map<string, TrackingRecord>();

  if (sid) {
    const savedRows = await db.prepare('SELECT opportunity_id, stage, notes, updated_at FROM saved WHERE session_id = ?').bind(sid).all<any>();
    for (const s of savedRows.results || []) {
      userSaved.set(s.opportunity_id, {
        stage: s.stage,
        notes: s.notes,
        updated_at: s.updated_at,
      });
    }
  }

  const q = String(params.q || '').trim();
  const sector = String(params.sector || '').trim();
  const city = String(params.city || '').trim();
  const organization = String(params.organization || '').trim();
  const status = String(params.status || '').trim();
  const kind = String(params.kind || '').trim();
  const procurementOnly = params.procurement_only === 'true';
  const publishedAfter = String(params.published_after || '').trim();
  const deadlineBefore = String(params.deadline_before || '').trim();
  const savedOnly = params.saved === 'true';
  const sort = String(params.sort || 'deadline');

  const offset = Math.max(0, parseInt(String(params.offset || '0'), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(params.limit || '50'), 10)));

  // Query all opportunities from D1
  const sql = 'SELECT id, kind, status, deadline, title, city, organization, data FROM opportunities';
  const result = await db.prepare(sql).all<any>();
  const rows = result.results || [];

  const matched = rows
    .map((row) => {
      let rec: any = {};
      try {
        rec = JSON.parse(row.data);
      } catch {
        rec = { ...row };
      }
      rec.id = row.id;
      rec.kind = row.kind;
      rec.status = row.status;
      rec.deadline = row.deadline;
      rec.title = row.title;
      rec.city = row.city;
      rec.organization = row.organization;
      return rec;
    })
    .filter((r) => {
      if (procurementOnly && !['tender', 'rfq', 'rfp', 'qualification'].includes(r.kind)) return false;
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
    matched.sort((a, b) => {
      const da = a.deadline || '9999-12-31';
      const db = b.deadline || '9999-12-31';
      return da.localeCompare(db);
    });
  }

  const paginated = matched.slice(offset, offset + limit);
  return {
    items: paginated,
    total: matched.length,
    offset,
    limit,
  };
}

export async function getOpportunityById(db: D1Database, id: string, sid?: string): Promise<any | null> {
  const row = await db.prepare('SELECT data FROM opportunities WHERE id = ?').bind(id).first<{ data: string }>();
  if (!row) return null;

  let rec: any;
  try {
    rec = JSON.parse(row.data);
  } catch {
    return null;
  }

  const company = sid ? await getCompany(db, sid) : {};
  let isSaved = false;
  let tracking: any = null;

  if (sid) {
    const savedRow = await db.prepare('SELECT stage, notes, updated_at FROM saved WHERE session_id = ? AND opportunity_id = ?').bind(sid, id).first<any>();
    if (savedRow) {
      isSaved = true;
      tracking = {
        stage: savedRow.stage,
        notes: savedRow.notes,
        updated_at: savedRow.updated_at,
      };
    }
  }

  const fitScore = fit(rec, company);
  return {
    ...rec,
    saved: isSaved,
    tracking,
    fit: fitScore,
  };
}

/**
 * Validates admin token securely using constant-time comparison.
 */
export function verifyAdminToken(providedToken: string, expectedToken?: string): boolean {
  if (!expectedToken || expectedToken.length < 32 || !providedToken) {
    return false;
  }
  const cleanProvided = providedToken.replace(/^Bearer\s+/i, '').trim();
  const cleanExpected = expectedToken.trim();

  if (cleanProvided.length !== cleanExpected.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(cleanProvided), Buffer.from(cleanExpected));
  } catch {
    return false;
  }
}

export interface RefreshOptions {
  connectors?: () => Promise<ConnectorResult[]>;
}

export interface RefreshResult {
  ok: boolean;
  status: number;
  message: string;
  run_id?: number;
  new_tenders: number;
  updated_tenders: number;
  closed_expired: number;
  unchanged_tenders: number;
  verified_sources: string[];
  failed_sources: Array<{ id: string; name: string; status: string; reason: string }>;
  unreachable_sources: Array<{ id: string; name: string; status: string; reason: string }>;
  preserved_sources: number;
  details?: {
    new_records: Array<{ id: string; title: string; organization: string }>;
    updated_records: Array<{ id: string; title: string }>;
    failed_sources: Array<{ id: string; name: string; status: string; reason: string }>;
  };
}

/**
 * Performs admin manual refresh:
 * 1. Checks and closes expired opportunities in D1
 * 2. Fetches real Saudi procurement source connectors (Etimad and official portals)
 * 3. Discovers, verifies, deduplicates, and saves real new or updated tenders into D1
 * 4. Preserves previous records if any source fails (403, timeout, etc.)
 * 5. Accurately reports new, updated, closed, failed, and unreachable results separately
 * 6. Never marks a source LIVE without successful actual network verification
 */
export async function refreshOpportunities(
  db: D1Database,
  adminToken: string,
  configuredAdminToken?: string,
  options?: RefreshOptions
): Promise<RefreshResult> {
  if (!verifyAdminToken(adminToken, configuredAdminToken)) {
    return {
      ok: false,
      status: 401,
      message: 'رمز المشرف غير صحيح أو غير مصرح به (يلزم توفير مفتاح لا يقل عن 32 حرفًا)',
      new_tenders: 0,
      updated_tenders: 0,
      closed_expired: 0,
      unchanged_tenders: 0,
      verified_sources: [],
      failed_sources: [],
      unreachable_sources: [],
      preserved_sources: 0,
    };
  }

  const startedAt = new Date().toISOString();
  // Record run start
  const runResult = await db.prepare(`
    INSERT INTO runs (started_at, status, data)
    VALUES (?, ?, ?)
  `).bind(startedAt, 'running', '{}').run();

  const runId = runResult.meta.last_row_id;
  const now = new Date().toISOString();

  // 1. Re-check deadlines and close expired opportunities
  const rows = await db.prepare("SELECT id, data FROM opportunities WHERE status IN ('open', 'unknown')").all<any>();
  let closedCount = 0;

  for (const row of rows.results || []) {
    let rec: any;
    try {
      rec = JSON.parse(row.data);
    } catch {
      continue;
    }
    if (isExpired(rec)) {
      rec.status = 'closed';
      closedCount++;
      // Save version
      await db.prepare(`
        INSERT INTO versions (opportunity_id, data, recorded_at)
        VALUES (?, ?, ?)
      `).bind(row.id, row.data, now).run();

      await db.prepare(`
        UPDATE opportunities
        SET status = 'closed', data = ?, updated_at = ?
        WHERE id = ?
      `).bind(JSON.stringify(rec), now, row.id).run();
    }
  }

  // 2. Run source connectors (Etimad and official sources)
  let connectorResults: ConnectorResult[] = [];
  try {
    if (options?.connectors) {
      connectorResults = await options.connectors();
    } else {
      connectorResults = await runAllConnectors();
    }
  } catch (err: any) {
    connectorResults = [
      {
        sourceId: 'system',
        sourceName: 'موصلات المصادر',
        status: 'UNAVAILABLE',
        success: false,
        records: [],
        notes: `خطأ أثناء استدعاء الموصلات: ${err.message || String(err)}`,
        publicAccess: 'UNAVAILABLE',
        error: err.message || String(err),
      },
    ];
  }

  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  const verifiedSources: string[] = [];
  const failedSources: Array<{ id: string; name: string; status: string; reason: string }> = [];
  const unreachableSources: Array<{ id: string; name: string; status: string; reason: string }> = [];
  const newRecords: Array<{ id: string; title: string; organization: string }> = [];
  const updatedRecords: Array<{ id: string; title: string }> = [];

  for (const c of connectorResults) {
    const sId = c.sourceId;
    const sName = c.sourceName;

    // Update source status in D1
    const existingSource = await db.prepare('SELECT id, status, data, last_attempt, last_success FROM sources WHERE id = ?').bind(sId).first<any>();

    let sourceData: any = {};
    if (existingSource) {
      try {
        sourceData = JSON.parse(existingSource.data);
      } catch {}
    } else {
      sourceData = { id: sId, name: sName, url: '' };
    }

    sourceData.last_attempt = now;
    sourceData.notes = c.notes;
    sourceData.public_access = c.publicAccess;

    if (c.status === 'LIVE' && c.success) {
      sourceData.last_success = now;
      sourceData.status = 'LIVE';
      verifiedSources.push(sName);

      if (existingSource) {
        await db.prepare(`
          UPDATE sources
          SET status = 'LIVE', last_attempt = ?, last_success = ?, data = ?
          WHERE id = ?
        `).bind(now, now, JSON.stringify(sourceData), sId).run();
      } else {
        await db.prepare(`
          INSERT INTO sources (id, name, url, status, data, last_attempt, last_success)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(sId, sName, '', 'LIVE', JSON.stringify(sourceData), now, now).run();
      }
    } else if (c.status === 'BLOCKED') {
      sourceData.status = 'BLOCKED';
      failedSources.push({ id: sId, name: sName, status: 'BLOCKED', reason: c.notes });
      if (existingSource) {
        // Preserves previous records and previous last_success
        await db.prepare(`
          UPDATE sources
          SET status = 'BLOCKED', last_attempt = ?, data = ?
          WHERE id = ?
        `).bind(now, JSON.stringify(sourceData), sId).run();
      }
    } else {
      sourceData.status = c.status;
      unreachableSources.push({ id: sId, name: sName, status: c.status, reason: c.notes });
      if (existingSource) {
        // Preserves previous records and previous last_success
        await db.prepare(`
          UPDATE sources
          SET status = ?, last_attempt = ?, data = ?
          WHERE id = ?
        `).bind(c.status, now, JSON.stringify(sourceData), sId).run();
      }
    }

    // Process extracted opportunities from this connector
    for (const rawOpp of c.records) {
      const opp = normalizeRecord(rawOpp);
      const fingerprint = crypto.createHash('sha256').update(
        opp.source_id + '|' + (opp.reference || opp.source_url) + '|' + opp.title
      ).digest('hex');

      // Check if already in D1
      const existingOpp = await db.prepare(
        'SELECT id, fingerprint, status, deadline, title, organization, data FROM opportunities WHERE id = ? OR fingerprint = ?'
      ).bind(opp.id, fingerprint).first<any>();

      if (existingOpp) {
        let existingObj: any = {};
        try {
          existingObj = JSON.parse(existingOpp.data);
        } catch {}

        const hasChanged =
          existingOpp.status !== opp.status ||
          existingOpp.deadline !== opp.deadline ||
          existingOpp.title !== opp.title ||
          existingOpp.organization !== opp.organization ||
          existingObj.document_fee !== opp.document_fee ||
          JSON.stringify(existingObj.requirements || []) !== JSON.stringify(opp.requirements || []);

        if (hasChanged) {
          // Record old version
          await db.prepare(`
            INSERT INTO versions (opportunity_id, data, recorded_at)
            VALUES (?, ?, ?)
          `).bind(existingOpp.id, existingOpp.data, now).run();

          // Update opportunity
          await db.prepare(`
            UPDATE opportunities
            SET kind = ?, status = ?, deadline = ?, title = ?, city = ?, organization = ?, data = ?, updated_at = ?
            WHERE id = ?
          `).bind(
            opp.kind || 'tender',
            opp.status,
            opp.deadline || null,
            opp.title,
            opp.city || 'السعودية',
            opp.organization,
            JSON.stringify(opp),
            now,
            existingOpp.id
          ).run();

          updatedCount++;
          updatedRecords.push({ id: existingOpp.id, title: opp.title });
        } else {
          unchangedCount++;
        }
      } else {
        // Insert new opportunity
        await db.prepare(`
          INSERT INTO opportunities (id, fingerprint, source_id, kind, status, deadline, title, city, organization, data, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          opp.id,
          fingerprint,
          opp.source_id,
          opp.kind || 'tender',
          opp.status,
          opp.deadline || null,
          opp.title,
          opp.city || 'السعودية',
          opp.organization,
          JSON.stringify(opp),
          opp.last_verified || now,
          now
        ).run();

        newCount++;
        newRecords.push({ id: opp.id, title: opp.title, organization: opp.organization });
      }
    }
  }

  // Count preserved sources
  const totalSourcesCount = await db.prepare('SELECT COUNT(*) as count FROM sources').first<{ count: number }>();
  const totalSources = totalSourcesCount?.count || 0;
  const preservedSources = Math.max(0, totalSources - verifiedSources.length);

  const finishedAt = new Date().toISOString();
  const runPayload = {
    new_tenders: newCount,
    updated_tenders: updatedCount,
    closed_expired: closedCount,
    unchanged_tenders: unchangedCount,
    verified_sources: verifiedSources,
    failed_sources: failedSources,
    unreachable_sources: unreachableSources,
    preserved_sources: preservedSources,
    mode: 'MANUAL_REFRESH',
  };

  await db.prepare(`
    UPDATE runs
    SET finished_at = ?, status = 'completed', data = ?
    WHERE id = ?
  `).bind(finishedAt, JSON.stringify(runPayload), runId).run();

  await db.prepare(`
    INSERT INTO audit_logs (event, target, occurred_at, data)
    VALUES (?, ?, ?, ?)
  `).bind(
    'admin_manual_refresh',
    'HTTP_ADMIN',
    finishedAt,
    JSON.stringify({ run_id: runId, ...runPayload })
  ).run();

  let message = `تم التحديث بنجاح: اكتشاف ${newCount} منافسة جديدة، وتحديث ${updatedCount} منافسة، وإغلاق ${closedCount} منافسة منتهية. ` +
    `المصادر المباشرة المتحققة (${verifiedSources.length}): ${verifiedSources.join('، ') || 'لا يوجد'}. `;
  if (failedSources.length > 0) {
    message += `المصادر المحمية والمحفوظة (${failedSources.length}): ${failedSources.map(f => f.name).join('، ')}. `;
  }
  if (unreachableSources.length > 0) {
    message += `المصادر غير المتاحة (${unreachableSources.length}): ${unreachableSources.map(u => u.name).join('، ')}. `;
  }
  message += `جميع السجلات السابقة محفوظة بأمان في Cloudflare D1.`;

  return {
    ok: true,
    status: 200,
    message,
    run_id: runId,
    new_tenders: newCount,
    updated_tenders: updatedCount,
    closed_expired: closedCount,
    unchanged_tenders: unchangedCount,
    verified_sources: verifiedSources,
    failed_sources: failedSources,
    unreachable_sources: unreachableSources,
    preserved_sources: preservedSources,
    details: {
      new_records: newRecords,
      updated_records: updatedRecords,
      failed_sources: failedSources,
    },
  };
}

/**
 * Handles verified manual import for protected, blocked, or authorized sources.
 */
export async function importOpportunities(
  db: D1Database,
  adminToken: string,
  configuredAdminToken: string | undefined,
  body: any
): Promise<{ ok: boolean; status: number; message: string; imported?: number; new_records?: number; updated_records?: number }> {
  if (!verifyAdminToken(adminToken, configuredAdminToken)) {
    return {
      ok: false,
      status: 401,
      message: 'رمز المشرف غير صحيح أو غير مصرح به (يلزم توفير مفتاح لا يقل عن 32 حرفًا)',
    };
  }

  const rawItems = Array.isArray(body) ? body : Array.isArray(body?.opportunities) ? body.opportunities : [];
  if (rawItems.length === 0) {
    return {
      ok: false,
      status: 400,
      message: 'لم يتم توفير أي سجلات للاستيراد. أرسل مصفوفة opportunities في الطلب.',
    };
  }

  const sourceId = body?.source_id || rawItems[0]?.source_id || 'manual_import';
  const now = new Date().toISOString();
  let newCount = 0;
  let updatedCount = 0;

  for (const raw of rawItems) {
    const opp = normalizeRecord({ ...raw, source_id: raw.source_id || sourceId });
    const fingerprint = crypto.createHash('sha256').update(
      opp.source_id + '|' + (opp.reference || opp.source_url) + '|' + opp.title
    ).digest('hex');

    const existing = await db.prepare(
      'SELECT id, fingerprint, data FROM opportunities WHERE id = ? OR fingerprint = ?'
    ).bind(opp.id, fingerprint).first<any>();

    if (existing) {
      await db.prepare('INSERT INTO versions (opportunity_id, data, recorded_at) VALUES (?, ?, ?)').bind(existing.id, existing.data, now).run();
      await db.prepare(`
        UPDATE opportunities
        SET kind = ?, status = ?, deadline = ?, title = ?, city = ?, organization = ?, data = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        opp.kind || 'tender',
        opp.status,
        opp.deadline || null,
        opp.title,
        opp.city || 'السعودية',
        opp.organization,
        JSON.stringify(opp),
        now,
        existing.id
      ).run();
      updatedCount++;
    } else {
      await db.prepare(`
        INSERT INTO opportunities (id, fingerprint, source_id, kind, status, deadline, title, city, organization, data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        opp.id,
        fingerprint,
        opp.source_id,
        opp.kind || 'tender',
        opp.status,
        opp.deadline || null,
        opp.title,
        opp.city || 'السعودية',
        opp.organization,
        JSON.stringify(opp),
        opp.last_verified || now,
        now
      ).run();
      newCount++;
    }
  }

  // Update source record if exists
  await db.prepare(`
    UPDATE sources
    SET last_attempt = ?, last_success = ?, status = 'MANUAL_IMPORT'
    WHERE id = ?
  `).bind(now, now, sourceId).run();

  await db.prepare(`
    INSERT INTO audit_logs (event, target, occurred_at, data)
    VALUES (?, ?, ?, ?)
  `).bind(
    'admin_manual_import',
    sourceId,
    now,
    JSON.stringify({ total: rawItems.length, new_records: newCount, updated_records: updatedCount })
  ).run();

  return {
    ok: true,
    status: 200,
    message: `تم استيراد وتوثيق ${rawItems.length} سجل بنجاح (${newCount} جديد، ${updatedCount} محدث). السجلات محفوظة في D1.`,
    imported: rawItems.length,
    new_records: newCount,
    updated_records: updatedCount,
  };
}

export function escapeCsvCell(val: any): string {
  let s = String(val ?? '');
  if (['=', '+', '-', '@', '\t', '\r', '\n'].some((ch) => s.startsWith(ch))) {
    s = "'" + s;
  }
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function exportCsv(db: D1Database, params: any, sid?: string): Promise<string> {
  const result = await getOpportunities(db, { ...params, limit: 200, offset: 0 }, sid);
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
  const rows = result.items.map((r) => fields.map((f) => escapeCsvCell(r[f])).join(','));
  return '\uFEFF' + [header, ...rows].join('\r\n');
}
