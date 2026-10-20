import { authenticate, readBoundedBody, validatePayload, processNews } from './core.mjs';

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const raw = await readBoundedBody(req, 12000);
    const secret = Deno.env.get('NEWS_HMAC_SECRET') || '';
    if (!secret) return json(401, { error: 'unauthorized' });
    await authenticate(req.headers, raw, secret);
    let payload: any;
    try { payload = JSON.parse(raw); } catch { return json(400, { error: 'bad_payload' }); }
    validatePayload(payload);
    if (payload.timestamp !== req.headers.get('X-News-Timestamp') || payload.nonce !== req.headers.get('X-News-Nonce')) return json(400, { error: 'bad_payload' });
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json(503, { error: 'unavailable' });
    return json(200, await processNews(payload, { geminiKey: key }));
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message === 'too_large') return json(413, { error: 'too_large' });
    if (message === 'payload') return json(400, { error: 'bad_payload' });
    if (message === 'unauthorized' || message === 'replay') return json(401, { error: 'unauthorized' });
    return json(500, { error: 'unavailable' });
  }
});
