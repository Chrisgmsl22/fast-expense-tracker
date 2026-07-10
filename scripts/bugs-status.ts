import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Manifest — the bug/prod-feedback register (docs/roadmap/bugs.json).
//
// Unlike the roadmap (slices.json), bug state is STORED here, not derived from
// git: `status` is the hand-maintained fixed/merged flag. The only live input
// is the current branch, used to mark which bug you're actively on.
// ---------------------------------------------------------------------------

export type BugStatus = "open" | "in-progress" | "fixed" | "merged";

export interface BugDef {
    id: string;
    title: string;
    description: string;
    proposedSolution: string;
    status: BugStatus;
    /** path to a spec doc when the bug needs one, else null */
    spec: string | null;
    /** PR URL/number once opened, else null */
    pr: string | null;
    /** GitHub issue number this bug was drained from (capture inbox), else null */
    issue: number | null;
}

export interface BugManifest {
    /** template containing "{id}", e.g. "fix/{id}-" */
    branchPattern: string;
    bugs: BugDef[];
}

const BUG_STATUSES: BugStatus[] = ["open", "in-progress", "fixed", "merged"];

export function validateManifest(data: unknown): BugManifest {
    if (typeof data !== "object" || data === null) {
        throw new Error("bugs.json: expected a JSON object");
    }
    const m = data as Record<string, unknown>;
    if (
        typeof m.branchPattern !== "string" ||
        !m.branchPattern.includes("{id}")
    ) {
        throw new Error(
            'bugs.json: "branchPattern" must be a string containing "{id}"',
        );
    }
    if (!Array.isArray(m.bugs)) {
        throw new Error('bugs.json: "bugs" must be an array');
    }

    const ids = new Set<string>();
    for (const raw of m.bugs) {
        const b = raw as Record<string, unknown>;
        if (typeof b.id !== "string")
            throw new Error("bugs.json: a bug has a non-string id");
        if (ids.has(b.id))
            throw new Error(`bugs.json: duplicate bug id "${b.id}"`);
        ids.add(b.id);
        if (typeof b.title !== "string")
            throw new Error(`bugs.json: bug ${b.id} missing title`);
        if (typeof b.description !== "string")
            throw new Error(`bugs.json: bug ${b.id} missing description`);
        if (typeof b.proposedSolution !== "string")
            throw new Error(`bugs.json: bug ${b.id} missing proposedSolution`);
        if (!BUG_STATUSES.includes(b.status as BugStatus)) {
            throw new Error(
                `bugs.json: bug ${b.id} has invalid status "${String(b.status)}"`,
            );
        }
        if (b.spec !== null && typeof b.spec !== "string")
            throw new Error(
                `bugs.json: bug ${b.id} spec must be a string or null`,
            );
        if (b.pr !== null && typeof b.pr !== "string")
            throw new Error(
                `bugs.json: bug ${b.id} pr must be a string or null`,
            );
        if (b.issue !== null && typeof b.issue !== "number")
            throw new Error(
                `bugs.json: bug ${b.id} issue must be a number or null`,
            );
    }
    return data as BugManifest;
}

// ---------------------------------------------------------------------------
// Derived view — the manifest plus which bug the current branch is on.
// ---------------------------------------------------------------------------

export interface BugStatusItem extends BugDef {
    /** true when the current branch matches this bug's `fix/{id}-` prefix */
    mine: boolean;
}

export interface BugModel {
    bugs: BugStatusItem[];
    mineId: string | null;
}

export function branchPrefixFor(id: string, branchPattern: string): string {
    return branchPattern.replace("{id}", id);
}

export function deriveModel(
    manifest: BugManifest,
    currentBranch: string,
): BugModel {
    const bugs = manifest.bugs.map((b) => ({
        ...b,
        mine: currentBranch.startsWith(
            branchPrefixFor(b.id, manifest.branchPattern),
        ),
    }));
    const mineId = bugs.find((b) => b.mine)?.id ?? null;
    return { bugs, mineId };
}

// ---------------------------------------------------------------------------
// Views — human/agent line + generated bugs.md block.
// ---------------------------------------------------------------------------

const idList = (bugs: BugStatusItem[]) =>
    bugs.map((b) => b.id).join(", ") || "none";

export function formatView(model: BugModel): string {
    const byStatus = (s: BugStatus) => model.bugs.filter((b) => b.status === s);
    const mine = model.bugs.find((b) => b.mine);

    const parts: string[] = [];
    parts.push(
        mine
            ? `On ${mine.id} (${mine.status}) — "${mine.title}".`
            : "Not on a bug branch.",
    );
    parts.push(`Open: ${idList(byStatus("open"))}.`);

    const inProgress = byStatus("in-progress");
    if (inProgress.length) {
        parts.push(`In progress: ${idList(inProgress)}.`);
    }
    const fixed = byStatus("fixed");
    if (fixed.length) {
        parts.push(`Fixed, awaiting merge: ${idList(fixed)}.`);
    }
    parts.push(`Merged: ${byStatus("merged").length}.`);
    return "[bugs] " + parts.join(" ");
}

const cell = (s: string) => s.replace(/\|/g, "\\|");

export function renderBlock(model: BugModel): string {
    const header = [
        BLOCK_START,
        "<!-- Generated by `pnpm bugs:status --write` — do not hand-edit. -->",
        "",
        "| ID | Status | Title | Issue | Spec | PR |",
        "| ----- | ----------- | ----- | ----- | ---- | --- |",
    ];
    const rows = model.bugs.map(
        (b) =>
            `| ${b.id} | ${b.status} | ${cell(b.title)} | ${b.issue !== null ? `#${b.issue}` : "—"} | ${b.spec ?? "—"} | ${b.pr ?? "—"} |`,
    );
    return [...header, ...rows, "", BLOCK_END].join("\n");
}

// ---------------------------------------------------------------------------
// I/O edges — git branch, manifest load, bugs.md writer, CLI.
// ---------------------------------------------------------------------------

export function getCurrentBranch(cwd: string = process.cwd()): string {
    try {
        return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
            cwd,
            encoding: "utf8",
        }).trim();
    } catch {
        return "HEAD";
    }
}

export function loadManifest(cwd: string = process.cwd()): BugManifest {
    const path = `${cwd}/docs/roadmap/bugs.json`;
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
        throw new Error(`bugs.json: invalid JSON — ${(e as Error).message}`);
    }
    return validateManifest(data);
}

const BLOCK_START = "<!-- bugs:status:start -->";
const BLOCK_END = "<!-- bugs:status:end -->";

function writeDoc(cwd: string, model: BugModel): void {
    const path = `${cwd}/docs/roadmap/bugs.md`;
    const current = readFileSync(path, "utf8");
    const start = current.indexOf(BLOCK_START);
    const end = current.indexOf(BLOCK_END);
    if (start === -1 || end === -1) {
        throw new Error(
            `bugs.md is missing the ${BLOCK_START} … ${BLOCK_END} markers`,
        );
    }
    const next =
        current.slice(0, start) +
        renderBlock(model) +
        current.slice(end + BLOCK_END.length);
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

    let model: BugModel;
    try {
        model = deriveModel(loadManifest(cwd), getCurrentBranch(cwd));
    } catch (e) {
        const msg = `[bugs] status unavailable: ${(e as Error).message}`;
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
            writeDoc(cwd, model);
            console.log("bugs.md register block regenerated.");
            break;
        default:
            console.log(formatView(model));
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main(process.argv);
}
