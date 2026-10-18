export const ALLOWED_ORIGIN = 'https://selim306306.github.io';
export const LIBRARY_IDS = [
  'a70f6fa4-0dc1-4612-9280-6c2a8e049dd4',
  'c5d10456-1c6e-4bd1-8275-d14e354ac285',
];
export const ALLOWED_MEDIA_KEYS = new Set(['header-feature-image', 'site-mark']);
export const DISPATCH_URL = 'https://api.github.com/repos/selim306306/borsaid-school-library/actions/workflows/sync-media-bootstrap.yml/dispatches';
const MAX_BODY_BYTES = 1024;
const ALLOWED_PATHNAMES = new Set(['/sync-media-bootstrap', '/functions/v1/sync-media-bootstrap']);

const json = (body, status, cors = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
});

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
});

function isBearer(value) {
  return typeof value === 'string' && /^Bearer\s+\S+$/.test(value);
}

export function createMediaBootstrapHandler({
  createActorClient,
  githubToken,
  fetchImpl = globalThis.fetch,
  origin = ALLOWED_ORIGIN,
  }) {
  return async function handleMediaBootstrap(request) {
    if (!ALLOWED_PATHNAMES.has(new URL(request.url).pathname)) {
      return json({ error: 'not_found' }, 404);
    }
    const requestOrigin = request.headers.get('origin');
    const cors = requestOrigin === origin ? corsHeaders(origin) : { Vary: 'Origin' };

    if (requestOrigin !== origin) return json({ error: 'origin_not_allowed' }, 403, cors);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

    const authorization = request.headers.get('authorization') || '';
    if (!isBearer(authorization)) return json({ error: 'authentication_required' }, 401, cors);

    const declaredLength = request.headers.get('content-length');
    if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
      return json({ error: 'payload_too_large' }, 413, cors);
    }
    let bodyText;
    try { bodyText = await request.text(); } catch { return json({ error: 'invalid_json' }, 400, cors); }
    if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'payload_too_large' }, 413, cors);
    }
    let body;
    try { body = JSON.parse(bodyText); } catch { return json({ error: 'invalid_json' }, 400, cors); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_request' }, 400, cors);
    const keys = Object.keys(body);
    if (keys.length !== 1 || keys[0] !== 'media_key' || !ALLOWED_MEDIA_KEYS.has(body.media_key)) {
      return json({ error: 'invalid_request' }, 400, cors);
    }

    let actor;
    try { actor = createActorClient(authorization); } catch { return json({ error: 'authentication_required' }, 401, cors); }
    let user;
    try {
      const result = await actor.auth.getUser(authorization.slice(7));
      user = result?.data?.user;
      if (result?.error || !user?.id) return json({ error: 'authentication_required' }, 401, cors);
    } catch { return json({ error: 'authentication_required' }, 401, cors); }

    let memberships;
    try {
      const result = await actor.from('library_memberships')
        .select('library_id,role,status')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .eq('status', 'active')
        .in('library_id', LIBRARY_IDS)
        .limit(1);
      memberships = result?.data;
      const ownsAllowedLibrary = Array.isArray(memberships) && memberships.some(member =>
        member?.role === 'owner' && member?.status === 'active' && LIBRARY_IDS.includes(member?.library_id));
      if (result?.error || !ownsAllowedLibrary) {
        return json({ error: 'not_authorized' }, 403, cors);
      }
    } catch { return json({ error: 'not_authorized' }, 403, cors); }

    if (!githubToken || typeof fetchImpl !== 'function') return json({ error: 'dispatch_failed' }, 502, cors);
    try {
      const response = await fetchImpl(DISPATCH_URL, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main', inputs: {} }),
      });
      if (response.status !== 200 && response.status !== 204) return json({ error: 'dispatch_failed' }, 502, cors);
    } catch { return json({ error: 'dispatch_failed' }, 502, cors); }

    return json({ accepted: true }, 202, cors);
  };
}
