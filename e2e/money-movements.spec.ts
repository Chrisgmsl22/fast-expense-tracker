import { test, expect, type Page } from "@playwright/test";

// Seeded dev user (`pnpm db:seed:dev`) — local-only, not a secret.
const EMAIL = "test@email.com";
const PASSWORD = "test";

// Distinctive amounts so this spec finds + cleans up its own rows on a shared
// dev DB without colliding with seeded data.
const CARD_PAYMENT = "7777";
const TRANSFER = "6666";

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

async function login(page: Page) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Login lands on the dashboard (post-login landing, slice 2.4a); movements
    // render + delete on the Expenses page (interleaved in the All view).
    await page.waitForURL("**/dashboard");
    await page.goto("/expenses");
}

test("money movements: log a card payment + a partner transfer, then delete both", async ({
    page,
}) => {
    await login(page);

    // --- Card payment funded by the partner's money ---
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.getByRole("button", { name: /Card payment/ }).click();
    const cpDialog = page.getByRole("dialog", { name: /Add card payment/ });
    await cpDialog.getByLabel("Date").fill(todayIso());
    await cpDialog.getByLabel("Amount").fill(CARD_PAYMENT);
    // Base UI Select is not a native <select> — open it and pick the option.
    await cpDialog.getByRole("combobox", { name: "Card paid" }).click();
    await page.getByRole("option", { name: "Amex Platinum" }).click();
    await cpDialog
        .getByRole("checkbox", { name: /Paid with .*'s money/ })
        .click();
    await cpDialog.getByRole("button", { name: "Add card payment" }).click();

    // Blue "Card payment" line, tagged as the partner's money.
    await expect(page.getByText("Card payment").first()).toBeVisible();
    await expect(page.getByText(/'s money/).first()).toBeVisible();

    // --- Transfer to the partner ("I paid <partner>") ---
    await page.getByRole("button", { name: "+ Add" }).click();
    await page.getByRole("button", { name: /I paid Brenda/ }).click();
    const trDialog = page.getByRole("dialog", { name: /I paid Brenda/ });
    await trDialog.getByLabel("Date").fill(todayIso());
    await trDialog.getByLabel("Amount").fill(TRANSFER);
    await trDialog.getByRole("button", { name: /Log payment to/ }).click();

    // Amber transfer line + footer "Paid to <partner>".
    await expect(page.getByText(/^Paid /).first()).toBeVisible();
    const totals = page.getByTestId("totals-desktop");
    await expect(totals.getByText(/Paid to/)).toBeVisible();
    await expect(totals.getByText("$6,666.00")).toBeVisible();

    // --- Clean up: delete both movements so re-runs stay idempotent ---
    await page.getByRole("button", { name: /Delete paid/i }).click();
    let dialog = page.getByRole("dialog", { name: /Delete this movement/i });
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(/^Paid /)).toHaveCount(0);

    await page.getByRole("button", { name: /Delete card payment/i }).click();
    dialog = page.getByRole("dialog", { name: /Delete this movement/i });
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Card payment")).toHaveCount(0);
});
