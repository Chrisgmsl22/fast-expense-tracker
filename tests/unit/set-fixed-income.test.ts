import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { setFixedIncome } from "@/app/_actions/income/set-fixed";
import { FakeIncomeRepository } from "@/tests/support/fake-income-repository";

describe("setFixedIncome (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-09-20T18:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("rejects a negative amount with a validation code + field errors", async () => {
        const repo = new FakeIncomeRepository();
        const res = await setFixedIncome({ amount: -1 }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.amount).toBeDefined();
        expect(repo.fixedWrites).toHaveLength(0);
    });

    it("returns unauthenticated when there is no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeIncomeRepository();

        const res = await setFixedIncome({ amount: 44000 }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
        expect(repo.fixedWrites).toHaveLength(0);
    });

    // Guard: pre-fix, the future-month check ran before auth.
    it("Should return unauthenticated for a future month with no session", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeIncomeRepository();

        const res = await setFixedIncome(
            { amount: 44000, month: "2026-10" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
        expect(repo.fixedWrites).toHaveLength(0);
        expect(repo.monthOnlyWrites).toHaveLength(0);
    });

    // Guard: pre-fix, any well-formed year was accepted.
    it("Should refuse a month before 2000", async () => {
        const repo = new FakeIncomeRepository();

        const res = await setFixedIncome(
            { amount: 44000, month: "1999-12" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.message).toBe("Invalid month");
        expect(res.fieldErrors?.month).toEqual(["Month can't be before 2000"]);
        expect(repo.monthOnlyWrites).toHaveLength(0);
    });

    // Pin: the floor month itself is a valid past month.
    it("Should accept 2000-01 as a past month", async () => {
        const repo = new FakeIncomeRepository();

        const res = await setFixedIncome(
            { amount: 44000, month: "2000-01" },
            repo,
        );

        expect(res).toEqual({
            ok: true,
            data: { amount: 44000, effectiveMonth: "2000-01" },
        });
        expect(repo.monthOnlyWrites).toEqual([
            { userId: "u1", month: "2000-01", amount: 44000 },
        ]);
    });

    // Guard: pre-fix, the write carried no month at all.
    it("Should write the amount for the current CDMX month", async () => {
        const repo = new FakeIncomeRepository();

        const res = await setFixedIncome({ amount: 44000 }, repo);

        expect(res).toEqual({
            ok: true,
            data: { amount: 44000, effectiveMonth: "2026-09" },
        });
        expect(repo.fixedWrites).toEqual([
            { userId: "u1", effectiveMonth: "2026-09", amount: 44000 },
        ]);
    });

    // Guard: pre-fix, the write carried no month at all.
    it("Should use the Mexico City month, not the UTC one, at the boundary", async () => {
        // 03:00Z on Oct 1 is still Sep 30 in CDMX (UTC-6).
        vi.setSystemTime(new Date("2026-10-01T03:00:00Z"));
        const repo = new FakeIncomeRepository();

        await setFixedIncome({ amount: 44000 }, repo);

        expect(repo.fixedWrites[0]?.effectiveMonth).toBe("2026-09");
    });

    // Pin: only `month` is read; any other month-like key is stripped.
    it("Should ignore an effectiveMonth key from the client", async () => {
        const repo = new FakeIncomeRepository();

        await setFixedIncome(
            { amount: 44000, effectiveMonth: "2026-01" },
            repo,
        );

        expect(repo.fixedWrites).toEqual([
            { userId: "u1", effectiveMonth: "2026-09", amount: 44000 },
        ]);
        expect(repo.monthOnlyWrites).toHaveLength(0);
    });

    // Guard: pre-fix, a client month was ignored and every save went forward.
    it("Should change only a past month when the client sends one", async () => {
        const repo = new FakeIncomeRepository();
        repo.seedFixed("u1", 40000);

        const res = await setFixedIncome(
            { amount: "45000", month: "2026-05" },
            repo,
        );

        expect(res).toEqual({
            ok: true,
            data: { amount: 45000, effectiveMonth: "2026-05" },
        });
        expect(repo.monthOnlyWrites).toEqual([
            { userId: "u1", month: "2026-05", amount: 45000 },
        ]);
        expect(repo.fixedWrites).toHaveLength(0);
        const fixed = async (m: string) =>
            (await repo.getMonthlySummary("u1", m)).fixed;
        expect(await fixed("2026-04")).toBe(40000);
        expect(await fixed("2026-05")).toBe(45000);
        expect(await fixed("2026-06")).toBe(40000);
        expect(await fixed("2026-09")).toBe(40000);
    });

    // Pin: the current month keeps the forward save.
    it("Should save forward when the client sends the current month", async () => {
        const repo = new FakeIncomeRepository();

        await setFixedIncome({ amount: 44000, month: "2026-09" }, repo);

        expect(repo.fixedWrites).toEqual([
            { userId: "u1", effectiveMonth: "2026-09", amount: 44000 },
        ]);
        expect(repo.monthOnlyWrites).toHaveLength(0);
    });

    // Guard: pre-fix, a future month was silently saved from the current month.
    it("Should refuse a month after the current CDMX month", async () => {
        const repo = new FakeIncomeRepository();

        const res = await setFixedIncome(
            { amount: 44000, month: "2026-10" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.month).toBeDefined();
        expect(repo.fixedWrites).toHaveLength(0);
        expect(repo.monthOnlyWrites).toHaveLength(0);
    });

    // Guard: the future check uses the CDMX month, not the UTC one.
    it("Should refuse the UTC month while CDMX is still in the month before", async () => {
        vi.setSystemTime(new Date("2026-10-01T03:00:00Z"));
        const repo = new FakeIncomeRepository();

        const res = await setFixedIncome(
            { amount: 44000, month: "2026-10" },
            repo,
        );

        expect(res.ok).toBe(false);
        expect(repo.fixedWrites).toHaveLength(0);
        expect(repo.monthOnlyWrites).toHaveLength(0);
    });

    // Guard: pre-fix, a malformed month was stripped and the save went through.
    it.each(["2026-13", "2026-5", "26-05", "2026/05", "", 202605])(
        "Should refuse the malformed month %j",
        async (month) => {
            const repo = new FakeIncomeRepository();

            const res = await setFixedIncome({ amount: 44000, month }, repo);

            expect(res.ok).toBe(false);
            if (res.ok) return;
            expect(res.code).toBe("validation");
            expect(res.message).toBe("Invalid month");
            expect(res.fieldErrors?.month).toBeDefined();
            expect(repo.fixedWrites).toHaveLength(0);
            expect(repo.monthOnlyWrites).toHaveLength(0);
        },
    );

    // Pin: the user always comes from the session.
    it("Should write for the session user, never a payload userId", async () => {
        const repo = new FakeIncomeRepository();

        await setFixedIncome(
            { amount: 45000, month: "2026-05", userId: "attacker" },
            repo,
        );

        expect(repo.monthOnlyWrites).toEqual([
            { userId: "u1", month: "2026-05", amount: 45000 },
        ]);
    });

    it("Should map a past-month write failure to db_error", async () => {
        const repo = new FakeIncomeRepository();
        repo.failOnWrite = true;

        const res = await setFixedIncome(
            { amount: 44000, month: "2026-05" },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });

    it("allows 0 to clear the fixed amount", async () => {
        const repo = new FakeIncomeRepository();

        const res = await setFixedIncome({ amount: 0 }, repo);

        expect(res.ok).toBe(true);
        expect(repo.fixedWrites).toEqual([
            { userId: "u1", effectiveMonth: "2026-09", amount: 0 },
        ]);
    });

    it("maps a repository failure to db_error", async () => {
        const repo = new FakeIncomeRepository();
        repo.failOnWrite = true;

        const res = await setFixedIncome({ amount: 44000 }, repo);

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
