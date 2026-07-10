import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Generic work-register engine.
//
// Shared by the `bugs` and `chores` registers (docs/roadmap/{bugs,chores}.json).
// A register is a hand-maintained JSON manifest: an array of items, each with a
// stored `status` (its fixed/merged flag) — NOT derived from git like the phased
// roadmap (slices.json). The only live input is the current branch, used to mark
// which item you're actively on. `makeRegister(config)` binds the generic ops to
// one register's config; the thin `*-status.ts` scripts are just those configs.
// ---------------------------------------------------------------------------

export interface StatusDef {
    /** stored value in the JSON, e.g. "open" */
    value: string;
    /** how it reads in the status line, e.g. "Fixed, awaiting merge" */
    label: string;
    /** the done state — always shown as a count, never listed */
    terminal?: boolean;
}

export interface RegisterConfig {
    /** the [tag] prefix on the status line + the `<tag>:status` doc markers */
    tag: string;
    /** singular noun for the "not on a <noun> branch" message */
    itemNoun: string;
    /** the JSON array key, e.g. "bugs" */
    arrayField: string;
    /** manifest path, relative to cwd */
    jsonPath: string;
    /** generated-table doc path, relative to cwd */
    docPath: string;
    /** branch template containing "{id}", e.g. "fix/{id}-" */
    branchPattern: string;
    /** ordered lifecycle; the first is always listed, exactly one is terminal */
    statuses: StatusDef[];
    /** item fields that must be non-empty strings (include "title") */
    requiredStringFields: string[];
    /** item fields that must be a string or null (e.g. spec, pr) */
    nullableStringFields: string[];
    /** item fields that must be a number or null (e.g. issue) */
    nullableNumberFields: string[];
}

export interface RegisterItem {
    id: string;
    title: string;
    status: string;
    spec: string | null;
    pr: string | null;
    issue: number | null;
    [key: string]: unknown;
}

export interface RegisterManifest {
    branchPattern: string;
    [key: string]: unknown;
}

export interface RegisterModelItem extends RegisterItem {
    /** true when the current branch matches this item's branch prefix */
    mine: boolean;
}

export interface RegisterModel {
    items: RegisterModelItem[];
    mineId: string | null;
}

const jsonName = (config: RegisterConfig) =>
    config.jsonPath.split("/").pop() ?? config.jsonPath;

export function branchPrefixFor(id: string, branchPattern: string): string {
    return branchPattern.replace("{id}", id);
}

// --- pure core --------------------------------------------------------------

export function validateManifest(
    config: RegisterConfig,
    data: unknown,
): RegisterManifest {
    const name = jsonName(config);
    if (typeof data !== "object" || data === null) {
        throw new Error(`${name}: expected a JSON object`);
    }
    const m = data as Record<string, unknown>;
    if (
        typeof m.branchPattern !== "string" ||
        !m.branchPattern.includes("{id}")
    ) {
        throw new Error(
            `${name}: "branchPattern" must be a string containing "{id}"`,
        );
    }
    const arr = m[config.arrayField];
    if (!Array.isArray(arr)) {
        throw new Error(`${name}: "${config.arrayField}" must be an array`);
    }

    const validStatuses = new Set(config.statuses.map((s) => s.value));
    const ids = new Set<string>();
    for (const raw of arr) {
        const it = raw as Record<string, unknown>;
        if (typeof it.id !== "string")
            throw new Error(`${name}: an item has a non-string id`);
        if (ids.has(it.id)) throw new Error(`${name}: duplicate id "${it.id}"`);
        ids.add(it.id);
        for (const f of config.requiredStringFields) {
            if (typeof it[f] !== "string")
                throw new Error(`${name}: ${it.id} missing ${f}`);
        }
        if (!validStatuses.has(it.status as string)) {
            throw new Error(
                `${name}: ${it.id} has invalid status "${String(it.status)}"`,
            );
        }
        for (const f of config.nullableStringFields) {
            if (it[f] !== null && typeof it[f] !== "string")
                throw new Error(
                    `${name}: ${it.id} ${f} must be a string or null`,
                );
        }
        for (const f of config.nullableNumberFields) {
            if (it[f] !== null && typeof it[f] !== "number")
                throw new Error(
                    `${name}: ${it.id} ${f} must be a number or null`,
                );
        }
    }
    return data as RegisterManifest;
}

export function deriveModel(
    config: RegisterConfig,
    manifest: RegisterManifest,
    currentBranch: string,
): RegisterModel {
    const arr = (manifest[config.arrayField] as RegisterItem[]) ?? [];
    const items = arr.map((it) => ({
        ...it,
        mine: currentBranch.startsWith(
            branchPrefixFor(it.id, manifest.branchPattern),
        ),
    }));
    const mineId = items.find((i) => i.mine)?.id ?? null;
    return { items, mineId };
}

const idList = (items: RegisterModelItem[]) =>
    items.map((i) => i.id).join(", ") || "none";

export function formatView(
    config: RegisterConfig,
    model: RegisterModel,
): string {
    const byStatus = (v: string) => model.items.filter((i) => i.status === v);
    const mine = model.items.find((i) => i.mine);

    const parts: string[] = [];
    parts.push(
        mine
            ? `On ${mine.id} (${mine.status}) — "${mine.title}".`
            : `Not on a ${config.itemNoun} branch.`,
    );
    // First status always shows (even if empty); middle statuses only when they
    // have items; the terminal status always shows as a count.
    config.statuses.forEach((s, idx) => {
        const list = byStatus(s.value);
        if (s.terminal) {
            parts.push(`${s.label}: ${list.length}.`);
        } else if (idx === 0 || list.length > 0) {
            parts.push(`${s.label}: ${idList(list)}.`);
        }
    });
    return `[${config.tag}] ` + parts.join(" ");
}

const cell = (s: string) => s.replace(/\|/g, "\\|");

export function renderBlock(
    config: RegisterConfig,
    model: RegisterModel,
): string {
    const header = [
        blockStart(config),
        `<!-- Generated by \`pnpm ${config.tag}:status --write\` — do not hand-edit. -->`,
        "",
        "| ID | Status | Title | Issue | Spec | PR |",
        "| ----- | ----------- | ----- | ----- | ---- | --- |",
    ];
    const rows = model.items.map(
        (i) =>
            `| ${i.id} | ${i.status} | ${cell(i.title)} | ${i.issue !== null ? `#${i.issue}` : "—"} | ${i.spec ?? "—"} | ${i.pr ?? "—"} |`,
    );
    return [...header, ...rows, "", blockEnd(config)].join("\n");
}

// --- I/O edges --------------------------------------------------------------

const blockStart = (config: RegisterConfig) =>
    `<!-- ${config.tag}:status:start -->`;
const blockEnd = (config: RegisterConfig) =>
    `<!-- ${config.tag}:status:end -->`;

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

export function loadManifest(
    config: RegisterConfig,
    cwd: string = process.cwd(),
): RegisterManifest {
    const path = `${cwd}/${config.jsonPath}`;
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
        throw new Error(
            `${jsonName(config)}: invalid JSON — ${(e as Error).message}`,
        );
    }
    return validateManifest(config, data);
}

function writeDoc(
    config: RegisterConfig,
    cwd: string,
    model: RegisterModel,
): void {
    const path = `${cwd}/${config.docPath}`;
    const current = readFileSync(path, "utf8");
    const start = current.indexOf(blockStart(config));
    const end = current.indexOf(blockEnd(config));
    if (start === -1 || end === -1) {
        throw new Error(
            `${config.docPath} is missing the ${blockStart(config)} … ${blockEnd(config)} markers`,
        );
    }
    const next =
        current.slice(0, start) +
        renderBlock(config, model) +
        current.slice(end + blockEnd(config).length);
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

export interface Register {
    config: RegisterConfig;
    validateManifest: (data: unknown) => RegisterManifest;
    deriveModel: (manifest: RegisterManifest, branch: string) => RegisterModel;
    formatView: (model: RegisterModel) => string;
    renderBlock: (model: RegisterModel) => string;
    loadManifest: (cwd?: string) => RegisterManifest;
    runCli: (argv: string[]) => void;
}

/** Bind the generic ops to one register's config. */
export function makeRegister(config: RegisterConfig): Register {
    function runCli(argv: string[]): void {
        const cwd = process.cwd();
        const mode = argv[2] ?? "";

        let model: RegisterModel;
        try {
            model = deriveModel(
                config,
                loadManifest(config, cwd),
                getCurrentBranch(cwd),
            );
        } catch (e) {
            const msg = `[${config.tag}] status unavailable: ${(e as Error).message}`;
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
                emitHookEnvelope(formatView(config, model));
                break;
            case "--write":
                writeDoc(config, cwd, model);
                console.log(`${config.docPath} register block regenerated.`);
                break;
            default:
                console.log(formatView(config, model));
        }
    }

    return {
        config,
        validateManifest: (data) => validateManifest(config, data),
        deriveModel: (manifest, branch) =>
            deriveModel(config, manifest, branch),
        formatView: (model) => formatView(config, model),
        renderBlock: (model) => renderBlock(config, model),
        loadManifest: (cwd) => loadManifest(config, cwd),
        runCli,
    };
}
