import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [react(), tsconfigPaths()],
    test: {
        environment: "jsdom",
        globals: true,
        include: ["tests/**/*.{test,spec}.{ts,tsx}"],
        coverage: {
            provider: "v8",
            reporter: ["text", "text-summary", "html", "lcov"],
            reportsDirectory: "./coverage",
            // Measure only the layers we intend to test. Infra — server components,
            // auth/route wiring, config, vendored UI primitives — is excluded so the
            // numbers stay honest. Tiered thresholds + rationale: ADR-0011, and the
            // implementer guide in docs/conventions/testing.md.
            include: ["lib/**", "app/_actions/**", "components/**"],
            exclude: [
                "**/*.d.ts",
                "**/*.test.{ts,tsx}",
                "components/ui/**", // vendored shadcn/Base-UI primitives
                "lib/db.ts", // Prisma client singleton, no logic to cover
            ],
            thresholds: {
                // Global floor — backstop for anything not matched by a glob below.
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
                // Logic core — fully covered (pure functions, actions, validation, money math).
                "lib/**": {
                    lines: 100,
                    functions: 100,
                    branches: 100,
                    statements: 100,
                },
                "app/_actions/**": {
                    lines: 100,
                    functions: 100,
                    branches: 100,
                    statements: 100,
                },
                // UI components — high but not absolute (rare-state branches aren't worth 100%).
                "components/**": {
                    lines: 90,
                    functions: 90,
                    branches: 90,
                    statements: 90,
                },
            },
        },
    },
});
