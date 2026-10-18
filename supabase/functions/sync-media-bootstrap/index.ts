import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { createMediaBootstrapHandler } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const githubToken = Deno.env.get('GITHUB_MEDIA_ACTIONS_TOKEN') ?? '';

const handler = createMediaBootstrapHandler({
  githubToken,
  createActorClient: authorization => createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  }),
});

Deno.serve(handler);
