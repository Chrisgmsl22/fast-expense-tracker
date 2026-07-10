// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
    makeRegister,
    type RegisterConfig,
    type RegisterManifest,
} from "../../scripts/lib/register-status";
import { bugsConfig } from "../../scripts/bugs-status";
import { choresConfig } from "../../scripts/chores-status";

// A synthetic register exercising the generic engine (two non-terminal statuses
// before the terminal one, mixed required/nullable fields).
const config: RegisterConfig = {
    tag: "widgets",
    itemNoun: "widget",
    arrayField: "widgets",
    jsonPath: "docs/roadmap/widgets.json",
    docPath: "docs/roadmap/widgets.md",
    branchPattern: "feat/{id}-",
    statuses: [
        { value: "open", label: "Open" },
        { value: "in-progress", label: "In progress" },
        { value: "done", label: "Done", terminal: true },
    ],
    requiredStringFields: ["title", "description"],
    nullableStringFields: ["spec", "pr"],
    nullableNumberFields: ["issue"],
};
const reg = makeRegister(config);

const good = {
    branchPattern: "feat/{id}-",
    widgets: [
        {
            id: "W-1",
            title: "First widget",
            description: "d1",
            status: "in-progress",
            spec: "docs/spec.md",
            pr: null,
            issue: 47,
        },
        {
            id: "W-2",
            title: "Second widget",
            description: "d2",
            status: "open",
            spec: null,
            pr: null,
            issue: null,
        },
    ],
} as unknown as RegisterManifest;

describe("validateManifest", () => {
    it("accepts a well-formed manifest", () => {
        expect(reg.validateManifest(good).widgets as unknown[]).toHaveLength(2);
    });

    it("rejects a missing branchPattern", () => {
        expect(() => reg.validateManifest({ widgets: [] })).toThrow(
            /branchPattern/,
        );
    });

    it("names the array field when it's not an array", () => {
        expect(() =>
            reg.validateManifest({ branchPattern: "feat/{id}-" }),
        ).toThrow(/"widgets" must be an array/);
    });

    it("rejects a duplicate id", () => {
        const widgets = good.widgets as unknown[];
        const dup = { ...good, widgets: [...widgets, widgets[0]] };
        expect(() => reg.validateManifest(dup)).toThrow(/duplicate/);
    });

    it("rejects a missing required field", () => {
        const bad = {
            branchPattern: "feat/{id}-",
            widgets: [{ id: "W-1", title: "t", status: "open" }],
        };
        expect(() => reg.validateManifest(bad)).toThrow(/missing description/);
    });

    it("rejects an invalid status", () => {
        const bad = {
            branchPattern: "feat/{id}-",
            widgets: [
                {
                    id: "W-1",
                    title: "t",
                    description: "d",
                    status: "shipped",
                    spec: null,
                    pr: null,
                    issue: null,
                },
            ],
        };
        expect(() => reg.validateManifest(bad)).toThrow(/invalid status/);
    });

    it("rejects a non-null non-number nullable-number field", () => {
        const bad = {
            branchPattern: "feat/{id}-",
            widgets: [
                {
                    id: "W-1",
                    title: "t",
                    description: "d",
                    status: "open",
                    spec: null,
                    pr: null,
                    issue: "47",
                },
            ],
        };
        expect(() => reg.validateManifest(bad)).toThrow(/issue/);
    });
});

describe("deriveModel", () => {
    it("marks the item whose branch prefix the branch matches as mine", () => {
        const model = reg.deriveModel(good, "feat/W-1-first");
        expect(model.mineId).toBe("W-1");
        expect(model.items.find((i) => i.id === "W-1")?.mine).toBe(true);
        expect(model.items.find((i) => i.id === "W-2")?.mine).toBe(false);
    });

    it("has no mine on main", () => {
        expect(reg.deriveModel(good, "main").mineId).toBeNull();
    });
});

describe("formatView", () => {
    it("names the current item, always lists the first status, counts terminal", () => {
        const view = reg.formatView(reg.deriveModel(good, "feat/W-1-first"));
        expect(view).toContain(
            '[widgets] On W-1 (in-progress) — "First widget".',
        );
        expect(view).toContain("Open: W-2.");
        expect(view).toContain("In progress: W-1.");
        expect(view).toContain("Done: 0.");
    });

    it("shows the first status even when empty, and hides empty middle statuses", () => {
        const model = reg.deriveModel(
            {
                branchPattern: "feat/{id}-",
                widgets: [],
            } as unknown as RegisterManifest,
            "main",
        );
        const view = reg.formatView(model);
        expect(view).toContain("Not on a widget branch.");
        expect(view).toContain("Open: none.");
        expect(view).not.toContain("In progress:");
        expect(view).toContain("Done: 0.");
    });
});

describe("renderBlock", () => {
    it("renders one row per item with issue/spec/pr fallbacks + tagged markers", () => {
        const block = reg.renderBlock(reg.deriveModel(good, "main"));
        expect(block).toContain("<!-- widgets:status:start -->");
        expect(block).toContain(
            "| W-1 | in-progress | First widget | #47 | docs/spec.md | — |",
        );
        expect(block).toContain("| W-2 | open | Second widget | — | — | — |");
        expect(block).toContain("<!-- widgets:status:end -->");
    });
});

// The real registers must load + validate against their own configs — guards
// the seeded bugs.json / chores.json data.
describe("real registers validate", () => {
    it("bugs.json is valid", () => {
        expect(() => makeRegister(bugsConfig).loadManifest()).not.toThrow();
    });

    it("chores.json is valid", () => {
        expect(() => makeRegister(choresConfig).loadManifest()).not.toThrow();
    });
});
