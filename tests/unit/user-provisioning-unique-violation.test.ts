// @vitest-environment node
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
    EmailTakenError,
    PrismaUserProvisioningRepository,
} from "@/lib/repositories/user-provisioning.repository";

/** A db whose `user.create` rejects with `error`, inside a pass-through transaction. */
function failingDb(error: unknown): PrismaClient {
    const tx = { user: { create: () => Promise.reject(error) } };
    return {
        $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    } as unknown as PrismaClient;
}

function createWith(error: unknown) {
    return new PrismaUserProvisioningRepository(
        failingDb(error),
    ).createUserWithStarterKit({
        name: "Ana Example",
        email: "ana@example.com",
        password: "invented-pass-123",
    });
}

function p2002(meta?: unknown) {
    return Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta,
    });
}

describe("PrismaUserProvisioningRepository unique violations", () => {
    it.each([
        ["a field list with email", ["email"]],
        ["a constraint name for email", "User_email_key"],
        ["the email field name", "email"],
    ])("Should map P2002 on %s to EmailTakenError", async (_case, target) => {
        await expect(createWith(p2002({ target }))).rejects.toBeInstanceOf(
            EmailTakenError,
        );
    });

    it.each([
        ["a field list without email", { target: ["id"] }],
        ["a constraint name without email", { target: "User_pkey" }],
        ["no target", {}],
        ["no meta", undefined],
    ])("Should rethrow P2002 on %s unchanged", async (_case, meta) => {
        const error = p2002(meta);

        await expect(createWith(error)).rejects.toBe(error);
    });

    it("Should rethrow any other Prisma error unchanged", async () => {
        const error = Object.assign(new Error("db down"), {
            code: "P1001",
            meta: { target: ["email"] },
        });

        await expect(createWith(error)).rejects.toBe(error);
    });
});
