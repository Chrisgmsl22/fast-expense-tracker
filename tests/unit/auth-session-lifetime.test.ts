// @vitest-environment node
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import bcrypt from "bcryptjs";
import { expect, it } from "vitest";
import { authConfig } from "@/auth.config";
import { IDLE_TIMEOUT_MS } from "@/lib/auth/idle-session";

it.each([undefined, false, true])(
    "limits HTTP sign-in to 30 minutes with rememberMe=%s",
    async (rememberMe) => {
        const origin = "http://localhost:3996";
        const provider = betterAuth({
            ...authConfig,
            baseURL: origin,
            secret: "invented-test-secret-only-abcdefghijklmnopqrstuvwxyz",
            database: memoryAdapter({
                User: [],
                Account: [],
                Session: [],
                Verification: [],
                RateLimit: [],
            }),
        });
        const context = await provider.$context;
        const userId = crypto.randomUUID();
        await context.adapter.create({
            model: "user",
            data: {
                id: userId,
                name: "Invented",
                email: "lifetime@example.com",
                emailVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            forceAllowId: true,
        });
        await context.adapter.create({
            model: "account",
            data: {
                userId,
                accountId: userId,
                providerId: "credential",
                password: await bcrypt.hash("Invented-password-123", 10),
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
        const before = Date.now();
        const response = await provider.handler(
            new Request(origin + "/api/auth/sign-in/email", {
                method: "POST",
                headers: {
                    origin,
                    "content-type": "application/json",
                    "x-forwarded-for": "192.0.2.41",
                },
                body: JSON.stringify({
                    email: "lifetime@example.com",
                    password: "Invented-password-123",
                    ...(rememberMe === undefined ? {} : { rememberMe }),
                }),
            }),
        );
        const after = Date.now();
        expect(response.status).toBe(200);
        const cookie = response.headers
            .getSetCookie()
            .map((value) => value.split(";")[0])
            .join("; ");
        const result = await provider.api.getSession({
            headers: new Headers({ cookie }),
        });
        expect(result?.user.id).toBe(userId);
        expect(result!.session.expiresAt.getTime()).toBeGreaterThanOrEqual(
            before + IDLE_TIMEOUT_MS,
        );
        expect(result!.session.expiresAt.getTime()).toBeLessThanOrEqual(
            after + IDLE_TIMEOUT_MS,
        );
    },
);
