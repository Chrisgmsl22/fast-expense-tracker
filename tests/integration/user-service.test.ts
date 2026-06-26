import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import {
    getUserByEmail,
    verifyCredentials,
} from "@/lib/services/user/user.service";

async function seedUser(email: string, plainPassword: string) {
    return db.user.create({
        data: {
            email,
            password: await bcrypt.hash(plainPassword, 10),
            name: "Christian",
        },
    });
}

describe("getUserByEmail (integration)", () => {
    it("finds a stored user and returns null for an unknown email", async () => {
        await seedUser("admin@example.com", "hunter2");

        expect(await getUserByEmail("admin@example.com")).not.toBeNull();
        expect(await getUserByEmail("nobody@example.com")).toBeNull();
    });
});

describe("verifyCredentials (integration)", () => {
    it("returns the user (without the hash) on a correct password", async () => {
        const user = await seedUser("admin@example.com", "hunter2");

        const res = await verifyCredentials("admin@example.com", "hunter2");

        expect(res).toEqual({
            id: user.id,
            email: "admin@example.com",
            name: "Christian",
        });
    });

    it("returns null on a wrong password", async () => {
        await seedUser("admin@example.com", "hunter2");
        expect(
            await verifyCredentials("admin@example.com", "wrong"),
        ).toBeNull();
    });

    it("returns null for an unknown email", async () => {
        expect(
            await verifyCredentials("nobody@example.com", "hunter2"),
        ).toBeNull();
    });
});
