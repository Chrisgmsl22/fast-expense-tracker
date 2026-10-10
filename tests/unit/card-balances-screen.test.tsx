import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push }),
    usePathname: () => "/cards",
}));
vi.mock("@/app/_actions/card/get-history", () => ({
    getCardHistory: vi.fn(),
}));
vi.mock("@/app/_actions/movement/add-card-payment", () => ({
    addCardPayment: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-card-payment", () => ({
    updateCardPayment: vi.fn(),
}));

import { CardBalancesScreen } from "@/components/cards/CardBalancesScreen";
import type { CardBalanceInput } from "@/components/cards/card-balance-display";
import { getCardHistory } from "@/app/_actions/card/get-history";
import { addCardPayment } from "@/app/_actions/movement/add-card-payment";
import {
    summarizeCardBalances,
    type CardHistoryLine,
} from "@/lib/domain/card-balance";

const historyMock = getCardHistory as unknown as Mock;
const addMock = addCardPayment as unknown as Mock;

const card = ({
    id,
    name,
    charged,
    paid,
    before = { charged: 0, paid: 0, redeemed: 0 },
}: {
    id: string;
    name: string;
    charged: number;
    paid: number;
    before?: CardBalanceInput["before"];
}): CardBalanceInput => ({
    id,
    name,
    color: "#0b5cab",
    type: "credit",
    before,
    during: { charged, paid, redeemed: 0 },
});

const CARDS = [
    card({ id: "bbva", name: "BBVA", charged: 18400, paid: 12270 }),
    card({ id: "nu", name: "NU", charged: 9850.4, paid: 9850.4 }),
    card({ id: "plat", name: "Amex Platinum", charged: 21110.75, paid: 23000 }),
    card({
        id: "gold",
        name: "Amex Gold",
        charged: 4215.6,
        paid: 3000,
    }),
];

const line = (over: Partial<CardHistoryLine> & Pick<CardHistoryLine, "id">) =>
    ({
        kind: "charge",
        date: new Date("2026-09-26T06:00:00Z"),
        createdAt: new Date("2026-09-26T06:00:00Z"),
        description: "Costco",
        detail: "Groceries",
        isShared: false,
        amount: 2840,
        signedAmount: 2840,
        balanceAfter: 6130,
        ...over,
    }) satisfies CardHistoryLine;

function renderScreen(cards = CARDS, currentMonth = "2026-09") {
    return render(
        <CardBalancesScreen
            summary={summarizeCardBalances(cards)}
            month="2026-09"
            monthName="September"
            currentMonth={currentMonth}
        />,
    );
}

const tile = (name: string) => screen.getByRole("article", { name });

beforeEach(() => {
    vi.clearAllMocks();
    historyMock.mockResolvedValue({
        ok: true,
        data: {
            opening: 6290,
            lines: [
                line({
                    id: "m1",
                    kind: "payment",
                    description: null,
                    detail: "from checking",
                    amount: 3000,
                    signedAmount: -3000,
                    balanceAfter: 6130,
                    date: new Date("2026-09-28T06:00:00Z"),
                }),
                line({ id: "e1", isShared: true, balanceAfter: 9130 }),
            ],
        },
    });
    addMock.mockResolvedValue({ ok: true, data: { id: "m9" } });
});

describe("CardBalancesScreen", () => {
    it("shows each active card's state and balance", () => {
        renderScreen();

        expect(
            within(tile("BBVA")).getByText("Owed at end of September"),
        ).toBeDefined();
        expect(within(tile("BBVA")).getByText("$6,130.00")).toBeDefined();
        expect(within(tile("NU")).getByText("Paid in full")).toBeDefined();
        expect(
            within(tile("NU")).getByText("Nothing owed at end of September"),
        ).toBeDefined();
        const plat = tile("Amex Platinum");
        expect(within(plat).getByText("Card owes you")).toBeDefined();
        expect(within(plat).getByText("+$1,889.25")).toBeDefined();
        expect(
            within(plat).getByText("You paid $1,889.25 more than you owed"),
        ).toBeDefined();
    });

    it("totals what is owed without subtracting a credit", () => {
        renderScreen();
        const totals = screen.getByRole("region", { name: "Totals" });

        expect(within(totals).getByText("$7,345.60")).toBeDefined();
        expect(
            within(totals).getByText("BBVA $6,130.00 + Amex Gold $1,215.60"),
        ).toBeDefined();
        expect(within(totals).getByText("$1,889.25")).toBeDefined();
        expect(
            within(totals).getByText(
                "Amex Platinum, overpaid · not subtracted above",
            ),
        ).toBeDefined();
    });

    it("hides the credit panel when no card owes you", () => {
        renderScreen([CARDS[0]!, CARDS[1]!]);
        const totals = screen.getByRole("region", { name: "Totals" });

        expect(within(totals).queryByText("A card owes you")).toBeNull();
        expect(within(totals).getByText("$6,130.00")).toBeDefined();
    });

    it("says nothing is owed when every card is at zero", () => {
        renderScreen([CARDS[1]!]);

        expect(screen.getByText("Nothing owed on any card")).toBeDefined();
    });

    it("shows the work-in-progress banner and the balance rules", async () => {
        renderScreen();
        const notice = screen.getByRole("complementary", {
            name: "Work in progress",
        });

        expect(notice.textContent).toContain(
            "Work in progress: balances may not match your bank yet. They count only the card payments you logged.",
        );
        fireEvent.click(
            within(notice).getByRole("button", {
                name: "How this balance works",
            }),
        );
        expect(
            await within(notice).findByText(
                "Partner money, insurance refunds and the reimbursed toggle do not change it.",
            ),
        ).toBeDefined();
        expect(
            within(notice).getByText(
                "Charges count at their full amount, even when you split them.",
            ),
        ).toBeDefined();
        expect(
            within(notice).getByText("Card payments lower the balance."),
        ).toBeDefined();
        expect(
            within(notice).getByText(
                "Cash and debit cards spend money you already have, so they are not listed. Transfers to Savings are not card charges.",
            ),
        ).toBeDefined();
        expect(
            within(notice).getByText("Archived cards are not listed."),
        ).toBeDefined();
    });

    it("shows the empty state with a link to Settings → Cards", () => {
        renderScreen([]);

        expect(screen.getByText("No cards yet")).toBeDefined();
        expect(
            screen
                .getByRole("link", { name: "Go to Cards" })
                .getAttribute("href"),
        ).toBe("/settings#cards");
        expect(screen.queryByRole("region", { name: "Totals" })).toBeNull();
    });
});

describe("CardBalancesScreen drawer", () => {
    async function openBbva() {
        renderScreen();
        fireEvent.click(screen.getByRole("button", { name: "BBVA details" }));
        return screen.findByRole("dialog", { name: "BBVA" });
    }

    it("opens on a tile click with the summary and history, newest first", async () => {
        const drawer = await openBbva();

        expect(historyMock).toHaveBeenCalledWith({
            id: "bbva",
            month: "2026-09",
        });
        expect(within(drawer).getByText("$6,130.00")).toBeDefined();
        const rows = within(
            await within(drawer).findByRole("list", { name: "History" }),
        ).getAllByRole("listitem");
        expect(rows[0]?.textContent).toContain("Payment");
        expect(rows[0]?.textContent).toContain("− $3,000.00");
        expect(rows[0]?.textContent).toContain("bal $6,130.00");
        expect(rows[1]?.textContent).toContain("Costco");
        expect(rows[1]?.textContent).toContain("shared, full amount");
        expect(rows[1]?.textContent).toContain("bal $9,130.00");
        expect(rows[2]?.textContent).toBe("Opening balance$6,290.00");
    });

    it("closes with Escape", async () => {
        const drawer = await openBbva();

        fireEvent.keyDown(drawer, { key: "Escape" });

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("closes with the × button", async () => {
        const drawer = await openBbva();

        fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("closes on a click outside", async () => {
        await openBbva();
        const backdrop = document.querySelector('[data-slot="sheet-overlay"]');

        fireEvent.pointerDown(backdrop!);
        fireEvent.mouseDown(backdrop!);
        fireEvent.click(backdrop!);

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("shows the error message when the history fails to load", async () => {
        historyMock.mockResolvedValue({
            ok: false,
            code: "db_error",
            message: "Could not load the card history. Please try again.",
        });
        const drawer = await openBbva();

        expect(
            (await within(drawer).findByRole("alert")).textContent,
        ).toContain("Could not load the card history");
    });

    it("shows an error when the history request throws", async () => {
        historyMock.mockRejectedValue(new Error("network"));
        const drawer = await openBbva();

        expect((await within(drawer).findByRole("alert")).textContent).toBe(
            "Could not load the card history. Please try again.",
        );
    });

    it("says so when a card has no history", async () => {
        historyMock.mockResolvedValue({
            ok: true,
            data: { opening: 0, lines: [] },
        });
        const drawer = await openBbva();

        expect(
            await within(drawer).findByText(
                "Nothing logged on this card in September.",
            ),
        ).toBeDefined();
    });

    it("counts several hidden lines in the plural", async () => {
        const lines = Array.from({ length: 23 }, (_, i) =>
            line({ id: `e${i}`, description: `Charge ${i}` }),
        );
        historyMock.mockResolvedValue({
            ok: true,
            data: { opening: 0, lines },
        });
        const drawer = await openBbva();

        expect(
            await within(drawer).findByRole("button", {
                name: "Show 3 earlier entries",
            }),
        ).toBeDefined();
    });

    it("shows the first 20 lines, then the rest on request", async () => {
        const lines = Array.from({ length: 21 }, (_, i) =>
            line({ id: `e${i}`, description: `Charge ${i}` }),
        );
        historyMock.mockResolvedValue({
            ok: true,
            data: { opening: 0, lines },
        });
        const drawer = await openBbva();
        const list = await within(drawer).findByRole("list", {
            name: "History",
        });

        expect(within(list).getAllByRole("listitem")).toHaveLength(20);
        fireEvent.click(
            within(drawer).getByRole("button", {
                name: "Show 1 earlier entry",
            }),
        );
        expect(within(list).getAllByRole("listitem")).toHaveLength(22);
        expect(within(list).getByText("Opening balance")).toBeDefined();
    });

    it("keeps only the latest card's history when tiles are clicked quickly", async () => {
        let resolveFirst: (v: unknown) => void = () => {};
        historyMock
            .mockImplementationOnce(
                () => new Promise((resolve) => (resolveFirst = resolve)),
            )
            .mockResolvedValueOnce({
                ok: true,
                data: { opening: 0, lines: [] },
            });
        renderScreen();
        fireEvent.click(screen.getByRole("button", { name: "BBVA details" }));
        fireEvent.keyDown(await screen.findByRole("dialog"), {
            key: "Escape",
        });
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        fireEvent.click(screen.getByRole("button", { name: "NU details" }));
        const drawer = await screen.findByRole("dialog", { name: "NU" });
        await within(drawer).findByText(
            "Nothing logged on this card in September.",
        );

        resolveFirst({
            ok: true,
            data: {
                opening: 0,
                lines: [line({ id: "stale", description: "Stale" })],
            },
        });

        await waitFor(() =>
            expect(within(drawer).queryByText("Stale")).toBeNull(),
        );
    });
});

describe("CardBalancesScreen log a payment", () => {
    it("opens the payment form from a tile with the card prefilled, then saves and refreshes", async () => {
        renderScreen();
        fireEvent.click(
            screen.getByRole("button", { name: "Log a payment on BBVA" }),
        );
        const dialog = await screen.findByRole("dialog", {
            name: "Log a payment",
        });
        expect(
            within(dialog).getByRole("combobox", { name: "Card paid" })
                .textContent,
        ).toContain("BBVA");

        fireEvent.click(
            within(dialog).getByRole("button", { name: "Pay full $6,130.00" }),
        );
        expect(
            (within(dialog).getByLabelText(/Amount/) as HTMLInputElement).value,
        ).toBe("6130.00");
        expect(within(dialog).getByText("BBVA balance")).toBeDefined();

        fireEvent.change(within(dialog).getByLabelText("Date"), {
            target: { value: "2026-10-02" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Add card payment" }),
        );

        await waitFor(() => expect(refresh).toHaveBeenCalled());
        expect(addMock).toHaveBeenCalledWith(
            expect.objectContaining({ cardId: "bbva", amount: "6130.00" }),
        );
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("opens the payment form from the drawer and closes the drawer", async () => {
        renderScreen();
        fireEvent.click(screen.getByRole("button", { name: "BBVA details" }));
        const drawer = await screen.findByRole("dialog", { name: "BBVA" });

        fireEvent.click(
            within(drawer).getByRole("button", { name: "Log a payment" }),
        );

        const dialog = await screen.findByRole("dialog", {
            name: "Log a payment",
        });
        expect(within(dialog).getByText("BBVA balance")).toBeDefined();
        await waitFor(() =>
            expect(screen.queryByRole("dialog", { name: "BBVA" })).toBeNull(),
        );

        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() =>
            expect(document.activeElement).toBe(
                screen.getByRole("button", { name: "BBVA details" }),
            ),
        );
    });

    it("closes the payment form with Escape", async () => {
        renderScreen();
        fireEvent.click(
            screen.getByRole("button", { name: "Log a payment on Amex Gold" }),
        );
        const dialog = await screen.findByRole("dialog", {
            name: "Log a payment",
        });

        expect(
            within(dialog).getByRole("button", { name: "Pay full $1,215.60" }),
        ).toBeDefined();
        fireEvent.keyDown(dialog, { key: "Escape" });
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("offers no Pay full on a card that owes you, and Cancel closes the form", async () => {
        renderScreen();
        fireEvent.click(
            screen.getByRole("button", {
                name: "Log a payment on Amex Platinum",
            }),
        );
        const dialog = await screen.findByRole("dialog", {
            name: "Log a payment",
        });

        expect(
            within(dialog).queryByRole("button", { name: /Pay full/ }),
        ).toBeNull();
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("shows a credit balance in green with a + sign in the drawer", async () => {
        renderScreen();
        fireEvent.click(
            screen.getByRole("button", { name: "Amex Platinum details" }),
        );
        const drawer = await screen.findByRole("dialog", {
            name: "Amex Platinum",
        });

        const balance = within(drawer).getByText("+$1,889.25");
        expect(balance.className).toContain("text-positive");
        expect(within(drawer).getByText("Card owes you")).toBeDefined();
    });
});

describe("CardBalancesScreen on a phone", () => {
    it("shows one compact totals block with each card that owes you", () => {
        renderScreen();
        const block = screen.getByRole("region", { name: "Total owed" });

        expect(within(block).getByText("$7,345.60")).toBeDefined();
        expect(block.textContent).toContain("Amex Platinum owes you$1,889.25");
        expect(block.textContent).toContain(
            "Opening balance + charged (full amount, even when split) − payments − points redeemed",
        );
    });

    it("lists each card as a compact row that opens the drawer", async () => {
        renderScreen();
        const row = screen.getByRole("button", {
            name: "BBVA, $6,130.00, Owed",
        });

        expect(row.textContent).toContain("Credit·$0 + $18.4k − $12.3k − $0");
        fireEvent.click(row);
        expect(
            await screen.findByRole("dialog", { name: "BBVA" }),
        ).toBeDefined();
    });
});

describe("CardBalancesScreen focus after the payment dialog", () => {
    it("returns focus to the tile's button after a save started in the drawer", async () => {
        renderScreen();
        fireEvent.click(screen.getByRole("button", { name: "NU details" }));
        const drawer = await screen.findByRole("dialog", { name: "NU" });
        fireEvent.click(
            within(drawer).getByRole("button", { name: "Log a payment" }),
        );
        const dialog = await screen.findByRole("dialog", {
            name: "Log a payment",
        });
        fireEvent.change(within(dialog).getByLabelText("Date"), {
            target: { value: "2026-10-02" },
        });
        fireEvent.change(within(dialog).getByLabelText(/Amount/), {
            target: { value: "10" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Add card payment" }),
        );

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() =>
            expect(document.activeElement).toBe(
                screen.getByRole("button", { name: "NU details" }),
            ),
        );
    });
});

describe("CardBalancesScreen month statement", () => {
    it("shows the month switcher, and the way back when on a past month", () => {
        renderScreen(CARDS, "2026-10");

        expect(
            (screen.getByLabelText("Filter by month") as HTMLInputElement)
                .value,
        ).toBe("2026-09");
        fireEvent.click(
            screen.getByRole("button", {
                name: "Take me back to the current month",
            }),
        );
        expect(push).toHaveBeenCalledWith("/cards?month=2026-10");
    });

    it("hides the way back on the current month", () => {
        renderScreen();

        expect(
            screen.queryByRole("button", {
                name: "Take me back to the current month",
            }),
        ).toBeNull();
    });

    it("names the month on each statement line and on the total", () => {
        renderScreen([
            card({
                id: "bbva",
                name: "BBVA",
                charged: 250.5,
                paid: 100,
                before: { charged: 1000, paid: 400, redeemed: 0 },
            }),
        ]);
        const bbva = tile("BBVA");

        expect(
            within(bbva).getByText("Opening balance").nextSibling?.textContent,
        ).toBe("$600.00");
        expect(within(bbva).getByText("Charged in September")).toBeDefined();
        expect(within(bbva).getByText("Paid in September")).toBeDefined();
        expect(within(bbva).getByText("Redeemed in September")).toBeDefined();
        expect(within(bbva).getByText("$750.50")).toBeDefined();
        expect(
            screen.getAllByText("Total owed at end of September"),
        ).toHaveLength(2);
    });

    it("offers no Pay full or before → after line on a past month", async () => {
        renderScreen(CARDS, "2026-10");
        fireEvent.click(
            screen.getByRole("button", { name: "Log a payment on BBVA" }),
        );
        const dialog = await screen.findByRole("dialog", {
            name: "Log a payment",
        });

        expect(
            within(dialog).queryByRole("button", { name: /Pay full/ }),
        ).toBeNull();
        expect(within(dialog).queryByText("BBVA balance")).toBeNull();
    });
});
