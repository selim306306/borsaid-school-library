import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { shouldShowSchoolNameOnHomepage } from '../school-homepage-branding.mjs';

const migration = readFileSync(new URL('../supabase/migrations/20261016225711_school_homepage_name_visibility.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('homepage school-name visibility defaults to visible and can be hidden independently', () => {
  assert.equal(shouldShowSchoolNameOnHomepage({ is_public: true }), true);
  assert.equal(shouldShowSchoolNameOnHomepage({ is_public: true, show_school_name_on_homepage: true }), true);
  assert.equal(shouldShowSchoolNameOnHomepage({ is_public: true, show_school_name_on_homepage: false }), false);
  assert.equal(shouldShowSchoolNameOnHomepage({ is_public: false, show_school_name_on_homepage: true }), true);
});

test('the migration adds only an additive homepage-name setting and preserves existing display by default', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS show_school_name_on_homepage boolean NOT NULL DEFAULT true/);
  assert.match(migration, /does not change directory publication, the school logo, the Egypt mark, or any school data/i);
  assert.match(app, /\.update\(\{ show_school_name_on_homepage: visible/);
  assert.match(app, /show_school_name_on_homepage: currentLibraryProfile\?\.show_school_name_on_homepage !== false/);
});

test('the owner UI offers a named school choice and separate homepage-only and permanent-delete actions', () => {
  assert.ok(html.includes('id="ownedSchoolActionSelect"'));
  assert.ok(html.includes('id="toggleHomepageSchoolName"'));
  assert.ok(html.includes('id="previewOwnedSchoolDeletion"'));
  assert.match(html, /الصفحة الرئيسية فقط/);
  assert.match(html, /معاينة أثر الحذف النهائي/);
  assert.match(app, /refreshOwnedSchoolActionChoices/);
  assert.match(app, /p_expected_counts/);
});
