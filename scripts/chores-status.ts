import { fileURLToPath } from "node:url";

import { makeRegister, type RegisterConfig } from "./lib/register-status.ts";

/**
 * Chore register (docs/roadmap/chores.json) — feedback-driven features/chores
 * NOT in the phased roadmap (slices.json stays the pristine planned trajectory).
 * Config only; the generic logic lives in `lib/register-status.ts`. See
 * docs/roadmap/chores.md.
 */
export const choresConfig: RegisterConfig = {
    tag: "chores",
    itemNoun: "chore",
    arrayField: "chores",
    jsonPath: "docs/roadmap/chores.json",
    docPath: "docs/roadmap/chores.md",
    branchPattern: "feat/{id}-",
    statuses: [
        { value: "open", label: "Open" },
        { value: "in-progress", label: "In progress" },
        { value: "shipped", label: "Shipped, awaiting merge" },
        { value: "merged", label: "Merged", terminal: true },
        // Side-exit: considered but intentionally not built. Listed (not counted)
        // with its reason in the description so the decision stays visible.
        { value: "cancelled", label: "Cancelled" },
    ],
    requiredStringFields: ["title", "description", "plan"],
    nullableStringFields: ["spec", "pr"],
    nullableNumberFields: ["issue"],
};

const register = makeRegister(choresConfig);

export const { validateManifest, deriveModel, formatView, renderBlock } =
    register;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    register.runCli(process.argv);
}
