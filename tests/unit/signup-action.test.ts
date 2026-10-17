// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock, rootGate, rootAccounts } = vi.hoisted(() => ({
    signInMock: vi.fn(),
    rootGate: { read: vi.fn() },
    rootAccounts: { countUsers: vi.fn(), createUserWithStarterKit: vi.fn() },
}));
vi.mock("@/auth", () => ({ signIn: signInMock }));
vi.mock("@/lib/repositories", () => ({
    signupGate: rootGate,
    userProvisioningRepository: rootAccounts,
}));

import { signupAction } from "@/app/_actions/auth/signup";
import { signup } from "@/lib/auth/signup";
import { FakeSignupGate } from "@/tests/support/fake-signup-gate";
import { FakeUserProvisioningRepository } from "@/tests/support/fake-user-provisioning-repository";

const PASSWORD = "Invented-pass-123";
const input = {
    name: "  Ana Example ",
    email: " Ana@Example.com ",
    password: PASSWORD,
    confirmPassword: PASSWORD,
};

let gate: FakeSignupGate;
let accounts: FakeUserProvisioningRepository;
let logs: ReturnType<typeof vi.spyOn>[];

function loggedText(): string {
    return JSON.stringify(logs.flatMap((spy) => spy.mock.calls));
}

beforeEach(() => {
    signInMock.mockReset();
    signInMock.mockResolvedValue("http://localhost/dashboard");
    gate = new FakeSignupGate({ open: true, maxUsers: 10 });
    accounts = new FakeUserProvisioningRepository();
    logs = (["info", "warn", "error", "log"] as const).map((level) =>
        vi.spyOn(console, level).mockImplementation(() => {}),
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("signup", () => {
    it("Should create the account with the normalised input, then sign it in", async () => {
        const result = await signup(input, gate, accounts);

        expect(result).toEqual({ ok: true, data: undefined });
        expect(accounts.createdAccounts).toEqual([
            {
                name: "Ana Example",
                email: "ana@example.com",
                password: PASSWORD,
            },
        ]);
        expect(signInMock).toHaveBeenCalledWith("credentials", {
            email: "ana@example.com",
            password: PASSWORD,
            redirectTo: "/dashboard",
            redirect: false,
        });
    });

    it("Should call signIn only after the account exists", async () => {
        signInMock.mockImplementation(async () => {
            expect(accounts.createdAccounts).toHaveLength(1);
            return "http://localhost/dashboard";
        });

        await expect(signup(input, gate, accounts)).resolves.toEqual({
            ok: true,
            data: undefined,
        });
        expect(signInMock).toHaveBeenCalledTimes(1);
    });

    it("Should return field errors and touch nothing when the input is invalid", async () => {
        const result = await signup(
            { ...input, confirmPassword: "different-pass" },
            gate,
            accounts,
        );

        expect(result).toEqual({
            ok: false,
            code: "validation",
            message: "Check the highlighted fields.",
            fieldErrors: { confirmPassword: ["Passwords do not match"] },
        });
        expect(gate.reads).toBe(0);
        expect(accounts.createdAccounts).toEqual([]);
        expect(signInMock).not.toHaveBeenCalled();
    });

    it("Should refuse a weak password that matches its confirmation before reading the gate", async () => {
        const weak = PASSWORD.toLowerCase();

        const result = await signup(
            { ...input, password: weak, confirmPassword: weak },
            gate,
            accounts,
        );

        expect(result).toEqual({
            ok: false,
            code: "validation",
            message: "Check the highlighted fields.",
            fieldErrors: {
                password: ["Password must include an uppercase letter"],
            },
        });
        expect(gate.reads).toBe(0);
        expect(accounts.createdAccounts).toEqual([]);
        expect(signInMock).not.toHaveBeenCalled();
    });

    it("Should refuse as closed before counting or creating when the gate is closed", async () => {
        gate.state = { open: false };
        const countUsers = vi.spyOn(accounts, "countUsers");

        const result = await signup(input, gate, accounts);

        expect(result).toEqual({
            ok: false,
            code: "closed",
            message: "Sign-ups are closed right now.",
        });
        expect(countUsers).not.toHaveBeenCalled();
        expect(accounts.createdAccounts).toEqual([]);
        expect(signInMock).not.toHaveBeenCalled();
    });

    it("Should accept the last free place under the cap", async () => {
        gate.state = { open: true, maxUsers: 3 };
        accounts.userCount = 2;

        await expect(signup(input, gate, accounts)).resolves.toEqual({
            ok: true,
            data: undefined,
        });
    });

    it.each([3, 4])(
        "Should refuse as full when %i accounts exist under a cap of 3",
        async (userCount) => {
            gate.state = { open: true, maxUsers: 3 };
            accounts.userCount = userCount;

            const result = await signup(input, gate, accounts);

            expect(result).toEqual({
                ok: false,
                code: "full",
                message: "Sign-ups are currently full.",
            });
            expect(accounts.createdAccounts).toEqual([]);
            expect(signInMock).not.toHaveBeenCalled();
        },
    );

    it("Should map a taken email (any case) to email_taken on the email field", async () => {
        accounts.addExistingEmail("ana@example.com");

        const result = await signup(
            { ...input, email: "ANA@EXAMPLE.COM" },
            gate,
            accounts,
        );

        expect(result).toEqual({
            ok: false,
            code: "email_taken",
            message: "An account with this email already exists.",
            fieldErrors: {
                email: ["An account with this email already exists."],
            },
        });
        expect(signInMock).not.toHaveBeenCalled();
    });

    it("Should return error and skip signIn when account creation fails", async () => {
        accounts.failOnWrite = true;

        const result = await signup(input, gate, accounts);

        expect(result).toEqual({
            ok: false,
            code: "error",
            message: "Something went wrong. Please try again.",
        });
        expect(signInMock).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledWith(
            "signupAction: account creation failed",
            { name: "Error" },
        );
    });

    it("Should return error when the user count cannot be read", async () => {
        vi.spyOn(accounts, "countUsers").mockRejectedValue(
            Object.assign(new Error("db down"), { code: "P1001" }),
        );

        const result = await signup(input, gate, accounts);

        expect(result).toMatchObject({ ok: false, code: "error" });
        expect(console.error).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledWith(
            "signupAction: signup failed before sign-in",
            { name: "Error", code: "P1001" },
        );
        expect(accounts.createdAccounts).toEqual([]);
    });

    it("Should tell the user to log in when sign-in fails after the account was created", async () => {
        signInMock.mockRejectedValue(new Error("auth down"));

        const result = await signup(input, gate, accounts);

        expect(result).toEqual({
            ok: false,
            code: "error",
            message:
                "Your account is ready, but signing in failed. Please log in.",
        });
        expect(accounts.createdAccounts).toHaveLength(1);
    });

    it("Should never log the email or the password on any path", async () => {
        const leakyError = new Error(
            `Invalid prisma.user.create() { email: "ana@example.com", password: "${PASSWORD}" }`,
        );
        await signup(input, gate, accounts);
        vi.spyOn(accounts, "createUserWithStarterKit").mockRejectedValueOnce(
            leakyError,
        );
        await signup(input, gate, accounts);
        signInMock.mockRejectedValueOnce(leakyError);
        await signup({ ...input, email: "other@example.com" }, gate, accounts);
        accounts.userCount = 10;
        await signup(input, gate, accounts);

        const text = loggedText();
        expect(text).not.toContain(PASSWORD);
        expect(text.toLowerCase()).not.toContain("ana@example.com");
        expect(text).not.toContain("other@example.com");
    });
});

describe("signupAction", () => {
    it("Should take exactly one parameter, so a client cannot pass collaborators", () => {
        expect(signupAction.length).toBe(1);
    });

    it("Should run with the composition-root gate even when the client sends extra arguments", async () => {
        rootGate.read.mockResolvedValue({ open: false });
        const clientGate = new FakeSignupGate({ open: true, maxUsers: 10 });
        const callWithExtras = signupAction as (
            ...args: unknown[]
        ) => ReturnType<typeof signupAction>;

        const result = await callWithExtras(input, clientGate, accounts);

        expect(result).toMatchObject({ ok: false, code: "closed" });
        expect(rootGate.read).toHaveBeenCalledTimes(1);
        expect(clientGate.reads).toBe(0);
        expect(accounts.createdAccounts).toEqual([]);
    });
});
