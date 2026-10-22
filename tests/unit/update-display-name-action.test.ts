// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, updateSessionMock, rootUsers } = vi.hoisted(() => ({
    authMock: vi.fn(),
    updateSessionMock: vi.fn(),
    rootUsers: { updateName: vi.fn() },
}));
vi.mock("@/auth", () => ({
    auth: authMock,
    unstable_update: updateSessionMock,
}));
vi.mock("@/lib/repositories", () => ({ userRepository: rootUsers }));

import { updateDisplayName } from "@/app/_actions/account/update-display-name";
import { changeDisplayName } from "@/lib/account/display-name";
import { FakeUserRepository } from "@/tests/support/fake-user-repository";

const INVENTED_NAME = "Marisol Inventada";

let users: FakeUserRepository;
let logs: ReturnType<typeof vi.spyOn>[];

function loggedText(): string {
    return JSON.stringify(logs.flatMap((spy) => spy.mock.calls));
}

beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "u1", name: "Old Name" } });
    updateSessionMock.mockReset();
    updateSessionMock.mockResolvedValue({});
    rootUsers.updateName.mockReset();
    users = new FakeUserRepository();
    users.seed("u1", { name: "Old Name" });
    users.seed("u2", { name: "Someone Else" });
    logs = (["info", "warn", "error", "log"] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => {}),
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("changeDisplayName", () => {
    it("Should save the trimmed name for the session user and refresh the session", async () => {
        const result = await changeDisplayName(
            { name: `  ${INVENTED_NAME}  ` },
            users,
        );

        expect(result).toEqual({ ok: true, data: { name: INVENTED_NAME } });
        expect(users.stateOf("u1")?.name).toBe(INVENTED_NAME);
        expect(updateSessionMock).toHaveBeenCalledWith({
            user: { name: INVENTED_NAME },
        });
    });

    it("Should write only the session user when the input names another user", async () => {
        await changeDisplayName({ name: INVENTED_NAME, userId: "u2" }, users);

        expect(users.stateOf("u1")?.name).toBe(INVENTED_NAME);
        expect(users.stateOf("u2")?.name).toBe("Someone Else");
    });

    it.each([
        ["an empty name", ""],
        ["a blank name", "   "],
        ["a name over 50 characters", "x".repeat(51)],
        ["a missing name", undefined],
    ])(
        "Should refuse %s without writing or refreshing",
        async (_case, name) => {
            const result = await changeDisplayName({ name }, users);

            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.code).toBe("validation");
            expect(result.fieldErrors?.name?.length).toBeGreaterThan(0);
            expect(users.stateOf("u1")?.name).toBe("Old Name");
            expect(updateSessionMock).not.toHaveBeenCalled();
        },
    );

    it("Should accept a name of exactly 50 characters", async () => {
        const name = "y".repeat(50);

        const result = await changeDisplayName({ name }, users);

        expect(result).toEqual({ ok: true, data: { name } });
    });

    it("Should refuse without a session and write nothing", async () => {
        authMock.mockResolvedValue(null);

        const result = await changeDisplayName({ name: INVENTED_NAME }, users);

        expect(result).toMatchObject({ ok: false, code: "unauthenticated" });
        expect(users.stateOf("u1")?.name).toBe("Old Name");
        expect(updateSessionMock).not.toHaveBeenCalled();
    });

    it("Should refuse when the session user no longer exists", async () => {
        authMock.mockResolvedValue({ user: { id: "gone" } });

        const result = await changeDisplayName({ name: INVENTED_NAME }, users);

        expect(result).toMatchObject({ ok: false, code: "unauthenticated" });
        expect(updateSessionMock).not.toHaveBeenCalled();
    });

    it("Should return db_error on a failed write and log no name", async () => {
        users.failOnWrite = true;

        const result = await changeDisplayName({ name: INVENTED_NAME }, users);

        expect(result).toMatchObject({ ok: false, code: "db_error" });
        expect(updateSessionMock).not.toHaveBeenCalled();
        expect(loggedText()).not.toContain(INVENTED_NAME);
        expect(loggedText()).toContain("updateDisplayName");
    });

    it("Should still succeed when the session refresh fails, logging no name", async () => {
        updateSessionMock.mockRejectedValue(new Error(INVENTED_NAME));

        const result = await changeDisplayName({ name: INVENTED_NAME }, users);

        expect(result).toEqual({ ok: true, data: { name: INVENTED_NAME } });
        expect(users.stateOf("u1")?.name).toBe(INVENTED_NAME);
        expect(loggedText()).not.toContain(INVENTED_NAME);
    });
});

describe("updateDisplayName action", () => {
    it("Should run against the composition-root repository", async () => {
        rootUsers.updateName.mockResolvedValue(1);

        const result = await updateDisplayName({ name: INVENTED_NAME });

        expect(result).toEqual({ ok: true, data: { name: INVENTED_NAME } });
        expect(rootUsers.updateName).toHaveBeenCalledWith("u1", INVENTED_NAME);
    });
});
