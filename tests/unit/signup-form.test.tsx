import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { signupActionMock, replaceMock } = vi.hoisted(() => ({
    signupActionMock: vi.fn(),
    replaceMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: replaceMock }),
}));
vi.mock("@/app/_actions/auth/signup", () => ({
    signupAction: (...args: unknown[]) => signupActionMock(...args),
}));

import { SignupForm } from "@/components/auth/SignupForm";
import { toFieldErrors } from "@/lib/actions/field-errors";
import { signupSchema, type SignupInput } from "@/lib/schemas/auth";

const SUMMARY = "Check the highlighted fields.";

/** The validation failure the action returns for these values, from the real schema. */
function validationFailure(values: Record<keyof SignupInput, string>) {
    const parsed = signupSchema.safeParse(values);
    if (parsed.success) throw new Error("Expected the values to be invalid");
    return {
        ok: false,
        code: "validation",
        message: SUMMARY,
        fieldErrors: toFieldErrors<SignupInput>(parsed.error),
    };
}

const entered = {
    name: "Ana Example",
    email: "ana@example.com",
    password: "Invented-pass-123",
    confirmPassword: "Invented-pass-123",
};

beforeEach(() => {
    signupActionMock.mockReset();
    replaceMock.mockReset();
});

function fillAndSubmit(values = entered) {
    fireEvent.change(screen.getByLabelText("Name"), {
        target: { value: values.name },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: values.email },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: values.password },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
        target: { value: values.confirmPassword },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

type FocusSnapshot = { invalid: string | null; description: string | null };

/** Record what a screen reader would announce each time the input takes focus. */
function recordFocus(input: HTMLElement): FocusSnapshot[] {
    const snapshots: FocusSnapshot[] = [];
    input.addEventListener("focus", () => {
        const describedBy = input.getAttribute("aria-describedby");
        snapshots.push({
            invalid: input.getAttribute("aria-invalid"),
            description: describedBy
                ? (document.getElementById(describedBy)?.textContent ?? null)
                : null,
        });
    });
    return snapshots;
}

describe("SignupForm", () => {
    it("Should render the four fields with signup autocomplete hints", () => {
        render(<SignupForm />);

        expect(screen.getByLabelText("Name").getAttribute("autocomplete")).toBe(
            "name",
        );
        expect(screen.getByLabelText("Email").getAttribute("type")).toBe(
            "email",
        );
        for (const label of ["Password", "Confirm password"]) {
            const input = screen.getByLabelText(label);
            expect(input.getAttribute("type")).toBe("password");
            expect(input.getAttribute("autocomplete")).toBe("new-password");
        }
    });

    it.each([
        ["Password", "password"],
        ["Confirm password", "confirm password"],
    ])("Should toggle the %s field without submitting", (label, subject) => {
        render(<SignupForm />);
        const input = screen.getByLabelText(label);
        fireEvent.change(input, { target: { value: entered.password } });

        fireEvent.click(
            screen.getByRole("button", { name: `Show ${subject}` }),
        );

        expect(input.getAttribute("type")).toBe("text");
        expect(input.getAttribute("autocomplete")).toBe("new-password");
        expect((input as HTMLInputElement).value).toBe(entered.password);
        expect(
            screen
                .getByRole("button", { name: `Hide ${subject}` })
                .hasAttribute("aria-pressed"),
        ).toBe(false);
        expect(signupActionMock).not.toHaveBeenCalled();
    });

    it("Should hide both password fields before the request goes out", async () => {
        const typesAtRequest: (string | null)[] = [];
        signupActionMock.mockImplementation(async () => {
            for (const label of ["Password", "Confirm password"]) {
                typesAtRequest.push(
                    screen.getByLabelText(label).getAttribute("type"),
                );
            }
            return { ok: true, data: undefined };
        });
        render(<SignupForm />);
        fireEvent.click(screen.getByRole("button", { name: "Show password" }));
        fireEvent.click(
            screen.getByRole("button", { name: "Show confirm password" }),
        );

        fillAndSubmit();

        await waitFor(() => expect(replaceMock).toHaveBeenCalled());
        expect(typesAtRequest).toEqual(["password", "password"]);
        expect(signupActionMock).toHaveBeenCalledWith(entered);
    });

    it("Should show the password checklist only once the user types", () => {
        render(<SignupForm />);
        const password = screen.getByLabelText("Password");
        expect(
            screen.queryByRole("list", { name: "Password requirements" }),
        ).toBeNull();

        fireEvent.change(password, { target: { value: "abc" } });

        const list = screen.getByRole("list", {
            name: "Password requirements",
        });
        expect(list.textContent).toContain("One lowercase letter (met)");
        expect(screen.getByText("Weak")).toBeTruthy();

        fireEvent.change(password, { target: { value: entered.password } });

        expect(screen.getByText("Strong")).toBeTruthy();

        fireEvent.change(password, { target: { value: "" } });

        expect(
            screen.queryByRole("list", { name: "Password requirements" }),
        ).toBeNull();
    });

    it("Should leave the checklist out of the confirm field", () => {
        render(<SignupForm />);

        fireEvent.change(screen.getByLabelText("Confirm password"), {
            target: { value: "abc" },
        });

        expect(
            screen.queryByRole("list", { name: "Password requirements" }),
        ).toBeNull();
    });

    it("Should report the first unmet password rule on submit", async () => {
        const lower = entered.password.toLowerCase();
        const weak = { ...entered, password: lower, confirmPassword: lower };
        signupActionMock.mockResolvedValue(validationFailure(weak));
        render(<SignupForm />);
        const password = screen.getByLabelText("Password");

        fillAndSubmit(weak);

        await waitFor(() => expect(document.activeElement).toBe(password));
        expect(
            document.getElementById(
                password.getAttribute("aria-describedby") ?? "",
            )?.textContent,
        ).toBe("Password must include an uppercase letter");
        expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([
            SUMMARY,
        ]);
    });

    it("Should submit every field and go to the dashboard on success", async () => {
        signupActionMock.mockResolvedValue({ ok: true, data: undefined });
        render(<SignupForm />);

        fillAndSubmit();

        await waitFor(() =>
            expect(replaceMock).toHaveBeenCalledWith("/dashboard"),
        );
        expect(signupActionMock).toHaveBeenCalledWith(entered);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("Should show the pending label and disable submit while the action runs", async () => {
        let resolve: (value: unknown) => void = () => {};
        signupActionMock.mockReturnValue(
            new Promise((r) => {
                resolve = r;
            }),
        );
        render(<SignupForm />);

        fillAndSubmit();

        const button = await screen.findByRole("button", {
            name: "Creating account…",
        });
        expect(button.hasAttribute("disabled")).toBe(true);
        resolve({ ok: true, data: undefined });
        await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    });

    it("Should render each field error next to its field and link it to the input", async () => {
        signupActionMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Check the highlighted fields.",
            fieldErrors: {
                name: ["Name is required"],
                confirmPassword: ["Passwords do not match"],
            },
        });
        render(<SignupForm />);

        fillAndSubmit();

        const confirm = screen.getByLabelText("Confirm password");
        await waitFor(() =>
            expect(confirm.getAttribute("aria-invalid")).toBe("true"),
        );
        expect(
            document.getElementById(
                confirm.getAttribute("aria-describedby") ?? "",
            )?.textContent,
        ).toBe("Passwords do not match");
        expect(
            screen.getByLabelText("Name").getAttribute("aria-describedby"),
        ).toBe("name-error");
        expect(
            screen.getByLabelText("Email").getAttribute("aria-invalid"),
        ).toBeNull();
        expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([
            SUMMARY,
        ]);
        expect(replaceMock).not.toHaveBeenCalled();
    });

    it("Should announce only the summary on an empty submit", async () => {
        const empty = {
            name: "",
            email: "",
            password: "",
            confirmPassword: "",
        };
        signupActionMock.mockResolvedValue(validationFailure(empty));
        render(<SignupForm />);

        fireEvent.click(screen.getByRole("button", { name: "Create account" }));

        const name = screen.getByLabelText("Name");
        await waitFor(() => expect(document.activeElement).toBe(name));
        expect(signupActionMock).toHaveBeenCalledWith(empty);
        expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([
            SUMMARY,
        ]);
        for (const label of ["Name", "Email", "Password", "Confirm password"]) {
            const input = screen.getByLabelText(label);
            expect(input.getAttribute("aria-invalid")).toBe("true");
            const describedBy = input.getAttribute("aria-describedby") ?? "";
            expect(
                document.getElementById(describedBy)?.textContent,
            ).toBeTruthy();
        }
    });

    it("Should announce only the summary when the passwords do not match", async () => {
        signupActionMock.mockResolvedValue(
            validationFailure({ ...entered, confirmPassword: "different-123" }),
        );
        render(<SignupForm />);
        const confirm = screen.getByLabelText("Confirm password");

        fillAndSubmit();

        await waitFor(() => expect(document.activeElement).toBe(confirm));
        expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([
            SUMMARY,
        ]);
        expect(
            document.getElementById(
                confirm.getAttribute("aria-describedby") ?? "",
            )?.textContent,
        ).toBe("Passwords do not match");
    });

    it("Should move focus to the first invalid field in form order", async () => {
        signupActionMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Check the highlighted fields.",
            fieldErrors: {
                confirmPassword: ["Passwords do not match"],
                email: ["Enter a valid email"],
            },
        });
        render(<SignupForm />);
        const email = screen.getByLabelText("Email");
        const focused = recordFocus(email);

        fillAndSubmit();

        await waitFor(() => expect(document.activeElement).toBe(email));
        expect(focused).toEqual([
            { invalid: "true", description: "Enter a valid email" },
        ]);
    });

    it("Should move focus to the email field when the email is taken", async () => {
        const message = "An account with this email already exists.";
        signupActionMock.mockResolvedValue({
            ok: false,
            code: "email_taken",
            message,
            fieldErrors: { email: [message] },
        });
        render(<SignupForm />);
        const email = screen.getByLabelText("Email");
        const focused = recordFocus(email);

        fillAndSubmit();

        await waitFor(() => expect(document.activeElement).toBe(email));
        expect(focused).toEqual([{ invalid: "true", description: message }]);
    });

    it("Should move focus again on each failed submit", async () => {
        signupActionMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Check the highlighted fields.",
            fieldErrors: { email: ["Enter a valid email"] },
        });
        render(<SignupForm />);
        const email = screen.getByLabelText("Email");
        const focused = recordFocus(email);

        fillAndSubmit();
        await waitFor(() => expect(focused).toHaveLength(1));
        await screen.findByRole("button", { name: "Create account" });
        screen.getByLabelText("Name").focus();
        fillAndSubmit();

        await waitFor(() => expect(focused).toHaveLength(2));
        expect(document.activeElement).toBe(email);
        expect(focused[1]).toEqual({
            invalid: "true",
            description: "Enter a valid email",
        });
    });

    it("Should leave focus alone when the error has no field", async () => {
        signupActionMock.mockResolvedValue({
            ok: false,
            code: "full",
            message: "Sign-ups are currently full.",
        });
        render(<SignupForm />);

        fillAndSubmit();

        await screen.findByRole("alert");
        expect(document.activeElement?.tagName).not.toBe("INPUT");
    });

    it.each([
        ["closed", "Sign-ups are closed right now."],
        ["full", "Sign-ups are currently full."],
        ["error", "Something went wrong. Please try again."],
    ])("Should show the %s message at form level", async (code, message) => {
        signupActionMock.mockResolvedValue({ ok: false, code, message });
        render(<SignupForm />);

        fillAndSubmit();

        await screen.findByRole("alert");
        expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([
            message,
        ]);
        expect(replaceMock).not.toHaveBeenCalled();
    });

    it("Should show a taken email once, on the email field", async () => {
        const message = "An account with this email already exists.";
        signupActionMock.mockResolvedValue({
            ok: false,
            code: "email_taken",
            message,
            fieldErrors: { email: [message] },
        });
        render(<SignupForm />);

        fillAndSubmit();

        await screen.findByRole("alert");
        expect(
            screen.getAllByRole("alert").map((a) => [a.id, a.textContent]),
        ).toEqual([["email-error", message]]);
        expect(screen.getAllByText(message)).toHaveLength(1);
    });

    it("Should show a generic error when the action throws", async () => {
        signupActionMock.mockRejectedValue(new Error("network down"));
        render(<SignupForm />);

        fillAndSubmit();

        await screen.findByRole("alert");
        expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([
            "Something went wrong. Please try again.",
        ]);
    });

    it("Should clear the previous error when submitting again", async () => {
        signupActionMock.mockResolvedValueOnce({
            ok: false,
            code: "full",
            message: "Sign-ups are currently full.",
        });
        let resolve: (value: unknown) => void = () => {};
        signupActionMock.mockReturnValueOnce(
            new Promise((r) => {
                resolve = r;
            }),
        );
        render(<SignupForm />);

        fillAndSubmit();
        await screen.findByRole("alert");
        await screen.findByRole("button", { name: "Create account" });
        fillAndSubmit();

        await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
        resolve({ ok: true, data: undefined });
        await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    });
});
