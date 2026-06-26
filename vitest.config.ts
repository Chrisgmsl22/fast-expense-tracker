import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Unit tests: pure logic + components, no database. jsdom environment.
// Integration tests (DB layer) live in tests/integration and run via
// vitest.integration.config.ts (see `pnpm test:integration`).
export default defineConfig({
    plugins: [react(), tsconfigPaths()],
    test: {
        environment: "jsdom",
        globals: true,
        include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
        coverage: {
            provider: "v8",
            reporter: ["text", "text-summary", "html"],
            reportsDirectory: "./coverage",
            include: ["lib/**", "app/_actions/**", "components/**"],
            exclude: [
                "**/*.d.ts",
                "**/*.test.{ts,tsx}",
                "components/ui/**", // vendored shadcn/Base-UI primitives
                "lib/db.ts", // Prisma client singleton, no logic to cover
            ],
            // ADVISORY ONLY — no thresholds. The v8/istanbul reporters unreliably drop
            // executed Prisma-importing modules in this environment, so a blocking %
            // gate isn't trustworthy (see ADR-0011). CI gates on tests passing — unit
            // + integration — not on a coverage number.
        },
    },
});
