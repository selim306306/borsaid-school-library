import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderPublicProfilesAsSoonAsAvailable, shouldShowSchoolNameOnHomepage } from '../school-homepage-branding.mjs';

const migration = readFileSync(new URL('../supabase/migrations/20261016225711_school_homepage_name_visibility.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('homepage school-name visibility defaults to visible and can be hidden independently', () => {
  assert.equal(shouldShowSchoolNameOnHomepage({ is_public: true }), true);
  assert.equal(shouldShowSchoolNameOnHomepage({ is_public: true, show_school_name_on_homepage: true }), true);
  assert.equal(shouldShowSchoolNameOnHomepage({ is_public: true, show_school_name_on_homepage: false }), false);
  assert.equal(shouldShowSchoolNameOnHomepage({ is_public: false, show_school_name_on_homepage: true }), true);
});

test('public school profiles render before a slower branch-directory request completes', async () => {
  let resolveProfiles;
  let resolveBranches;
  const profilesRequest = new Promise(resolve => { resolveProfiles = resolve; });
  const branchesRequest = new Promise(resolve => { resolveBranches = resolve; });
  let renderedProfiles = null;
  const decoratedProfilesRequest = renderPublicProfilesAsSoonAsAvailable(profilesRequest, profiles => {
    renderedProfiles = profiles;
  });
  const allRequests = Promise.all([decoratedProfilesRequest, branchesRequest]);

  resolveProfiles({ data: [{ library_id: 'test-library', school_name: 'مدرسة اختبار' }], error: null });
  await decoratedProfilesRequest;
  assert.deepEqual(renderedProfiles, [{ library_id: 'test-library', school_name: 'مدرسة اختبار' }]);

  let allRequestsSettled = false;
  allRequests.then(() => { allRequestsSettled = true; });
  await Promise.resolve();
  assert.equal(allRequestsSettled, false);

  resolveBranches({ data: [], error: null });
  await allRequests;
});

test('the migration adds only an additive homepage-name setting and preserves existing display by default', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS show_school_name_on_homepage boolean NOT NULL DEFAULT true/);
  assert.match(migration, /does not change directory publication, the school logo, the Egypt mark, or any school data/i);
  assert.match(app, /\.update\(\{ show_school_name_on_homepage: visible/);
  assert.match(app, /show_school_name_on_homepage: currentLibraryProfile\?\.show_school_name_on_homepage !== false/);
});

test('public school profile data is painted immediately and only header logos bypass lazy loading', () => {
  const publicLoaderStart = app.indexOf('async function loadPublicBranches()');
  const publicLoaderEnd = app.indexOf('async function runPublicSearch()', publicLoaderStart);
  const publicLoader = app.slice(publicLoaderStart, publicLoaderEnd);
  assert.match(publicLoader, /renderPublicProfilesAsSoonAsAvailable/);
  assert.match(publicLoader, /paintBranches\(\[\], profiles\)/);
  assert.match(publicLoader, /paintBranches\(publicBranches, publicLibraryProfiles, false\)/);
  assert.match(app, /image\.loading = eager \? 'eager' : 'lazy'/);
  assert.match(app, /image\.fetchPriority = eager \? 'high' : 'low'/);
  assert.match(app, /bindPublicLogoFallback\(logo, publicLogoUrl\(profile\.school_logo_path, \{ original: true \}\), \{ eager: true \}\)/);
  assert.match(app, /await Promise\.all\(\[\s*loadSiteFooter\(\)\.catch\(\(\) => \{\}\),\s*loadPublicBranches\(\)/);
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
