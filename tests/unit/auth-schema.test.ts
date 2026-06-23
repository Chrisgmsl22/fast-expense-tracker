// @vitest-environment node
import { describe, it, expect } from "vitest";

import { loginSchema } from "@/lib/schemas/auth";

describe("loginSchema", () => {
    it("accepts a valid email + password and trims (but does not lowercase) the email", () => {
        const res = loginSchema.safeParse({
            email: "  Admin@Example.com ",
            password: "hunter2",
        });
        expect(res.success).toBe(true);
        if (res.success) {
            // Trimmed, case preserved — must match the verbatim seeded email.
            expect(res.data.email).toBe("Admin@Example.com");
        }
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
