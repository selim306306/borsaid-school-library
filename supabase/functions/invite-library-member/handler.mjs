export const ALLOWED_ROLES = new Set(['admin', 'librarian', 'circulation', 'reporter']);
export const INVITE_REDIRECT = 'https://selim306306.github.io/borsaid-school-library/set-password.html';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function jsonResponse(body, status, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

export function createInviteHandler({ createActorClient, createAdminClient, origin = 'https://selim306306.github.io' }) {
  return async function handleInvite(request) {
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405, cors);
    if (request.headers.get('origin') !== origin) return jsonResponse({ error: 'origin_not_allowed' }, 403, cors);
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return jsonResponse({ error: 'authentication_required' }, 401, cors);
    let body;
    try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid_json' }, 400, cors); }
    const libraryId = String(body?.library_id || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const role = String(body?.role || '').trim();
    if (!UUID.test(libraryId) || !EMAIL.test(email) || email.length > 254 || !ALLOWED_ROLES.has(role)) {
      return jsonResponse({ error: 'invalid_request' }, 400, cors);
    }

    const actor = createActorClient(authorization);
    const { data: auth, error: authError } = await actor.auth.getUser();
    if (authError || !auth?.user?.id) return jsonResponse({ error: 'authentication_required' }, 401, cors);
    const { data: canManage, error: permissionError } = await actor.rpc('can_manage_library_members', { p_library_id: libraryId });
    if (permissionError || canManage !== true && canManage?.allowed !== true) return jsonResponse({ error: 'not_authorized' }, 403, cors);
    const { data: membership, error: roleError } = await actor.from('library_memberships')
      .select('role,status').eq('library_id', libraryId).eq('user_id', auth.user.id).maybeSingle();
    if (roleError || membership?.status !== 'active' || !['owner', 'admin'].includes(membership?.role)) {
      return jsonResponse({ error: 'not_authorized' }, 403, cors);
    }
    if (membership.role === 'admin' && role === 'admin') return jsonResponse({ error: 'not_authorized' }, 403, cors);

    const admin = createAdminClient();
    let invited;
    try {
      const result = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: INVITE_REDIRECT });
      invited = result?.data?.user;
      if (result?.error) return jsonResponse({ error: 'invite_failed' }, 502, cors);
    } catch {
      return jsonResponse({ error: 'invite_failed' }, 502, cors);
    }
    if (!invited?.id || !UUID.test(invited.id)) return jsonResponse({ error: 'invite_user_unavailable' }, 502, cors);

    const { error: membershipError } = await actor.rpc('create_invited_library_membership', {
      p_library_id: libraryId, p_user_id: invited.id, p_new_role: role,
    });
    if (membershipError) {
      if (membershipError.code === '23505') return jsonResponse({ error: 'membership_already_exists' }, 409, cors);
      return jsonResponse({ error: membershipError.code === '42501' ? 'not_authorized' : 'membership_creation_failed' }, membershipError.code === '42501' ? 403 : 502, cors);
    }
    return jsonResponse({ ok: true, message: 'تم إرسال الدعوة وإضافة العضوية بالصلاحية المحددة.' }, 200, cors);
  };
}
