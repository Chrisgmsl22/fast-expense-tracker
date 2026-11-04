# Better Auth expand migration

Christian runs these read-only surveys before and after the expand deploy. Keep the results in private notes outside this repository. The agent does not connect to production. Auth.js still handles login, and the new auth tables stay empty.

Before merging, follow the [recovery runbook](./recovery.md). Keep production writes blocked between surveys so the counts are comparable. Merging deploys the migration automatically through `vercel.json`. Rolling back the application leaves these additive schema changes in place.

## Before the merge

Confirm the intended production database in Neon's SQL editor. Run this transaction there. It returns counts only and changes nothing.

```sql
BEGIN TRANSACTION READ ONLY;

SELECT count(*) AS users,
       count(*) FILTER (WHERE password IS NOT NULL) AS users_with_legacy_password,
       count(*) FILTER (WHERE password IS NULL) AS users_without_legacy_password
FROM "User";

SELECT 'Expense' AS table_name, count(*) AS rows FROM "Expense"
UNION ALL SELECT 'Movement', count(*) FROM "Movement"
UNION ALL SELECT 'Income', count(*) FROM "Income"
UNION ALL SELECT 'Card', count(*) FROM "Card"
UNION ALL SELECT 'Category', count(*) FROM "Category"
UNION ALL SELECT 'Subcategory', count(*) FROM "Subcategory"
UNION ALL SELECT 'CategoryBudget', count(*) FROM "CategoryBudget"
UNION ALL SELECT 'BudgetRule', count(*) FROM "BudgetRule"
UNION ALL SELECT 'Settings', count(*) FROM "Settings";

SELECT count(*) AS financial_user_foreign_keys
FROM pg_constraint
WHERE contype = 'f' AND confrelid = '"User"'::regclass
  AND conrelid IN ('"Expense"'::regclass, '"Movement"'::regclass,
      '"Income"'::regclass, '"Card"'::regclass, '"Category"'::regclass,
      '"Subcategory"'::regclass, '"CategoryBudget"'::regclass,
      '"BudgetRule"'::regclass, '"Settings"'::regclass);

SELECT count(*) AS applied_expand_migrations
FROM "_prisma_migrations"
WHERE migration_name = '20261031000000_add_better_auth_core'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL;

ROLLBACK;
```

Expect 9 financial user foreign keys and 0 applied expand migrations. Every existing user must have a legacy password before this step. If either check differs, stop and investigate before merging.

## After the deploy

Repeat the first survey. User counts, legacy-password counts, financial row counts, and the 9 foreign keys must match. Expect 1 applied expand migration. Then run:

```sql
BEGIN TRANSACTION READ ONLY;

SELECT count(*) FILTER (WHERE "emailVerified" = false) AS unverified_users,
       count(*) FILTER (WHERE "emailVerified" = true) AS verified_users,
       count(*) FILTER (WHERE image IS NOT NULL) AS users_with_images
FROM "User";

SELECT 'account' AS table_name, count(*) AS rows FROM "account"
UNION ALL SELECT 'session', count(*) FROM "session"
UNION ALL SELECT 'verification', count(*) FROM "verification"
UNION ALL SELECT 'rateLimit', count(*) FROM "rateLimit";

SELECT count(*) AS credential_accounts
FROM "account" WHERE "providerId" = 'credential';

SELECT count(*) AS users_without_credential_accounts
FROM "User" u
WHERE NOT EXISTS (
    SELECT 1 FROM "account" a
    WHERE a."userId" = u.id AND a."providerId" = 'credential'
);

ROLLBACK;
```

Every user should be unverified, with no image. All 4 new tables and the credential-account count must be 0. The number of users without credential accounts must equal the user count. This step does not copy passwords into accounts.

Keep writes blocked if the results differ. Use the recovery runbook to assess the failure. After the surveys pass, verify legacy login and existing financial history before reopening writes. Counts do not prove row equality; the migration integration tests check exact invented rows and hashes.

<details>
<summary>Schema generation and the later auth switch</summary>

The schema comes from `auth@1.7.10` with `better-auth@1.7.10`, installed only in a temporary directory. The app does not depend on either package in this slice. The release is more than 14 days old, and the compatibility review found no advisory that applies to this schema-only change. CHORE-41 must select and verify its runtime version separately. See [ADR-0027](../decisions/0027-replace-authjs-with-better-auth.md) and the [1.7.10 release](https://github.com/better-auth/better-auth/releases/tag/v1.7.10).

Use this generation configuration and the same ID callback when the auth runtime switches:

```ts
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    user: { modelName: "User" },
    advanced: { database: { generateId: () => randomUUID() } },
    rateLimit: { storage: "database" },
});
```

The callback produces UUID strings while the columns remain PostgreSQL `TEXT`. The built-in `generateId: "uuid"` option generates native UUID columns in 1.7.10, which cannot reference the existing text `User.id`. The custom callback preserves every existing identity and financial foreign key. See the versioned [option type](https://github.com/better-auth/better-auth/blob/v1.7.10/packages/core/src/types/init-options.ts) and [runtime callback handling](https://github.com/better-auth/better-auth/blob/v1.7.10/packages/better-auth/src/context/create-context.ts).

Better Auth 1.7.11 later fixed a PostgreSQL `int8` warning in Kysely introspection. This repo uses Prisma 6. Two 1.7.10 schema generations matched, and Prisma reported no schema diff between them. The later fix does not change this migration. See [upstream fix #10719](https://github.com/better-auth/better-auth/pull/10719).

Copy the existing Prisma schema into the temporary directory and generate into that copy:

```sh
pnpm exec auth generate --config ./auth.ts --adapter prisma --dialect postgresql --output ./schema.prisma --yes
```

Keep the generated core models and new user fields. Make `User.password` optional as approved in the auth spec. Do not replace the existing user ID or financial models. New core IDs have no database default because Better Auth supplies them through the callback.

</details>
