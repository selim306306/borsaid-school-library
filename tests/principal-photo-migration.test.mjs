import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261017130000_principal_photo_path.sql', import.meta.url), 'utf8');
const originalBrandingMigration = readFileSync(new URL('../supabase/migrations/20261015013000_library_profiles_and_branding.sql', import.meta.url), 'utf8');

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const principalPath = `' ^ ' || library_id::text || '/principal-photo-${uuid}$'`.replace(/^' \^ '/, "'^'");
const storagePath = `name ~ '^${uuid}/principal-photo-${uuid}$'`;

 test('migration adds a nullable principal photo path constrained to its library UUID path', () => {
  assert.match(migration, /alter table public\.library_profiles[\s\S]*add column if not exists principal_photo_path text/);
  assert.match(migration, /principal_photo_path is null/);
  assert.ok(migration.includes(principalPath));
  assert.match(migration, /grant select \(principal_photo_path\) on public\.library_profiles to anon, authenticated/);
  assert.match(migration, /grant update \(principal_photo_path\) on public\.library_profiles to authenticated/);
});

test('migration adds narrowly scoped owner-only principal photo insert and delete policies', () => {
  assert.match(migration, /create policy school_branding_principal_photo_owner_insert[\s\S]*on storage\.objects for insert to authenticated/);
  assert.match(migration, /create policy school_branding_principal_photo_owner_delete[\s\S]*on storage\.objects for delete to authenticated/);
  assert.equal(migration.match(/bucket_id = 'school-branding'/g)?.length, 2);
  assert.equal(migration.split(storagePath).length - 1, 2);
  assert.equal((migration.match(/public\.has_library_role\(split_part\(name, '\/', 1\)::uuid, array\['owner'\]::text\[\]\)/g) || []).length, 2);
  assert.doesNotMatch(migration, /drop policy/i);
  assert.doesNotMatch(migration, /for update|for select/i);
});

test('existing school-branding policies remain untouched by the additive migration', () => {
  assert.match(originalBrandingMigration, /create policy school_branding_owner_insert/);
  assert.match(originalBrandingMigration, /create policy school_branding_owner_delete/);
  assert.match(originalBrandingMigration, /create policy school_branding_public_read/);
});
