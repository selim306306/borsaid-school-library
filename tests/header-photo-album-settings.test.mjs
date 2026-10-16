import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const publicMedia = readFileSync(new URL('../site-media-public.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261016190000_header_photo_album_and_timing.sql', import.meta.url), 'utf8');

test('album offers 25 total slides and owner-editable timing from 2 to 30 seconds', () => {
  assert.match(html, /حتى 25 صورة إجمالًا/);
  assert.match(html, /id="addHeaderGalleryPhoto"/);
  assert.match(html, /id="headerGallerySettingsForm"/);
  assert.match(html, /<option value="2">/);
  assert.match(html, /<option value="30">/);
  assert.match(app, /HEADER_GALLERY_MAX_PHOTOS = 25/);
  assert.match(publicMedia, /header-gallery-updated/);
});

test('database migration only grants dynamic gallery slot changes to site media admins', () => {
  assert.match(migration, /2\[0-5\]/);
  assert.match(migration, /site_media_slots_admin_gallery_insert[\s\S]*?public\.is_site_media_admin\(\)/);
  assert.match(migration, /site_media_slots_admin_gallery_delete[\s\S]*?public\.is_site_media_admin\(\)/);
  assert.match(migration, /site_banner_settings_admin_update[\s\S]*?public\.is_site_media_admin\(\)/);
  assert.match(migration, /interval_seconds between 2 and 30/);
  assert.match(migration, /grant select on public\.site_banner_settings to anon, authenticated/);
  assert.doesNotMatch(migration, /grant update \([^)]*\) on public\.site_banner_settings to anon/);
});
