import test from 'node:test';
import assert from 'node:assert/strict';
import { createInviteHandler, INVITE_REDIRECT } from '../supabase/functions/invite-library-member/handler.mjs';

const actorId = '11111111-1111-4111-8111-111111111111';
const invitedId = '22222222-2222-4222-8222-222222222222';
const libraryId = '33333333-3333-4333-8333-333333333333';
const origin = 'https://selim306306.github.io';
function request(body, { method = 'POST', authorization = 'Bearer token', requestOrigin = origin } = {}) {
  return new Request('https://function.test', {
    method,
    headers: { ...(authorization ? { authorization } : {}), ...(requestOrigin ? { origin: requestOrigin } : {}), 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
}
function setup({ user = { id: actorId }, authError = null, allowed = true, permissionError = null, actorMembership = { role: 'owner', status: 'active' }, inviteError = null, inviteThrows = false, invited = { id: invitedId }, membershipError = null } = {}) {
  const calls = { rpc: [], invite: [] };
  const actor = {
    auth: { getUser: async () => ({ data: { user }, error: authError }) },
    from: () => ({ select: () => ({ eq() { return this; }, maybeSingle: async () => ({ data: actorMembership, error: null }) }) }),
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return name === 'can_manage_library_members'
        ? { data: allowed, error: permissionError }
        : { data: null, error: membershipError };
    },
  };
  const admin = {
    auth: { admin: { inviteUserByEmail: async (email, options) => {
      calls.invite.push({ email, options });
      if (inviteThrows) throw new Error('provider secret detail');
      return { data: { user: invited }, error: inviteError };
    } } },
  };
  return { calls, handler: createInviteHandler({ origin, createActorClient: () => actor, createAdminClient: () => admin }) };
}
const body = { library_id: libraryId, email: 'new.staff@example.com', role: 'librarian' };

test('OPTIONS returns a null body with 204 and CORS headers', async () => {
  const { handler } = setup();
  const response = await handler(request(undefined, { method: 'OPTIONS' }));
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
});

test('rejects unsupported methods and origins before inviting', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request(body, { method: 'GET' }))).status, 405);
  const crossOrigin = await handler(request(body, { requestOrigin: 'https://evil.example' }));
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error, 'origin_not_allowed');
  assert.equal(calls.invite.length, 0);
});

test('rejects anonymous before any invite', async () => {
  const { handler, calls } = setup();
  const response = await handler(request(body, { authorization: '' }));
  assert.equal(response.status, 401); assert.equal(calls.invite.length, 0);
});

test('rejects suspended actor and cross-library access', async () => {
  const { handler, calls } = setup({ allowed: false });
  const response = await handler(request(body));
  assert.equal(response.status, 403); assert.equal(calls.invite.length, 0);
});

test('rejects owner role and malformed library/email', async () => {
  const { handler } = setup();
  for (const invalid of [{ ...body, role: 'owner' }, { ...body, library_id: 'not-a-uuid' }, { ...body, email: 'not-an-email' }]) assert.equal((await handler(request(invalid))).status, 400);
});

test('invites then uses the atomic membership RPC and fixed redirect', async () => {
  const { handler, calls } = setup();
  const response = await handler(request(body));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.invite[0], { email: body.email, options: { redirectTo: INVITE_REDIRECT } });
  assert.deepEqual(calls.rpc.at(-1), { name: 'create_invited_library_membership', args: { p_library_id: libraryId, p_user_id: invitedId, p_new_role: 'librarian' } });
});

test('maps the atomic unique conflict to 409 without exposing database detail', async () => {
  const { handler, calls } = setup({ membershipError: { code: '23505', message: 'raw constraint and private detail' } });
  const response = await handler(request(body));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'membership_already_exists' });
  assert.equal(calls.rpc.at(-1).name, 'create_invited_library_membership');
});

test('hides provider error details', async () => {
  const { handler } = setup({ inviteError: { message: 'raw provider detail' } });
  const response = await handler(request(body));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'invite_failed' });
});

test('hides database error details while preserving authorization status', async () => {
  const { handler } = setup({ membershipError: { code: '42501', message: 'raw database detail' } });
  const response = await handler(request(body));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'not_authorized' });
});

test('admin cannot invite admin before any email is sent', async () => {
  const { handler, calls } = setup({ actorMembership: { role: 'admin', status: 'active' } });
  assert.equal((await handler(request({ ...body, role: 'admin' }))).status, 403);
  assert.equal(calls.invite.length, 0);
});
