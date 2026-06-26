import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/auth so next-auth/next-server never loads under the test runner.
const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));
vi.mock("@/auth", () => ({ signOut: signOutMock }));

import { logoutAction } from "@/app/_actions/auth/logout";

beforeEach(() => {
    signOutMock.mockReset();
});

describe("logoutAction", () => {
    it("signs out and redirects to /login", async () => {
        await logoutAction();
        expect(signOutMock).toHaveBeenCalledWith({ redirectTo: "/login" });
    });
});
