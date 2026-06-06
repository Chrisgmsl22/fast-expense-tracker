# Roadmap Status Derivation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-maintained "Currently active" roadmap pointer with a status view computed from a static slice manifest + live git state, surfaced automatically at SessionStart and on demand.

**Architecture:** A static JSON manifest (`docs/roadmap/slices.json`) holds the slice dependency graph only. A TypeScript engine (`scripts/roadmap-status.ts`) derives all dynamic state — shipped / in-progress / available / blocked / mine — from git (merge-commit grep + branch/worktree refs). The engine is consumed three ways: a read-only SessionStart hook (auto), `pnpm roadmap:status` (mid-session refresh), and `--write` (regenerates the README block). Pure derivation functions are unit-tested with fixture git-state; git I/O sits behind one boundary function.

**Tech Stack:** Node 24 (native TypeScript execution via type-stripping), Vitest 4, ESLint 9 + Prettier 3 (4-space), pnpm. Git is the only runtime dependency of the engine — no npm packages added.

**Design source:** [`docs/specs/0002-roadmap-status-derivation.md`](../specs/0002-roadmap-status-derivation.md).

**Spec refinements discovered during planning (carried as tasks here):**

- The engine is **TypeScript run directly by Node 24** (native type-stripping), not `.mjs` as the spec sketched — for typecheck/lint coverage. A one-line `scripts/package.json` (`{"type":"module"}`) scopes ESM to `scripts/` so `node scripts/roadmap-status.ts` runs as a module without flipping the repo root to ESM, and tests import it extensionless (clean for both Vitest and `tsc`). Behavior identical.
- `dependsOn` supports a **`phase:N`** token meaning "every slice in phase N is shipped" (needed for Foundation slices that depend on a whole prior phase, e.g. `1.*`). Task 8 amends the spec to document it.
- Manifest covers **37 slices**: spec §7 predates Phase 1's slice **1.7 (Observability)** (added per ADR-0005, present in the phase file). The manifest follows the current phase file; Task 8 notes the stale spec §7 count.

---

## PR split

Shipped as two PRs so the working feature lands fast and the doc churn is reviewed separately:

- **PR A — core (Tasks 1–6 + 9):** manifest, engine, `scripts/package.json`, tests, `pnpm roadmap:status`, README markers + generated block, and the SessionStart hook. All-new code + tiny config edits; this is the working feature. Ships with the design docs (spec 0002 + this plan).
- **PR B — migration (Tasks 7–8):** phase-file trim + conventions/CLAUDE.md rewrite + ADR + spec status flip. Pure cleanup, no logic. Branches off PR A (depends on the engine for README regen). Delegated to a subagent.

---

## File structure

| File                                                                                      | Responsibility                                                                                                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/roadmap/slices.json`                                                                | **Create.** Static slice graph: `branchPattern` + 37 slices (`id`, `phase`, `type`, `title`, `dependsOn`). The only hand-edited artifact.                   |
| `scripts/package.json`                                                                    | **Create.** One line: `{"type":"module"}` — scopes ESM to `scripts/` so Node 24 runs `.ts` files here as modules.                                           |
| `scripts/roadmap-status.ts`                                                               | **Create.** Engine: types, `validateManifest`, pure `deriveStatus`/`formatView`/`renderReadmeBlock`, git boundary `getGitState`, README writer, CLI `main`. |
| `tests/unit/roadmap-manifest.test.ts`                                                     | **Create.** Manifest integrity (parse, unique ids, referential deps, no self-dep).                                                                          |
| `tests/unit/roadmap-status.test.ts`                                                       | **Create.** Pure-logic tests for `validateManifest`, `deriveStatus`, `formatView`, `renderReadmeBlock` against fixtures.                                    |
| `.claude/hooks/slice-status.sh`                                                           | **Create.** SessionStart hook → runs the engine in `--hook` mode. Read-only.                                                                                |
| `.claude/settings.json`                                                                   | **Modify.** Register the new SessionStart hook alongside `branch-status.sh`. (Sign-off gated.)                                                              |
| `package.json`                                                                            | **Modify.** Add `"roadmap:status": "node scripts/roadmap-status.ts"`.                                                                                       |
| `docs/roadmap/README.md`                                                                  | **Modify.** Insert `<!-- roadmap:status:start -->`…`<!-- roadmap:status:end -->` markers; the block becomes generated.                                      |
| `docs/roadmap/phase-*.md`                                                                 | **Modify.** Remove the structured `**Type**`/`**Depends on**`/`**Status**` fields (sign-off gated).                                                         |
| `docs/specs/0002-...md`, `docs/conventions/*.md`, `CLAUDE.md`, `docs/decisions/00NN-*.md` | **Modify/Create.** Spec amendment + convention updates + ADR (sign-off gated).                                                                              |

---

## Task 1: Manifest — `docs/roadmap/slices.json`

**Files:**

- Test: `tests/unit/roadmap-manifest.test.ts`
- Create: `docs/roadmap/slices.json`

- [ ] **Step 1: Write the failing integrity test**

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(
    new URL("../../docs/roadmap/slices.json", import.meta.url),
);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    branchPattern: string;
    slices: {
        id: string;
        phase: number;
        type: string;
        title: string;
        dependsOn: string[];
    }[];
};

describe("slices.json manifest", () => {
    it("declares a branchPattern containing {id}", () => {
        expect(manifest.branchPattern).toContain("{id}");
    });

    it("has unique slice ids", () => {
        const ids = manifest.slices.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("uses only valid slice types", () => {
        for (const s of manifest.slices) {
            expect(["foundation", "fan-out", "integration"]).toContain(s.type);
        }
    });

    it("references only existing slice ids or known phases in dependsOn", () => {
        const ids = new Set(manifest.slices.map((s) => s.id));
        const phases = new Set(manifest.slices.map((s) => s.phase));
        for (const s of manifest.slices) {
            for (const dep of s.dependsOn) {
                if (dep.startsWith("phase:")) {
                    expect(phases.has(Number(dep.slice("phase:".length)))).toBe(
                        true,
                    );
                } else {
                    expect(ids.has(dep)).toBe(true);
                }
                expect(dep).not.toBe(s.id); // no self-dependency
            }
        }
    });

    it("covers all 8 phases", () => {
        expect(new Set(manifest.slices.map((s) => s.phase))).toEqual(
            new Set([0, 1, 2, 3, 4, 5, 6, 7]),
        );
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test roadmap-manifest`
Expected: FAIL — cannot read `docs/roadmap/slices.json` (file does not exist).

- [ ] **Step 3: Author the manifest**

Create `docs/roadmap/slices.json` exactly as below (data transcribed from `docs/specs/0001-initial-design.md §7` and the current phase files; `1.7` comes from `phase-1-foundation.md`):

```json
{
    "branchPattern": "feat/{id}-",
    "slices": [
        {
            "id": "0.1",
            "phase": 0,
            "type": "foundation",
            "title": "Next.js + TS-strict + Tailwind + shadcn + Prisma + Neon scaffold",
            "dependsOn": []
        },
        {
            "id": "0.2",
            "phase": 0,
            "type": "fan-out",
            "title": "Vercel deploy hookup",
            "dependsOn": ["0.1"]
        },
        {
            "id": "0.3",
            "phase": 0,
            "type": "fan-out",
            "title": "GitHub Actions CI",
            "dependsOn": ["0.1"]
        },
        {
            "id": "0.4",
            "phase": 0,
            "type": "fan-out",
            "title": "Pre-commit hook",
            "dependsOn": ["0.1"]
        },

        {
            "id": "1.1",
            "phase": 1,
            "type": "foundation",
            "title": "Schema + Prisma client + Auth.js config + page shells",
            "dependsOn": ["phase:0"]
        },
        {
            "id": "1.2",
            "phase": 1,
            "type": "fan-out",
            "title": "Seed script",
            "dependsOn": ["1.1"]
        },
        {
            "id": "1.3",
            "phase": 1,
            "type": "fan-out",
            "title": "Login UI + session middleware",
            "dependsOn": ["1.1"]
        },
        {
            "id": "1.4",
            "phase": 1,
            "type": "fan-out",
            "title": "Capture modal + create server action",
            "dependsOn": ["1.1"]
        },
        {
            "id": "1.5",
            "phase": 1,
            "type": "fan-out",
            "title": "List view + month filter",
            "dependsOn": ["1.1"]
        },
        {
            "id": "1.6",
            "phase": 1,
            "type": "integration",
            "title": "Edit + delete + Playwright smoke",
            "dependsOn": ["1.4", "1.5"]
        },
        {
            "id": "1.7",
            "phase": 1,
            "type": "fan-out",
            "title": "Observability — Sentry + Speed Insights",
            "dependsOn": ["1.1"]
        },

        {
            "id": "2.1",
            "phase": 2,
            "type": "foundation",
            "title": "getMonthSummary util + summary header shell",
            "dependsOn": ["phase:1"]
        },
        {
            "id": "2.2",
            "phase": 2,
            "type": "fan-out",
            "title": "Settings page UI",
            "dependsOn": ["2.1"]
        },
        {
            "id": "2.3",
            "phase": 2,
            "type": "fan-out",
            "title": "Top-line summary widget (Spent/Saved/Remaining)",
            "dependsOn": ["2.1"]
        },
        {
            "id": "2.4",
            "phase": 2,
            "type": "fan-out",
            "title": "Category rollup table",
            "dependsOn": ["2.1"]
        },
        {
            "id": "2.5",
            "phase": 2,
            "type": "fan-out",
            "title": "Settlement defaults + badges + Owed-to-you card",
            "dependsOn": ["2.1"]
        },
        {
            "id": "2.6",
            "phase": 2,
            "type": "integration",
            "title": "Settle-up modal + e2e",
            "dependsOn": ["2.5"]
        },

        {
            "id": "3.1",
            "phase": 3,
            "type": "foundation",
            "title": "Recurring checkbox + badge",
            "dependsOn": ["1.4", "1.5", "1.6"]
        },
        {
            "id": "3.2",
            "phase": 3,
            "type": "fan-out",
            "title": "getRecurringForCloning + month-rollover detection",
            "dependsOn": ["3.1"]
        },
        {
            "id": "3.3",
            "phase": 3,
            "type": "fan-out",
            "title": "Recurring prompt suppression setting",
            "dependsOn": ["2.2"]
        },
        {
            "id": "3.4",
            "phase": 3,
            "type": "integration",
            "title": "Clone modal + date-shift logic + e2e",
            "dependsOn": ["3.2", "3.3"]
        },

        {
            "id": "4.1",
            "phase": 4,
            "type": "foundation",
            "title": "/dashboard route + 4-card layout + chart lib + 50/25/25 widget",
            "dependsOn": ["phase:2"]
        },
        {
            "id": "4.2",
            "phase": 4,
            "type": "fan-out",
            "title": "By-category donut chart",
            "dependsOn": ["4.1"]
        },
        {
            "id": "4.3",
            "phase": 4,
            "type": "fan-out",
            "title": "By-card bar chart",
            "dependsOn": ["4.1"]
        },
        {
            "id": "4.4",
            "phase": 4,
            "type": "fan-out",
            "title": "Month picker propagation",
            "dependsOn": ["4.1"]
        },
        {
            "id": "4.5",
            "phase": 4,
            "type": "integration",
            "title": "Subcategory drilldown + e2e",
            "dependsOn": ["4.2"]
        },

        {
            "id": "5.1",
            "phase": 5,
            "type": "foundation",
            "title": "Currency picker + originalAmount + Zod",
            "dependsOn": ["1.4", "1.6"]
        },
        {
            "id": "5.2",
            "phase": 5,
            "type": "integration",
            "title": "Foreign-amount display + e2e",
            "dependsOn": ["5.1"]
        },

        {
            "id": "6.1",
            "phase": 6,
            "type": "foundation",
            "title": "Responsive audit + FAB + useMediaQuery",
            "dependsOn": ["phase:1", "phase:2"]
        },
        {
            "id": "6.2",
            "phase": 6,
            "type": "fan-out",
            "title": "Capture form responsive split",
            "dependsOn": ["6.1"]
        },
        {
            "id": "6.3",
            "phase": 6,
            "type": "fan-out",
            "title": "Optimistic UI (useOptimistic)",
            "dependsOn": ["6.1"]
        },
        {
            "id": "6.4",
            "phase": 6,
            "type": "fan-out",
            "title": "PWA manifest + install prompt + icons",
            "dependsOn": ["6.1"]
        },
        {
            "id": "6.5",
            "phase": 6,
            "type": "integration",
            "title": "Mobile regression sweep + Playwright mobile",
            "dependsOn": ["6.2", "6.3"]
        },

        {
            "id": "7.1",
            "phase": 7,
            "type": "foundation",
            "title": "Resend integration + env + React Email scaffold",
            "dependsOn": ["phase:2"]
        },
        {
            "id": "7.2",
            "phase": 7,
            "type": "fan-out",
            "title": "Email template content + preview route",
            "dependsOn": ["7.1"]
        },
        {
            "id": "7.3",
            "phase": 7,
            "type": "fan-out",
            "title": "Vercel cron + summary computation",
            "dependsOn": ["7.1"]
        },
        {
            "id": "7.4",
            "phase": 7,
            "type": "integration",
            "title": "Cron e2e test",
            "dependsOn": ["7.2", "7.3"]
        }
    ]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test roadmap-manifest`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add docs/roadmap/slices.json tests/unit/roadmap-manifest.test.ts
git commit -m "feat(roadmap): add static slice manifest (37 slices, 8 phases)"
```

---

## Task 2: Engine types + `validateManifest`

**Files:**

- Create: `scripts/roadmap-status.ts`
- Test: `tests/unit/roadmap-status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validateManifest } from "../../scripts/roadmap-status";

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test roadmap-status`
Expected: FAIL — cannot resolve `../../scripts/roadmap-status.ts` (file does not exist).

- [ ] **Step 3: Create the engine file with types + validateManifest**

First create `scripts/package.json` so Node runs `.ts` files in this directory as ESM modules:

```json
{ "type": "module" }
```

Then create `scripts/roadmap-status.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export type SliceType = "foundation" | "fan-out" | "integration";

export interface SliceDef {
    id: string;
    phase: number;
    type: SliceType;
    title: string;
    /** slice ids ("1.1") or phase tokens ("phase:1") */
    dependsOn: string[];
}

export interface Manifest {
    /** template containing "{id}", e.g. "feat/{id}-" */
    branchPattern: string;
    slices: SliceDef[];
}

const SLICE_TYPES: SliceType[] = ["foundation", "fan-out", "integration"];
const PHASE_PREFIX = "phase:";

export function validateManifest(data: unknown): Manifest {
    if (typeof data !== "object" || data === null) {
        throw new Error("slices.json: expected a JSON object");
    }
    const m = data as Record<string, unknown>;
    if (
        typeof m.branchPattern !== "string" ||
        !m.branchPattern.includes("{id}")
    ) {
        throw new Error(
            'slices.json: "branchPattern" must be a string containing "{id}"',
        );
    }
    if (!Array.isArray(m.slices)) {
        throw new Error('slices.json: "slices" must be an array');
    }

    const ids = new Set<string>();
    for (const raw of m.slices) {
        const s = raw as Record<string, unknown>;
        if (typeof s.id !== "string")
            throw new Error("slices.json: a slice has a non-string id");
        if (ids.has(s.id))
            throw new Error(`slices.json: duplicate slice id "${s.id}"`);
        ids.add(s.id);
        if (typeof s.phase !== "number")
            throw new Error(`slices.json: slice ${s.id} missing numeric phase`);
        if (!SLICE_TYPES.includes(s.type as SliceType)) {
            throw new Error(
                `slices.json: slice ${s.id} has invalid type "${String(s.type)}"`,
            );
        }
        if (typeof s.title !== "string")
            throw new Error(`slices.json: slice ${s.id} missing title`);
        if (!Array.isArray(s.dependsOn))
            throw new Error(
                `slices.json: slice ${s.id} dependsOn must be an array`,
            );
    }

    const phases = new Set((m.slices as SliceDef[]).map((s) => s.phase));
    for (const s of m.slices as SliceDef[]) {
        for (const dep of s.dependsOn) {
            if (dep === s.id)
                throw new Error(`slices.json: slice ${s.id} depends on itself`);
            if (dep.startsWith(PHASE_PREFIX)) {
                const n = Number(dep.slice(PHASE_PREFIX.length));
                if (!phases.has(n))
                    throw new Error(
                        `slices.json: slice ${s.id} depends on unknown ${dep}`,
                    );
            } else if (!ids.has(dep)) {
                throw new Error(
                    `slices.json: slice ${s.id} depends on unknown slice "${dep}"`,
                );
            }
        }
    }
    return data as Manifest;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test roadmap-status`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/package.json scripts/roadmap-status.ts tests/unit/roadmap-status.test.ts
git commit -m "feat(roadmap): manifest types + validation"
```

---

## Task 3: Pure derivation — `deriveStatus`

**Files:**

- Modify: `scripts/roadmap-status.ts`
- Test: `tests/unit/roadmap-status.test.ts`

- [ ] **Step 1: Add failing tests for deriveStatus**

Append to `tests/unit/roadmap-status.test.ts`:

```ts
import {
    deriveStatus,
    type GitState,
    type Manifest,
} from "../../scripts/roadmap-status";

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
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm test roadmap-status`
Expected: FAIL — `deriveStatus` / `GitState` not exported.

- [ ] **Step 3: Implement GitState type + deriveStatus**

Append to `scripts/roadmap-status.ts`:

```ts
export type SliceState = "shipped" | "in-progress" | "available" | "blocked";

export interface GitState {
    /** result of `git rev-parse --abbrev-ref HEAD`, e.g. "feat/1.4-capture" or "main" */
    currentBranch: string;
    /** local + remote branch shortnames (remote "origin/" prefix stripped) */
    branches: string[];
    worktrees: { path: string; branch: string }[];
    /** subjects (%s) of merge commits on origin/main */
    mergeSubjects: string[];
}

export interface SliceStatus extends SliceDef {
    state: SliceState;
    mine: boolean;
    /** the live branch backing an in-progress slice, if any */
    branch?: string;
    /** the worktree path backing an in-progress slice, if any */
    worktree?: string;
    /** unmet dependencies, only populated when state === "blocked" */
    missingDeps: string[];
}

export interface RoadmapModel {
    slices: SliceStatus[];
    mineId: string | null;
}

export function branchPrefixFor(id: string, branchPattern: string): string {
    return branchPattern.replace("{id}", id);
}

export function deriveStatus(manifest: Manifest, git: GitState): RoadmapModel {
    const prefix = (id: string) => branchPrefixFor(id, manifest.branchPattern);

    // Pass 1: shipped — a merge commit subject contains the slice's branch prefix.
    const shipped = new Map<string, boolean>();
    for (const s of manifest.slices) {
        shipped.set(
            s.id,
            git.mergeSubjects.some((subj) => subj.includes(prefix(s.id))),
        );
    }
    const isShipped = (id: string) => shipped.get(id) === true;
    const phaseShipped = (n: number) =>
        manifest.slices
            .filter((s) => s.phase === n)
            .every((s) => isShipped(s.id));
    const depMet = (dep: string) =>
        dep.startsWith(PHASE_PREFIX)
            ? phaseShipped(Number(dep.slice(PHASE_PREFIX.length)))
            : isShipped(dep);

    // Pass 2: classify the rest.
    const slices: SliceStatus[] = manifest.slices.map((s) => {
        const p = prefix(s.id);
        const branch = git.branches.find((b) => b.startsWith(p));
        const worktree = git.worktrees.find((w) => w.branch.startsWith(p));
        const mine = git.currentBranch.startsWith(p);

        let state: SliceState;
        let missingDeps: string[] = [];
        if (isShipped(s.id)) {
            state = "shipped";
        } else if (branch || worktree) {
            state = "in-progress";
        } else {
            missingDeps = s.dependsOn.filter((d) => !depMet(d));
            state = missingDeps.length === 0 ? "available" : "blocked";
        }

        return {
            ...s,
            state,
            mine,
            branch,
            worktree: worktree?.path,
            missingDeps,
        };
    });

    const mineId = slices.find((s) => s.mine)?.id ?? null;
    return { slices, mineId };
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `pnpm test roadmap-status`
Expected: PASS (12 tests total).

- [ ] **Step 5: Commit**

```bash
git add scripts/roadmap-status.ts tests/unit/roadmap-status.test.ts
git commit -m "feat(roadmap): derive slice status from manifest + git state"
```

---

## Task 4: `formatView` + `renderReadmeBlock`

**Files:**

- Modify: `scripts/roadmap-status.ts`
- Test: `tests/unit/roadmap-status.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/unit/roadmap-status.test.ts`:

```ts
import { formatView, renderReadmeBlock } from "../../scripts/roadmap-status";

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test roadmap-status`
Expected: FAIL — `formatView` / `renderReadmeBlock` not exported.

- [ ] **Step 3: Implement both**

Append to `scripts/roadmap-status.ts`:

```ts
const idList = (slices: SliceStatus[]) =>
    slices.map((s) => s.id).join(", ") || "none";

export function formatView(model: RoadmapModel): string {
    const byState = (st: SliceState) =>
        model.slices.filter((s) => s.state === st);
    const mine = model.slices.find((s) => s.mine);
    const inFlightElsewhere = byState("in-progress").filter((s) => !s.mine);

    const parts: string[] = [];
    parts.push(
        mine
            ? `On ${mine.id} (${mine.type}) — "${mine.title}".`
            : "Not on a slice branch (current ref maps to no slice).",
    );
    parts.push(`Shipped: ${idList(byState("shipped"))}.`);
    parts.push(`Available next: ${idList(byState("available"))}.`);

    const blocked = byState("blocked");
    if (blocked.length) {
        parts.push(
            "Blocked: " +
                blocked
                    .map((s) => `${s.id} (needs ${s.missingDeps.join(", ")})`)
                    .join("; ") +
                ".",
        );
    }
    if (inFlightElsewhere.length) {
        const where = (s: SliceStatus) =>
            s.worktree
                ? ` (worktree ${s.worktree})`
                : s.branch
                  ? ` (${s.branch})`
                  : "";
        parts.push(
            "In flight elsewhere: " +
                inFlightElsewhere.map((s) => `${s.id}${where(s)}`).join("; ") +
                ". ⚠️ Do not claim an in-flight slice; PR state is git-inferred — confirm via GitHub MCP if acting on it.",
        );
    }
    return "[roadmap] " + parts.join(" ");
}

export function renderReadmeBlock(model: RoadmapModel): string {
    const available = model.slices.filter((s) => s.state === "available");
    const inProgress = model.slices.filter((s) => s.state === "in-progress");

    const header = [
        "<!-- roadmap:status:start -->",
        "<!-- Generated by `pnpm roadmap:status --write` — do not hand-edit. -->",
        "",
        "## Currently active (derived)",
        "",
        `**In progress:** ${idList(inProgress)} · **Available next:** ${idList(available)}`,
        "",
        "| Slice | Phase | Type | State | Depends on |",
        "| ----- | ----- | ---- | ----- | ---------- |",
    ];
    const rows = model.slices.map(
        (s) =>
            `| ${s.id} | ${s.phase} | ${s.type} | ${s.state} | ${s.dependsOn.join(", ") || "—"} |`,
    );
    return [...header, ...rows, "", "<!-- roadmap:status:end -->"].join("\n");
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `pnpm test roadmap-status`
Expected: PASS (16 tests total).

- [ ] **Step 5: Commit**

```bash
git add scripts/roadmap-status.ts tests/unit/roadmap-status.test.ts
git commit -m "feat(roadmap): human view + generated README block"
```

---

## Task 5: Git boundary + CLI + README markers + `pnpm roadmap:status`

**Files:**

- Modify: `scripts/roadmap-status.ts` (add `getGitState`, `loadManifest`, `writeReadme`, `main`)
- Modify: `package.json` (add script)
- Modify: `docs/roadmap/README.md` (insert markers)

- [ ] **Step 1: Add git boundary, loader, README writer, and CLI entry**

Append to `scripts/roadmap-status.ts`:

```ts
export function getGitState(cwd: string = process.cwd()): GitState {
    const git = (args: string[]) =>
        execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    const lines = (out: string) =>
        out
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

    let currentBranch = "HEAD";
    try {
        currentBranch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    } catch {
        /* not a repo */
    }

    let branches: string[] = [];
    try {
        branches = lines(git(["branch", "--all", "--format=%(refname:short)"]))
            .map((b) => b.replace(/^origin\//, ""))
            .filter((b) => b !== "HEAD" && !b.includes("->"));
    } catch {
        /* ignore */
    }

    const worktrees: { path: string; branch: string }[] = [];
    try {
        let path = "";
        for (const line of git(["worktree", "list", "--porcelain"]).split(
            "\n",
        )) {
            if (line.startsWith("worktree "))
                path = line.slice("worktree ".length);
            else if (line.startsWith("branch ")) {
                worktrees.push({
                    path,
                    branch: line
                        .slice("branch ".length)
                        .replace("refs/heads/", ""),
                });
            }
        }
    } catch {
        /* ignore */
    }

    let mergeSubjects: string[] = [];
    try {
        mergeSubjects = lines(
            git(["log", "origin/main", "--merges", "--format=%s"]),
        );
    } catch {
        try {
            mergeSubjects = lines(
                git(["log", "main", "--merges", "--format=%s"]),
            );
        } catch {
            /* ignore */
        }
    }

    return { currentBranch, branches, worktrees, mergeSubjects };
}

export function loadManifest(cwd: string = process.cwd()): Manifest {
    const path = `${cwd}/docs/roadmap/slices.json`;
    let raw: string;
    try {
        raw = readFileSync(path, "utf8");
    } catch {
        throw new Error(`cannot read manifest at ${path}`);
    }
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        throw new Error(`slices.json: invalid JSON — ${(e as Error).message}`);
    }
    return validateManifest(data);
}

const README_START = "<!-- roadmap:status:start -->";
const README_END = "<!-- roadmap:status:end -->";

function writeReadme(cwd: string, model: RoadmapModel): void {
    const path = `${cwd}/docs/roadmap/README.md`;
    const current = readFileSync(path, "utf8");
    const start = current.indexOf(README_START);
    const end = current.indexOf(README_END);
    if (start === -1 || end === -1) {
        throw new Error(
            `README.md is missing the ${README_START} … ${README_END} markers`,
        );
    }
    const next =
        current.slice(0, start) +
        renderReadmeBlock(model) +
        current.slice(end + README_END.length);
    writeFileSync(path, next);
}

function emitHookEnvelope(context: string): void {
    process.stdout.write(
        JSON.stringify({
            hookSpecificOutput: {
                hookEventName: "SessionStart",
                additionalContext: context,
            },
        }) + "\n",
    );
}

function main(argv: string[]): void {
    const cwd = process.cwd();
    const mode = argv[2] ?? "";

    let model: RoadmapModel;
    try {
        model = deriveStatus(loadManifest(cwd), getGitState(cwd));
    } catch (e) {
        const msg = `[roadmap] status unavailable: ${(e as Error).message}`;
        if (mode === "--hook") {
            emitHookEnvelope(msg);
            return;
        } // never fail the hook
        console.error(msg);
        process.exit(1);
    }

    switch (mode) {
        case "--json":
            process.stdout.write(JSON.stringify(model, null, 2) + "\n");
            break;
        case "--hook":
            emitHookEnvelope(formatView(model));
            break;
        case "--write":
            writeReadme(cwd, model);
            console.log("README roadmap block regenerated.");
            break;
        default:
            console.log(formatView(model));
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main(process.argv);
}
```

- [ ] **Step 2: Add the package.json script**

In `package.json`, add to `"scripts"` (after `"test"`):

```json
        "roadmap:status": "node scripts/roadmap-status.ts",
```

- [ ] **Step 3: Insert the markers into `docs/roadmap/README.md`**

Replace the hand-written "## Currently active" section (lines beginning `## Currently active` through the blank line before `## All phases`) with exactly:

```markdown
<!-- roadmap:status:start -->
<!-- Generated by `pnpm roadmap:status --write` — do not hand-edit. -->
<!-- roadmap:status:end -->
```

(The `--write` run in the next step fills it in.)

- [ ] **Step 4: Verify the engine runs end-to-end under Node 24**

Run: `pnpm roadmap:status`
Expected: a single `[roadmap] …` line. On this branch (`chore/roadmap-status-derivation`, off-pattern) it should read `Not on a slice branch …`, list `Shipped: 0.1, 0.2, 0.3, 0.4, 1.1` (Phase 0 + 1.1 have merged), and `Available next: 1.2, 1.3, 1.4, 1.5, 1.7`.

> If Node errors running the `.ts` file, confirm `node --version` is ≥ 24 (type-stripping is on by default) and that `scripts/package.json` (`{"type":"module"}`) exists. Do not add a transpiler — the repo targets Node 24.

- [ ] **Step 5: Generate the README block + verify the hook envelope**

Run: `pnpm roadmap:status --write`
Then: `node scripts/roadmap-status.ts --hook | node -e "process.stdin.on('data',d=>JSON.parse(d))"` — exits 0 (valid JSON).
Inspect: `docs/roadmap/README.md` now contains the filled `<!-- roadmap:status:start -->` table.

- [ ] **Step 6: Run lint + typecheck + full tests**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green. (If `tsc` does not see `scripts/`, add `"scripts/**/*.ts"` to `tsconfig.json`'s `include` — verify first; only change if typecheck misses the file.)

- [ ] **Step 7: Commit**

```bash
git add scripts/roadmap-status.ts package.json docs/roadmap/README.md
git commit -m "feat(roadmap): git state reader, CLI, and generated README block"
```

---

## Task 6: SessionStart hook (sign-off gated)

> **Harness change.** Before editing `.claude/settings.json`, confirm the standing sign-off with the user (per CLAUDE.md rule #6). The branch-sync hook precedent is `.claude/hooks/branch-status.sh`.

**Files:**

- Create: `.claude/hooks/slice-status.sh`
- Modify: `.claude/settings.json`

- [ ] **Step 1: Create the hook script**

Create `.claude/hooks/slice-status.sh`:

```bash
#!/usr/bin/env bash
#
# SessionStart hook: roadmap slice-status view.
#
# Read-only. Delegates to the TypeScript engine, which derives the current
# slice / available slices / in-flight slices from docs/roadmap/slices.json
# + git, and prints a SessionStart envelope. Never mutates anything; never
# fails the session (engine swallows errors into an informational envelope).

set -uo pipefail

# Need node (repo targets Node >=24). If absent, stay silent rather than erroring.
command -v node >/dev/null 2>&1 || exit 0

node "${CLAUDE_PROJECT_DIR}/scripts/roadmap-status.ts" --hook 2>/dev/null || exit 0
```

- [ ] **Step 2: Make it executable and pipe-test it**

```bash
chmod +x .claude/hooks/slice-status.sh
echo '{}' | CLAUDE_PROJECT_DIR="$PWD" bash .claude/hooks/slice-status.sh
```

Expected: a JSON object with `hookSpecificOutput.hookEventName == "SessionStart"` and an `additionalContext` containing `[roadmap]`.

- [ ] **Step 3: Register the hook in `.claude/settings.json`**

Add a second entry to the existing `hooks.SessionStart` array (do not replace the `branch-status.sh` entry):

```json
{
    "hooks": [
        {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/slice-status.sh\"",
            "timeout": 20,
            "statusMessage": "Computing roadmap status..."
        }
    ]
}
```

- [ ] **Step 4: Validate settings JSON + hook schema**

Run: `jq -e '.hooks.SessionStart[].hooks[] | select(.command | contains("slice-status"))' .claude/settings.json`
Expected: exit 0, prints the matching hook object.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/slice-status.sh .claude/settings.json
git commit -m "feat(roadmap): SessionStart hook surfacing derived slice status"
```

---

## Task 7: Phase-file trim (sign-off gated)

> **Docs/process change.** Confirm sign-off. This removes the now-derived fields so nothing duplicates the manifest.

**Files:**

- Modify: every `docs/roadmap/phase-*.md`

- [ ] **Step 1: Remove the structured fields from each slice in each phase file**

In each `docs/roadmap/phase-N-*.md`, delete the per-slice `**Type**: …`, `**Depends on**: …`, and `**Status**: …` lines. **Keep** the slice header (`#### N.M: … [PR]`), the prose description, the `##### Tasks` checklist, the Plan block, and genuinely-narrative notes (e.g. `ADRs: [0007](...)` pointers — move these into the description prose if they sat on the deleted `**Status**` line). Also remove the phase-header `**Status**: … — N.M next up` line (now derived).

- [ ] **Step 2: Verify no derived fields remain as parsed truth**

Run: `grep -rn '\*\*\(Type\|Depends on\|Status\)\*\*' docs/roadmap/phase-*.md`
Expected: no output (all removed).

- [ ] **Step 3: Regenerate the README block (reflects the trim is cosmetic to derivation)**

Run: `pnpm roadmap:status --write && pnpm test roadmap-manifest`
Expected: README regenerated; manifest test still green.

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap/phase-*.md docs/roadmap/README.md
git commit -m "docs(roadmap): trim derived fields from phase files"
```

---

## Task 8: Spec amendment, conventions, ADR (sign-off gated)

> **Harness/convention change.** `docs/conventions/**`, `CLAUDE.md`, and `docs/decisions/**` are sign-off-gated (rule #6). Confirm before editing.

**Files:**

- Modify: `docs/specs/0002-roadmap-status-derivation.md`
- Modify: `docs/conventions/session-handoff.md`, `docs/conventions/parallel-slicing.md`
- Modify: `CLAUDE.md`
- Create: `docs/decisions/00NN-derived-roadmap-status.md` (next free ADR number)

- [ ] **Step 1: Amend the spec for the two planning discoveries**

In `0002-roadmap-status-derivation.md` §3.1, document the `phase:N` dependency token (a dep satisfied iff every slice in phase N is shipped) and add it to the `dependsOn` field description; in §3.2's "available" rule, note that a `phase:N` dep resolves via phase-completion. Add a one-line note that the manifest carries **37** slices (Phase 1 includes 1.7, added after spec 0001 §7's count of 6). Flip the header **Status** to `Accepted`.

- [ ] **Step 2: Update the conventions to the derived model**

In `session-handoff.md`: change the "orchestrator hand-advances the pointer" / "workers flip their own status" rules to: status is **derived, never written**; the README "Currently active" block is **generated** (`pnpm roadmap:status --write`); `slices.json` is edited only when planning slices (single-writer, no worker contention). In `parallel-slicing.md` §"Status & the roadmap index": replace the hand-maintained-pointer paragraph with a pointer to the derived view + `slices.json`.

- [ ] **Step 3: Update CLAUDE.md session-startup**

Add under "Session startup": the SessionStart `[roadmap]` view tells you your slice, available slices, and in-flight slices — **pick only from _available_, never claim an _in-flight_ slice, and MCP-confirm an ambiguous "unshipped" before acting** (squash/rebase blind spot). Note `pnpm roadmap:status` for mid-session refresh.

- [ ] **Step 4: Write the ADR**

Create `docs/decisions/00NN-derived-roadmap-status.md` recording: decision (static manifest + fully-derived status), rationale (kill the stale-pointer chore; an index over data should be computed), the merge-commit-grep detection mechanism, the squash/rebase caveat + GitHub-MCP fallback, and the consequence (phase files no longer carry status/deps as truth). Link the spec.

- [ ] **Step 5: Commit**

```bash
git add docs/specs/0002-roadmap-status-derivation.md docs/conventions/*.md CLAUDE.md docs/decisions/
git commit -m "docs(roadmap): adopt derived-status model in conventions + ADR"
```

---

## Task 9: Final verification + PR

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 2: Engine sanity across scenarios**

Run: `pnpm roadmap:status` (default view) and `pnpm roadmap:status --json` (full model). Confirm Phase 0 + 1.1 are `shipped`, 1.2–1.5/1.7 are `available`, 1.6 is `blocked (needs 1.4, 1.5)`, and Phase 2+ Foundations are `blocked` on their `phase:N` deps.

- [ ] **Step 3: Open the PR**

Push `chore/roadmap-status-derivation`; open a PR to `main` via the GitHub MCP (`mcp__github__create_pull_request`). Title: `feat(roadmap): derived slice-status (manifest + hook + generated pointer)`. Body: summarize the model, the surfaces, the squash/rebase caveat, and the sign-off-gated harness/doc changes. Note this is process tooling, not a feature slice.

---

## Self-review notes (for the implementer)

- **Spec coverage:** manifest (§3.1) → Task 1; derived state incl. `phase:N` (§3.2) → Tasks 2–3; views + generated README (§4, §5) → Tasks 4–5; SessionStart hook (§4.3) → Task 6; phase-file trim (§8) → Task 7; conventions/ADR (§9) → Task 8; squash/rebase fallback (§3.3) lives in `formatView`'s in-flight warning + the CLAUDE.md note (Task 8) + ADR.
- **Ordering:** Tasks 1–5 are pure build (no sign-off). Tasks 6–8 touch harness/docs and are **sign-off-gated** — batch the confirmation before starting Task 6.
- **No stored status anywhere** — if you find yourself adding a `status` field to a slice, stop: it is derived.
