// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
    validateManifest,
    deriveModel,
    formatView,
    renderBlock,
    type BugManifest,
} from "../../scripts/bugs-status";

const good: BugManifest = {
    branchPattern: "fix/{id}-",
    bugs: [
        {
            id: "BUG-1",
            title: "Phantom cash",
            description: "d1",
            proposedSolution: "s1",
            status: "in-progress",
            spec: "docs/spec.md",
            pr: null,
            issue: 47,
        },
        {
            id: "BUG-2",
            title: "Gray colors",
            description: "d2",
            proposedSolution: "s2",
            status: "open",
            spec: null,
            pr: null,
            issue: null,
        },
    ],
};

describe("validateManifest", () => {
    it("accepts a well-formed manifest", () => {
        expect(validateManifest(good).bugs).toHaveLength(2);
    });

    it("rejects a missing branchPattern", () => {
        expect(() => validateManifest({ bugs: [] })).toThrow(/branchPattern/);
    });

    it("rejects a duplicate bug id", () => {
        const dup = { ...good, bugs: [...good.bugs, good.bugs[0]] };
        expect(() => validateManifest(dup)).toThrow(/duplicate/);
    });

    it("rejects an invalid status", () => {
        const bad = {
            ...good,
            bugs: [{ ...good.bugs[0], status: "done" }],
        };
        expect(() => validateManifest(bad)).toThrow(/invalid status/);
    });

    it("rejects a non-null non-string spec", () => {
        const bad = { ...good, bugs: [{ ...good.bugs[0], spec: 5 }] };
        expect(() => validateManifest(bad)).toThrow(/spec/);
    });

    it("rejects a non-null non-number issue", () => {
        const bad = { ...good, bugs: [{ ...good.bugs[0], issue: "47" }] };
        expect(() => validateManifest(bad)).toThrow(/issue/);
    });
});

describe("deriveModel", () => {
    it("marks the bug whose fix/ prefix the branch matches as mine", () => {
        const model = deriveModel(good, "fix/BUG-1-phantom-cash");
        expect(model.mineId).toBe("BUG-1");
        expect(model.bugs.find((b) => b.id === "BUG-1")?.mine).toBe(true);
        expect(model.bugs.find((b) => b.id === "BUG-2")?.mine).toBe(false);
    });

    it("has no mine on main", () => {
        expect(deriveModel(good, "main").mineId).toBeNull();
    });
});

describe("formatView", () => {
    it("names the current bug, lists open, counts merged", () => {
        const view = formatView(deriveModel(good, "fix/BUG-1-phantom-cash"));
        expect(view).toContain('On BUG-1 (in-progress) — "Phantom cash".');
        expect(view).toContain("Open: BUG-2.");
        expect(view).toContain("In progress: BUG-1.");
        expect(view).toContain("Merged: 0.");
    });

    it("says not on a bug branch off a bug branch", () => {
        expect(formatView(deriveModel(good, "main"))).toContain(
            "Not on a bug branch.",
        );
    });
});

describe("renderBlock", () => {
    it("renders one table row per bug with status + spec/pr fallbacks", () => {
        const block = renderBlock(deriveModel(good, "main"));
        expect(block).toContain(
            "| BUG-1 | in-progress | Phantom cash | #47 | docs/spec.md | — |",
        );
        expect(block).toContain("| BUG-2 | open | Gray colors | — | — | — |");
    });
});
