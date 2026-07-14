import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { saveSplitRule } from "@/app/_actions/settings/save-split-rule";
import { FakeSettingsRepository } from "@/tests/support/fake-settings-repository";

describe("saveSplitRule (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    it("saves shared mode: name + share fraction, scoped to the session user", async () => {
        const repo = new FakeSettingsRepository();
        const res = await saveSplitRule(
            {
                sharesExpenses: true,
                partnerName: "Brenda",
                sharePercentage: 68,
            },
            repo,
        );

        expect(res.ok).toBe(true);
        expect(repo.saves).toHaveLength(1);
        expect(repo.saves[0]).toEqual({
            userId: "u1",
            data: {
                sharesExpenses: true,
                partnerName: "Brenda",
                defaultSharePercentage: 0.68,
            },
        });
    });

    it("requires a partner name when sharing is on (validation, no write)", async () => {
        const repo = new FakeSettingsRepository();
        const res = await saveSplitRule(
            { sharesExpenses: true, partnerName: "", sharePercentage: 68 },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.partnerName).toBeDefined();
        expect(repo.saves).toHaveLength(0);
    });

    it("allows Solo mode with no partner name", async () => {
        const repo = new FakeSettingsRepository();
        const res = await saveSplitRule(
            { sharesExpenses: false, partnerName: "", sharePercentage: 68 },
            repo,
        );

        expect(res.ok).toBe(true);
        expect(repo.saves[0]?.data.sharesExpenses).toBe(false);
        expect(repo.saves[0]?.data.partnerName).toBeNull();
    });

    it("rejects an out-of-range share percentage", async () => {
        const repo = new FakeSettingsRepository();
        const res = await saveSplitRule(
            { sharesExpenses: true, partnerName: "Brenda", sharePercentage: 0 },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("validation");
        expect(res.fieldErrors?.sharePercentage).toBeDefined();
        expect(repo.saves).toHaveLength(0);
    });

    it("returns unauthenticated with no session (IDOR guard — never writes)", async () => {
        authMock.mockResolvedValue(null);
        const repo = new FakeSettingsRepository();
        const res = await saveSplitRule(
            {
                sharesExpenses: true,
                partnerName: "Brenda",
                sharePercentage: 68,
            },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("unauthenticated");
        expect(repo.saves).toHaveLength(0);
    });

    it("scopes the write to the session user, ignoring any client-supplied id", async () => {
        authMock.mockResolvedValue({ user: { id: "owner" } });
        const repo = new FakeSettingsRepository();
        await saveSplitRule(
            {
                userId: "someone-else",
                sharesExpenses: true,
                partnerName: "Brenda",
                sharePercentage: 68,
            },
            repo,
        );

        expect(repo.saves[0]?.userId).toBe("owner");
    });

    it("maps a repository failure to db_error", async () => {
        const repo = new FakeSettingsRepository();
        repo.failOnWrite = true;
        const res = await saveSplitRule(
            {
                sharesExpenses: true,
                partnerName: "Brenda",
                sharePercentage: 68,
            },
            repo,
        );

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("db_error");
    });
});
