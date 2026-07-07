import { defineConfig, devices } from "@playwright/test";

/**
 * First e2e setup in the repo (slice 1.6). Boots the app via `pnpm dev` and runs
 * the smoke spec against it. The dev server reads `.env.local`, so the e2e needs
 * a running local DB seeded with the dev user (`pnpm db:up && pnpm db:seed:dev`).
 * CI wiring (DB service + `playwright install`) is a separate follow-up.
 */
// Port is configurable via PORT so the suite can run against an isolated
// worktree dev server (e.g. `PORT=3006 pnpm test:e2e`) without colliding with a
// dev server already on 3000 — matters when slices are built in parallel.
const PORT = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: "list",
    use: {
        baseURL,
        trace: "on-first-retry",
    },
    // PW_CHANNEL lets a constrained machine (no bundled-browser download) run
    // against an installed browser, e.g. `PW_CHANNEL=chrome`. Unset in CI → the
    // bundled Chromium from `playwright install`.
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                channel: process.env.PW_CHANNEL || undefined,
            },
        },
    ],
    webServer: {
        command: `pnpm dev -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
