import { test, expect, type Page } from "@playwright/test";

// Seeded dev user (`pnpm db:seed:dev`) — local-only, not a secret.
const EMAIL = "test@email.com";
const PASSWORD = "test";

/** Today as yyyy-mm-dd, so the new row lands in the default (current) month filter. */
function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

async function login(page: Page) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Login lands on the dashboard (post-login landing, slice 2.4a); the
    // create/edit/delete controls live on the Expenses page.
    await page.waitForURL("**/dashboard");
    await page.goto("/expenses");
}

test("expense lifecycle: login → create → edit → delete → logout", async ({
    page,
}) => {
    await login(page);

    // CREATE
    await page.getByRole("button", { name: "+ Add" }).click();
    // The Add menu is a type picker now (ADR-0018) — choose Expense first.
    await page.getByRole("button", { name: "Expense", exact: false }).click();
    const addDialog = page.getByRole("dialog", { name: "Add expense" });
    await addDialog.getByLabel("Date").fill(todayIso());
    await addDialog.getByLabel("Amount").fill("123");
    // Base UI Select isn't a native <select> — open it and click an option.
    await addDialog
        .getByRole("combobox", { name: "Category", exact: true })
        .click();
    await page.getByRole("option", { name: "Groceries" }).click();
    await addDialog.getByLabel("Description").fill("E2E expense");
    await addDialog.getByRole("button", { name: "Add expense" }).click();

    await expect(page.getByText("E2E expense")).toBeVisible();

    // EDIT
    await page.getByRole("button", { name: "Edit E2E expense" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit expense" });
    await expect(editDialog.getByLabel("Description")).toHaveValue(
        "E2E expense",
    );
    await editDialog.getByLabel("Description").fill("E2E edited");
    await editDialog.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("E2E edited")).toBeVisible();
    await expect(page.getByText("E2E expense", { exact: true })).toHaveCount(0);

    // DELETE
    await page.getByRole("button", { name: "Delete E2E edited" }).click();
    const deleteDialog = page.getByRole("dialog", { name: /Delete expense/ });
    await deleteDialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("E2E edited")).toHaveCount(0);

    // LOGOUT
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/login");
});
