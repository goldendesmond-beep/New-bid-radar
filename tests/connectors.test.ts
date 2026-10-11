import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchEtimadTenders,
  probeGeosa,
  probeDasc,
  probeTaqeem,
  probeDga,
  runAllConnectors,
} from '../src/connectors.js';

test('Connectors - Etimad live retrieval from official Saudi API', async () => {
  const result = await fetchEtimadTenders(5);

  assert.strictEqual(result.sourceId, 'etimad');
  assert.strictEqual(result.sourceName, 'منصة اعتماد');
  // Either successfully connected or gracefully handled if network throttles
  if (result.success) {
    assert.strictEqual(result.status, 'LIVE');
    assert.strictEqual(result.publicAccess, 'LIVE');
    assert.ok(result.records.length > 0, 'Should retrieve at least one active tender from Etimad');

    const first = result.records[0];
    assert.ok(first.id.startsWith('etimad-'), 'ID should be prefixed with etimad-');
    assert.ok(first.title.length > 0, 'Title should be populated');
    assert.ok(first.organization.length > 0, 'Organization should be populated');
    assert.ok(first.source_url.startsWith('https://tenders.etimad.sa/'), 'Source URL should point to Etimad');
    assert.strictEqual(first.apply_url, null, 'Direct apply_url should be null because Etimad requires CR sign-in');
    assert.strictEqual(first.apply_verified, false);
    assert.strictEqual(first.login_required, true);
    assert.strictEqual(first.verification_status, 'verified');
    assert.ok(Array.isArray(first.sectors), 'Sectors should be classified');
  } else {
    // If blocked or throttled by remote, status must be reported honestly
    assert.ok(['BLOCKED', 'DEGRADED', 'UNAVAILABLE'].includes(result.status));
    assert.strictEqual(result.records.length, 0);
  }
});

test('Connectors - Geosa official portal probing', async () => {
  const result = await probeGeosa();
  assert.strictEqual(result.sourceId, 'geosa');
  assert.ok(['LIVE', 'DEGRADED', 'UNAVAILABLE'].includes(result.status));
  // Does not fabricate records; existing historical records in D1 remain preserved
  assert.strictEqual(result.records.length, 0);
  assert.ok(result.notes.length > 0);
});

test('Connectors - DASC official portal probing', async () => {
  const result = await probeDasc();
  assert.strictEqual(result.sourceId, 'dasc');
  assert.ok(['LIVE', 'DEGRADED', 'UNAVAILABLE'].includes(result.status));
  assert.strictEqual(result.records.length, 0);
  assert.ok(result.notes.length > 0);
});

test('Connectors - Taqeem bot protection correctly detected and reported', async () => {
  const result = await probeTaqeem();
  assert.strictEqual(result.sourceId, 'taqeem');
  // Taqeem returns HTTP 403 Forbidden under automated access
  if (result.status === 'BLOCKED') {
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.publicAccess, 'BLOCKED');
    assert.ok(result.notes.includes('403') || result.notes.includes('الوصول مرفوض'));
  } else {
    assert.ok(['LIVE', 'DEGRADED', 'UNAVAILABLE'].includes(result.status));
  }
});

test('Connectors - DGA protection detection', async () => {
  const result = await probeDga();
  assert.strictEqual(result.sourceId, 'dga');
  assert.ok(['BLOCKED', 'LIVE', 'DEGRADED', 'UNAVAILABLE'].includes(result.status));
});

test('Connectors - runAllConnectors executes all official sources in parallel', async () => {
  const results = await runAllConnectors();
  assert.ok(Array.isArray(results));
  assert.strictEqual(results.length, 5);

  const sourceIds = results.map((r) => r.sourceId);
  assert.ok(sourceIds.includes('etimad'));
  assert.ok(sourceIds.includes('geosa'));
  assert.ok(sourceIds.includes('dasc'));
  assert.ok(sourceIds.includes('taqeem'));
  assert.ok(sourceIds.includes('dga'));

  // Ensure no source is marked LIVE unless actually verified with success: true
  for (const r of results) {
    if (r.status === 'LIVE') {
      assert.strictEqual(r.success, true, `${r.sourceId} marked LIVE must have success=true`);
    } else {
      assert.strictEqual(r.success, false, `${r.sourceId} not LIVE must have success=false`);
    }
  }
});
