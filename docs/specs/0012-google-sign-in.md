# 0012: Google sign-in

**Status** Draft  
**Date** 2026-11-25

Add Google signup and sign-in to the web app. Existing users can connect Google
from Settings and keep access to the same account and expenses. Christian can
manage the integration with his existing Google account if it can create or
administer a Google Cloud project.

## User requirements

| Entry point                | Behavior                                                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign up                    | Show **Sign up with Google** when registration is open and Google is configured. A new user gets the same starter categories, Cash card, Settings, and onboarding as a password signup.                                                        |
| Log in                     | Show **Continue with Google** when Google is configured. A linked Google identity signs in to the existing app account even while registration is closed. An unlinked identity goes to signup if eligible or receives a localized explanation. |
| Settings → Sign-in methods | Show which methods are available for the signed-in user. A password user can select **Connect Google**. Linked users see **Google connected**. A Google-only user sees Google as their sole sign-in method.                                    |

Require an active app session, a Google-verified email, and a case-insensitive
match to the app email for linking. If Google sign-in finds an existing password
account with the same email, direct the user to password login and Settings to
connect Google. Keep automatic account linking disabled.

Provide English and Spanish copy for each state, including cancelled consent,
closed or full signup, mismatched email, and retryable errors. Retain the web
session's current idle timeout, logout, and signed-in redirects.

The first release covers the web app and one Google identity per app user.
Disconnecting Google, adding a password to a Google-only account, and iOS
sign-in are follow-ups.

## Account storage and signup rules

Keep the existing app user ID. Better Auth's `Account` table already stores
`userId`, `providerId`, and `accountId`. A Google row uses `providerId = "google"`
and Google's stable subject ID as `accountId`. Settings reads the signed-in
user's linked providers. The `User` table needs no new column. Add database
uniqueness for provider identities and enforce at most one Google link per user.
Check existing rows before applying the migration.
[Account schema](../../prisma/schema.prisma) · [Google identity reference](https://developers.google.com/identity/openid-connect/reference)

Apply the existing `signupEnabled` switch and `maxUsers` cap to new registrations
at the server callback, including direct auth requests. A missing or unreadable
config closes registration. Use the password path's database lock for the cap
check. Commit the user, Google account row, and starter data together before
issuing a session. Link and sign-in requests for existing users do not consume a
signup slot.
[Signup rules](../decisions/0026-gate-public-signup-behind-global-config.md) · [Provisioning code](../../lib/repositories/user-provisioning.repository.ts)

First, prove this transaction works with the pinned Better Auth and Prisma
adapter against an isolated database. The adapter defaults to transactions off.
When transactions are enabled, Better Auth runs its `create.after` hook after
commit. Prove a failure during starter setup rolls back the account and that
simultaneous Google and password signups share the same cap before building the
UI. [Better Auth OAuth](https://better-auth.com/docs/concepts/oauth)

## Google Cloud and Vercel setup

Use an existing Google account to sign in to Google Cloud Console. Create or
reuse an app-owned Cloud project with permission to manage Google Auth Platform.
The project is where Christian manages the consent screen, audience, OAuth
clients, and credential rotation. Use an **External** audience for users with
personal Google accounts. Google's **Personal** mode limits sign-in to the
project creator. Request only `openid`, `email`, and `profile`. Confirm the
production branding and verification requirements in Google Auth Platform before
launch. [Google Auth Platform setup](https://support.google.com/cloud/answer/15544987?hl=en) · [Audience options](https://support.google.com/cloud/answer/15549945?hl=en) · [Brand verification](https://developers.google.com/identity/verification/authentication-verification)

1. Christian creates Web application OAuth clients for local testing and production before the feature deploys. Register the exact redirect URIs, including `http://localhost:3000/api/auth/callback/google` for the default local port and `<production AUTH_URL>/api/auth/callback/google` for production. Use the actual hostname and scheme from the deployment. [Better Auth Google setup](https://better-auth.com/docs/authentication/google)
2. Christian sets the variables below for local testing and in Vercel **Production** before merging the implementation PR. Use separate test credentials for a preview only if it has a stable callback hostname and an isolated database. Add variable names to `.env.example`. Keep secret values in the target environment.

| Variable               | Value source                                                               | Where                                                              |
| ---------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GOOGLE_CLIENT_ID`     | Client ID from the corresponding Google Cloud Web application OAuth client | Local environment and Vercel Production                            |
| `GOOGLE_CLIENT_SECRET` | Client secret from the same OAuth client                                   | Local environment and Vercel Production                            |
| `AUTH_URL` (existing)  | Base URL of the app for that environment                                   | Verify it matches the origin registered for that client's callback |

With incomplete Google credentials, keep password login available and hide
Google actions. Once Google-only accounts exist, disabling the provider blocks
their sign-in. For rollout, verify password login and Google linking first with
registrations closed. Open registration for the Google signup smoke test, then
restore the planned signup state. Confirm a Google-only user can sign out and
sign back in after registration closes. Record a rollback plan that preserves
Google-only access before opening registration.

## Acceptance checks

- With signup open, Google creates one user, one account link, and one starter kit. Repeat sign-in returns to the same user.
- Closed or full signup refuses a new Google user, including if the switch closes during consent. A linked user can still sign in.
- Concurrent password and Google signup cannot exceed the cap. A failed starter-data write leaves no partial signup.
- Linking preserves the user ID, password access, and expenses. A mismatched email, expired session, or Google identity already attached elsewhere cannot create a link.
- Settings shows the correct methods for password-only, linked, and Google-only users. Verify both locales and exercise the real Google redirect in a browser.

## Open decisions

- Confirm whether Google signup should open at the same time as password signup. The draft uses the existing shared switch and cap.
- Confirm whether the first release should support linking a Google account with a different email. The draft requires a matching email.
