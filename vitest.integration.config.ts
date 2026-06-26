import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Integration tests run against a REAL Postgres (Docker locally, the GitHub
// Actions service in CI — ADR-0004). Default to the local test database when the
// env doesn't already specify one; CI sets its own DATABASE_URL to the service.
// These are throwaway local creds, matching docker-compose.yml.
process.env.DATABASE_URL ||=
    "postgresql://postgres:postgres@localhost:5433/fast_expense_tracker_test?schema=public";
process.env.DATABASE_URL_UNPOOLED ||= process.env.DATABASE_URL;

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: "node",
        globals: true,
        include: ["tests/integration/**/*.{test,spec}.ts"],
        // Apply migrations once before the suite.
        globalSetup: ["tests/integration/global-setup.ts"],
        // Truncate between tests for isolation.
        setupFiles: ["tests/integration/truncate.ts"],
        // One shared database — run files serially so they don't race on truncation.
        fileParallelism: false,
    },
});
