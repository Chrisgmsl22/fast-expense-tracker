// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted above the imports vi.mock rewrites.
const { findUniqueMock, compareMock } = vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    compareMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
    db: { user: { findUnique: findUniqueMock } },
}));
vi.mock("bcryptjs", () => ({
    default: { compare: compareMock },
}));

import { verifyCredentials } from "@/lib/services/user/user.service";

const storedUser = {
    id: "user-1",
    email: "admin@example.com",
    name: "Christian",
    password: "$2a$10$storedhash",
};

beforeEach(() => {
    findUniqueMock.mockReset();
    compareMock.mockReset();
});

describe("verifyCredentials", () => {
    it("returns the user (without the hash) on a correct password", async () => {
        findUniqueMock.mockResolvedValue(storedUser);
        compareMock.mockResolvedValue(true);

        const res = await verifyCredentials("admin@example.com", "hunter2");

        expect(res).toEqual({
            id: "user-1",
            email: "admin@example.com",
            name: "Christian",
        });
        expect(compareMock).toHaveBeenCalledWith(
            "hunter2",
            storedUser.password,
        );
    });

    it("returns null on a wrong password", async () => {
        findUniqueMock.mockResolvedValue(storedUser);
        compareMock.mockResolvedValue(false);

        const res = await verifyCredentials("admin@example.com", "wrong");

        expect(res).toBeNull();
    });

    it("returns null for an unknown email without comparing a hash", async () => {
        findUniqueMock.mockResolvedValue(null);

        const res = await verifyCredentials("nobody@example.com", "hunter2");

        expect(res).toBeNull();
        expect(compareMock).not.toHaveBeenCalled();
    });
});
