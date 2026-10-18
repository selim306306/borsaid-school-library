import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fetchInitialPublicProfiles, publicBrandingLogoUrl, takeInitialPublicProfilesRequest, PUBLIC_PROFILE_COLUMNS } from '../school-branding-bootstrap.mjs';
import { deduplicatePublicSchoolProfiles } from '../school-homepage-branding.mjs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('early request is anonymous, no-store, and uses the same public projection as later refreshes', async () => {
  let call;
  const profiles = [{ school_name: 'اختبار محلي', is_public: true }];
  const result = await fetchInitialPublicProfiles(async (url, options) => {
    call = { url: new URL(url), options };
    return { ok: true, json: async () => profiles };
  });
  assert.equal(result.error, null);
  assert.deepEqual(result.data, profiles);
  assert.equal(call.url.origin, 'https://eahptkwvjcnixlzlyznh.supabase.co');
  assert.equal(call.url.pathname, '/rest/v1/library_profiles');
  assert.equal(call.url.searchParams.get('select'), PUBLIC_PROFILE_COLUMNS);
  assert.equal(call.url.searchParams.get('order'), 'school_name.asc');
  assert.equal(call.options.credentials, 'omit');
  assert.equal(call.options.cache, 'no-store');
  assert.equal(call.options.referrerPolicy, 'no-referrer');
  assert.deepEqual(Object.keys(call.options.headers), ['apikey']);
  assert.match(read('app.js'), /\.select\(PUBLIC_PROFILE_COLUMNS\)/);
  assert.doesNotMatch(PUBLIC_PROFILE_COLUMNS, /student|patron|borrower|email|phone/);
});

test('every new request sees current visibility and name, not a saved profile snapshot', async () => {
  let data = [{ school_name: 'اختبار أول', show_school_name_on_homepage: true }];
  const fetcher = async () => ({ ok: true, json: async () => data });
  assert.equal((await fetchInitialPublicProfiles(fetcher)).data[0].school_name, 'اختبار أول');
  data = [{ school_name: 'اختبار محدث', show_school_name_on_homepage: false }];
  const latest = await fetchInitialPublicProfiles(fetcher);
  assert.equal(latest.data[0].school_name, 'اختبار محدث');
  assert.equal(latest.data[0].show_school_name_on_homepage, false);
  data = [];
  assert.deepEqual((await fetchInitialPublicProfiles(fetcher)).data, []);
  const bootstrap = read('school-branding-bootstrap.mjs');
  assert.doesNotMatch(bootstrap, /localStorage|sessionStorage|مدرسة الأمين|مكة المكرمة/);
});

test('HTTP, invalid JSON shape, and network failures return empty errors, never invented names', async () => {
  for (const fetcher of [
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({ school_name: 'not an array' }) }),
    async () => { throw new Error('offline'); },
  ]) {
    const result = await fetchInitialPublicProfiles(fetcher);
    assert.deepEqual(result.data, []);
    assert.ok(result.error instanceof Error);
  }
});

test('small bootstrap starts before SDK scripts and main consumes it once with a live fallback', () => {
  const html = read('index.html');
  const bootstrap = read('school-branding-bootstrap.mjs');
  const app = read('app.js');
  assert.ok(html.indexOf('src="school-branding-bootstrap.mjs') < html.indexOf('src="site-media-public.js'));
  assert.doesNotMatch(bootstrap, /esm\.sh|createClient|auth\.getSession/);
  assert.match(app, /const initialProfiles = takeInitialPublicProfilesRequest\(\)/);
  assert.match(app, /initialProfiles\.then\(result => result\.error \? requestFreshProfiles\(\) : result\)/);
  assert.match(bootstrap, /initialProfilesRequest = null;\s*return request/);
  assert.equal(takeInitialPublicProfilesRequest(), null);
  assert.equal(takeInitialPublicProfilesRequest(), null);
});

test('public logo URLs retain the existing transformation and original-image fallback', () => {
  assert.equal(publicBrandingLogoUrl(null), '');
  assert.equal(publicBrandingLogoUrl('test/logo.png', { original: true }), 'https://eahptkwvjcnixlzlyznh.supabase.co/storage/v1/object/public/school-branding/test/logo.png');
  assert.ok(publicBrandingLogoUrl('test/logo.png').endsWith('/test/logo.png?width=128&height=128&resize=contain&format=webp&quality=65'));
  assert.ok(publicBrandingLogoUrl('test/شعار مدرسة.png').includes('%20'));
});

test('shared deduplication still selects complete profiles and never substitutes school names', () => {
  const profiles = [
    { school_name: 'اختبار محلي', school_logo_path: null },
    { school_name: 'اختبار محلي', school_logo_path: 'test/logo.png' },
    { school_name: '' },
  ];
  assert.deepEqual(deduplicatePublicSchoolProfiles(profiles), [profiles[1]]);
  assert.deepEqual(deduplicatePublicSchoolProfiles([]), []);
});

test('owner visibility controls retain their helper after extracting the renderer', () => {
  const app = read('app.js');
  assert.match(app, /import \{[^}]*shouldShowSchoolNameOnHomepage[^}]*\} from ['"]\.\/school-homepage-branding\.mjs/);
  assert.match(app, /renderPublicSchoolBranding\(profiles, publicLogoUrl\)/);
});

function publicLoaderHarness(initialResult, freshResult) {
  const app = read('app.js');
  const start = app.indexOf('async function loadPublicBranches()');
  const end = app.indexOf('async function runPublicSearch(', start);
  let pending = Promise.resolve(initialResult);
  let freshRequests = 0;
  const paints = [];
  const dependencies = {
    PUBLIC_PROFILE_COLUMNS,
    publicSupabase: { from(table) {
      if (table === 'library_profiles') freshRequests++;
      return { select() { return this; }, order() { return Promise.resolve(table === 'library_profiles' ? freshResult : { data: [], error: null }); } };
    } },
    takeInitialPublicProfilesRequest() { const result = pending; pending = null; return result; },
    renderPublicProfilesAsSoonAsAvailable(request, callback) {
      return Promise.resolve(request).then(result => { callback(result.error ? [] : result.data); return result; });
    },
    paintBranches(rows, profiles) { paints.push(profiles); },
    updateBranchFilter() {},
  };
  const load = new Function('dependencies', `
    const { PUBLIC_PROFILE_COLUMNS, publicSupabase, takeInitialPublicProfilesRequest, renderPublicProfilesAsSoonAsAvailable, paintBranches, updateBranchFilter } = dependencies;
    let publicBranches = [], publicLibraryProfiles = [];
    ${app.slice(start, end)}
    return loadPublicBranches;
  `)(dependencies);
  return { load, paints, freshRequests: () => freshRequests };
}

test('initial live result is consumed once; subsequent owner refreshes request new data', async () => {
  const initial = { data: [{ school_name: 'اختبار أول', show_school_name_on_homepage: true }], error: null };
  const latest = { data: [{ school_name: 'اختبار محدث', show_school_name_on_homepage: false }], error: null };
  const harness = publicLoaderHarness(initial, latest);
  await harness.load();
  assert.equal(harness.freshRequests(), 0);
  assert.deepEqual(harness.paints[0], initial.data);
  await harness.load();
  assert.equal(harness.freshRequests(), 1);
  assert.deepEqual(harness.paints.at(-1), latest.data);
});

test('failed bootstrap retries through the existing SDK query instead of retaining an old identity', async () => {
  const latest = { data: [], error: null };
  const harness = publicLoaderHarness({ data: [], error: new Error('offline') }, latest);
  await harness.load();
  assert.equal(harness.freshRequests(), 1);
  assert.deepEqual(harness.paints.at(-1), []);
  assert.match(read('school-homepage-branding.mjs'), /if \(!schoolProfiles\.length\) \{\s*subtitle\.removeAttribute\('title'\)/);
});
