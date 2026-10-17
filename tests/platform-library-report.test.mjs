import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anonymousPlatformReport,
  hasPlatformOwnerAccess,
  libraryHasOperationalData,
} from '../platform-library-report.mjs';

const officialLibrary = 'a70f6fa4-0dc1-4612-9280-6c2a8e049dd4';

test('platform report requires an active owner membership in a designated site library', () => {
  assert.equal(hasPlatformOwnerAccess([{ library_id: officialLibrary, role: 'owner', status: 'active' }]), true);
  assert.equal(hasPlatformOwnerAccess([{ library_id: officialLibrary, role: 'admin', status: 'active' }]), false);
  assert.equal(hasPlatformOwnerAccess([{ library_id: officialLibrary, role: 'owner', status: 'suspended' }]), false);
  assert.equal(hasPlatformOwnerAccess([{ library_id: '00000000-0000-4000-8000-000000000001', role: 'owner', status: 'active' }]), false);
  assert.equal(hasPlatformOwnerAccess([]), false);
});

test('AI payload contains only anonymous aggregate counts and no library names or identifiers', () => {
  const anonymized = anonymousPlatformReport({
    totals: { branches: 2, titles: 12, copies: 20, available: 7, lost: 1, open_loans: 3, overdue_loans: 1, queued_reservations: 2, ready_reservations: 0 },
    libraries: [{ name: 'اسم مدرسة خاص', id: 'private-library-id', titles: 5 }, { name: 'اسم آخر', id: 'another-id', titles: 7 }, { name: 'اسم ثالث', id: 'third-id', titles: 1 }],
  });
  const serialized = JSON.stringify(anonymized);
  assert.match(serialized, /مكتبة 1/);
  assert.match(serialized, /مكتبة 2/);
  assert.match(serialized, /مكتبة 3/);
  assert.doesNotMatch(serialized, /اسم مدرسة خاص|اسم آخر|private-library-id|another-id/);
  assert.equal(anonymized.libraries[0].titles, 5);
});

test('empty inventory and operations are reported as no recorded data, not a quality judgment', () => {
  assert.equal(libraryHasOperationalData({ titles: 0, copies: 0, branches: 0, open_loans: 0, overdue_loans: 0 }), false);
  assert.equal(libraryHasOperationalData({ titles: 1, copies: 0, branches: 0 }), true);
});
