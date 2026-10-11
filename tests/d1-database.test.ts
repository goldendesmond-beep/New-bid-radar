import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalD1Database } from '../src/d1.js';
import {
  initDatabase,
  getSession,
  saveCompany,
  getCompany,
  saveTracking,
  getSummary,
  getSources,
  getOpportunities,
  getOpportunityById,
  refreshOpportunities,
  verifyAdminToken,
} from '../src/repository.js';

test('D1 Database - Schema initialization and seeding', async () => {
  const db = await createLocalD1Database(':memory:');

  const sampleOpps = [
    {
      id: 'opp-1',
      source_id: 'ksau_hs',
      kind: 'tender',
      status: 'open',
      title: 'مشروع صيانة وتكييف المستشفى',
      organization: 'جامعة الملك سعود',
      source_url: 'https://example.com/opp1',
      deadline: '2028-12-31',
      city: 'الرياض',
      sectors: ['maintenance'],
      confidence: 90,
      last_verified: '2026-10-10T12:00:00Z',
    },
    {
      id: 'opp-2',
      source_id: 'etimad',
      kind: 'supplier_registration',
      status: 'registration_available',
      title: 'بوابة تسجيل الموردين للخدمات الفندقية',
      organization: 'هيئة السياحة',
      source_url: 'https://example.com/opp2',
      registration_url: 'https://example.com/reg',
      city: 'جدة',
      sectors: ['hospitality'],
      confidence: 85,
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

  const sources = await getSources(db);
  assert.strictEqual(sources.length, 1);
  assert.strictEqual(sources[0].id, 'ksau_hs');

  const summary = await getSummary(db);
  assert.strictEqual(summary.total, 2);
  assert.strictEqual(summary.tenders, 1);
  assert.strictEqual(summary.open, 1);
  assert.strictEqual(summary.registrations, 1);
  assert.strictEqual(summary.last_run, null, 'Initial last_run should be null');
});

test('D1 Database - Session persistence', async () => {
  const db = await createLocalD1Database(':memory:');
  await initDatabase(db);

  // New session
  const { session, isNew } = await getSession(db);
  assert.strictEqual(isNew, true);
  assert.ok(session.id.length >= 20);
  assert.ok(session.csrf.length >= 20);

  // Retrieve existing session
  const retrieved = await getSession(db, session.id);
  assert.strictEqual(retrieved.isNew, false);
  assert.strictEqual(retrieved.session.id, session.id);
  assert.strictEqual(retrieved.session.csrf, session.csrf);
});

test('D1 Database - Company profile persistence and audit logging', async () => {
  const db = await createLocalD1Database(':memory:');
  await initDatabase(db);

  const { session } = await getSession(db);

  const savedProfile = await saveCompany(db, session.id, {
    name: 'شركة المقاولات المتحدة',
    size: 'medium',
    city: 'الرياض',
    sectors: ['construction', 'maintenance'],
    services: 'تنفيذ وإنشاء المباني',
    workers: 50,
  });

  assert.strictEqual(savedProfile.name, 'شركة المقاولات المتحدة');
  assert.strictEqual(savedProfile.size, 'medium');

  const retrieved = await getCompany(db, session.id);
  assert.strictEqual(retrieved.name, 'شركة المقاولات المتحدة');
  assert.deepStrictEqual(retrieved.sectors, ['construction', 'maintenance']);

  // Verify audit log
  const auditRow = await db.prepare('SELECT * FROM audit_logs WHERE event = ?').bind('company_updated').first<any>();
  assert.ok(auditRow);
});

test('D1 Database - Saved opportunities and application tracking', async () => {
  const db = await createLocalD1Database(':memory:');
  const sampleOpps = [
    {
      id: 'opp-track-1',
      source_id: 'ksau',
      kind: 'tender',
      status: 'open',
      title: 'منافسة توريد',
      organization: 'الجهة الحكومية',
      source_url: 'https://example.com',
      last_verified: '2026-10-10T12:00:00Z',
    },
  ];
  await initDatabase(db, sampleOpps);

  const { session } = await getSession(db);

  // Save opportunity with stage 'preparing'
  await saveTracking(db, session.id, 'opp-track-1', {
    stage: 'preparing',
    notes: 'تم البدء في تجهيز وثائق العرض المالي',
  });

  const opp = await getOpportunityById(db, 'opp-track-1', session.id);
  assert.ok(opp);
  assert.strictEqual(opp.saved, true);
  assert.strictEqual(opp.tracking.stage, 'preparing');
  assert.strictEqual(opp.tracking.notes, 'تم البدء في تجهيز وثائق العرض المالي');

  // Remove saved
  await saveTracking(db, session.id, 'opp-track-1', { stage: 'remove' });
  const oppAfterRemove = await getOpportunityById(db, 'opp-track-1', session.id);
  assert.strictEqual(oppAfterRemove.saved, false);
  assert.strictEqual(oppAfterRemove.tracking, null);
});

test('D1 Database - Security token verification', () => {
  const token = 'a_very_strong_admin_secret_token_at_least_32_characters';
  assert.strictEqual(verifyAdminToken(`Bearer ${token}`, token), true);
  assert.strictEqual(verifyAdminToken(token, token), true);
  assert.strictEqual(verifyAdminToken('Bearer wrong_token', token), false);
  assert.strictEqual(verifyAdminToken('', token), false);
  // Short tokens must be rejected
  assert.strictEqual(verifyAdminToken('short', 'short'), false);
});

test('D1 Database - Manual admin refresh lifecycle', async () => {
  const db = await createLocalD1Database(':memory:');
  const pastDeadline = '2020-01-01';
  const sampleOpps = [
    {
      id: 'opp-expired',
      source_id: 'test',
      kind: 'tender',
      status: 'open',
      title: 'منافسة قديمة',
      organization: 'جهة',
      source_url: 'https://example.com',
      deadline: pastDeadline,
      last_verified: '2026-10-10T12:00:00Z',
    },
  ];
  await initDatabase(db, sampleOpps);
  // Ensure the expired record is open to test that refreshOpportunities detects and closes it
  await db.prepare("UPDATE opportunities SET status = 'open' WHERE id = 'opp-expired'").run();

  const adminToken = 'production_admin_secret_minimum_32_chars_long';

  // Unauthorized refresh
  const failed = await refreshOpportunities(db, 'wrong', adminToken);
  assert.strictEqual(failed.ok, false);
  assert.strictEqual(failed.status, 401);

  // Authorized refresh
  const success = await refreshOpportunities(db, `Bearer ${adminToken}`, adminToken);
  assert.strictEqual(success.ok, true);
  assert.strictEqual(success.status, 200);
  assert.strictEqual(success.closed_expired, 1, 'Expired opportunity should be closed');

  // Verify status in DB is now closed
  const updatedOpp = await getOpportunityById(db, 'opp-expired');
  assert.strictEqual(updatedOpp.status, 'closed');

  // Verify run is recorded in runs table
  const summary = await getSummary(db);
  assert.ok(summary.last_run !== null);
  assert.strictEqual(summary.last_run.status, 'completed');
});
