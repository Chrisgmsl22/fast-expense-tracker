import { defineConfig, devices } from "@playwright/test";

/**
 * First e2e setup in the repo (slice 1.6). Boots the app via `pnpm dev` and runs
 * the smoke spec against it. The dev server reads `.env.local`, so the e2e needs
 * a running local DB seeded with the dev user (`pnpm db:up && pnpm db:seed:dev`).
 * CI wiring (DB service + `playwright install`) is a separate follow-up.
 */
export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: "list",
    use: {
        baseURL: "http://localhost:3000",
        trace: "on-first-retry",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
