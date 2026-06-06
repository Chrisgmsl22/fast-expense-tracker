import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Manifest — the static slice dependency graph (docs/roadmap/slices.json).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Derived state — computed from the manifest + live git, never stored.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Views — human/agent line + generated README block.
// ---------------------------------------------------------------------------

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

    // Blocked slices are not actionable now; show a count, not the full list
    // (the README table + `--json` carry the per-slice detail).
    const blocked = byState("blocked");
    if (blocked.length) {
        parts.push(`Blocked: ${blocked.length} downstream (deps unmet).`);
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
        README_START,
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
    return [...header, ...rows, "", README_END].join("\n");
}

// ---------------------------------------------------------------------------
// Git boundary + manifest loading (the I/O edges; everything above is pure).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// README writer + CLI.
// ---------------------------------------------------------------------------

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
            return; // never fail the hook
        }
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
