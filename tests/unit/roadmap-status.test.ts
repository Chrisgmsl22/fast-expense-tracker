// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
    validateManifest,
    deriveStatus,
    formatView,
    renderReadmeBlock,
    priorityDrift,
    type GitState,
    type Manifest,
} from "../../scripts/roadmap-status";

// --- validateManifest -------------------------------------------------------

const good = {
    branchPattern: "feat/{id}-",
    slices: [
        { id: "1.1", phase: 1, type: "foundation", title: "F", dependsOn: [] },
        {
            id: "1.2",
            phase: 1,
            type: "fan-out",
            title: "B",
            dependsOn: ["1.1"],
        },
    ],
};

describe("validateManifest", () => {
    it("accepts a well-formed manifest", () => {
        expect(validateManifest(good).slices).toHaveLength(2);
    });

    it("rejects a missing branchPattern", () => {
        expect(() => validateManifest({ slices: [] })).toThrow(/branchPattern/);
    });

    it("rejects a duplicate slice id", () => {
        const dup = { ...good, slices: [...good.slices, good.slices[0]] };
        expect(() => validateManifest(dup)).toThrow(/duplicate/);
    });

    it("rejects a dependsOn pointing at an unknown slice", () => {
        const bad = {
            branchPattern: "feat/{id}-",
            slices: [
                {
                    id: "1.1",
                    phase: 1,
                    type: "foundation",
                    title: "F",
                    dependsOn: ["9.9"],
                },
            ],
        };
        expect(() => validateManifest(bad)).toThrow(/unknown slice/);
    });

    it("rejects an invalid type", () => {
        const bad = {
            branchPattern: "feat/{id}-",
            slices: [
                {
                    id: "1.1",
                    phase: 1,
                    type: "bogus",
                    title: "F",
                    dependsOn: [],
                },
            ],
        };
        expect(() => validateManifest(bad)).toThrow(/invalid type/);
    });

    const withSlice = (over: Record<string, unknown>) => ({
        ...good,
        slices: [
            ...good.slices,
            {
                id: "1.3",
                phase: 1,
                type: "fan-out",
                title: "C",
                dependsOn: [],
                ...over,
            },
        ],
    });

    it("rejects a duplicate name", () => {
        const dup = {
            ...good,
            slices: [
                { ...good.slices[0], name: "same" },
                { ...good.slices[1], name: "same" },
            ],
        };
        expect(() => validateManifest(dup)).toThrow(
            /duplicate name "same" \(1.1, 1.2\)/,
        );
    });

    it("rejects a duplicate priority", () => {
        const dup = {
            ...good,
            slices: [
                { ...good.slices[0], name: "a", priority: 3 },
                { ...good.slices[1], name: "b", priority: 3 },
            ],
        };
        expect(() => validateManifest(dup)).toThrow(
            /duplicate priority 3 \(1.1, 1.2\)/,
        );
    });

    it("rejects a non-integer priority", () => {
        expect(() =>
            validateManifest(withSlice({ name: "c", priority: 2.5 })),
        ).toThrow(/1.3 priority must be a positive integer or null/);
    });

    it("rejects a priority on a superseded slice", () => {
        expect(() =>
            validateManifest(
                withSlice({ name: "c", priority: 4, supersededBy: "CHORE-1" }),
            ),
        ).toThrow(/1.3 is superseded, so it cannot carry a priority/);
    });

    it("rejects an empty supersededBy", () => {
        expect(() => validateManifest(withSlice({ supersededBy: "" }))).toThrow(
            /supersededBy must be a non-empty string/,
        );
    });
});

// --- deriveStatus -----------------------------------------------------------

const manifest: Manifest = {
    branchPattern: "feat/{id}-",
    slices: [
        {
            id: "1.1",
            phase: 1,
            type: "foundation",
            title: "Schema",
            dependsOn: [],
        },
        {
            id: "1.2",
            phase: 1,
            type: "fan-out",
            title: "Seed",
            dependsOn: ["1.1"],
        },
        {
            id: "1.5",
            phase: 1,
            type: "fan-out",
            title: "List",
            dependsOn: ["1.1"],
        },
        {
            id: "2.1",
            phase: 2,
            type: "foundation",
            title: "Summary util",
            dependsOn: ["phase:1"],
        },
    ],
};

const emptyGit: GitState = {
    currentBranch: "main",
    branches: [],
    worktrees: [],
    mergeSubjects: [],
};

const stateOf = (slices: { id: string; state: string }[], id: string) =>
    slices.find((s) => s.id === id)!.state;

describe("deriveStatus", () => {
    it("marks a slice shipped when a merge commit references its branch", () => {
        const git: GitState = {
            ...emptyGit,
            mergeSubjects: [
                "Merge pull request #9 from acme/feat/1.1-schema-auth-shells",
            ],
        };
        const { slices } = deriveStatus(manifest, git);
        expect(stateOf(slices, "1.1")).toBe("shipped");
    });

    it("marks deps-met unshipped slices available, others blocked", () => {
        const git: GitState = {
            ...emptyGit,
            mergeSubjects: ["Merge pull request #9 from acme/feat/1.1-schema"],
        };
        const { slices } = deriveStatus(manifest, git);
        expect(stateOf(slices, "1.2")).toBe("available"); // 1.1 shipped
        expect(stateOf(slices, "1.5")).toBe("available");
        expect(stateOf(slices, "2.1")).toBe("blocked"); // phase:1 not fully shipped
    });

    it("resolves a phase:N dependency only when every slice in that phase is shipped", () => {
        const git: GitState = {
            ...emptyGit,
            mergeSubjects: [
                "Merge ... feat/1.1-x",
                "Merge ... feat/1.2-x",
                "Merge ... feat/1.5-x",
            ],
        };
        const { slices } = deriveStatus(manifest, git);
        expect(stateOf(slices, "2.1")).toBe("available"); // all of phase 1 shipped
    });

    it("marks a slice in-progress when a live branch matches and it is not shipped", () => {
        const git: GitState = { ...emptyGit, branches: ["feat/1.2-seed"] };
        const { slices } = deriveStatus(manifest, git);
        expect(stateOf(slices, "1.2")).toBe("in-progress");
    });

    it("identifies the current slice via the branch pattern", () => {
        const git: GitState = {
            ...emptyGit,
            currentBranch: "feat/1.5-list-view",
        };
        const { mineId, slices } = deriveStatus(manifest, git);
        expect(mineId).toBe("1.5");
        expect(slices.find((s) => s.id === "1.5")!.mine).toBe(true);
    });

    it("treats a non-slice branch (chore/*) as no current slice", () => {
        const git: GitState = {
            ...emptyGit,
            currentBranch: "chore/some-tooling",
        };
        expect(deriveStatus(manifest, git).mineId).toBeNull();
    });

    it("does not confuse feat/1.1- with feat/1.10-", () => {
        const big: Manifest = {
            branchPattern: "feat/{id}-",
            slices: [
                {
                    id: "1.1",
                    phase: 1,
                    type: "fan-out",
                    title: "a",
                    dependsOn: [],
                },
                {
                    id: "1.10",
                    phase: 1,
                    type: "fan-out",
                    title: "b",
                    dependsOn: [],
                },
            ],
        };
        const git: GitState = {
            ...emptyGit,
            mergeSubjects: ["Merge ... feat/1.10-thing"],
        };
        const { slices } = deriveStatus(big, git);
        expect(stateOf(slices, "1.10")).toBe("shipped");
        expect(stateOf(slices, "1.1")).toBe("available"); // not shipped by 1.10's merge
    });

    it("marks a slice shipped via a feat(<id>) commit when no branch-named merge exists", () => {
        // 1.5 landed under a non-feat/1.5- branch (cf. 1.9 via docs/design-handoff);
        // only the conventional-commit subject reveals it shipped.
        const git: GitState = {
            ...emptyGit,
            commitSubjects: ["feat(1.5): list view + month filter"],
        };
        const { slices } = deriveStatus(manifest, git);
        expect(stateOf(slices, "1.5")).toBe("shipped");
    });

    it("scope detection does not confuse feat(1.1) with feat(1.10)", () => {
        const big: Manifest = {
            branchPattern: "feat/{id}-",
            slices: [
                {
                    id: "1.1",
                    phase: 1,
                    type: "fan-out",
                    title: "a",
                    dependsOn: [],
                },
                {
                    id: "1.10",
                    phase: 1,
                    type: "fan-out",
                    title: "b",
                    dependsOn: [],
                },
            ],
        };
        const git: GitState = {
            ...emptyGit,
            commitSubjects: ["feat(1.10): login re-skin"],
        };
        const { slices } = deriveStatus(big, git);
        expect(stateOf(slices, "1.10")).toBe("shipped");
        expect(stateOf(slices, "1.1")).toBe("available");
    });
});

// --- superseded slices + priorities ------------------------------------------

describe("superseded slices", () => {
    const replaced: Manifest = {
        branchPattern: "feat/{id}-",
        slices: [
            {
                id: "1.1",
                phase: 1,
                type: "foundation",
                title: "Old",
                dependsOn: [],
                supersededBy: "CHORE-6.c",
            },
            {
                id: "1.2",
                phase: 1,
                type: "fan-out",
                title: "Child",
                dependsOn: ["1.1"],
                name: "child",
                priority: 1,
            },
            {
                id: "2.1",
                phase: 2,
                type: "foundation",
                title: "Next phase",
                dependsOn: ["phase:1"],
                name: "next-phase",
                priority: 2,
            },
        ],
    };

    it("is never available or blocked, even with a live branch", () => {
        const git: GitState = { ...emptyGit, branches: ["feat/1.1-old"] };
        expect(stateOf(deriveStatus(replaced, git).slices, "1.1")).toBe(
            "superseded",
        );
    });

    it("counts as satisfied for a dependent slice", () => {
        expect(stateOf(deriveStatus(replaced, emptyGit).slices, "1.2")).toBe(
            "available",
        );
    });

    it("counts as done for a phase:N dependency", () => {
        const git: GitState = {
            ...emptyGit,
            mergeSubjects: ["Merge ... feat/1.2-child"],
        };
        expect(stateOf(deriveStatus(replaced, git).slices, "2.1")).toBe(
            "available",
        );
    });

    it("is listed as superseded in the status line", () => {
        expect(formatView(deriveStatus(replaced, emptyGit))).toContain(
            "Superseded: 1.1.",
        );
    });
});

describe("priorityDrift", () => {
    const one = (over: Record<string, unknown>): Manifest => ({
        branchPattern: "feat/{id}-",
        slices: [
            {
                id: "1.1",
                phase: 1,
                type: "foundation",
                title: "F",
                dependsOn: [],
                ...over,
            },
        ],
    });
    const shippedGit: GitState = {
        ...emptyGit,
        mergeSubjects: ["Merge ... feat/1.1-f"],
    };

    it("flags a shipped slice that still carries a priority, in the status line", () => {
        const model = deriveStatus(one({ name: "f", priority: 1 }), shippedGit);
        expect(priorityDrift(model)).toEqual(["1.1 is shipped but keeps P1"]);
        expect(formatView(model)).toContain(
            "slices.json drift, for the orchestrator to fix: 1.1 is shipped but keeps P1.",
        );
    });

    it.each([
        [{ name: "f" }, "1.1 is open but has no priority"],
        [{ priority: 1 }, "1.1 is open but has no name"],
        [{}, "1.1 is open but has no name or priority"],
    ])("names the missing field of an open slice (%o)", (over, message) => {
        const model = deriveStatus(one(over), emptyGit);
        expect(priorityDrift(model)).toEqual([message]);
    });

    it("lets an in-progress slice go either way", () => {
        const git: GitState = { ...emptyGit, branches: ["feat/1.1-f"] };
        expect(priorityDrift(deriveStatus(one({ name: "f" }), git))).toEqual(
            [],
        );
        expect(
            priorityDrift(deriveStatus(one({ name: "f", priority: 1 }), git)),
        ).toEqual([]);
    });

    it("is silent for a shipped slice with no priority", () => {
        const model = deriveStatus(one({ name: "f" }), shippedGit);
        expect(priorityDrift(model)).toEqual([]);
        expect(formatView(model)).not.toContain("slices.json drift");
    });
});

// --- formatView + renderReadmeBlock ----------------------------------------

describe("formatView", () => {
    it("summarises the current slice, shipped, available, and in-flight", () => {
        const git: GitState = {
            currentBranch: "feat/1.5-list",
            branches: ["feat/1.5-list", "feat/1.2-seed"],
            worktrees: [{ path: "../fet-1-2", branch: "feat/1.2-seed" }],
            mergeSubjects: ["Merge ... feat/1.1-schema"],
        };
        const view = formatView(deriveStatus(manifest, git));
        expect(view).toContain("[roadmap]");
        expect(view).toContain("On 1.5");
        expect(view).toContain("Shipped: 1.1");
        expect(view).toContain("In flight elsewhere: 1.2");
    });

    it("reports no current slice when off-pattern", () => {
        const git: GitState = {
            currentBranch: "main",
            branches: [],
            worktrees: [],
            mergeSubjects: [],
        };
        expect(formatView(deriveStatus(manifest, git))).toContain(
            "Not on a slice branch",
        );
    });

    it("summarises blocked slices as a count, not a full list", () => {
        const git: GitState = {
            currentBranch: "main",
            branches: [],
            worktrees: [],
            mergeSubjects: [],
        };
        const view = formatView(deriveStatus(manifest, git));
        // Nothing shipped → 1.2, 1.5 (need 1.1) and 2.1 (need phase:1) are blocked.
        expect(view).toContain("Blocked: 3 downstream");
    });

    it("labels a ranked in-flight slice by priority and name", () => {
        const git: GitState = { ...emptyGit, branches: ["feat/2.8-privacy"] };
        const view = formatView(
            deriveStatus(
                {
                    branchPattern: "feat/{id}-",
                    slices: [
                        {
                            id: "2.8",
                            phase: 2,
                            type: "fan-out",
                            title: "P",
                            dependsOn: [],
                            name: "privacy-toggle",
                            priority: 12,
                        },
                    ],
                },
                git,
            ),
        );
        expect(view).toContain(
            "In flight elsewhere: P12 privacy-toggle (2.8) (feat/2.8-privacy).",
        );
    });

    it("lists available slices in ascending priority by name", () => {
        const ranked: Manifest = {
            branchPattern: "feat/{id}-",
            slices: [
                {
                    id: "3.1",
                    phase: 3,
                    type: "foundation",
                    title: "a",
                    dependsOn: [],
                    name: "recurring-flag",
                    priority: 13,
                },
                {
                    id: "2.8",
                    phase: 2,
                    type: "fan-out",
                    title: "b",
                    dependsOn: [],
                    name: "privacy-toggle",
                    priority: 12,
                },
            ],
        };
        expect(formatView(deriveStatus(ranked, emptyGit))).toContain(
            "Available next: P12 privacy-toggle (2.8), P13 recurring-flag (3.1).",
        );
    });
});

describe("renderReadmeBlock", () => {
    it("produces a markdown table row per slice with its derived state", () => {
        const git: GitState = {
            currentBranch: "main",
            branches: [],
            worktrees: [],
            mergeSubjects: [],
        };
        const block = renderReadmeBlock(deriveStatus(manifest, git));
        expect(block).toContain("| 1.1 |");
        expect(block).toMatch(/available|blocked|shipped|in-progress/);
    });

    const ranked = (n: number) => ({
        id: `4.${n}`,
        phase: 4,
        type: "fan-out" as const,
        title: "t",
        dependsOn: [],
        name: `slice-${n}`,
        priority: n,
    });

    it("renders the name and priority of a ranked slice, and dashes for an unranked one", () => {
        const block = renderReadmeBlock(
            deriveStatus(
                {
                    branchPattern: "feat/{id}-",
                    slices: [
                        {
                            id: "1.1",
                            phase: 1,
                            type: "foundation",
                            title: "F",
                            dependsOn: [],
                        },
                        {
                            id: "2.8",
                            phase: 2,
                            type: "fan-out",
                            title: "P",
                            dependsOn: [],
                            name: "privacy-toggle",
                            priority: 12,
                        },
                    ],
                },
                {
                    ...emptyGit,
                    mergeSubjects: ["Merge ... feat/1.1-f"],
                },
            ),
        );
        expect(block).toContain(
            "| Slice | Name | Priority | Phase | Type | State | Depends on |",
        );
        expect(block).toContain(
            "| 2.8 | privacy-toggle | P12 | 2 | fan-out | available | — |",
        );
        expect(block).toContain(
            "| 1.1 | — | — | 1 | foundation | shipped | — |",
        );
    });

    it("lists every available slice in priority order, with no cap", () => {
        const slices = [4, 7, 1, 6, 2, 5, 3].map(ranked);
        const block = renderReadmeBlock(
            deriveStatus({ branchPattern: "feat/{id}-", slices }, emptyGit),
        );
        expect(block).toContain(
            "**Available next:** P1 slice-1 (4.1), P2 slice-2 (4.2), P3 slice-3 (4.3), P4 slice-4 (4.4), P5 slice-5 (4.5), P6 slice-6 (4.6), P7 slice-7 (4.7)\n",
        );
        expect(block).not.toContain("more");
    });
});
