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
  importOpportunities,
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

test('D1 Database - Discovery, deduplication, and version tracking during refresh', async () => {
  const db = await createLocalD1Database(':memory:');
  const initialOpp = {
    id: 'etimad-existing-1',
    source_id: 'etimad',
    kind: 'tender',
    status: 'open',
    title: 'مشروع صيانة شبكات المياه والمضخات',
    organization: 'وزارة البيئة والمياه والزراعة',
    source_url: 'https://tenders.etimad.sa/1',
    deadline: '2027-01-01',
    requirements: ['شهادة تصنيف'],
  };
  await initDatabase(db, [initialOpp]);

  const adminToken = 'admin_secret_token_at_least_32_characters_long';

  // Mock connector returning:
  // 1. One updated version of existing tender (deadline and requirements changed)
  // 2. One brand new tender
  const mockConnectors = async () => [
    {
      sourceId: 'etimad',
      sourceName: 'منصة اعتماد',
      status: 'LIVE' as const,
      success: true,
      records: [
        {
          id: 'etimad-existing-1',
          source_id: 'etimad',
          kind: 'tender',
          status: 'open',
          title: 'مشروع صيانة شبكات المياه والمضخات',
          organization: 'وزارة البيئة والمياه والزراعة',
          source_url: 'https://tenders.etimad.sa/1',
          deadline: '2027-06-30', // Updated deadline
          requirements: ['شهادة تصنيف', 'ضمان بنكي إلكتروني'], // Updated requirements
        },
        {
          id: 'etimad-new-2',
          source_id: 'etimad',
          kind: 'tender',
          status: 'open',
          title: 'توريد وتركيب أجهزة استشعار بيئية',
          organization: 'المركز الوطني للأرصاد',
          source_url: 'https://tenders.etimad.sa/2',
          deadline: '2027-03-15',
          requirements: ['سجل تجاري ساري'],
        },
      ],
      notes: 'تم الاتصال بنجاح واستخراج 2 منافسة.',
      publicAccess: 'LIVE',
    },
    {
      sourceId: 'taqeem',
      sourceName: 'الهيئة السعودية للمقيّمين المعتمدين',
      status: 'BLOCKED' as const,
      success: false,
      records: [],
      notes: 'حماية منع الوصول الآلي (403 Forbidden). السجلات السابقة محفوظة.',
      publicAccess: 'BLOCKED',
    },
  ];

  const result = await refreshOpportunities(db, `Bearer ${adminToken}`, adminToken, {
    connectors: mockConnectors,
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.new_tenders, 1, 'Should discover exactly 1 new tender');
  assert.strictEqual(result.updated_tenders, 1, 'Should update exactly 1 changed tender');
  assert.strictEqual(result.verified_sources.length, 1);
  assert.strictEqual(result.verified_sources[0], 'منصة اعتماد');
  assert.strictEqual(result.failed_sources.length, 1);
  assert.strictEqual(result.failed_sources[0].status, 'BLOCKED');

  // Verify updated opportunity in D1 has new deadline
  const updated = await getOpportunityById(db, 'etimad-existing-1');
  assert.strictEqual(updated.deadline, '2027-06-30');
  assert.strictEqual(updated.requirements.length, 2);

  // Verify version history was created in versions table
  const versionRow = await db.prepare('SELECT * FROM versions WHERE opportunity_id = ?').bind('etimad-existing-1').first<any>();
  assert.ok(versionRow, 'Previous version must be recorded');
  const prevData = JSON.parse(versionRow.data);
  assert.strictEqual(prevData.deadline, '2027-01-01', 'Previous version captured original deadline');

  // Verify new opportunity was inserted
  const brandNew = await getOpportunityById(db, 'etimad-new-2');
  assert.ok(brandNew);
  assert.strictEqual(brandNew.title, 'توريد وتركيب أجهزة استشعار بيئية');
});

test('D1 Database - Preservation of existing records when a source fails or is blocked', async () => {
  const db = await createLocalD1Database(':memory:');
  const taqeemOpp = {
    id: 'taqeem-tender-1',
    source_id: 'taqeem',
    kind: 'tender',
    status: 'open',
    title: 'تطوير المنظومة الإلكترونية للتقييم',
    organization: 'هيئة المقيمين',
    source_url: 'https://taqeem.gov.sa/tenders/1',
    deadline: '2028-01-01',
  };
  await initDatabase(db, [taqeemOpp]);

  const adminToken = 'admin_secret_token_at_least_32_characters_long';

  // Mock connector returning complete failure / 403 blocked for taqeem
  const mockConnectors = async () => [
    {
      sourceId: 'taqeem',
      sourceName: 'الهيئة السعودية للمقيّمين المعتمدين',
      status: 'BLOCKED' as const,
      success: false,
      records: [],
      notes: 'HTTP 403 Forbidden. السجلات السابقة محفوظة.',
      publicAccess: 'BLOCKED',
    },
  ];

  const result = await refreshOpportunities(db, `Bearer ${adminToken}`, adminToken, {
    connectors: mockConnectors,
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.failed_sources.length, 1);
  assert.strictEqual(result.failed_sources[0].id, 'taqeem');

  // Crucial check: Existing record for taqeem MUST still exist in D1!
  const opp = await getOpportunityById(db, 'taqeem-tender-1');
  assert.ok(opp, 'Previous record must be preserved when source fails');
  assert.strictEqual(opp.title, 'تطوير المنظومة الإلكترونية للتقييم');
  assert.strictEqual(opp.status, 'open');
});

test('D1 Database - Verified manual import via importOpportunities', async () => {
  const db = await createLocalD1Database(':memory:');
  await initDatabase(db);

  const adminToken = 'admin_secret_token_at_least_32_characters_long';

  const payload = {
    source_id: 'ksau_hs',
    opportunities: [
      {
        id: 'ksau-manual-1',
        title: 'صيانة مبنى الكليات الصحية',
        organization: 'جامعة الملك سعود للعلوم الصحية',
        kind: 'tender',
        status: 'open',
        deadline: '2027-11-20',
        city: 'الرياض',
        sectors: ['maintenance', 'construction'],
        reference: 'KSAU-2026-44',
        source_url: 'https://ksau-hs.edu.sa/biddings/44',
      },
    ],
  };

  // Unauthorized import
  const fail = await importOpportunities(db, 'bad_token', adminToken, payload);
  assert.strictEqual(fail.ok, false);
  assert.strictEqual(fail.status, 401);

  // Authorized import
  const success = await importOpportunities(db, `Bearer ${adminToken}`, adminToken, payload);
  assert.strictEqual(success.ok, true);
  assert.strictEqual(success.status, 200);
  assert.strictEqual(success.imported, 1);
  assert.strictEqual(success.new_records, 1);

  // Verify in D1
  const importedOpp = await getOpportunityById(db, 'ksau-manual-1');
  assert.ok(importedOpp);
  assert.strictEqual(importedOpp.title, 'صيانة مبنى الكليات الصحية');
  assert.strictEqual(importedOpp.organization, 'جامعة الملك سعود للعلوم الصحية');
  assert.strictEqual(importedOpp.city, 'الرياض');
});

