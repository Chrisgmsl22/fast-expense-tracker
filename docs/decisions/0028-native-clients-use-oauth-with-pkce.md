# ADR-0028: Native clients log in with OAuth 2.1 and PKCE

Date: 2026-10-16
Status: Accepted
Builds on: ADR-0027 (Better Auth)
Spec: [0009](../specs/0009-auth-module-better-auth.md)

## Context

A Swift iOS app, in its own repo, will read and write the same data as the web.
It is not a browser, so it cannot rely on the web's cookie. The options were:
send the password from the app to a sign-in endpoint (the password grant, which
OAuth 2.1 removes), hand-write token endpoints, use a hosted provider, or run a
standard OAuth server ourselves. The owner wants the standard path, not a
workaround, and wants user data to stay in Neon.

## Decision

1. Native clients use the OAuth 2.1 authorization code flow with PKCE, as RFC
   8252 (BCP 212) describes. Login opens in the system browser sheet
   (`ASWebAuthenticationSession`), never in an embedded web view. The app never
   sees the password.
2. The authorization server is the Better Auth OAuth 2.1 Provider plugin, with
   the `jwt()` plugin for signing keys and the JWKS endpoint. Both run inside
   this app.
3. The iOS app is a registered public client with no client secret
   (`token_endpoint_auth_method` set to `none`), PKCE required, and a
   private-use redirect URI. No dynamic client registration.
4. Access tokens are JWTs. `/api/v1` checks the signature against JWKS, and
   the issuer, audience and expiry. Refresh tokens rotate on every use, and a
   reused one ends its whole family.
5. The web stays a first-party cookie session (ADR-0027). It is not an OAuth
   client.
6. Lifetimes start at the plugin defaults: access token 1 hour, refresh token
   30 days.

## Consequences

- One login page serves the web and the phone. Password managers and, later,
  passkeys work on both.
- The iOS app uses a standard client library (AppAuth-iOS, or another
  maintained one the iOS spec picks), not custom auth code.
- A JWT access token cannot be revoked one by one before it expires. The short
  lifetime limits that window, and revoking the refresh token stops renewal.
- The API is versioned (`/api/v1`), because old app builds stay on phones.
- Sign in with Apple becomes required only if the app adds a third-party login
  (App Store guideline 4.8). Email and password alone do not trigger it.
