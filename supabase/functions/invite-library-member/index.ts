import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { createInviteHandler } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const origin = 'https://selim306306.github.io';

const handler = createInviteHandler({
  origin,
  createActorClient: authorization => createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  createAdminClient: () => createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
});

Deno.serve(handler);
