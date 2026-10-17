// Match the site-owner scope used by the private owner dashboard.
const OWNER_LIBRARY_IDS = [
  "a70f6fa4-0dc1-4612-9280-6c2a8e049dd4",
  "c5d10456-1c6e-4bd1-8275-d14e354ac285",
];

export async function isSetupOwner(request, { supabaseUrl, publishableKey, fetchImpl = fetch }) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization) || !supabaseUrl || !publishableKey) return false;
  const headers = { apikey: publishableKey, Authorization: authorization, Accept: "application/json" };
  try {
    // Verify the token with Auth; never trust locally decoded JWT claims.
    const userResponse = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers, signal: AbortSignal.timeout(8000),
    });
    if (!userResponse.ok) return false;
    const user = await userResponse.json();
    if (typeof user?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(user.id)) return false;
    const query = new URLSearchParams({
      select: "library_id", user_id: `eq.${user.id}`, role: "eq.owner",
      status: "eq.active", library_id: `in.(${OWNER_LIBRARY_IDS.join(",")})`, limit: "1",
    });
    const membershipResponse = await fetchImpl(`${supabaseUrl}/rest/v1/library_memberships?${query}`, {
      headers, signal: AbortSignal.timeout(8000),
    });
    if (!membershipResponse.ok) return false;
    const memberships = await membershipResponse.json();
    return Array.isArray(memberships) && memberships.some(row => OWNER_LIBRARY_IDS.includes(row?.library_id));
  } catch {
    return false;
  }
}
