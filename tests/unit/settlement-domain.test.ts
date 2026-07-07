import { describe, expect, it } from "vitest";

import { computeCoupleBalance } from "@/lib/domain/settlement";

const inputs = (
    over: Partial<Parameters<typeof computeCoupleBalance>[0]> = {},
) => ({
    partnerShareOfYourExpenses: 0,
    yourDebtToPartner: 0,
    moneyPartnerPaidYou: 0,
    moneyYouPaidPartner: 0,
    ...over,
});

describe("computeCoupleBalance", () => {
    it("she owes you her share of what you paid", () => {
        const r = computeCoupleBalance(
            inputs({ partnerShareOfYourExpenses: 1000 }),
        );
        expect(r.balance).toBe(1000);
        expect(r.amount).toBe(1000);
        expect(r.direction).toBe("she_owes");
    });

    it("you owe her for a logged debt", () => {
        const r = computeCoupleBalance(inputs({ yourDebtToPartner: 500 }));
        expect(r.balance).toBe(-500);
        expect(r.amount).toBe(500);
        expect(r.direction).toBe("you_owe");
    });

    // Worked scenarios from spec 0004 §2.4 — all settle to 0.
    it("scenario: she owes 1000, pays 1000 → settled", () => {
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 1000,
                moneyPartnerPaidYou: 1000,
            }),
        );
        expect(r.balance).toBe(0);
        expect(r.direction).toBe("settled");
    });

    it("scenario: she owes 1000, you owe 300, she pays 700 → settled", () => {
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 1000,
                yourDebtToPartner: 300,
                moneyPartnerPaidYou: 700,
            }),
        );
        expect(r.balance).toBe(0);
        expect(r.direction).toBe("settled");
    });

    it("scenario: she owes 500, you owe 700, you pay 200 → settled", () => {
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 500,
                yourDebtToPartner: 700,
                moneyYouPaidPartner: 200,
            }),
        );
        expect(r.balance).toBe(0);
        expect(r.direction).toBe("settled");
    });

    it("fundedByPartner + gf_received both draw down what she owes (moneyPartnerPaidYou)", () => {
        // she owes 1000; she paid 600 (400 cash + 200 card-funded) → 400 left
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 1000,
                moneyPartnerPaidYou: 600,
            }),
        );
        expect(r.balance).toBe(400);
        expect(r.direction).toBe("she_owes");
    });

    it("rounds float drift to cents", () => {
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 0.1,
                moneyYouPaidPartner: 0.2,
            }),
        );
        expect(r.balance).toBe(0.3);
    });

    it("exposes the four signed breakdown lines", () => {
        const r = computeCoupleBalance(
            inputs({
                partnerShareOfYourExpenses: 1000,
                yourDebtToPartner: 300,
                moneyPartnerPaidYou: 50,
                moneyYouPaidPartner: 20,
            }),
        );
        expect(r.breakdown).toEqual([
            { key: "partner_share", sign: "+", amount: 1000 },
            { key: "your_debt", sign: "-", amount: 300 },
            { key: "partner_paid", sign: "-", amount: 50 },
            { key: "you_paid", sign: "+", amount: 20 },
        ]);
    });
});
