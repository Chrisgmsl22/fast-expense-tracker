import { test, expect, type Page } from "@playwright/test";

// Seeded dev user (`pnpm db:seed:dev`) — local-only, not a secret.
const EMAIL = "test@email.com";
const PASSWORD = "test";

// A debt big enough to force the balance into "you owe" regardless of whatever
// the seeded data makes the partner owe — keeps the assertion deterministic on a
// shared dev DB. Distinctive so cleanup finds its own row.
const BIG_DEBT = "999999";
const BIG_DEBT_FMT = "$999,999.00";

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

async function login(page: Page) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
}

test("settlement: log an 'I owe Brenda' debt → balance flips to you-owe, then clean up", async ({
    page,
}) => {
    await login(page);

    // The dashboard month-feed footer carries the settlement chip → /settlement.
    const chip = page.locator('a[href="/settlement"]');
    await expect(chip.first()).toBeVisible();

    await page.goto("/settlement");
    await expect(
        page.getByRole("heading", { name: "Settlement" }),
    ).toBeVisible();

    // --- Log an "I owe Brenda" debt ---
    await page.getByRole("button", { name: /I owe Brenda/ }).click();
    const dialog = page.getByRole("dialog", { name: /I owe Brenda/ });
    await dialog.getByLabel("Date").fill(todayIso());
    await dialog.getByLabel(/Amount you owe/).fill(BIG_DEBT);
    // Base UI Select is not a native <select> — open it and pick an option.
    await dialog.getByRole("combobox", { name: "Category" }).click();
    await page.getByRole("option", { name: "Groceries" }).click();
    await dialog.getByRole("button", { name: "Log debt" }).click();

    // The two-sided balance now reads "you owe" (orange), and the debt shows in
    // the journal — the core of slice 2.12.
    await expect(page.getByText("YOU OWE BRENDA")).toBeVisible();
    await expect(page.getByText("I owe Brenda").first()).toBeVisible();
    await expect(page.getByText(`−${BIG_DEBT_FMT}`).first()).toBeVisible();

    // --- Clean up: delete the debt (a paidBy="gf" expense) from /expenses ---
    await page.goto("/expenses");
    await page
        .getByRole("button", { name: "Delete I owe Brenda" })
        .first()
        .click();
    const del = page.getByRole("dialog", { name: /Delete expense/ });
    await del.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(BIG_DEBT_FMT)).toHaveCount(0);
});
