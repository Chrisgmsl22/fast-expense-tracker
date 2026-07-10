import { fileURLToPath } from "node:url";

import { makeRegister, type RegisterConfig } from "./lib/register-status.ts";

/**
 * Bug register (docs/roadmap/bugs.json) — defects found using the app. Config
 * only; the generic logic lives in `lib/register-status.ts`. See docs/roadmap/bugs.md.
 */
export const bugsConfig: RegisterConfig = {
    tag: "bugs",
    itemNoun: "bug",
    arrayField: "bugs",
    jsonPath: "docs/roadmap/bugs.json",
    docPath: "docs/roadmap/bugs.md",
    branchPattern: "fix/{id}-",
    statuses: [
        { value: "open", label: "Open" },
        { value: "in-progress", label: "In progress" },
        { value: "fixed", label: "Fixed, awaiting merge" },
        { value: "merged", label: "Merged", terminal: true },
    ],
    requiredStringFields: ["title", "description", "proposedSolution"],
    nullableStringFields: ["spec", "pr"],
    nullableNumberFields: ["issue"],
};

const register = makeRegister(bugsConfig);

export const { validateManifest, deriveModel, formatView, renderBlock } =
    register;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    register.runCli(process.argv);
}
