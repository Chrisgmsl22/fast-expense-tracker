// @vitest-environment node
import { describe, it, expect } from "vitest";

import { loginSchema, signupSchema } from "@/lib/schemas/auth";

describe("loginSchema", () => {
    it("accepts a valid email + password and trims and lowercases the email", () => {
        const res = loginSchema.safeParse({
            email: "  Admin@Example.COM ",
            password: "hunter2",
        });
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.email).toBe("admin@example.com");
        }
    });

    it("still rejects an email that is only whitespace", () => {
        const res = loginSchema.safeParse({
            email: "   ",
            password: "hunter2",
        });
        expect(res.success).toBe(false);
    });

    it("rejects a malformed email", () => {
        const res = loginSchema.safeParse({
            email: "not-an-email",
            password: "hunter2",
        });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.issues.some((i) => i.path[0] === "email")).toBe(
                true,
            );
        }
    });

    it("rejects an empty password", () => {
        const res = loginSchema.safeParse({
            email: "admin@example.com",
            password: "",
        });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.issues.some((i) => i.path[0] === "password")).toBe(
                true,
            );
        }
    });

    it("rejects a missing email", () => {
        const res = loginSchema.safeParse({ password: "hunter2" });
        expect(res.success).toBe(false);
    });
});

const validSignup = {
    name: "  Ana Example  ",
    email: "  Ana@Example.COM ",
    password: "correct-horse",
    confirmPassword: "correct-horse",
};

function signupFieldErrors(input: Record<string, unknown>) {
    const res = signupSchema.safeParse(input);
    if (res.success) return {};
    return res.error.flatten().fieldErrors as Record<string, string[]>;
}

describe("signupSchema", () => {
    it("Should trim the name and normalise the email like login", () => {
        const res = signupSchema.safeParse(validSignup);
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data).toEqual({
                name: "Ana Example",
                email: "ana@example.com",
                password: "correct-horse",
                confirmPassword: "correct-horse",
            });
        }
    });

    it.each([
        ["empty", "", "Name is required"],
        ["whitespace only", "   ", "Name is required"],
        [
            "51 characters",
            "a".repeat(51),
            "Name must be 50 characters or fewer",
        ],
    ])("Should reject a name that is %s", (_case, name, message) => {
        expect(signupFieldErrors({ ...validSignup, name }).name).toEqual([
            message,
        ]);
    });

    it("Should accept a 50-character name", () => {
        expect(
            signupSchema.safeParse({ ...validSignup, name: "a".repeat(50) })
                .success,
        ).toBe(true);
    });

    it.each(["", "   ", "not-an-email"])(
        "Should reject the email %j",
        (email) => {
            expect(
                signupFieldErrors({ ...validSignup, email }).email,
            ).toBeDefined();
        },
    );

    it.each([
        [
            "7 characters",
            "a".repeat(7),
            "Password must be at least 8 characters",
        ],
        [
            "73 characters",
            "a".repeat(73),
            "Password must be 72 characters or fewer",
        ],
    ])("Should reject a password of %s", (_case, password, message) => {
        const errors = signupFieldErrors({
            ...validSignup,
            password,
            confirmPassword: password,
        });
        expect(errors.password?.[0]).toBe(message);
    });

    it.each([8, 72])("Should accept a password of %i characters", (length) => {
        const password = "a".repeat(length);
        expect(
            signupSchema.safeParse({
                ...validSignup,
                password,
                confirmPassword: password,
            }).success,
        ).toBe(true);
    });

    it("Should reject a password under 72 characters that bcrypt would truncate", () => {
        const password = "ñ".repeat(40);
        expect(
            signupFieldErrors({
                ...validSignup,
                password,
                confirmPassword: password,
            }).password,
        ).toEqual([
            "Password is too long. Use fewer accented letters or symbols.",
        ]);
    });

    it("Should put a mismatched confirmation on the confirm field", () => {
        expect(
            signupFieldErrors({
                ...validSignup,
                confirmPassword: "correct-horsf",
            }),
        ).toEqual({ confirmPassword: ["Passwords do not match"] });
    });

    it("Should require the confirmation", () => {
        expect(
            signupFieldErrors({ ...validSignup, confirmPassword: "" })
                .confirmPassword,
        ).toBeDefined();
    });

    it("Should reject missing fields", () => {
        expect(Object.keys(signupFieldErrors({})).sort()).toEqual([
            "confirmPassword",
            "email",
            "name",
            "password",
        ]);
    });
});
