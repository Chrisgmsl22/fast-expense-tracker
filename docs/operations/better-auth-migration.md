# Better Auth web switch

Christian takes a Neon restore point and runs these surveys before merging CHORE-41. Keep results in private notes. The agent does not access production. Merging deploys the credential migration automatically through `vercel.json`.

Keep application writes blocked from the first survey until the post-deploy checks pass. The migration copies each legacy hash to a credential account. It preserves every user ID, financial row and legacy hash. Everyone signs in once after the switch.

## Before the merge

1. Follow the [recovery runbook](./recovery.md) and record a restore point.
2. Confirm the intended production database in Neon's SQL editor.
3. Run the read-only survey below. Save the counts and the currently deployed pre-switch build.
4. Stop if any user lacks a legacy hash, any credential conflicts, or the financial foreign-key count differs from 9.

```sql
BEGIN TRANSACTION READ ONLY;

SELECT count(*) AS users,
       count(*) FILTER (WHERE password IS NULL OR password = '') AS missing_legacy_passwords
FROM "User";

SELECT count(*) AS credential_accounts FROM "account" WHERE "providerId" = 'credential';

SELECT count(*) AS missing_credentials FROM "User" u WHERE NOT EXISTS (
    SELECT 1 FROM "account" a WHERE a."userId" = u.id AND a."providerId" = 'credential'
);

SELECT count(*) AS conflicting_users FROM "User" u WHERE
    (SELECT count(*) FROM "account" a WHERE a."userId" = u.id AND a."providerId" = 'credential') > 1
    OR EXISTS (SELECT 1 FROM "account" a WHERE a."userId" = u.id AND a."providerId" = 'credential'
        AND (a."accountId" IS DISTINCT FROM u.id OR a.password IS DISTINCT FROM u.password));

SELECT 'Expense' AS table_name, count(*) AS rows FROM "Expense"
UNION ALL SELECT 'Movement', count(*) FROM "Movement"
UNION ALL SELECT 'Income', count(*) FROM "Income"
UNION ALL SELECT 'Card', count(*) FROM "Card"
UNION ALL SELECT 'Category', count(*) FROM "Category"
UNION ALL SELECT 'Subcategory', count(*) FROM "Subcategory"
UNION ALL SELECT 'CategoryBudget', count(*) FROM "CategoryBudget"
UNION ALL SELECT 'BudgetRule', count(*) FROM "BudgetRule"
UNION ALL SELECT 'Settings', count(*) FROM "Settings";

SELECT count(*) AS financial_user_foreign_keys FROM pg_constraint
WHERE contype = 'f' AND confrelid = '"User"'::regclass
  AND conrelid IN ('"Expense"'::regclass, '"Movement"'::regclass,
      '"Income"'::regclass, '"Card"'::regclass, '"Category"'::regclass,
      '"Subcategory"'::regclass, '"CategoryBudget"'::regclass,
      '"BudgetRule"'::regclass, '"Settings"'::regclass);

SELECT count(*) AS applied_switch_migrations FROM "_prisma_migrations"
WHERE migration_name = '20261104000000_backfill_better_auth_credentials'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL;

ROLLBACK;
```

Before the first switch, expect 0 applied switch migrations. Missing credentials are expected before the copy. The migration aborts its whole transaction if any legacy hash is absent or any credential is duplicate or mismatched. It reports counts only.

## After the deploy

Repeat the survey before reopening writes. Expect 1 applied switch migration, exactly 1 credential account per user, 0 missing credentials and 0 conflicts. The user count, financial counts and 9 foreign keys must match the saved preflight survey.

Sign in with the existing password. Check financial history, logout, closed signup and the session-expired notice. Keep writes blocked if a survey or login fails. Counts support the check; integration tests compare exact invented rows and foreign keys.

Record the actual production switch date privately. CHORE-43's two-week observation starts with that deployment, not the PR date.

## Rollback

Roll the application back to the recorded pre-switch build. Leave the additive auth tables and credential rows in place. The old build authenticates against the preserved `User.password`. Everyone signs in again. A Vercel rollback does not undo migrations.

Signup stays closed under the existing gate. If signup is permitted, our repository commits the user, credential and starter kit together before sign-in can return cookies. Seed writes use the same transaction rule and never replace an existing password. Password-change, set-password, reset and raw signup endpoints stay disabled. Any future password writer must update both hashes in one application-owned transaction until CHORE-43 removes the legacy column.

## OAuth provider (CHORE-42)

Merging adds 8 empty tables: `jwks`, `oauthClient`, `oauthResource`, `oauthClientResource`, `oauthRefreshToken`, `oauthAccessToken`, `oauthConsent` and `oauthClientAssertion`. It changes no existing table. On the first auth request the app inserts one `oauthResource` row for `<AUTH_URL>/api/v1`. The first JWKS or token request creates the signing key, encrypted with `AUTH_SECRET`. No client exists until a later migration adds the iOS client.

Run this read-only survey before and after the deploy. User and financial counts must not change. Before the deploy the tables do not exist; after it, expect 0 clients and at most 1 resource.

```sql
BEGIN TRANSACTION READ ONLY;

SELECT 'User' AS table_name, count(*) AS rows FROM "User"
UNION ALL SELECT 'account', count(*) FROM "account"
UNION ALL SELECT 'session', count(*) FROM "session"
UNION ALL SELECT 'Expense', count(*) FROM "Expense"
UNION ALL SELECT 'Movement', count(*) FROM "Movement"
UNION ALL SELECT 'Income', count(*) FROM "Income"
UNION ALL SELECT 'Card', count(*) FROM "Card"
UNION ALL SELECT 'Category', count(*) FROM "Category"
UNION ALL SELECT 'Subcategory', count(*) FROM "Subcategory"
UNION ALL SELECT 'CategoryBudget', count(*) FROM "CategoryBudget"
UNION ALL SELECT 'BudgetRule', count(*) FROM "BudgetRule"
UNION ALL SELECT 'Settings', count(*) FROM "Settings";

SELECT count(*) AS oauth_clients FROM "oauthClient";
SELECT identifier, "allowedScopes", disabled FROM "oauthResource";

ROLLBACK;
```

### Client row for a later migration

`registerNativeClient()` in `lib/auth/oauth-client.ts` writes these rows. A migration INSERT for the production iOS client copies the same values, with the real client ID and redirect URI.

| Table                 | Column                              | Value                                           |
| --------------------- | ----------------------------------- | ----------------------------------------------- |
| `oauthResource`       | `identifier`                        | `<AUTH_URL>/api/v1`, insert only when absent    |
| `oauthResource`       | `name`                              | `Fast Expense Tracker API v1`                   |
| `oauthResource`       | `allowedScopes`                     | `{openid,profile,email,offline_access,fet:api}` |
| `oauthClient`         | `clientId`, `name`                  | the client ID and display name                  |
| `oauthClient`         | `redirectUris`                      | private-use or http loopback URIs only          |
| `oauthClient`         | `tokenEndpointAuthMethod`           | `none` (public client, `clientSecret` NULL)     |
| `oauthClient`         | `applicationType`                   | `native`                                        |
| `oauthClient`         | `grantTypes`                        | `{authorization_code,refresh_token}`            |
| `oauthClient`         | `responseTypes`                     | `{code}`                                        |
| `oauthClient`         | `requirePKCE`                       | `true`                                          |
| `oauthClient`         | `skipConsent`                       | `false`                                         |
| `oauthClient`         | `scopes`                            | `{openid,profile,email,offline_access,fet:api}` |
| `oauthClient`         | `disabled`, `dpopBoundAccessTokens` | `false`                                         |
| `oauthClient`         | `clientCredentialsScopes`           | `{}`                                            |
| `oauthClient`         | `userId`                            | NULL                                            |
| `oauthClientResource` | `clientId`, `resourceId`            | the client ID and `<AUTH_URL>/api/v1`           |

Every row also gets a random UUID `id` and `createdAt`/`updatedAt` of the insert time. `allowedScopes` must list the scopes: Prisma reads a NULL list as empty, and the provider then refuses every scope.

<details>
<summary>For agents: runtime and security constraints</summary>

The app pins `better-auth` and `@better-auth/prisma-adapter` to 1.7.12. Its [October 20 release](https://github.com/better-auth/better-auth/releases/tag/v1.7.12) meets ADR-0027's 14-day rule on November 3. Recheck the [official advisories](https://github.com/better-auth/better-auth/security/advisories) before any provider or plugin change.

The November 3 advisories affect this package range. This configuration uses none of their affected OAuth, organization, admin, phone, email OTP, email-change, Expo or MySQL paths. [GHSA-fvxx-76fc-893x](https://github.com/better-auth/better-auth/security/advisories/GHSA-fvxx-76fc-893x) also covers cached or secondary-storage sessions. Both are disabled here, as its workaround requires. CHORE-42 enables `@better-auth/oauth-provider` 1.7.12 and the `jwt` plugin. The advisories page was checked on 2026-11-27. Its 7 advisories of 2026-11-03 name better-auth core (admin phone update, OAuth sign-in email verification, email OTP, email change), `@better-auth/expo`, `@better-auth/electron` and `@better-auth/kysely-adapter`: GHSA-g95c-wqvr-8c3j, GHSA-4wq4-2ppv-q3hg, GHSA-9hm7-xhfp-cx58, GHSA-48c2-w96j-mv3m, GHSA-2f9c-7xj7-gh55, GHSA-hwq2-v29r-p69r and GHSA-9p5w-h4pr-fcrc. None names `@better-auth/oauth-provider` or the `jwt` plugin. GHSA-9hm7-xhfp-cx58 covers OAuth sign-in to this app through a social provider, which this app does not use.

Prisma uses the existing User, Account, Session, Verification and RateLimit models. The UUID callback preserves UUID strings in text columns. Passive session reads never renew. Activity renewal binds the authenticated user, session ID and token in one guarded database update. Database time rejects expired sessions, and GREATEST prevents stale updates from shortening expiry. Cookie publication follows the committed write.

The database-backed limiter handles public sign-in requests and server-action sign-in through the same HTTP handler. Database failures must fail authentication. Do not add an in-memory fallback.

</details>
