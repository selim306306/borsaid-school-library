import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMediaBootstrapHandler,
  DISPATCH_URL,
  LIBRARY_IDS,
} from '../supabase/functions/sync-media-bootstrap/handler.mjs';

const origin = 'https://selim306306.github.io';
const userId = '11111111-1111-4111-8111-111111111111';

function request(body, { method = 'POST', authorization = 'Bearer real-token', requestOrigin = origin, path = '/sync-media-bootstrap', headers = {} } = {}) {
  return new Request(`https://function.test${path}`, {
    method,
    headers: {
      ...(authorization ? { authorization } : {}),
      ...(requestOrigin ? { origin: requestOrigin } : {}),
      'content-type': 'application/json',
      ...headers,
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}

function setup({ user = { id: userId }, authError = null, memberships = [{ library_id: LIBRARY_IDS[0], role: 'owner', status: 'active' }], githubToken = 'test-token', fetchImpl = async () => new Response(null, { status: 204 }) } = {}) {
  const calls = { auth: [], membership: [], github: [] };
  const actor = {
    auth: { getUser: async token => {
      calls.auth.push(token);
      return { data: { user }, error: authError };
    } },
    from: table => {
      assert.equal(table, 'library_memberships');
      const query = {
        select() { return this; },
        eq(field, value) { calls.membership.push([field, value]); return this; },
        in(field, value) { calls.membership.push([field, value]); return this; },
        limit() { return Promise.resolve({ data: memberships, error: null }); },
      };
      return query;
    },
  };
  const fetchRecording = async (...args) => {
    calls.github.push(args);
    return fetchImpl(...args);
  };
  return {
    calls,
    handler: createMediaBootstrapHandler({
      origin,
      githubToken,
      createActorClient: () => actor,
      fetchImpl: fetchRecording,
    }),
  };
}

test('authorized active owner dispatches only the fixed workflow input and returns 202', async () => {
  const { handler, calls } = setup();
  const response = await handler(request({ media_key: 'header-feature-image' }));
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: true });
  assert.deepEqual(calls.auth, ['real-token']);
  assert.equal(calls.github.length, 1);
  const [url, options] = calls.github[0];
  assert.equal(url, DISPATCH_URL);
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.signal.aborted, false);
  assert.deepEqual(JSON.parse(options.body), { ref: 'main', inputs: {} });
  assert.equal(options.headers.Authorization, 'Bearer test-token');
});

test('accepts both supported function pathnames and rejects every other pathname with 404', async () => {
  for (const path of ['/sync-media-bootstrap', '/functions/v1/sync-media-bootstrap']) {
    const { handler } = setup();
    assert.equal((await handler(request({ media_key: 'site-mark' }, { path }))).status, 202);
  }
  const { handler, calls } = setup();
  const response = await handler(request({ media_key: 'site-mark' }, { path: '/wrong' }));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found' });
  assert.equal(calls.auth.length, 0);
  assert.equal(calls.github.length, 0);
});

test('rejects missing or invalid JWT before ownership lookup', async () => {
  const { handler, calls } = setup({ authError: { message: 'invalid' }, user: null });
  const response = await handler(request({ media_key: 'site-mark' }));
  assert.equal(response.status, 401);
  assert.equal(calls.membership.length, 0);
  assert.equal(calls.github.length, 0);
  assert.equal((await handler(request({ media_key: 'site-mark' }), { authorization: '' })).status, 401);
});

test('requires getUser user identity and rejects non-owner and admin memberships', async () => {
  for (const memberships of [
    [{ library_id: LIBRARY_IDS[0], role: 'librarian', status: 'active' }],
    [{ library_id: LIBRARY_IDS[1], role: 'admin', status: 'active' }],
    [{ library_id: LIBRARY_IDS[0], role: 'owner', status: 'inactive' }],
    [],
  ]) {
    const { handler, calls } = setup({ memberships });
    assert.equal((await handler(request({ media_key: 'site-mark' }))).status, 403);
    assert.equal(calls.github.length, 0);
  }
});

test('rejects extra fields, URL properties, malformed JSON, methods, and origins', async () => {
  const { handler } = setup();
  for (const body of [
    {},
    { media_key: 'other' },
    { media_key: 'header-feature-image', url: 'https://evil.example' },
    { media_key: 'site-mark', image_url: 'https://evil.example' },
    { media_key: 42 },
    ['media_key', 'site-mark'],
  ]) assert.equal((await handler(request(body))).status, 400);
  const malformed = new Request('https://function.test/sync-media-bootstrap', { method: 'POST', headers: { origin, authorization: 'Bearer real-token', 'content-type': 'application/json' }, body: '{' });
  assert.equal((await handler(malformed)).status, 400);
  assert.equal((await handler(request({ media_key: 'site-mark' }, { method: 'GET' }))).status, 405);
  assert.equal((await handler(request(undefined, { method: 'OPTIONS' }))).status, 204);
  assert.equal((await handler(request({ media_key: 'site-mark' }, { requestOrigin: 'https://evil.example' }))).status, 403);
  assert.equal((await handler(request(undefined, { method: 'OPTIONS', requestOrigin: 'https://evil.example' }))).status, 403);
});

test('rejects payloads over 1024 bytes using declared and actual byte lengths', async () => {
  const { handler } = setup();
  const oversized = JSON.stringify({ media_key: 'site-mark', padding: 'x'.repeat(1100) });
  const actual = new Request('https://function.test/sync-media-bootstrap', {
    method: 'POST',
    headers: { origin, authorization: 'Bearer real-token', 'content-type': 'application/json' },
    body: oversized,
  });
  assert.equal((await handler(actual)).status, 413);
  assert.equal((await handler(request({ media_key: 'site-mark' }, { headers: { 'content-length': '1025' } }))).status, 413);
});

test('maps GitHub failure to opaque 502 and permits an idempotent retry', async () => {
  const replies = [new Response('private provider detail', { status: 500 }), new Response(null, { status: 200 })];
  const { handler, calls } = setup({ fetchImpl: async () => replies.shift() });
  const first = await handler(request({ media_key: 'site-mark' }));
  assert.equal(first.status, 502);
  const firstBody = await first.json();
  assert.deepEqual(firstBody, { error: 'dispatch_failed' });
  assert.equal((await handler(request({ media_key: 'site-mark' }))).status, 202);
  assert.equal(calls.github.length, 2);
  assert.equal(JSON.stringify(firstBody).includes('private'), false);
});
