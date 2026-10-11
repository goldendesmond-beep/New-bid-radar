import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalD1Database } from '../src/d1.js';
import { initDatabase } from '../src/repository.js';
import { handleRequest } from '../src/worker.js';
import type { Env } from '../src/types.js';

const ADMIN_TOKEN = 'test_admin_token_with_more_than_32_characters_secret';

async function setupTestEnv(): Promise<Env> {
  const db = await createLocalD1Database(':memory:');
  const sampleOpps = [
    {
      id: 'opp-t1',
      source_id: 'ksau_hs',
      kind: 'tender',
      status: 'open',
      title: 'توريد معدات طبية متخصصة',
      organization: 'مستشفى الملك فهد',
      source_url: 'https://example.com/t1',
      deadline: '2028-12-31',
      city: 'الرياض',
      sectors: ['supplies', 'maintenance'],
      confidence: 95,
      last_verified: '2026-10-10T12:00:00Z',
    },
    {
      id: 'opp-t2',
      source_id: 'hotel_source',
      kind: 'tender',
      status: 'open',
      title: 'مشروع تأثيث وضيافة فندقية',
      organization: 'شركة المشاريع السياحية',
      source_url: 'https://example.com/t2',
      deadline: '2028-06-30',
      city: 'جدة',
      sectors: ['hospitality'],
      confidence: 90,
      last_verified: '2026-10-10T12:00:00Z',
    },
    {
      id: 'opp-reg1',
      source_id: 'supplier_portal',
      kind: 'supplier_registration',
      status: 'registration_available',
      title: 'بوابة تسجيل موردي قطاع التشييد والمقاولات',
      organization: 'أمانة منطقة الرياض',
      source_url: 'https://example.com/reg1',
      registration_url: 'https://example.com/register',
      city: 'الرياض',
      sectors: ['construction'],
      confidence: 90,
      last_verified: '2026-10-10T12:00:00Z',
    },
  ];

  const sampleSources = [
    {
      id: 'ksau_hs',
      name: 'جامعة الملك سعود للعلوم الصحية',
      url: 'https://example.com/ksau',
      status: 'MANUAL_IMPORT',
    },
  ];

  await initDatabase(db, sampleOpps, sampleSources);

  return {
    DB: db,
    BIDPILOT_ADMIN_TOKEN: ADMIN_TOKEN,
    ZERO_COST_ONLY: 'true',
  };
}

test('API - GET /api/session returns csrf and sets cookie', async () => {
  const env = await setupTestEnv();
  const req = new Request('http://localhost:3000/api/session', { method: 'GET' });
  const res = await handleRequest(req, env);

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(data.csrf);
  assert.ok(data.privacy);
  const setCookie = res.headers.get('Set-Cookie');
  assert.ok(setCookie?.includes('bidpilot_session='));
});

test('API - GET /api/meta returns sectors and engines', async () => {
  const env = await setupTestEnv();
  const req = new Request('http://localhost:3000/api/meta', { method: 'GET' });
  const res = await handleRequest(req, env);

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(data.sectors.construction);
  assert.ok(data.sectors.hospitality);
  assert.ok(data.sectors.manpower);
  assert.ok(data.engines.length >= 2);
});

test('API - GET /api/summary returns correct tender metrics', async () => {
  const env = await setupTestEnv();
  const req = new Request('http://localhost:3000/api/summary', { method: 'GET' });
  const res = await handleRequest(req, env);

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.total, 3);
  assert.strictEqual(data.tenders, 2);
  assert.strictEqual(data.open, 2);
  assert.strictEqual(data.registrations, 1);
  assert.strictEqual(data.zero_cost_only, true);
});

test('API - GET /api/sources returns source list and manual-only mode', async () => {
  const env = await setupTestEnv();
  const req = new Request('http://localhost:3000/api/sources', { method: 'GET' });
  const res = await handleRequest(req, env);

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.items.length, 1);
  assert.strictEqual(data.scheduler.active, false);
  assert.strictEqual(data.scheduler.mode, 'manual_only');
});

test('API - GET /api/opportunities filters by sector, status, query and procurement_only', async () => {
  const env = await setupTestEnv();

  // Filter hospitality
  const reqHosp = new Request('http://localhost:3000/api/opportunities?sector=hospitality', { method: 'GET' });
  const resHosp = await handleRequest(reqHosp, env);
  const dataHosp = await resHosp.json();
  assert.strictEqual(dataHosp.total, 1);
  assert.strictEqual(dataHosp.items[0].id, 'opp-t2');

  // Filter procurement only (excludes supplier_registration)
  const reqProc = new Request('http://localhost:3000/api/opportunities?procurement_only=true', { method: 'GET' });
  const resProc = await handleRequest(reqProc, env);
  const dataProc = await resProc.json();
  assert.strictEqual(dataProc.total, 2);

  // Search query
  const reqQ = new Request('http://localhost:3000/api/opportunities?q=معدات+طبية', { method: 'GET' });
  const resQ = await handleRequest(reqQ, env);
  const dataQ = await resQ.json();
  assert.strictEqual(dataQ.total, 1);
  assert.strictEqual(dataQ.items[0].id, 'opp-t1');
});

test('API - GET /api/opportunities/:id returns single record', async () => {
  const env = await setupTestEnv();
  const req = new Request('http://localhost:3000/api/opportunities/opp-t1', { method: 'GET' });
  const res = await handleRequest(req, env);

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.id, 'opp-t1');
  assert.strictEqual(data.title, 'توريد معدات طبية متخصصة');
});

test('API - Company profile update and persistence', async () => {
  const env = await setupTestEnv();

  // Create session first
  const sessionRes = await handleRequest(new Request('http://localhost:3000/api/session'), env);
  const cookieHeader = sessionRes.headers.get('Set-Cookie')!;
  const sid = cookieHeader.split(';')[0];

  const updateReq = new Request('http://localhost:3000/api/company', {
    method: 'POST',
    headers: {
      'Cookie': sid,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'شركة التوريد والخدمات',
      size: 'small',
      city: 'الرياض',
      sectors: ['supplies'],
      services: 'توريد مستلزمات طبية',
    }),
  });

  const updateRes = await handleRequest(updateReq, env);
  assert.strictEqual(updateRes.status, 200);

  // Fetch updated profile
  const getReq = new Request('http://localhost:3000/api/company', {
    method: 'GET',
    headers: { 'Cookie': sid },
  });
  const getRes = await handleRequest(getReq, env);
  const profile = await getRes.json();
  assert.strictEqual(profile.name, 'شركة التوريد والخدمات');
  assert.deepStrictEqual(profile.sectors, ['supplies']);
});

test('API - Opportunity tracking update', async () => {
  const env = await setupTestEnv();

  const sessionRes = await handleRequest(new Request('http://localhost:3000/api/session'), env);
  const cookieHeader = sessionRes.headers.get('Set-Cookie')!;
  const sid = cookieHeader.split(';')[0];

  const trackReq = new Request('http://localhost:3000/api/saved/opp-t1', {
    method: 'POST',
    headers: {
      'Cookie': sid,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stage: 'reviewing',
      notes: 'قيد المراجعة الفنية',
    }),
  });

  const trackRes = await handleRequest(trackReq, env);
  assert.strictEqual(trackRes.status, 200);

  const getOpp = await handleRequest(new Request('http://localhost:3000/api/opportunities/opp-t1', {
    headers: { 'Cookie': sid },
  }), env);
  const oppData = await getOpp.json();
  assert.strictEqual(oppData.saved, true);
  assert.strictEqual(oppData.tracking?.stage, 'reviewing');
});

test('API - Export CSV contains proper UTF-8 BOM and headers', async () => {
  const env = await setupTestEnv();
  const req = new Request('http://localhost:3000/api/export.csv', { method: 'GET' });
  const res = await handleRequest(req, env);

  assert.strictEqual(res.status, 200);
  assert.ok(res.headers.get('Content-Type')?.includes('text/csv'));
  const buf = new Uint8Array(await res.arrayBuffer());
  // Verify UTF-8 BOM bytes 0xEF, 0xBB, 0xBF
  assert.strictEqual(buf[0], 0xEF);
  assert.strictEqual(buf[1], 0xBB);
  assert.strictEqual(buf[2], 0xBF);
  const text = new TextDecoder('utf-8').decode(buf.slice(3));
  assert.ok(text.startsWith('title,organization,kind'));
  assert.ok(text.includes('توريد معدات طبية متخصصة'));
});

test('API - Admin refresh security enforcement', async () => {
  const env = await setupTestEnv();

  // Missing Authorization header -> 401
  const reqNoAuth = new Request('http://localhost:3000/api/admin/refresh', { method: 'POST' });
  const resNoAuth = await handleRequest(reqNoAuth, env);
  assert.strictEqual(resNoAuth.status, 401);

  // Invalid token -> 401
  const reqBadAuth = new Request('http://localhost:3000/api/admin/refresh', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer wrong_token_attempt' },
  });
  const resBadAuth = await handleRequest(reqBadAuth, env);
  assert.strictEqual(resBadAuth.status, 401);

  // Valid token -> 200
  const reqGoodAuth = new Request('http://localhost:3000/api/admin/refresh', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` },
  });
  const resGoodAuth = await handleRequest(reqGoodAuth, env);
  assert.strictEqual(resGoodAuth.status, 200);
  const goodData = await resGoodAuth.json();
  assert.strictEqual(goodData.ok, true);
  assert.ok(goodData.message);
  assert.ok(typeof goodData.new_tenders === 'number');
  assert.ok(typeof goodData.updated_tenders === 'number');
  assert.ok(typeof goodData.closed_expired === 'number');
  assert.ok(Array.isArray(goodData.verified_sources));
  assert.ok(Array.isArray(goodData.failed_sources));
  assert.ok(Array.isArray(goodData.unreachable_sources));
  assert.ok(typeof goodData.preserved_sources === 'number');
});

test('API - POST /api/admin/import verified manual import', async () => {
  const env = await setupTestEnv();

  const payload = {
    source_id: 'ksau_hs',
    opportunities: [
      {
        id: 'ksau-api-manual-1',
        title: 'عقد استشارات هندسية',
        organization: 'جامعة الملك سعود للعلوم الصحية',
        kind: 'tender',
        status: 'open',
        deadline: '2028-01-01',
        city: 'الرياض',
        sectors: ['consulting'],
        reference: 'KSAU-ENG-101',
        source_url: 'https://ksau-hs.edu.sa/101',
      },
    ],
  };

  // Unauthorized import
  const unauthReq = new Request('http://localhost:3000/api/admin/import', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer bad_token', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const unauthRes = await handleRequest(unauthReq, env);
  assert.strictEqual(unauthRes.status, 401);

  // Authorized import
  const authReq = new Request('http://localhost:3000/api/admin/import', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const authRes = await handleRequest(authReq, env);
  assert.strictEqual(authRes.status, 200);
  const data = await authRes.json();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.imported, 1);
  assert.strictEqual(data.new_records, 1);
});

