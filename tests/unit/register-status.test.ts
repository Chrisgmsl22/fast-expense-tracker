// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
    makeRegister,
    type RegisterConfig,
    type RegisterItem,
    type RegisterManifest,
} from "../../scripts/lib/register-status";
import { assertUnique } from "../../scripts/lib/priority";
import { bugsConfig } from "../../scripts/bugs-status";
import { choresConfig } from "../../scripts/chores-status";
import { loadManifest as loadSlices } from "../../scripts/roadmap-status";

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
        { value: "open", label: "Open", open: true },
        { value: "in-progress", label: "In progress", open: true },
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
            name: "first-widget",
            priority: 2,
            title: "First widget",
            description: "d1",
            status: "in-progress",
            spec: "docs/spec.md",
            pr: null,
            issue: 47,
        },
        {
            id: "W-2",
            name: "second-widget",
            priority: 1,
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

describe("validateManifest — names and priorities", () => {
    const widget = (over: Record<string, unknown>) => ({
        id: "W-9",
        name: "ninth-widget",
        priority: 9,
        title: "t",
        description: "d",
        status: "open",
        spec: null,
        pr: null,
        issue: null,
        ...over,
    });
    const withWidget = (over: Record<string, unknown>) => ({
        ...good,
        widgets: [...(good.widgets as unknown[]), widget(over)],
    });

    it("rejects a duplicate name", () => {
        expect(() =>
            reg.validateManifest(withWidget({ name: "first-widget" })),
        ).toThrow(/duplicate name "first-widget" \(W-1, W-9\)/);
    });

    it("rejects a duplicate priority", () => {
        expect(() => reg.validateManifest(withWidget({ priority: 1 }))).toThrow(
            /duplicate priority 1 \(W-2, W-9\)/,
        );
    });

    it.each([1.5, 0, -2, "3"])("rejects a priority of %s", (priority) => {
        expect(() => reg.validateManifest(withWidget({ priority }))).toThrow(
            /W-9 priority must be a positive integer or null/,
        );
    });

    it("rejects a name that is not kebab-case", () => {
        expect(() =>
            reg.validateManifest(withWidget({ name: "Ninth Widget" })),
        ).toThrow(/W-9 name must be kebab-case/);
    });

    it("rejects a priority on a closed item", () => {
        expect(() =>
            reg.validateManifest(withWidget({ status: "done" })),
        ).toThrow(/W-9 is done, so it cannot carry a priority/);
    });

    it("accepts a closed item that keeps its name but drops its priority", () => {
        expect(() =>
            reg.validateManifest(
                withWidget({ status: "done", priority: null }),
            ),
        ).not.toThrow();
    });

    it.each([
        ["name", { name: undefined }],
        ["priority", { priority: null }],
    ])("rejects an open item with no %s", (_field, over) => {
        expect(() => reg.validateManifest(withWidget(over))).toThrow(
            /W-9 is open, so it needs a name and a priority/,
        );
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
        expect(view).toContain("Open: P1 second-widget (W-2).");
        expect(view).toContain("In progress: P2 first-widget (W-1).");
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

    it("lists open items in ascending priority, top 5, and counts the rest", () => {
        const widgets = [7, 3, 6, 1, 5, 2, 4].map((p) => ({
            id: `W-${p}`,
            name: `widget-${p}`,
            priority: p,
            title: "t",
            description: "d",
            status: "open",
            spec: null,
            pr: null,
            issue: null,
        }));
        const view = reg.formatView(
            reg.deriveModel(
                reg.validateManifest({ branchPattern: "feat/{id}-", widgets }),
                "main",
            ),
        );
        expect(view).toContain(
            "Open: P1 widget-1 (W-1), P2 widget-2 (W-2), P3 widget-3 (W-3), P4 widget-4 (W-4), P5 widget-5 (W-5), +2 more.",
        );
    });

    it("keeps the closed groups as plain id lists", () => {
        const bugs = makeRegister(bugsConfig);
        const view = bugs.formatView(
            bugs.deriveModel(
                {
                    branchPattern: "fix/{id}-",
                    bugs: [
                        { id: "BUG-1", title: "t", status: "fixed" },
                        { id: "BUG-2", title: "t", status: "fixed" },
                    ],
                } as unknown as RegisterManifest,
                "main",
            ),
        );
        expect(view).toContain("Fixed, awaiting merge: BUG-1, BUG-2.");
    });
});

describe("renderBlock", () => {
    it("renders one row per item with issue/spec/pr fallbacks + tagged markers", () => {
        const block = reg.renderBlock(reg.deriveModel(good, "main"));
        expect(block).toContain("<!-- widgets:status:start -->");
        expect(block).toContain(
            "| W-1 | first-widget | P2 | in-progress | First widget | #47 | docs/spec.md | — |",
        );
        expect(block).toContain(
            "| W-2 | second-widget | P1 | open | Second widget | — | — | — |",
        );
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

    it("names and priorities are unique across all three registers", () => {
        const items = [
            ...(makeRegister(choresConfig).loadManifest()
                .chores as RegisterItem[]),
            ...(makeRegister(bugsConfig).loadManifest().bugs as RegisterItem[]),
            ...loadSlices().slices,
        ];
        expect(() => assertUnique("registers", items)).not.toThrow();
    });
});

describe("real closed statuses reject a priority", () => {
    const closed = [choresConfig, bugsConfig].flatMap((c) =>
        c.statuses
            .filter((s) => !s.open)
            .map((s) => [c.tag, s.value, c] as const),
    );

    it("covers every closed status of both registers", () => {
        expect(closed.map(([tag, value]) => `${tag}:${value}`)).toEqual([
            "chores:shipped",
            "chores:merged",
            "chores:cancelled",
            "bugs:fixed",
            "bugs:merged",
        ]);
    });

    it.each(closed)("%s rejects a priority on a %s item", (_tag, status, c) => {
        const item = {
            id: "X-1",
            name: "closed-item",
            priority: 1,
            title: "t",
            description: "d",
            plan: "p",
            proposedSolution: "s",
            status,
            spec: null,
            pr: null,
            issue: null,
        };
        const manifest = {
            branchPattern: c.branchPattern,
            [c.arrayField]: [item],
        };
        expect(() => makeRegister(c).validateManifest(manifest)).toThrow(
            `X-1 is ${status}, so it cannot carry a priority`,
        );
    });
});

describe("assertUnique across registers", () => {
    it("rejects a name reused in another register", () => {
        expect(() =>
            assertUnique("registers", [
                { id: "CHORE-1", name: "card-balance", priority: 1 },
                { id: "BUG-1", name: "card-balance", priority: 2 },
            ]),
        ).toThrow(/duplicate name "card-balance" \(CHORE-1, BUG-1\)/);
    });

    it("rejects a priority reused in another register", () => {
        expect(() =>
            assertUnique("registers", [
                { id: "CHORE-1", name: "a", priority: 4 },
                { id: "2.8", name: "b", priority: 4 },
            ]),
        ).toThrow(/duplicate priority 4 \(CHORE-1, 2.8\)/);
    });
});
