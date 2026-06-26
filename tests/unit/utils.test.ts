import { describe, it, expect } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
    it("joins truthy class names and drops falsy ones", () => {
        expect(cn("a", false && "b", undefined, "c")).toBe("a c");
    });

    it("dedupes conflicting Tailwind utilities, last one wins", () => {
        expect(cn("p-2", "p-4")).toBe("p-4");
    });
});
