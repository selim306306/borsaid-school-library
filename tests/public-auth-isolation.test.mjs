import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const media = readFileSync(new URL('../site-media-public.js', import.meta.url), 'utf8');

function initializedClients() {
  const calls = [];
  const fetches = [];
  const context = vm.createContext({
    SUPABASE_URL: 'https://example.invalid',
    SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
    createClient: (url, key, options) => {
      const client = { url, key, options };
      calls.push(client);
      return client;
    },
    fetch: (input, init) => { fetches.push({ input, init }); return Promise.resolve({ ok: true }); },
  });
  const appStart = app.indexOf('publicSupabase = createClient(');
  const appEnd = app.indexOf('    trackPublicPageView(', appStart);
  assert.ok(appStart > 0 && appEnd > appStart);
  vm.runInContext(app.slice(appStart, appEnd), context);
  const mediaStart = media.indexOf('const publicClient = createClient(');
  const mediaEnd = media.indexOf('\n\nfunction ', mediaStart);
  assert.ok(mediaStart > 0 && mediaEnd > mediaStart);
  vm.runInContext(media.slice(mediaStart, mediaEnd), context);
  return { calls, fetches };
}

test('all three public clients bypass GoTrue initialization and never provide a staff token', async () => {
  const { calls } = initializedClients();
  assert.equal(calls.length, 4);
  for (const index of [0, 1, 3]) {
    assert.equal(typeof calls[index].options.accessToken, 'function');
    assert.equal(await calls[index].options.accessToken(), null);
    assert.equal(calls[index].options.auth, undefined);
  }
});

test('the staff client retains default storage, browser lock and persistent session settings', () => {
  const { calls } = initializedClients();
  const staff = calls[2].options;
  assert.equal(staff.accessToken, undefined);
  assert.equal(staff.auth.persistSession, true);
  assert.equal(staff.auth.autoRefreshToken, true);
  assert.equal(staff.auth.detectSessionInUrl, true);
  assert.equal(staff.auth.storageKey, undefined);
  assert.equal(staff.auth.lock, undefined);
  assert.match(app, /supabase\.auth\.getSession\(\)/);
  assert.match(app, /supabase\.auth\.signInWithPassword\(/);
  assert.match(app, /supabase\.auth\.onAuthStateChange\(/);
  assert.doesNotMatch(app, /public(?:Analytics)?Supabase\.auth\b/);
  assert.doesNotMatch(media, /publicClient\.auth\b/);
});

test('anonymous analytics preserves cookie and referrer isolation', async () => {
  const { calls, fetches } = initializedClients();
  await calls[1].options.global.fetch('https://example.invalid/rest/v1/rpc/test', {
    method: 'POST', credentials: 'include', referrerPolicy: 'unsafe-url', headers: { apikey: 'public-test-key' },
  });
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].init.method, 'POST');
  assert.equal(fetches[0].init.credentials, 'omit');
  assert.equal(fetches[0].init.referrerPolicy, 'no-referrer');
  assert.equal(fetches[0].init.headers.apikey, 'public-test-key');
});
