import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { SAVINGS_SLUG } from "@/lib/domain/dashboard";
import {
    cardBalance,
    summarizeCardBalances,
    withRunningBalance,
} from "@/lib/domain/card-balance";
import { PrismaCardRepository } from "@/lib/repositories/card.repository";

const repo = new PrismaCardRepository(db);
const SEP = "2026-09";

let userSeq = 0;
async function seedUser() {
    userSeq += 1;
    return db.user.create({
        data: {
            email: `card-balance-${userSeq}@example.com`,
            password: "x",
            name: "Test",
        },
    });
}

async function seedCategory(
    userId: string,
    name = "Groceries",
    slug = `${name.toLowerCase()}-${Math.random()}`,
) {
    return db.category.create({ data: { userId, slug, name } });
}

async function seedCard(
    userId: string,
    over: Partial<{ name: string; type: string; archivedAt: Date | null }> = {},
) {
    return db.card.create({
        data: {
            userId,
            name: over.name ?? "BBVA",
            color: "#0b5cab",
            type: over.type ?? "credit",
            archivedAt: over.archivedAt ?? null,
        },
    });
}

type ChargeOver = Partial<{
    cardId: string | null;
    amount: number;
    actualExpenditure: number;
    isShared: boolean;
    yourPercentage: number;
    fundedFrom: string;
    isPartnerPayment: boolean;
    description: string;
    date: string;
}>;

async function seedCharge(
    userId: string,
    categoryId: string,
    over: ChargeOver,
) {
    const amount = over.amount ?? 100;
    return db.expense.create({
        data: {
            userId,
            categoryId,
            cardId: over.cardId ?? null,
            date: new Date(over.date ?? "2026-09-10T06:00:00Z"),
            description: over.description ?? "Charge",
            amount,
            actualExpenditure: over.actualExpenditure ?? amount,
            isShared: over.isShared ?? false,
            yourPercentage: over.yourPercentage ?? 1,
            fundedFrom: over.fundedFrom ?? "income",
            isPartnerPayment: over.isPartnerPayment ?? false,
        },
    });
}

async function seedMovement(
    userId: string,
    over: Partial<{
        cardId: string | null;
        amount: number;
        type: string;
        note: string | null;
        date: string;
    }>,
) {
    return db.movement.create({
        data: {
            userId,
            cardId: over.cardId ?? null,
            amount: over.amount ?? 100,
            type: over.type ?? "card_payment",
            note: over.note ?? null,
            date: new Date(over.date ?? "2026-09-12T06:00:00Z"),
        },
    });
}

describe("PrismaCardRepository.listBalances (integration)", () => {
    it("charges a shared expense at its full amount, not the user's share", async () => {
        const user = await seedUser();
        const category = await seedCategory(user.id);
        const card = await seedCard(user.id);
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            amount: 1000,
            isShared: true,
            yourPercentage: 0.6,
            actualExpenditure: 600,
        });

        const [row] = await repo.listBalances(user.id, SEP);

        expect(row?.charged).toBe(1000);
    });

    it("counts reimbursed and savings-funded charges", async () => {
        const user = await seedUser();
        const category = await seedCategory(user.id);
        const card = await seedCard(user.id);
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            amount: 250.5,
            fundedFrom: "reimbursed",
        });
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            amount: 99.5,
            fundedFrom: "savings",
        });
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            amount: 50,
        });

        const [row] = await repo.listBalances(user.id, SEP);

        expect(row?.charged).toBe(400);
    });

    it("leaves out cash and cardless rows", async () => {
        const user = await seedUser();
        const category = await seedCategory(user.id);
        const card = await seedCard(user.id);
        const cash = await seedCard(user.id, { name: "Cash", type: "cash" });
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            amount: 300,
        });
        await seedCharge(user.id, category.id, {
            cardId: cash.id,
            amount: 40,
        });
        await seedCharge(user.id, category.id, {
            amount: 2000,
            isPartnerPayment: true,
        });
        await seedCharge(user.id, category.id, { amount: 75 });

        const rows = await repo.listBalances(user.id, SEP);

        expect(rows.map((r) => r.name)).toEqual(["BBVA"]);
        expect(rows[0]).toMatchObject({ charged: 300, paid: 0, redeemed: 0 });
    });

    it("subtracts card payments and ignores other movement types", async () => {
        const user = await seedUser();
        const category = await seedCategory(user.id);
        const card = await seedCard(user.id);
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            amount: 18400,
        });
        await seedMovement(user.id, { cardId: card.id, amount: 9000 });
        await seedMovement(user.id, { cardId: card.id, amount: 3000 });
        await seedMovement(user.id, {
            cardId: card.id,
            amount: 500,
            type: "gf_received",
        });

        const [row] = await repo.listBalances(user.id, SEP);

        expect(row).toMatchObject({ charged: 18400, paid: 12000 });
        expect(cardBalance(row!)).toBe(6400);
    });

    it("never shows another user's cards or rows", async () => {
        const user = await seedUser();
        const other = await seedUser();
        const category = await seedCategory(user.id);
        const otherCategory = await seedCategory(other.id);
        const card = await seedCard(user.id);
        await seedCard(other.id, { name: "Not mine" });
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            amount: 100,
        });
        await seedCharge(other.id, otherCategory.id, {
            cardId: card.id,
            amount: 5000,
        });
        await seedMovement(other.id, { cardId: card.id, amount: 70 });

        const rows = await repo.listBalances(user.id, SEP);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            name: "BBVA",
            charged: 100,
            paid: 0,
        });
    });

    it("leaves out an archived card with a balance, from the list and from the total", async () => {
        const user = await seedUser();
        const category = await seedCategory(user.id);
        const active = await seedCard(user.id, { name: "NU" });
        const archived = await seedCard(user.id, {
            name: "Amex Gold",
            archivedAt: new Date("2026-08-01T00:00:00Z"),
        });
        await seedCharge(user.id, category.id, {
            cardId: active.id,
            amount: 500,
        });
        await seedCharge(user.id, category.id, {
            cardId: archived.id,
            amount: 4215.6,
        });
        await seedMovement(user.id, { cardId: archived.id, amount: 3000 });

        const rows = await repo.listBalances(user.id, SEP);

        expect(rows.map((r) => r.id)).toEqual([active.id]);
        expect(summarizeCardBalances(rows).totalOwed).toBe(500);
    });

    it("leaves out a Savings-category row on a card but counts a savings-funded purchase", async () => {
        const user = await seedUser();
        const groceries = await seedCategory(user.id);
        const savings = await seedCategory(user.id, "Savings", SAVINGS_SLUG);
        const card = await seedCard(user.id);
        await seedCharge(user.id, savings.id, {
            cardId: card.id,
            amount: 5000,
            description: "Monthly savings transfer",
        });
        await seedCharge(user.id, groceries.id, {
            cardId: card.id,
            amount: 320,
            fundedFrom: "savings",
        });

        const [row] = await repo.listBalances(user.id, SEP);

        expect(row?.charged).toBe(320);
    });

    it("leaves out debit cards like cash", async () => {
        const user = await seedUser();
        const category = await seedCategory(user.id);
        const credit = await seedCard(user.id, { name: "Amex" });
        const debit = await seedCard(user.id, {
            name: "Banorte",
            type: "debit",
        });
        await seedCharge(user.id, category.id, {
            cardId: debit.id,
            amount: 900,
        });

        const rows = await repo.listBalances(user.id, SEP);

        expect(rows.map((r) => r.id)).toEqual([credit.id]);
    });

    it("returns an empty list for a user with only a cash card", async () => {
        const user = await seedUser();
        await seedCard(user.id, { name: "Cash", type: "cash" });

        expect(await repo.listBalances(user.id, SEP)).toEqual([]);
    });
});

describe("PrismaCardRepository.listBalances by month (integration)", () => {
    it("reads only the month's own rows, none from before or after it", async () => {
        const user = await seedUser();
        const groceries = await seedCategory(user.id);
        const savings = await seedCategory(user.id, "Savings", SAVINGS_SLUG);
        const card = await seedCard(user.id);
        await seedCharge(user.id, groceries.id, {
            cardId: card.id,
            amount: 1000,
            date: "2026-08-15T06:00:00Z",
        });
        await seedCharge(user.id, savings.id, {
            cardId: card.id,
            amount: 5000,
            date: "2026-08-16T06:00:00Z",
        });
        await seedMovement(user.id, {
            cardId: card.id,
            amount: 400,
            date: "2026-08-20T06:00:00Z",
        });
        await seedCharge(user.id, groceries.id, {
            cardId: card.id,
            amount: 250.5,
            date: "2026-09-10T06:00:00Z",
        });
        await seedMovement(user.id, {
            cardId: card.id,
            amount: 100,
            date: "2026-09-20T06:00:00Z",
        });
        await seedCharge(user.id, groceries.id, {
            cardId: card.id,
            amount: 9999,
            date: "2026-10-05T06:00:00Z",
        });
        await seedMovement(user.id, {
            cardId: card.id,
            amount: 50,
            date: "2026-10-06T06:00:00Z",
        });

        const rows = await repo.listBalances(user.id, SEP);

        expect(rows[0]).toMatchObject({
            charged: 250.5,
            paid: 100,
            redeemed: 0,
        });
        const [statement] = summarizeCardBalances(rows).cards;
        expect(statement).toMatchObject({ balance: 150.5, state: "owed" });
    });

    it("files a row by its CDMX date at both month boundaries", async () => {
        const user = await seedUser();
        const category = await seedCategory(user.id);
        const card = await seedCard(user.id);
        const charge = (amount: number, date: string) =>
            seedCharge(user.id, category.id, { cardId: card.id, amount, date });
        await charge(70, "2026-09-01T05:59:59Z");
        await charge(30, "2026-09-01T06:00:00Z");
        await charge(5, "2026-10-01T05:59:59Z");
        await charge(9, "2026-10-01T06:00:00Z");

        const [august] = await repo.listBalances(user.id, "2026-08");
        const [september] = await repo.listBalances(user.id, SEP);
        const [october] = await repo.listBalances(user.id, "2026-10");

        expect(august?.charged).toBe(70);
        expect(september?.charged).toBe(35);
        expect(october?.charged).toBe(9);
    });
});

describe("PrismaCardRepository.getHistory (integration)", () => {
    it("lists only the month's rows, its running balance starting at 0", async () => {
        const user = await seedUser();
        const category = await seedCategory(user.id);
        const card = await seedCard(user.id);
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            description: "August",
            amount: 1000,
            date: "2026-08-15T06:00:00Z",
        });
        await seedMovement(user.id, {
            cardId: card.id,
            amount: 400,
            date: "2026-08-20T06:00:00Z",
        });
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            description: "September",
            amount: 250,
            date: "2026-09-10T06:00:00Z",
        });
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            description: "October",
            amount: 9999,
            date: "2026-10-05T06:00:00Z",
        });

        const history = await repo.getHistory(user.id, card.id, SEP);
        const lines = withRunningBalance(history!);

        expect(lines.map((l) => [l.description, l.balanceAfter])).toEqual([
            ["September", 250],
        ]);
    });

    it("returns charges and payments newest first with a running balance", async () => {
        const user = await seedUser();
        const category = await seedCategory(user.id, "Groceries");
        const card = await seedCard(user.id);
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            description: "Pemex",
            amount: 1150,
            date: "2026-09-12T06:00:00Z",
        });
        await seedMovement(user.id, {
            cardId: card.id,
            amount: 900,
            note: "from checking",
            date: "2026-09-15T06:00:00Z",
        });
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            description: "Costco",
            amount: 2840,
            isShared: true,
            yourPercentage: 0.5,
            actualExpenditure: 1420,
            date: "2026-09-26T06:00:00Z",
        });

        const history = await repo.getHistory(user.id, card.id, SEP);
        const lines = withRunningBalance(history!);

        expect(
            lines.map((l) => [
                l.kind,
                l.description,
                l.detail,
                l.signedAmount,
                l.balanceAfter,
            ]),
        ).toEqual([
            ["charge", "Costco", "Groceries", 2840, 3090],
            ["payment", null, "from checking", -900, 250],
            ["charge", "Pemex", "Groceries", 1150, 1150],
        ]);
        expect(lines[0]?.isShared).toBe(true);
    });

    it("keeps another user's rows and other movement types out", async () => {
        const user = await seedUser();
        const other = await seedUser();
        const otherCategory = await seedCategory(other.id);
        const card = await seedCard(user.id);
        await seedCharge(other.id, otherCategory.id, {
            cardId: card.id,
            amount: 5000,
        });
        await seedMovement(user.id, {
            cardId: card.id,
            amount: 10,
            type: "gf_received",
        });

        expect(await repo.getHistory(user.id, card.id, SEP)).toEqual([]);
    });

    it("leaves Savings-category rows out of the history", async () => {
        const user = await seedUser();
        const groceries = await seedCategory(user.id);
        const savings = await seedCategory(user.id, "Savings", SAVINGS_SLUG);
        const card = await seedCard(user.id);
        await seedCharge(user.id, savings.id, {
            cardId: card.id,
            amount: 5000,
            description: "Monthly savings transfer",
        });
        await seedCharge(user.id, groceries.id, {
            cardId: card.id,
            amount: 320,
            description: "Costco",
            fundedFrom: "savings",
        });

        const history = await repo.getHistory(user.id, card.id, SEP);

        expect(history?.map((e) => e.description)).toEqual(["Costco"]);
    });

    it("files a card payment at a month boundary by its CDMX date", async () => {
        const user = await seedUser();
        const card = await seedCard(user.id);
        const lastOfAugust = await seedMovement(user.id, {
            cardId: card.id,
            amount: 70,
            date: "2026-09-01T05:59:59Z",
        });
        const firstOfSeptember = await seedMovement(user.id, {
            cardId: card.id,
            amount: 30,
            date: "2026-09-01T06:00:00Z",
        });

        const august = await repo.getHistory(user.id, card.id, "2026-08");
        const september = await repo.getHistory(user.id, card.id, SEP);

        expect(august?.map((e) => [e.kind, e.id])).toEqual([
            ["payment", lastOfAugust.id],
        ]);
        expect(september?.map((e) => [e.kind, e.id])).toEqual([
            ["payment", firstOfSeptember.id],
        ]);
        const [row] = await repo.listBalances(user.id, SEP);
        expect(row).toMatchObject({ charged: 0, paid: 30 });
    });

    it("returns null for an archived card, even one with charges", async () => {
        const user = await seedUser();
        const category = await seedCategory(user.id);
        const archived = await seedCard(user.id, {
            archivedAt: new Date("2026-08-01T00:00:00Z"),
        });
        await seedCharge(user.id, category.id, {
            cardId: archived.id,
            amount: 1215.6,
        });

        expect(await repo.getHistory(user.id, archived.id, SEP)).toBeNull();
    });

    it("returns null for another user's card, the cash card or a debit card", async () => {
        const user = await seedUser();
        const other = await seedUser();
        const card = await seedCard(user.id);
        const cash = await seedCard(user.id, { name: "Cash", type: "cash" });
        const debit = await seedCard(user.id, { name: "Debit", type: "debit" });

        expect(await repo.getHistory(other.id, card.id, SEP)).toBeNull();
        expect(await repo.getHistory(user.id, cash.id, SEP)).toBeNull();
        expect(await repo.getHistory(user.id, debit.id, SEP)).toBeNull();
    });
});

describe("Every month is its own statement (integration)", () => {
    async function seedOwnerExample() {
        const user = await seedUser();
        const category = await seedCategory(user.id);
        const card = await seedCard(user.id, { name: "NU" });
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            description: "Unpaid in September",
            amount: 830,
            date: "2026-09-20T06:00:00Z",
        });
        await seedCharge(user.id, category.id, {
            cardId: card.id,
            description: "Shared dinner",
            amount: 1300,
            isShared: true,
            yourPercentage: 0.5,
            actualExpenditure: 650,
            date: "2026-10-02T06:00:00Z",
        });
        await seedMovement(user.id, {
            cardId: card.id,
            amount: 416,
            date: "2026-10-04T06:00:00Z",
        });
        return { user, card };
    }

    async function statementFor(userId: string, month: string) {
        const rows = await repo.listBalances(userId, month);
        return summarizeCardBalances(rows).cards[0];
    }

    it("keeps September's unpaid charge in September", async () => {
        const { user, card } = await seedOwnerExample();

        expect(await statementFor(user.id, SEP)).toMatchObject({
            charged: 830,
            paid: 0,
            balance: 830,
        });
        const history = await repo.getHistory(user.id, card.id, SEP);
        expect(history?.map((e) => e.description)).toEqual([
            "Unpaid in September",
        ]);
    });

    it("reads October from its own rows only, the shared charge at full amount", async () => {
        const { user, card } = await seedOwnerExample();

        expect(await statementFor(user.id, "2026-10")).toMatchObject({
            charged: 1300,
            paid: 416,
            balance: 884,
        });
        const lines = withRunningBalance(
            (await repo.getHistory(user.id, card.id, "2026-10"))!,
        );
        expect(lines.map((l) => [l.kind, l.balanceAfter])).toEqual([
            ["payment", 884],
            ["charge", 1300],
        ]);
    });

    it("carries nothing into November", async () => {
        const { user, card } = await seedOwnerExample();

        expect(await statementFor(user.id, "2026-11")).toMatchObject({
            charged: 0,
            paid: 0,
            redeemed: 0,
            balance: 0,
        });
        expect(await repo.getHistory(user.id, card.id, "2026-11")).toEqual([]);
    });
});
