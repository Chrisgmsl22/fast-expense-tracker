# Better Auth 1.7.9 compatibility experiments

Executed on 2026-10-29 Mexico City time, 2026-10-30 UTC. These are runtime observations for the candidate release, not a production version recommendation.

## Boundary and versions

The experiment used Better Auth 1.7.9, its core and Prisma adapter 1.7.9, bcryptjs 3.0.3, Prisma Client and CLI 6.19.3, and Node 24.22.1. Prisma 6.19.3 matches the repository lockfile. PostgreSQL ran in the existing local container on localhost:5433. Only the new database named fet_auth_compat_179_20261029 received schema or data changes. The script rejects another host, port or database name. All identities and credentials were invented. No secret files, application dependencies, app schema, app database or shared test database were used.

Scratch files remain in /private/tmp/fet-auth-compat-179. The script deleted its fixture rows in a finally block. The scratch database was dropped after the final successful run. Recreate it before a rerun. The schema is deliberately reduced to auth models and the existing User fields; it does not prove the full app migration or foreign-key graph.

## Verified results

| Check                                         | Observed result                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing credential with 3-character password | Sign-in returned 200, custom bcrypt verification ran, and the existing UUID stayed unchanged. Wrong password returned 401. Signup with the same short password returned 400.                                                                                                                |
| Prisma model mapping                          | User modelName User worked with Prisma 6.19.3 and the existing capitalized User table. Added auth models used explicit model names. New signup User IDs were UUIDs.                                                                                                                         |
| UUID defaults                                 | The first scratch schema omitted defaults on new auth IDs. Session creation failed with missing id. Adding @default(uuid()) fixed it. In PostgreSQL UUID mode the adapter permits Prisma to supply IDs. Keep UUID defaults in the expand schema.                                            |
| Account hooks                                 | Signup account.create.after and password-change account.update.after both ran and copied the credential hash to User.password.                                                                                                                                                              |
| Transaction rollback                          | With prismaAdapter transaction:true, an exception in account.create.before rolled back signup User, Account and Session writes.                                                                                                                                                             |
| Provisioning failure                          | An exception in user.create.after returned 500, but User, Account and Session remained committed. The account after hook did not run, so User.password stayed null. An after hook cannot preserve today's atomic starter-kit signup.                                                        |
| Mirror failure                                | Exceptions in account.create.after or account.update.after returned 500 after credentials had committed. The legacy hash was absent or stale. A successful-path mirror is not an atomic rollback guarantee.                                                                                 |
| Passive session reads                         | With expiresIn:1800, updateAge:0, disableSessionRefresh:true and cookieCache.enabled:false, 3 GET reads left expiresAt and updatedAt unchanged and emitted no Set-Cookie.                                                                                                                   |
| Global refresh disable                        | A false disableRefresh query did not override the global option. With deferSessionRefresh:true, POST returned 200 but still did not extend expiry while global disable remained true.                                                                                                       |
| Explicit renewal alternative                  | With deferSessionRefresh:true, disableSessionRefresh:false and updateAge:0, GET returned needsRefresh:true without moving expiry. POST /get-session extended expiry and emitted a session cookie. This is a tested library path for the future activity action, subject to the gates below. |

The expiry was moved to 2 minutes ahead before read tests. This forced refresh eligibility without a wall-clock wait. The results cover live, valid sessions with cookie cache off. Expired reads may delete rows or cookies. No claim of universally write-free reads is made.

## Version-specific source evidence

Paths below are relative to the installed package root. The package artifacts were installed from the default pnpm registry. These paths identify the exact code inspected, rather than current online documentation for a newer version.

- better-auth@1.7.9/dist/api/routes/sign-in.mjs, source region src/api/routes/sign-in.ts: sign-in checks maximum password length and verifies the credential hash. It does not call the signup minimum-length assertion. Credential selection also requires accountId to equal User.id.
- better-auth@1.7.9/dist/api/routes/sign-up.mjs, source region src/api/routes/sign-up.ts: signup checks minimum and maximum length and calls runWithTransaction around its writes.
- better-auth@1.7.9/dist/db/with-hooks.mjs, source region src/db/with-hooks.ts: account and user create/update hooks share the same hook implementation. After hooks use queueAfterTransactionHook.
- @better-auth/core@1.7.9/dist/context/transaction.mjs, source region src/context/transaction.ts: runWithTransaction commits through the adapter before it runs pending after hooks. Hook exceptions cannot undo those committed writes.
- @better-auth/prisma-adapter@1.7.9/dist/index.mjs: transaction defaults to false. Setting transaction:true wraps work in Prisma $transaction. PostgreSQL supportsUUIDs is true.
- @better-auth/core@1.7.9/dist/db/adapter/get-id-field.mjs: PostgreSQL UUID mode can omit generated IDs and rely on the database adapter/default.
- better-auth@1.7.9/dist/api/routes/session.mjs, source region src/api/routes/session.ts: global disableSessionRefresh participates in needsRefresh for GET and POST. deferSessionRefresh sends GET through the non-renewal branch. POST requires deferSessionRefresh. Cookie-cache handling and expired-session cleanup are separate branches.

## Reproduction

The commands below use public local-only Docker credentials already committed in docker-compose.yml. No environment file is required. Run from a fresh temporary directory containing package.json with private:true and type:module. Save the two appendix blocks as schema.prisma and proof.mjs.

```sh
export PATH="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
pnpm add --save-exact better-auth@1.7.9 bcryptjs@3.0.3 @prisma/client@6.19.3 prisma@6.19.3 --ignore-scripts
docker exec fast-expense-tracker-db psql -U postgres -c 'CREATE DATABASE fet_auth_compat_179_20261029'
export DATABASE_URL='postgresql://postgres:postgres@localhost:5433/fet_auth_compat_179_20261029'
node node_modules/prisma/build/index.js generate --schema schema.prisma
node node_modules/prisma/build/index.js db push --schema schema.prisma
node proof.mjs > results.jsonl 2> expected-failures.log
docker exec fast-expense-tracker-db psql -U postgres -c 'DROP DATABASE fet_auth_compat_179_20261029'
```

The final run exited 0. Expected injected failures returned HTTP 500 and produced stack traces in expected-failures.log. No token, cookie or hash is written by the success reports. The script clears only its guarded scratch database before and after tests. Do not change that guard to point at an existing app database.

Setup outcomes: the first unprivileged install failed DNS resolution; the scoped retry installed packages. pnpm initially rejected ignored Prisma build scripts after package resolution. The final dependency command used --ignore-scripts and explicit Prisma generation. pnpm exec also attempted an automatic modules reinstall without a TTY, so the proof uses the installed Prisma CLI through node directly. The first test used Prisma 6.19.0; every result below was repeated successfully with the repository's exact Prisma 6.19.3.

```jsonl
{"test":"legacy-short-sign-in","status":200,"length":3,"customBcryptVerified":true,"sameUserId":true}
{"test":"wrong-password","status":401}
{"test":"short-signup","status":400}
{"test":"disabled-passive-reads","reads":3,"expiryUnchanged":true,"updatedAtUnchanged":true,"noSetCookie":true}
{"test":"query-cannot-override-global-disable","expiryUnchanged":true}
{"test":"post-cannot-override-global-disable","status":200,"expiryUnchanged":true}
{"test":"deferred-explicit-renewal","getUnchanged":true,"getNeedsRefresh":true,"postStatus":200,"postExtended":true,"postSetCookie":true}
{"test":"account-update-mirror","status":200,"bothHashesEqual":true,"hookFired":true}
{"test":"update-after-failure","status":500,"accountWritePersisted":true,"legacyHashStale":true}
{"test":"signup-normal","status":200,"userPersisted":true,"accountCount":1,"sessionCount":1,"events":["account.before","user.after","account.after"]}
{"test":"signup-account-before-fail","status":500,"userPersisted":false,"accountCount":0,"sessionCount":0,"events":["account.before"]}
{"test":"signup-user-after-fail","status":500,"userPersisted":true,"accountCount":1,"sessionCount":1,"events":["account.before","user.after"]}
{"test":"signup-mirror-fail","status":500,"userPersisted":true,"accountCount":1,"sessionCount":1,"events":["account.before","user.after","account.after"]}
{"test":"complete","pass":true}
```

## Remaining gates

- The experiment does not choose between deferred refresh and a custom renewal action with global refresh disabled. It proves the proposed global-disable configuration cannot renew through the normal get-session endpoint.
- The future idle action still needs expiry, revocation, CSRF, session-lock, cross-tab, cookie lifetime, activity throttling and browser tests. A public POST endpoint needs review against passive-client behavior.
- Starter-kit provisioning was represented by an injected failure before any starter-kit write. No existing provisioning repository ran. Idempotent repair or a custom transaction design remains a decision and implementation gate.
- No account-hook design here guarantees atomic dual writes. Keep password-writing features closed during rollback or prove a different atomic design before opening them.
- OAuth, native clients, refresh-token linkage and replay behavior were outside this runtime experiment. Source research belongs in the findings document. No security advisory or candidate age decision comes from these tests.

## Appendix: disposable schema

```prisma
generator client {
 provider = "prisma-client-js"
}
datasource db {
 provider = "postgresql"
 url = env("DATABASE_URL")
}
model User {
 id String @id @default(uuid())
 email String @unique
 password String?
 name String
 onboardedAt DateTime?
 emailVerified Boolean @default(false)
 image String?
 createdAt DateTime @default(now())
 updatedAt DateTime @updatedAt
 sessions Session[]
 accounts Account[]
}
model Account {
 id String @id @default(uuid())
 accountId String
 providerId String
 userId String
 user User @relation(fields:[userId],references:[id])
 password String?
 accessToken String?
 refreshToken String?
 idToken String?
 accessTokenExpiresAt DateTime?
 refreshTokenExpiresAt DateTime?
 scope String?
 createdAt DateTime
 updatedAt DateTime
}
model Session {
 id String @id @default(uuid())
 token String @unique
 userId String
 user User @relation(fields:[userId],references:[id])
 expiresAt DateTime
 ipAddress String?
 userAgent String?
 createdAt DateTime
 updatedAt DateTime
}
model Verification {
 id String @id @default(uuid())
 identifier String
 value String
 expiresAt DateTime
 createdAt DateTime?
 updatedAt DateTime?
}
```

## Appendix: reusable experiment

```js
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import bcrypt from "bcryptjs";
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, "localhost");
assert.equal(url.port, "5433");
assert.equal(url.pathname, "/fet_auth_compat_179_20261029");
const db = new PrismaClient();
let verifies = 0;
let mode = "normal";
const events = [];
const hooks = {
    user: {
        create: {
            after: async (user) => {
                events.push("user.after");
                if (mode === "user-after-fail")
                    throw Error("INVENTED_PROVISION_FAILURE");
            },
        },
    },
    account: {
        create: {
            before: async () => {
                events.push("account.before");
                if (mode === "account-before-fail")
                    throw Error("INVENTED_ACCOUNT_FAILURE");
            },
            after: async (a) => {
                events.push("account.after");
                if (mode === "mirror-fail")
                    throw Error("INVENTED_MIRROR_FAILURE");
                if (a.password)
                    await db.user.update({
                        where: { id: a.userId },
                        data: { password: a.password },
                    });
            },
        },
        update: {
            after: async (a) => {
                events.push("account.update.after");
                if (mode === "mirror-fail")
                    throw Error("INVENTED_MIRROR_FAILURE");
                if (a.password)
                    await db.user.update({
                        where: { id: a.userId },
                        data: { password: a.password },
                    });
            },
        },
    },
};
const common = {
    baseURL: "http://localhost:3998",
    secret: "invented-disposable-secret-abcdefghijklmnopqrstuvwxyz",
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    user: { modelName: "User" },
    account: { modelName: "Account" },
    session: {
        modelName: "Session",
        expiresIn: 1800,
        updateAge: 0,
        disableSessionRefresh: true,
        cookieCache: { enabled: false },
    },
    verification: { modelName: "Verification" },
    advanced: { database: { generateId: "uuid" } },
    emailAndPassword: {
        enabled: true,
        password: {
            hash: (p) => bcrypt.hash(p, 10),
            verify: async ({ hash, password }) => {
                verifies++;
                return bcrypt.compare(password, hash);
            },
        },
    },
    databaseHooks: hooks,
    logger: { disabled: true },
};
const auth = betterAuth(common);
const request = async (
    instance,
    path,
    body,
    cookie,
    method = body ? "POST" : "GET",
) =>
    instance.handler(
        new Request("http://localhost:3998/api/auth/" + path, {
            method,
            headers: {
                origin: "http://localhost:3998",
                ...(body ? { "content-type": "application/json" } : {}),
                ...(cookie ? { cookie } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        }),
    );
const clear = async () => {
    await db.session.deleteMany();
    await db.account.deleteMany();
    await db.user.deleteMany();
};
const report = (name, detail) =>
    console.log(JSON.stringify({ test: name, ...detail }));
try {
    await clear();
    const id = "11111111-1111-4111-8111-111111111111";
    const hash = await bcrypt.hash("abc", 10);
    await db.user.create({
        data: {
            id,
            email: "legacy@example.test",
            name: "Invented legacy",
            password: hash,
        },
    });
    await db.account.create({
        data: {
            id: crypto.randomUUID(),
            userId: id,
            accountId: id,
            providerId: "credential",
            password: hash,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    });
    let r = await request(auth, "sign-in/email", {
        email: "legacy@example.test",
        password: "abc",
    });
    assert.equal(r.status, 200);
    let body = await r.json();
    assert.equal(body.user.id, id);
    assert.ok(verifies > 0);
    const cookie = r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    report("legacy-short-sign-in", {
        status: r.status,
        length: 3,
        customBcryptVerified: true,
        sameUserId: true,
    });
    r = await request(auth, "sign-in/email", {
        email: "legacy@example.test",
        password: "wrong",
    });
    assert.equal(r.status, 401);
    report("wrong-password", { status: r.status });
    r = await request(auth, "sign-up/email", {
        email: "short@example.test",
        password: "abc",
        name: "Invented short",
    });
    assert.equal(r.status, 400);
    report("short-signup", { status: r.status });
    let session = await db.session.findFirstOrThrow({ where: { userId: id } });
    await db.session.update({
        where: { id: session.id },
        data: {
            expiresAt: new Date(Date.now() + 120000),
            updatedAt: new Date(Date.now() - 60000),
        },
    });
    let before = await db.session.findUniqueOrThrow({
        where: { id: session.id },
    });
    for (let i = 0; i < 3; i++) {
        r = await request(auth, "get-session", undefined, cookie);
        assert.equal(r.status, 200);
        assert.ok((await r.json()).user);
        assert.equal(r.headers.getSetCookie().length, 0);
    }
    let after = await db.session.findUniqueOrThrow({
        where: { id: session.id },
    });
    assert.equal(after.expiresAt.getTime(), before.expiresAt.getTime());
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
    report("disabled-passive-reads", {
        reads: 3,
        expiryUnchanged: true,
        updatedAtUnchanged: true,
        noSetCookie: true,
    });
    r = await request(
        auth,
        "get-session?disableRefresh=false",
        undefined,
        cookie,
    );
    await r.json();
    after = await db.session.findUniqueOrThrow({ where: { id: session.id } });
    assert.equal(after.expiresAt.getTime(), before.expiresAt.getTime());
    report("query-cannot-override-global-disable", { expiryUnchanged: true });
    const deferred = betterAuth({
        ...common,
        session: { ...common.session, deferSessionRefresh: true },
    });
    r = await request(deferred, "get-session", undefined, cookie, "POST");
    await r.json();
    after = await db.session.findUniqueOrThrow({ where: { id: session.id } });
    assert.equal(after.expiresAt.getTime(), before.expiresAt.getTime());
    report("post-cannot-override-global-disable", {
        status: r.status,
        expiryUnchanged: true,
    });
    const explicit = betterAuth({
        ...common,
        session: {
            ...common.session,
            disableSessionRefresh: false,
            deferSessionRefresh: true,
        },
    });
    r = await request(explicit, "get-session", undefined, cookie);
    body = await r.json();
    assert.equal(body.needsRefresh, true);
    after = await db.session.findUniqueOrThrow({ where: { id: session.id } });
    assert.equal(after.expiresAt.getTime(), before.expiresAt.getTime());
    r = await request(explicit, "get-session", undefined, cookie, "POST");
    assert.equal(r.status, 200);
    body = await r.json();
    after = await db.session.findUniqueOrThrow({ where: { id: session.id } });
    assert.ok(after.expiresAt.getTime() > before.expiresAt.getTime() + 1000000);
    assert.ok(r.headers.getSetCookie().length > 0);
    report("deferred-explicit-renewal", {
        getUnchanged: true,
        getNeedsRefresh: true,
        postStatus: r.status,
        postExtended: true,
        postSetCookie: true,
    });
    r = await request(
        auth,
        "change-password",
        { currentPassword: "abc", newPassword: "invented-password-2" },
        cookie,
    );
    assert.equal(r.status, 200);
    let user = await db.user.findUniqueOrThrow({ where: { id } });
    let account = await db.account.findFirstOrThrow({ where: { userId: id } });
    assert.equal(user.password, account.password);
    assert.ok(await bcrypt.compare("invented-password-2", user.password));
    assert.ok(events.includes("account.update.after"));
    report("account-update-mirror", {
        status: r.status,
        bothHashesEqual: true,
        hookFired: true,
    });
    mode = "mirror-fail";
    r = await request(
        auth,
        "change-password",
        {
            currentPassword: "invented-password-2",
            newPassword: "invented-password-3",
        },
        cookie,
    );
    user = await db.user.findUniqueOrThrow({ where: { id } });
    account = await db.account.findFirstOrThrow({ where: { userId: id } });
    assert.ok(await bcrypt.compare("invented-password-2", user.password));
    assert.ok(await bcrypt.compare("invented-password-3", account.password));
    report("update-after-failure", {
        status: r.status,
        accountWritePersisted: true,
        legacyHashStale: true,
    });
    for (const m of [
        "normal",
        "account-before-fail",
        "user-after-fail",
        "mirror-fail",
    ]) {
        mode = m;
        events.length = 0;
        const email = m + "@example.test";
        r = await request(auth, "sign-up/email", {
            email,
            password: "invented-password-4",
            name: "Invented signup",
        });
        user = await db.user.findUnique({ where: { email } });
        const accountCount = user
            ? await db.account.count({ where: { userId: user.id } })
            : 0;
        const sessionCount = user
            ? await db.session.count({ where: { userId: user.id } })
            : 0;
        if (m === "normal") {
            assert.equal(r.status, 200);
            assert.equal(accountCount, 1);
            assert.ok(user.password);
            assert.match(user.id, /^[0-9a-f-]{36}$/);
        }
        if (m === "account-before-fail") {
            assert.equal(user, null);
        }
        if (m === "user-after-fail" || m === "mirror-fail") {
            assert.ok(user);
            assert.equal(accountCount, 1);
            assert.equal(sessionCount, 1);
            assert.equal(user.password, null);
        }
        report("signup-" + m, {
            status: r.status,
            userPersisted: !!user,
            accountCount,
            sessionCount,
            events: [...events],
        });
    }
    report("complete", { pass: true });
} finally {
    await clear();
    await db.$disconnect();
}
```
