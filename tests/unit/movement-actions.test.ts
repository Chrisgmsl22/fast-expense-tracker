import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { addCardPayment } from "@/app/_actions/movement/add-card-payment";
import { addTransfer } from "@/app/_actions/movement/add-transfer";
import { deleteMovement } from "@/app/_actions/movement/delete";
import { updateTransfer } from "@/app/_actions/movement/update-transfer";
import { FakeMovementRepository } from "@/tests/support/fake-movement-repository";

describe("movement actions (unit, injected fake repo)", () => {
    beforeEach(() => {
        authMock.mockReset();
        authMock.mockResolvedValue({ user: { id: "u1" } });
    });

    describe("addCardPayment", () => {
        it("persists a card_payment movement for the signed-in user", async () => {
            const repo = new FakeMovementRepository();
            const res = await addCardPayment(
                {
                    date: "2026-06-20",
                    amount: "1000",
                    cardId: "card_1",
                },
                repo,
            );

            expect(res.ok).toBe(true);
            expect(repo.inserts).toHaveLength(1);
            const row = repo.inserts[0]!;
            expect(row.userId).toBe("u1");
            expect(row.type).toBe("card_payment");
            expect(row.cardId).toBe("card_1");
            expect(row.amount).toBe(1000);
        });

        it("rejects an invalid payment with a validation code + no write", async () => {
            const repo = new FakeMovementRepository();
            const res = await addCardPayment(
                { date: "2026-06-20", amount: "0", cardId: "" },
                repo,
            );

            expect(res.ok).toBe(false);
            if (res.ok) return;
            expect(res.code).toBe("validation");
            expect(repo.inserts).toHaveLength(0);
        });

        it("returns unauthenticated when there is no session", async () => {
            authMock.mockResolvedValue(null);
            const repo = new FakeMovementRepository();
            const res = await addCardPayment(
                {
                    date: "2026-06-20",
                    amount: "1000",
                    cardId: "card_1",
                },
                repo,
            );

            expect(res.ok).toBe(false);
            if (res.ok) return;
            expect(res.code).toBe("unauthenticated");
            expect(repo.inserts).toHaveLength(0);
        });

        it("maps a repository failure to db_error", async () => {
            const repo = new FakeMovementRepository();
            repo.failOnWrite = true;
            const res = await addCardPayment(
                { date: "2026-06-20", amount: "1000", cardId: "card_1" },
                repo,
            );

            expect(res.ok).toBe(false);
            if (res.ok) return;
            expect(res.code).toBe("db_error");
        });
    });

    describe("addTransfer", () => {
        it("persists a gf_paid movement with no card", async () => {
            const repo = new FakeMovementRepository();
            const res = await addTransfer(
                { date: "2026-06-20", amount: "300", note: "netted" },
                repo,
            );

            expect(res.ok).toBe(true);
            expect(repo.inserts).toHaveLength(1);
            const row = repo.inserts[0]!;
            expect(row.type).toBe("gf_paid");
            expect(row.cardId).toBeNull();
            expect(row.amount).toBe(300);
        });

        it("persists a gf_received movement when direction is gf_received", async () => {
            const repo = new FakeMovementRepository();
            const res = await addTransfer(
                { date: "2026-06-20", amount: "700", direction: "gf_received" },
                repo,
            );

            expect(res.ok).toBe(true);
            expect(repo.inserts[0]!.type).toBe("gf_received");
            expect(repo.inserts[0]!.amount).toBe(700);
        });

        it("rejects a non-positive amount", async () => {
            const repo = new FakeMovementRepository();
            const res = await addTransfer(
                { date: "2026-06-20", amount: "0" },
                repo,
            );
            expect(res.ok).toBe(false);
            if (res.ok) return;
            expect(res.code).toBe("validation");
            expect(repo.inserts).toHaveLength(0);
        });
    });

    describe("deleteMovement", () => {
        it("deletes the user's movement", async () => {
            const repo = new FakeMovementRepository();
            repo.seed("mv1", "u1");
            const res = await deleteMovement({ id: "mv1" }, repo);
            expect(res.ok).toBe(true);
        });

        it("returns not_found for a movement that isn't the user's", async () => {
            const repo = new FakeMovementRepository();
            repo.seed("mv1", "someone-else");
            const res = await deleteMovement({ id: "mv1" }, repo);
            expect(res.ok).toBe(false);
            if (res.ok) return;
            expect(res.code).toBe("not_found");
        });

        it("returns unauthenticated with no session", async () => {
            authMock.mockResolvedValue(null);
            const repo = new FakeMovementRepository();
            const res = await deleteMovement({ id: "mv1" }, repo);
            expect(res.ok).toBe(false);
            if (res.ok) return;
            expect(res.code).toBe("unauthenticated");
        });

        it("refuses to delete the transfer that closed a settlement", async () => {
            // Deleting it would dissolve the boundary and merge a closed cycle
            // back into the open one (spec 0007 §3.5).
            const repo = new FakeMovementRepository();
            repo.seed("mv1", "u1", {
                type: "gf_received",
                closedAt: new Date("2026-07-12T00:00:00Z"),
            });

            const res = await deleteMovement({ id: "mv1" }, repo);

            expect(res.ok).toBe(false);
            if (res.ok) return;
            expect(res.code).toBe("cycle_closed");
            expect(res.message).toMatch(/closed a settlement/i);
            // Still there.
            expect(await repo.getById("u1", "mv1")).not.toBeNull();
        });
    });

    describe("updateTransfer", () => {
        it("edits an ordinary transfer", async () => {
            const repo = new FakeMovementRepository();
            repo.seed("mv1", "u1", { type: "gf_received", amount: 100 });

            const res = await updateTransfer(
                {
                    id: "mv1",
                    date: "2026-07-10",
                    amount: "150",
                    direction: "gf_received",
                },
                repo,
            );

            expect(res.ok).toBe(true);
            expect(repo.updates).toHaveLength(1);
        });

        it("refuses to edit the transfer that closed a settlement", async () => {
            // Its amount and direction are what that closed cycle settled.
            const repo = new FakeMovementRepository();
            repo.seed("mv1", "u1", {
                type: "gf_received",
                amount: 320,
                closedAt: new Date("2026-07-12T00:00:00Z"),
            });

            const res = await updateTransfer(
                {
                    id: "mv1",
                    date: "2026-07-10",
                    amount: "999",
                    direction: "gf_paid",
                },
                repo,
            );

            expect(res.ok).toBe(false);
            if (res.ok) return;
            expect(res.code).toBe("cycle_closed");
            expect(repo.updates).toHaveLength(0);
            const row = await repo.getById("u1", "mv1");
            expect(row?.amount).toBe(320);
            expect(row?.type).toBe("gf_received");
        });
    });
});
