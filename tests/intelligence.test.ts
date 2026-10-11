import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, classify, relevance, fit, SECTORS, engines } from '../src/intelligence.js';

test('Intelligence - Arabic text normalization', () => {
  assert.strictEqual(normalize('إدارة أمن وأمان'), 'ادارة امن وامان');
  assert.strictEqual(normalize('مُسْتَشْفَى'), 'مستشفي');
  assert.strictEqual(normalize(''), '');
  assert.strictEqual(normalize(null), '');
});

test('Intelligence - Sector classification', () => {
  const constructionHits = classify('مشروع إنشاء وتشييد مباني سكنية');
  assert.ok(constructionHits.includes('construction'));

  const hospitalityHits = classify('تشغيل وإدارة منتجع وفندق سياحي');
  assert.ok(hospitalityHits.includes('hospitality'));

  const manpowerHits = classify('عقد توريد عمالة مهنية وقوى عاملة');
  assert.ok(manpowerHits.includes('manpower'));

  const housekeepingHits = classify('خدمات تدبير فندقي وتنظيف غرف');
  assert.ok(housekeepingHits.includes('housekeeping'));

  const maintenanceHits = classify('صيانة وتشغيل أنظمة التكييف والكهرباء');
  assert.ok(maintenanceHits.includes('maintenance'));
  assert.ok(maintenanceHits.includes('mep'));
});

test('Intelligence - All 20 sectors are registered', () => {
  const requiredSectors = [
    'construction', 'hospitality', 'manpower', 'housekeeping', 'cleaning',
    'facilities', 'maintenance', 'catering', 'security', 'laundry',
    'logistics', 'landscaping', 'supplies', 'services', 'general_contracting',
    'mep', 'renovation', 'hotel_renovation', 'waste', 'subcontracting'
  ];
  for (const s of requiredSectors) {
    assert.ok(SECTORS[s], `Sector ${s} should be defined`);
    assert.ok(SECTORS[s][0].length > 0, `Sector ${s} should have Arabic label`);
    assert.ok(SECTORS[s][1].length > 0, `Sector ${s} should have English label`);
  }
});

test('Intelligence - Lexical relevance scoring', () => {
  const record = {
    title: 'منافسة توريد وتركيب كاميرات مراقبة أمنية',
    organization: 'جامعة الملك سعود',
    description: 'كاميرات مراقبة رقمية وغرفة تحكم',
    sectors: ['security', 'supplies'],
  };

  const exactMatch = relevance('كاميرات', record);
  assert.strictEqual(exactMatch, 1.0);

  const sectorMatch = relevance('أمن وحراسة', record);
  assert.strictEqual(sectorMatch, 0.75);

  const noMatch = relevance('أعمال زراعة ونخيل', record);
  assert.strictEqual(noMatch, 0);
});

test('Intelligence - Company fit calculation', () => {
  const record = {
    title: 'أعمال صيانة كهربائية وميكانيكية للمستشفى',
    city: 'الرياض',
    sectors: ['maintenance', 'mep'],
  };

  // Company with matching sector and city
  const company1 = {
    name: 'شركة الصيانة الحديثة',
    city: 'الرياض',
    sectors: ['maintenance'],
    services: 'صيانة مباني وتشغيل كهرباء',
  };
  const fitResult1 = fit(record, company1);
  assert.ok(fitResult1.score !== null);
  assert.ok(fitResult1.score >= 70, 'Expected high fit score');
  assert.strictEqual(fitResult1.level, 'high');
  assert.ok(fitResult1.reasons.some((r: string) => r.includes('تطابق النشاط')));
  assert.ok(fitResult1.reasons.some((r: string) => r.includes('الموقع يطابق مدينة الشركة')));

  // Company with non-matching sector
  const company2 = {
    name: 'شركة المقاولات العامة',
    city: 'جدة',
    sectors: ['laundry'],
    services: 'مغاسل',
  };
  const fitResult2 = fit(record, company2);
  assert.ok(fitResult2.score !== null);
  assert.ok(fitResult2.score < 40, 'Expected low fit score');
  assert.strictEqual(fitResult2.level, 'low');
});

test('Intelligence - Zero-cost analysis engines metadata', () => {
  const engs = engines();
  assert.ok(engs.length >= 2);
  assert.ok(engs.every((e) => e.cost === 0));
});
