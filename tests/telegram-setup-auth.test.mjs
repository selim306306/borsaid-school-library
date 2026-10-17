import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSetupOwner } from '../supabase/functions/telegram-webhook/setup-auth.js';
const id = '00000000-0000-4000-8000-000000000001';
const ownerLibrary = 'a70f6fa4-0dc1-4612-9280-6c2a8e049dd4';
const request = token => new Request('https://example.invalid/?action=setup', { headers: token ? { authorization: `Bearer ${token}` } : {} });
const json = (body, status=200) => new Response(JSON.stringify(body), {status});
const config = { supabaseUrl: 'https://example.invalid', publishableKey: 'public-test-key' };

test('public key without a user session cannot configure Telegram', async () => {
  assert.equal(await isSetupOwner(request(), {...config, fetchImpl: () => { throw Error('must not fetch'); }}), false);
});
test('invalid or expired session is denied before membership lookup', async () => {
  let calls = 0;
  assert.equal(await isSetupOwner(request('invalid'), {...config, fetchImpl: async () => {calls++; return json({},401);}}), false);
  assert.equal(calls,1);
});
test('authenticated non-owner staff and inactive owners are denied', async () => {
  for (const staffType of ['librarian','admin','inactive-owner','unrelated-user']) {
    const calls=[];
    assert.equal(await isSetupOwner(request(staffType), {...config, fetchImpl: async (url,init) => {
      calls.push(url);
      assert.equal(init.headers.Authorization, `Bearer ${staffType}`);
      if (url.endsWith('/auth/v1/user')) return json({id});
      const params = new URL(url).searchParams;
      assert.equal(params.get('user_id'),`eq.${id}`);
      assert.equal(params.get('role'),'eq.owner');
      assert.equal(params.get('status'),'eq.active');
      assert.equal(params.get('limit'),'1');
      assert.ok(params.get('library_id').includes(ownerLibrary));
      return json([]);
    }}),false);
    assert.equal(calls.length,2);
  }
});
test('verified active owner in the existing site-owner scope is allowed', async () => {
  assert.equal(await isSetupOwner(request('owner-session'), {...config, fetchImpl: async url => url.endsWith('/auth/v1/user') ? json({id}) : json([{library_id:ownerLibrary}])}),true);
});
test('unexpected membership, failures and malformed auth response fail closed', async () => {
  for (const membership of [json([{library_id:id}]),json({},403),json(null)]) {
    assert.equal(await isSetupOwner(request('session'), {...config,fetchImpl:async url => url.endsWith('/auth/v1/user') ? json({id}) : membership}),false);
  }
  assert.equal(await isSetupOwner(request('session'), {...config,fetchImpl:async()=>{throw Error('offline');}}),false);
  assert.equal(await isSetupOwner(request('session'), {...config,fetchImpl:async()=>json({id:'untrusted-filter'})}),false);
});
test('deployed handler checks owner before registering; webhook authentication stays independent', () => {
  const code=readFileSync(new URL('../supabase/functions/telegram-webhook/index.ts',import.meta.url),'utf8');
  const setup=code.slice(code.indexOf('if (request.method === "GET" && url.searchParams.get("action") === "setup")'));
  assert.ok(setup.indexOf('await isSetupOwner') < setup.indexOf('await registerWebhook'));
  assert.match(code,/Access-Control-Allow-Headers", "authorization, apikey/);
  assert.match(code,/x-telegram-bot-api-secret-token/);
  assert.match(code,/constantTimeEqual\(presentedSecret, expectedSecret\)/);
});
