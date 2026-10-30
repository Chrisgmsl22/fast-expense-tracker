// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionUserIdMock, rootUsers } = vi.hoisted(() => ({
    getSessionUserIdMock: vi.fn(),
    rootUsers: { markOnboarded: vi.fn() },
}));
vi.mock("@/lib/auth/session", () => ({
    getSessionUserId: getSessionUserIdMock,
}));
vi.mock("@/lib/repositories", () => ({ userRepository: rootUsers }));

import { completeOnboarding } from "@/app/_actions/account/complete-onboarding";
import { finishOnboarding } from "@/lib/onboarding/finish-onboarding";
import { FakeUserRepository } from "@/tests/support/fake-user-repository";

const FIRST = new Date("2026-10-16T18:00:00Z");
const LATER = new Date("2026-10-17T09:30:00Z");

let users: FakeUserRepository;

beforeEach(() => {
    getSessionUserIdMock.mockReset();
    getSessionUserIdMock.mockResolvedValue("u1");
    rootUsers.markOnboarded.mockReset();
    users = new FakeUserRepository();
    users.seed("u1");
    users.seed("u2");
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("finishOnboarding", () => {
    it("Should stamp onboardedAt for the session user only", async () => {
        const result = await finishOnboarding(users, () => FIRST);

        expect(result).toEqual({ ok: true, data: undefined });
        expect(users.stateOf("u1")?.onboardedAt).toEqual(FIRST);
        expect(users.stateOf("u2")?.onboardedAt).toBeNull();
    });

    it("Should succeed again and keep the first timestamp on a second call", async () => {
        await finishOnboarding(users, () => FIRST);

        const result = await finishOnboarding(users, () => LATER);

        expect(result).toEqual({ ok: true, data: undefined });
        expect(users.stateOf("u1")?.onboardedAt).toEqual(FIRST);
    });

    it("Should refuse without a session and write nothing", async () => {
        getSessionUserIdMock.mockResolvedValue(null);

        const result = await finishOnboarding(users, () => FIRST);

        expect(result).toMatchObject({ ok: false, code: "unauthenticated" });
        expect(users.stateOf("u1")?.onboardedAt).toBeNull();
    });

    it("Should return db_error when the write fails", async () => {
        users.failOnWrite = true;

        const result = await finishOnboarding(users, () => FIRST);

        expect(result).toMatchObject({ ok: false, code: "db_error" });
    });
});

describe("completeOnboarding action", () => {
    it("Should mark the session user through the composition-root repository", async () => {
        rootUsers.markOnboarded.mockResolvedValue(1);

        const result = await completeOnboarding();

        expect(result).toEqual({ ok: true, data: undefined });
        expect(rootUsers.markOnboarded).toHaveBeenCalledWith(
            "u1",
            expect.any(Date),
        );
    });
});
