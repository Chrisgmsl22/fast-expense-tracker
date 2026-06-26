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

    // Phase 4 (Dashboard) was retired and absorbed into Phase 2's screen
    // build-out when the Confirmed designs V1 handoff landed — see ADR-0013.
    // The vacant number is left as-is (renumbering 5–7 would break existing refs).
    it("covers every phase except the retired Phase 4", () => {
        expect(new Set(manifest.slices.map((s) => s.phase))).toEqual(
            new Set([0, 1, 2, 3, 5, 6, 7]),
        );
    });
});
