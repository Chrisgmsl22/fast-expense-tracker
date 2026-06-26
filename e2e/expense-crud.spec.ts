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
    await page.waitForURL("**/expenses");
}

test("expense lifecycle: login → create → edit → delete → logout", async ({
    page,
}) => {
    await login(page);

    // CREATE
    await page.getByRole("button", { name: "+ Add" }).click();
    const addDialog = page.getByRole("dialog", { name: "Add expense" });
    await addDialog.getByLabel("Date").fill(todayIso());
    await addDialog.getByLabel("Amount").fill("123");
    // "Category" exact — otherwise it also matches "Subcategory (optional)".
    await addDialog
        .getByLabel("Category", { exact: true })
        .selectOption({ index: 1 });
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
    const deleteDialog = page.getByRole("dialog", { name: "Confirm delete" });
    await deleteDialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("E2E edited")).toHaveCount(0);

    // LOGOUT
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/login");
});
