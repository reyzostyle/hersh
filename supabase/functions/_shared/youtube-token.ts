// The connected channel's access token, refreshed when it has run out.
//
// Five functions carry their own copy of this; new code uses this one. It
// returns null rather than throwing when there is nothing to use (no channel
// connected, or Google refused the refresh because access was revoked), since
// every caller treats "no token" as "no private numbers", not as a failure.

// deno-lint-ignore no-explicit-any
export async function freshAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data: row } = await supabase
    .from('user_tokens')
    .select('access_token, refresh_token, token_expiry')
    .eq('user_id', userId)
    .maybeSingle();
  if (!row?.access_token && !row?.refresh_token) return null;

  // A minute of slack: a token that runs out halfway through a sync fails
  // every read after it.
  const expiry = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
  if (row.access_token && expiry > Date.now() + 60_000) return row.access_token as string;
  if (!row.refresh_token) return (row.access_token as string) ?? null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('YOUTUBE_CLIENT_ID')!,
      client_secret: Deno.env.get('YOUTUBE_CLIENT_SECRET')!,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    console.log(`[youtube-token] refresh failed for ${userId}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const t = await res.json();
  const next = new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000);
  await supabase.from('user_tokens')
    .update({ access_token: t.access_token, token_expiry: next.toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  return t.access_token as string;
}
