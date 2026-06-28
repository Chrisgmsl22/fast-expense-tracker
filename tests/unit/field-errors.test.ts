import { describe, expect, it } from "vitest";
import { z } from "zod";

import { toFieldErrors } from "@/lib/actions/field-errors";

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
});
