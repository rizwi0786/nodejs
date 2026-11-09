import { KeyRound, Laptop, Lock, Server, ShieldCheck, User } from 'lucide-react';
import { Frame, Label, Sequence } from './primitives';

/* ================================================================================================ */
/* jwt-flow                                                                                          */
/* ================================================================================================ */

export function JwtFlow() {
  return (
    <Frame label="JWT authentication with access and refresh tokens. 1: The client posts email and password to the auth endpoint, which verifies the password hash with bcrypt. 2: The server returns a short-lived access token (about 15 minutes) in the response body and a long-lived refresh token (about 7 days) in an httpOnly, Secure, SameSite cookie, storing a hash of the refresh token. 3: The client calls the API with an Authorization Bearer header; the API verifies the signature and expiry without a database lookup and returns data. 4: When the access token expires, the API returns 401. 5: The client calls the refresh endpoint with the cookie; the server checks the stored refresh token, rotates it, and returns a new access token and a new refresh token. The client retries the original request. Logout deletes the stored refresh token.">
      <div className="mb-3 overflow-hidden rounded-lg border border-line bg-code px-3 py-2 font-mono text-[11px] leading-5">
        <Label className="mb-1">JWT = base64url(header).base64url(payload).signature</Label>
        <div className="break-all">
          <span className="text-danger">eyJhbGciOiJIUzI1NiJ9</span>
          <span className="text-faint">.</span>
          <span className="text-info">eyJzdWIiOiI0MiIsInJvbGUiOiJ1c2VyIiwiZXhwIjoxNzM...</span>
          <span className="text-faint">.</span>
          <span className="text-accent">Sfl8KxwRJSMeKKF2QT4f...</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 text-[10px] text-muted">
          <span><span className="text-danger">header</span> alg, typ</span>
          <span><span className="text-info">payload</span> sub, role, iat, exp — signed, not encrypted</span>
          <span><span className="text-accent">signature</span> HMAC/RSA over header.payload</span>
        </div>
      </div>
      <Sequence
        lanes={[
          { name: 'Client', sub: 'SPA / mobile', icon: <Laptop size={14} /> },
          { name: 'Auth API', sub: '/auth/*', icon: <KeyRound size={14} />, tone: 'warn' },
          { name: 'Resource API', sub: '/api/*', icon: <Server size={14} />, tone: 'accent' },
        ]}
        items={[
          { kind: 'msg', from: 0, to: 1, label: '1 · POST /auth/login', detail: '{ email, password }' },
          { kind: 'note', lane: 1, text: 'bcrypt.compare(password, hash)' },
          { kind: 'msg', from: 1, to: 0, label: '2 · access token (15 min)', detail: '+ Set-Cookie: refresh (7 d, httpOnly)', tone: 'warn', dashed: true },
          { kind: 'msg', from: 0, to: 2, label: '3 · GET /api/orders', detail: 'Authorization: Bearer <access>', tone: 'accent', animate: true },
          { kind: 'note', lane: 2, text: 'jwt.verify(): signature + exp — no DB lookup' },
          { kind: 'msg', from: 2, to: 0, label: '200 OK · orders', tone: 'accent', dashed: true },
          { kind: 'divider', text: '15 minutes later' },
          { kind: 'msg', from: 0, to: 2, label: 'GET /api/orders', detail: 'Bearer <expired access>' },
          { kind: 'msg', from: 2, to: 0, label: '4 · 401 token expired', tone: 'danger', dashed: true },
          { kind: 'msg', from: 0, to: 1, label: '5 · POST /auth/refresh', detail: 'cookie: refresh token', tone: 'warn' },
          { kind: 'note', lane: 1, text: 'look up stored hash → revoke old → issue new (rotation)' },
          { kind: 'msg', from: 1, to: 0, label: 'new access + new refresh', tone: 'warn', dashed: true },
          { kind: 'msg', from: 0, to: 2, label: 'retry with new access token', tone: 'accent' },
        ]}
      />
      <p className="mt-3 text-[11px] leading-snug text-muted">
        Access tokens are stateless and cannot be revoked before <span className="font-mono">exp</span> — keep them short. Refresh tokens are stateful: reuse of a rotated token signals theft → revoke the whole family. Logout = delete the stored refresh token.
      </p>
    </Frame>
  );
}

/* ================================================================================================ */
/* oauth-flow                                                                                        */
/* ================================================================================================ */

export function OAuthFlow() {
  return (
    <Frame label="OAuth 2.0 authorization code flow with PKCE. 1: The client app generates a random code_verifier and derives code_challenge as base64url of SHA-256 of the verifier. 2: It redirects the user's browser to the authorization server's /authorize endpoint with response_type=code, client_id, redirect_uri, scope, state and the code_challenge with method S256. 3: The user logs in and consents at the authorization server. 4: The authorization server redirects back to the redirect_uri with a short-lived authorization code and the same state, which the client checks. 5: The client exchanges the code at the /token endpoint, sending the code_verifier. 6: The authorization server checks that SHA-256 of the verifier matches the stored challenge and returns an access token, a refresh token and, with OpenID Connect, an ID token. 7: The client calls the resource API with the access token as a Bearer token.">
      <Sequence
        lanes={[
          { name: 'User', sub: 'browser', icon: <User size={14} /> },
          { name: 'Client app', sub: 'your Node app', icon: <Laptop size={14} />, tone: 'accent' },
          { name: 'Auth server', sub: 'Google, Auth0…', icon: <ShieldCheck size={14} />, tone: 'warn' },
          { name: 'Resource API', sub: 'protected data', icon: <Lock size={14} />, tone: 'info' },
        ]}
        items={[
          { kind: 'msg', from: 0, to: 1, label: 'click "Sign in"' },
          {
            kind: 'note',
            lane: 1,
            tone: 'accent',
            text: (
              <>
                1 · <span className="font-mono">verifier</span> = random
                <br />
                <span className="font-mono">challenge</span> = b64url(SHA256(verifier))
              </>
            ),
          },
          { kind: 'msg', from: 1, to: 2, label: '2 · 302 → /authorize', detail: 'response_type=code, client_id, redirect_uri, scope, state, code_challenge, method=S256', tone: 'warn' },
          { kind: 'note', lane: 0, span: 3, tone: 'warn', text: '3 · user logs in at the auth server & approves the requested scopes' },
          { kind: 'msg', from: 2, to: 1, label: '4 · 302 → redirect_uri', detail: '?code=…&state=… (via browser)', tone: 'warn', dashed: true },
          { kind: 'note', lane: 1, text: 'check state matches (CSRF)' },
          { kind: 'msg', from: 1, to: 2, label: '5 · POST /token', detail: 'grant_type=authorization_code, code, redirect_uri, code_verifier', tone: 'accent', animate: true },
          { kind: 'note', lane: 2, tone: 'warn', text: '6 · SHA256(verifier) == challenge?' },
          { kind: 'msg', from: 2, to: 1, label: 'access_token, refresh_token, id_token', tone: 'accent', dashed: true },
          { kind: 'msg', from: 1, to: 3, label: '7 · GET /me', detail: 'Authorization: Bearer <access_token>', tone: 'info', animate: true },
          { kind: 'msg', from: 3, to: 1, label: 'profile data', tone: 'info', dashed: true },
        ]}
      />
      <p className="mt-3 text-[11px] leading-snug text-muted">
        PKCE binds the code to the app that started the flow: a stolen <span className="font-mono">code</span> is useless without the <span className="font-mono">code_verifier</span>, which never passed through the browser URL.
        Confidential (server-side) clients also send their client secret at step 5.
      </p>
    </Frame>
  );
}
