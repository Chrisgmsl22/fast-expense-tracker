import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { deleteVariableIncome } from "@/app/_actions/income/delete-variable";
import { FakeIncomeRepository } from "@/tests/support/fake-income-repository";

describe("deleteVariableIncome (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("rejects a missing id with a validation code", async () => {
        const repo = new FakeIncomeRepository();
        const res = await deleteVariableIncome({}, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
    });

    it("returns unauthenticated when there is no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeIncomeRepository();

        const res = await deleteVariableIncome({ id: "inc_1" }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
    });

    it("deletes an owned row", async () => {
        const repo = new FakeIncomeRepository();
        repo.seedVariable("inc_1", "u1");

        const res = await deleteVariableIncome({ id: "inc_1" }, repo);

        expect(res.ok).toBe(true);
    });

    it("returns not_found for another user's row (IDOR guard)", async () => {
        const repo = new FakeIncomeRepository();
        repo.seedVariable("inc_1", "someone-else");

        const res = await deleteVariableIncome({ id: "inc_1" }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
    });

    it("maps a repository failure to db_error", async () => {
        const repo = new FakeIncomeRepository();
        repo.seedVariable("inc_1", "u1");
        repo.failOnWrite = true;

        const res = await deleteVariableIncome({ id: "inc_1" }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
