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

    it("Should accept a short legacy password that the signup rules would reject", () => {
        const res = loginSchema.safeParse({
            email: "admin@example.com",
            password: "abc",
        });
        expect(res.success).toBe(true);
    });

    it("rejects a missing email", () => {
        const res = loginSchema.safeParse({ password: "hunter2" });
        expect(res.success).toBe(false);
    });
});

const PASSWORD = "Invented-pass-123";

const validSignup = {
    name: "  Ana Example  ",
    email: "  Ana@Example.COM ",
    password: PASSWORD,
    confirmPassword: PASSWORD,
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
                password: PASSWORD,
                confirmPassword: PASSWORD,
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
        ["empty", "", "Password must be at least 8 characters"],
        [
            "7 characters",
            "Aa1!" + "x".repeat(3),
            "Password must be at least 8 characters",
        ],
        [
            "no uppercase letter",
            PASSWORD.toLowerCase(),
            "Password must include an uppercase letter",
        ],
        [
            "no lowercase letter",
            PASSWORD.toUpperCase(),
            "Password must include a lowercase letter",
        ],
        [
            "no number",
            PASSWORD.replace(/\d/g, "x"),
            "Password must include a number",
        ],
        [
            "no special character",
            PASSWORD.replaceAll("-", "x"),
            "Password must include a special character",
        ],
        [
            "73 characters",
            "Aa1!" + "x".repeat(69),
            "Password must be 72 characters or fewer",
        ],
        [
            "under 72 characters that bcrypt would truncate",
            "Aa1!" + "ñ".repeat(35),
            "Password is too long. Use fewer accented letters or symbols.",
        ],
    ])(
        "Should report only the first problem with a password of %s",
        (_case, password, message) => {
            const errors = signupFieldErrors({
                ...validSignup,
                password,
                confirmPassword: password,
            });
            expect(errors.password).toEqual([message]);
        },
    );

    it("Should report the length before the other rules", () => {
        expect(
            signupFieldErrors({
                ...validSignup,
                password: "abc",
                confirmPassword: "abc",
            }).password,
        ).toEqual(["Password must be at least 8 characters"]);
    });

    it.each([8, 72])("Should accept a password of %i characters", (length) => {
        const password = "Aa1!" + "x".repeat(length - 4);
        expect(
            signupSchema.safeParse({
                ...validSignup,
                password,
                confirmPassword: password,
            }).success,
        ).toBe(true);
    });

    it("Should accept a space as the special character", () => {
        const password = PASSWORD.replaceAll("-", " ");
        expect(
            signupSchema.safeParse({
                ...validSignup,
                password,
                confirmPassword: password,
            }).success,
        ).toBe(true);
    });

    it("Should put a mismatched confirmation on the confirm field", () => {
        expect(
            signupFieldErrors({
                ...validSignup,
                confirmPassword: `${PASSWORD}x`,
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
