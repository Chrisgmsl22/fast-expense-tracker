import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authConfig } from "@/auth.config";
import {
    PrismaUserProvisioningRepository,
    AccountCapError,
} from "@/lib/repositories/user-provisioning.repository";
import { PrismaAuthSessionRepository } from "@/lib/repositories/auth-session.repository";
import { runSeed } from "@/prisma/seed";
import bcrypt from "bcryptjs";

const origin = "http://localhost:3997";
const provider = betterAuth({
    ...authConfig,
    baseURL: origin,
    secret: "invented-test-secret-only-abcdefghijklmnopqrstuvwxyz",
    database: prismaAdapter(db, { provider: "postgresql" }),
});
const accounts = new PrismaUserProvisioningRepository(db);
const sessions = new PrismaAuthSessionRepository(db);
const input = {
    name: "Invented",
    email: "runtime@example.com",
    password: "Invented-password-123",
};
async function request(path: string, body?: unknown, cookie?: string) {
    return provider.handler(
        new Request(origin + "/api/auth/" + path, {
            method: body ? "POST" : "GET",
            headers: {
                origin,
                "content-type": "application/json",
                "x-forwarded-for": "192.0.2.41",
                ...(cookie ? { cookie } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        }),
    );
}
async function login(password = input.password) {
    const response = await request("sign-in/email", {
        email: input.email,
        password,
    });
    expect(response.status).toBe(200);
    const cookie = response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    const session = await db.session.findFirstOrThrow();
    return { response, cookie, session };
}
async function provision() {
    return accounts.createUserWithStarterKit(input);
}

describe("Better Auth 1.7.12 runtime", () => {
    it.each([undefined, false, true])(
        "limits HTTP sign-in sessions to 30 minutes with rememberMe=%s",
        async (rememberMe) => {
            await provision();
            const before = Date.now();
            const response = await request("sign-in/email", {
                email: input.email,
                password: input.password,
                ...(rememberMe === undefined ? {} : { rememberMe }),
            });
            const after = Date.now();
            expect(response.status).toBe(200);
            const session = await db.session.findFirstOrThrow();
            expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(
                before + 1_800_000,
            );
            expect(session.expiresAt.getTime()).toBeLessThanOrEqual(
                after + 1_800_000,
            );
            const cookie = response.headers
                .getSetCookie()
                .map((value) => value.split(";")[0])
                .join("; ");
            expect(
                await (await request("get-session", undefined, cookie)).json(),
            ).toMatchObject({
                session: {
                    id: session.id,
                    expiresAt: session.expiresAt.toISOString(),
                },
            });
        },
    );
    it("authenticates a legacy short bcrypt password with the original UUID and rollback hash", async () => {
        const { userId } = await accounts.createUserWithStarterKit({
            ...input,
            password: "abc",
        });
        const before = await db.user.findUniqueOrThrow({
            where: { id: userId },
        });
        const { session } = await login("abc");
        expect(session.userId).toBe(userId);
        expect(
            await db.user.findUniqueOrThrow({ where: { id: userId } }),
        ).toEqual(before);
        expect(await bcrypt.compare("abc", before.password!)).toBe(true);
        expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    });
    it("returns the same generic error for unknown emails and wrong passwords", async () => {
        await provision();
        const wrong = await request("sign-in/email", {
            email: input.email,
            password: "wrong",
        });
        const unknown = await request("sign-in/email", {
            email: "unknown@example.com",
            password: "wrong",
        });
        expect(wrong.status).toBe(401);
        expect(unknown.status).toBe(401);
        expect(await wrong.json()).toEqual(await unknown.json());
    });
    it.each(authConfig.disabledPaths)(
        "rejects direct HTTP writes through %s",
        async (path) => {
            const response = await request(path.slice(1), {
                ...input,
                newPassword: input.password,
            });
            expect(response.status).toBe(404);
            expect(await db.user.count()).toBe(0);
            expect(response.headers.getSetCookie()).toEqual([]);
        },
    );
    it("Should preserve the deadline when a passive session read occurs", async () => {
        await provision();
        const { cookie, session } = await login();
        for (let i = 0; i < 3; i++) {
            const response = await request("get-session", undefined, cookie);
            expect(response.status).toBe(200);
            expect(response.headers.getSetCookie()).toEqual([]);
            expect(
                await db.session.findUnique({ where: { id: session.id } }),
            ).toEqual(session);
        }
    });
    it("Should retain identity when authenticated activity renews the window", async () => {
        await provision();
        const { session } = await login();
        await db.session.update({
            where: { id: session.id },
            data: { expiresAt: new Date(Date.now() + 60_000) },
        });
        const expiry = await sessions.renew(session, 5_000);
        expect(expiry!.getTime()).toBeGreaterThan(Date.now() + 1_790_000);
        expect(
            (await db.session.findUniqueOrThrow({ where: { id: session.id } }))
                .userId,
        ).toBe(session.userId);
    });
    it("Should preserve a newer deadline when an old activity event arrives", async () => {
        await provision();
        const { session } = await login();
        await Promise.all(
            Array.from({ length: 12 }, (_, i) =>
                sessions.renew(session, i * 1000),
            ),
        );
        const before = await db.session.findUniqueOrThrow({
            where: { id: session.id },
        });
        await sessions.renew(session, 120_000);
        expect(
            (await db.session.findUniqueOrThrow({ where: { id: session.id } }))
                .expiresAt,
        ).toEqual(before.expiresAt);
    });
    it("Should ignore activity from a prior login in another tab", async () => {
        await provision();
        const { session } = await login();
        for (const identity of [
            { ...session, id: crypto.randomUUID() },
            { ...session, token: "wrong" },
            { ...session, userId: crypto.randomUUID() },
        ]) {
            expect(await sessions.renew(identity, 0)).toBeNull();
        }
        expect(
            await db.session.findUnique({ where: { id: session.id } }),
        ).toEqual(session);
    });
    it("Should reject late activity when the idle deadline expires", async () => {
        await provision();
        const { session, cookie } = await login();
        await db.session.update({
            where: { id: session.id },
            data: { expiresAt: new Date(Date.now() - 1) },
        });
        expect(await sessions.renew(session, 0)).toBeNull();
        expect(
            await (await request("get-session", undefined, cookie)).json(),
        ).toBeNull();
    });
    it("does not revive revoked sessions and signs out the existing browser session", async () => {
        await provision();
        const { session, cookie } = await login();
        expect((await request("sign-out", {}, cookie)).status).toBe(200);
        expect(await sessions.renew(session, 0)).toBeNull();
        expect(
            await (await request("get-session", undefined, cookie)).json(),
        ).toBeNull();
    });
    it("keeps the signup cap atomic across simultaneous provisions", async () => {
        const outcomes = await Promise.allSettled([
            accounts.createUserWithStarterKit(input, 1),
            accounts.createUserWithStarterKit(
                { ...input, email: "other@example.com" },
                1,
            ),
        ]);
        expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(
            1,
        );
        const rejected = outcomes.find((r) => r.status === "rejected");
        expect(
            rejected?.status === "rejected" && rejected.reason,
        ).toBeInstanceOf(AccountCapError);
        expect(await db.user.count()).toBe(1);
        expect(await db.account.count()).toBe(1);
    });
    it("keeps seed hashes aligned across reruns without changing the password", async () => {
        await runSeed(db, {
            adminEmail: input.email,
            adminPassword: input.password,
        });
        const before = await db.user.findUniqueOrThrow({
            where: { email: input.email },
        });
        await runSeed(db, {
            adminEmail: input.email,
            adminPassword: "replacement",
        });
        const credential = await db.account.findFirstOrThrow({
            where: { userId: before.id },
        });
        expect(credential.password).toBe(before.password);
        expect(
            (await db.user.findUniqueOrThrow({ where: { id: before.id } }))
                .password,
        ).toBe(before.password);
    });
});

it("shares database-backed login limits across auth instances", async () => {
    await provision();
    for (let i = 0; i < 3; i++)
        expect(
            (
                await request("sign-in/email", {
                    email: input.email,
                    password: "wrong",
                })
            ).status,
        ).toBe(401);
    const other = betterAuth({
        ...authConfig,
        baseURL: origin,
        secret: "invented-test-secret-only-abcdefghijklmnopqrstuvwxyz",
        database: prismaAdapter(db, { provider: "postgresql" }),
    });
    const response = await other.handler(
        new Request(origin + "/api/auth/sign-in/email", {
            method: "POST",
            headers: {
                origin,
                "content-type": "application/json",
                "x-forwarded-for": "192.0.2.41",
            },
            body: JSON.stringify({
                email: input.email,
                password: input.password,
            }),
        }),
    );
    expect(response.status).toBe(429);
    expect(await db.session.count()).toBe(0);
    expect(await db.rateLimit.count()).toBeGreaterThan(0);
});
