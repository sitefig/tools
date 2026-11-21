// Client-side OAuth 2.0 Authorization Code + PKCE. No secret, no backend.
// Provider p: { authUrl, tokenUrl, clientId, scope, redirectUri }
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export const challenge = async (v) => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));

export async function login(p) {
  const verifier = rand(), state = rand();
  sessionStorage.setItem('oauth', JSON.stringify({ verifier, state, p }));
  location.href = p.authUrl + '?' + new URLSearchParams({
    response_type: 'code', client_id: p.clientId, redirect_uri: p.redirectUri, scope: p.scope,
    state, code_challenge: await challenge(verifier), code_challenge_method: 'S256',
  });
}

// Call on the redirect page. Returns the access token, or null if not a redirect.
// Token is returned for in-memory use only; don't persist it. No refresh handling: re-login on expiry.
export async function finish() {
  const q = new URLSearchParams(location.search), code = q.get('code');
  if (!code) return null;
  const s = JSON.parse(sessionStorage.getItem('oauth') || 'null');
  sessionStorage.removeItem('oauth');
  if (!s || s.state !== q.get('state')) throw new Error('OAuth state mismatch');
  const r = await fetch(s.p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: s.p.redirectUri, client_id: s.p.clientId, code_verifier: s.verifier }),
  });
  if (!r.ok) throw new Error('Token exchange failed: ' + r.status);
  history.replaceState({}, '', s.p.redirectUri);
  return (await r.json()).access_token;
}
