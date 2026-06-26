// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
    validateManifest,
    deriveStatus,
    formatView,
    renderReadmeBlock,
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
});
