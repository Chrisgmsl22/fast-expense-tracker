// @vitest-environment node
import { describe, it, expect } from "vitest";

import { loginSchema } from "@/lib/schemas/auth";

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
