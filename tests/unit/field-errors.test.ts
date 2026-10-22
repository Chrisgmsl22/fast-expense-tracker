import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
    localizeFieldErrors,
    localizeMessage,
    toFieldErrors,
} from "@/lib/actions/field-errors";

const schema = z.object({
    amount: z.number().positive(),
    description: z.string().min(1),
});

type Input = z.infer<typeof schema>;

describe("toFieldErrors", () => {
    it("maps each invalid field to its messages", () => {
        const result = schema.safeParse({ amount: -1, description: "" });
        expect(result.success).toBe(false);
        if (result.success) return;

        const errors = toFieldErrors<Input>(result.error);
        expect(errors.amount?.length).toBeGreaterThanOrEqual(1);
        expect(errors.description?.length).toBeGreaterThanOrEqual(1);
    });

    it("accumulates multiple messages under one field", () => {
        const strict = z.object({
            name: z
                .string()
                .min(3)
                .regex(/^[a-z]+$/),
        });
        const result = strict.safeParse({ name: "A1" });
        expect(result.success).toBe(false);
        if (result.success) return;

        const errors = toFieldErrors<{ name: string }>(result.error);
        expect((errors.name ?? []).length).toBeGreaterThanOrEqual(2);
    });

    it("ignores issues whose path doesn't start with a string key", () => {
        const result = schema.safeParse({ amount: -1, description: "ok" });
        if (result.success) return;

        const errors = toFieldErrors<Input>(result.error);
        // Only `amount` failed; `description` is valid, so no key for it.
        expect(errors.description).toBeUndefined();
    });

    it("takes each message from messageOf when given", () => {
        const result = schema.safeParse({ amount: -1, description: "" });
        if (result.success) return;

        const errors = toFieldErrors<Input>(
            result.error,
            (issue, field) => `${field}:${issue.code}`,
        );
        expect(errors).toEqual({
            amount: ["amount:too_small"],
            description: ["description:too_small"],
        });
    });
});

const translations = { "Name is required": "El nombre es obligatorio" };

describe("localizeMessage", () => {
    it("Should return the translation for a known message", () => {
        expect(localizeMessage("Name is required", translations)).toBe(
            "El nombre es obligatorio",
        );
    });

    it("Should pass an unknown message through unchanged", () => {
        expect(localizeMessage("Invalid input", translations)).toBe(
            "Invalid input",
        );
    });

    it("Should not read inherited properties as translations", () => {
        expect(localizeMessage("constructor", translations)).toBe(
            "constructor",
        );
    });
});

describe("localizeFieldErrors", () => {
    it("Should translate every message and keep the field keys", () => {
        expect(
            localizeFieldErrors<{ name: string; email: string }>(
                { name: ["Name is required", "Other"], email: undefined },
                translations,
            ),
        ).toEqual({ name: ["El nombre es obligatorio", "Other"] });
    });
});
