import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock only the session; the real repositories and database are exercised.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { db } from "@/lib/db";
import { addPartnerPayment } from "@/app/_actions/expense/add-partner-payment";
import { PARTNER_PAYMENT_CATEGORY_SLUG } from "@/lib/domain/expense";

beforeEach(() => {
    authMock.mockReset();
});

async function seed() {
    const me = await db.user.create({
        data: { email: "me@example.com", password: "x", name: "Me" },
    });
    const other = await db.user.create({
        data: { email: "other@example.com", password: "x", name: "Other" },
    });
    const combined = await db.category.create({
        data: {
            userId: me.id,
            slug: PARTNER_PAYMENT_CATEGORY_SLUG,
            name: "Combined Expenses",
        },
    });
    authMock.mockResolvedValue({ user: { id: me.id } });
    return { me, other, combined };
}

const input = (over: Record<string, unknown> = {}) => ({
    date: "2026-09-10",
    amount: 680,
    ...over,
});

describe("addPartnerPayment (integration)", () => {
    it("refuses another user's category, writing nothing", async () => {
        const { other } = await seed();
        const theirs = await db.category.create({
            data: { userId: other.id, slug: "hobbies", name: "Hobbies" },
        });

        const res = await addPartnerPayment(input({ categoryId: theirs.id }));

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("validation");
            expect(res.fieldErrors?.categoryId).toBeDefined();
        }
        expect(await db.expense.count()).toBe(0);
    });

    it("refuses another user's subcategory under the default category, writing nothing", async () => {
        const { other, combined } = await seed();
        const theirs = await db.subcategory.create({
            data: {
                userId: other.id,
                categoryId: combined.id,
                name: "Covered",
            },
        });

        const res = await addPartnerPayment(
            input({ subcategoryId: theirs.id }),
        );

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.code).toBe("validation");
            expect(res.fieldErrors?.subcategoryId).toBeDefined();
        }
        expect(await db.expense.count()).toBe(0);
    });

    it("files the payment under the user's own chosen category", async () => {
        const { me } = await seed();
        const mine = await db.category.create({
            data: { userId: me.id, slug: "groceries", name: "Groceries" },
        });

        const res = await addPartnerPayment(input({ categoryId: mine.id }));

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const row = await db.expense.findUniqueOrThrow({
            where: { id: res.data.id },
        });
        expect(row.userId).toBe(me.id);
        expect(row.categoryId).toBe(mine.id);
    });
});
