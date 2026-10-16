import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canDeleteOwnedSchool, schoolDeletionErrorMessage } from '../owner-school-deletion.mjs';

const migration = readFileSync(new URL('../supabase/migrations/20261017003000_preview_confirmed_school_deletion.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('only an active owner may request a school deletion preview', () => {
  assert.equal(canDeleteOwnedSchool('owner', 'f63e1a2a-31a5-43a3-b2b4-6b7f8b50a190'), true);
  assert.equal(canDeleteOwnedSchool('admin', 'f63e1a2a-31a5-43a3-b2b4-6b7f8b50a190'), false);
  assert.equal(canDeleteOwnedSchool('owner', ''), false);
});

test('the UI presents a review stage and a separate explicit confirmation', () => {
  for (const id of ['previewOwnedSchoolDeletion', 'schoolDeletionPreview', 'schoolDeletionImpactList', 'confirmSchoolDeletionCheck', 'confirmDeleteOwnedSchool', 'cancelSchoolDeletion']) {
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(app, /preview_owned_school_deletion/);
  assert.match(app, /confirmSchoolDeletionCheck/);
  assert.match(app, /p_expected_counts/);
  assert.match(app, /حُذفت المدرسة نهائيًا/);
});

test('preview and delete RPCs require authenticated ownership and are not public', () => {
  assert.match(migration, /preview_owned_school_deletion\(p_library_id uuid\)/);
  assert.match(migration, /delete_owned_school\([\s\S]*p_expected_counts jsonb/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /auth\.uid\(\) IS NULL/);
  assert.match(migration, /m\.role = 'owner'/);
  assert.match(migration, /m\.status = 'active'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.preview_owned_school_deletion\(uuid\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.preview_owned_school_deletion\(uuid\) TO authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.delete_owned_school\(uuid, jsonb\) FROM PUBLIC, anon/);
});

test('impact preview includes school data, memberships, audit history and storage assets', () => {
  for (const key of ['libraries', 'library_profiles', 'library_memberships', 'branches', 'catalog_titles', 'holdings', 'inventory_checks', 'patrons', 'loans', 'reservations', 'visitors', 'interlibrary_requests', 'incoming_external_requests', 'audit_log', 'remaining_owned_libraries']) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  assert.match(migration, /storage\.objects/);
  assert.match(migration, /'storage_files'/);
  assert.match(migration, /p_expected_counts/);
  assert.match(migration, /impact_changed/);
});

test('delete removes children before no-action parents and audit history before the school row', () => {
  const removeRequests = migration.indexOf('DELETE FROM public.interlibrary_requests');
  const removeReservations = migration.indexOf('DELETE FROM public.reservations');
  const removeLoans = migration.indexOf('DELETE FROM public.loans');
  const removeHoldings = migration.indexOf('DELETE FROM public.holdings');
  const removeTitles = migration.indexOf('DELETE FROM public.catalog_titles');
  const removeBranches = migration.indexOf('DELETE FROM public.branches');
  const removeAudit = migration.indexOf('DELETE FROM public.audit_log');
  const removeLibrary = migration.indexOf('DELETE FROM public.libraries');
  assert.ok(removeRequests < removeTitles);
  assert.ok(removeReservations < removeHoldings);
  assert.ok(removeLoans < removeHoldings);
  assert.ok(removeHoldings < removeTitles);
  assert.ok(removeTitles < removeBranches);
  assert.ok(removeBranches < removeAudit);
  assert.ok(removeAudit < removeLibrary);
  assert.match(migration, /school_has_external_requests/);
  assert.match(migration, /last_owned_library/);
});

test('errors explain changed previews and records owned by other libraries', () => {
  assert.match(schoolDeletionErrorMessage('impact_changed'), /تغيّر عدد السجلات/);
  assert.match(schoolDeletionErrorMessage('school_has_external_requests'), /طلبات واردة/);
  assert.match(schoolDeletionErrorMessage('last_owned_library'), /آخر مكتبة/);
  assert.match(schoolDeletionErrorMessage('unexpected'), /تعذّر حذف المدرسة/);
});
