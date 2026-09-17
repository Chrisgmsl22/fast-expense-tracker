import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: refreshMock }),
}));
const { closeMock } = vi.hoisted(() => ({ closeMock: vi.fn() }));
vi.mock("@/app/_actions/settlement/close-cycle", () => ({
    closeSettlementCycle: closeMock,
}));
// The journal's edit dialogs import these; stub them so a pure render doesn't
// pull the next-auth server graph in.
vi.mock("@/app/_actions/expense/delete", () => ({
    deleteExpense: vi.fn(),
}));
vi.mock("@/app/_actions/movement/delete", () => ({ deleteMovement: vi.fn() }));
vi.mock("@/app/_actions/movement/add-partner-debt", () => ({
    addPartnerDebt: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-partner-debt", () => ({
    updatePartnerDebt: vi.fn(),
}));
vi.mock("@/app/_actions/expense/add-partner-payment", () => ({
    addPartnerPayment: vi.fn(),
}));
vi.mock("@/app/_actions/expense/update-partner-payment", () => ({
    updatePartnerPayment: vi.fn(),
}));
vi.mock("@/app/_actions/movement/add-transfer", () => ({
    addTransfer: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-transfer", () => ({
    updateTransfer: vi.fn(),
}));

import { SettlementCloseCard } from "@/components/settlement/SettlementCloseCard";
import { SettlementJournal } from "@/components/settlement/SettlementJournal";
import { SettlementViews } from "@/components/settlement/SettlementViews";
import {
    toMonthPosition,
    type MonthPosition,
} from "@/components/settlement/month-position";
import type {
    ClosedSettlementCycle,
    SettlementJournalItem,
} from "@/lib/services/settlement/settlement.service";

const JULY = new Date("2026-07-10T06:00:00Z");

const openRow: SettlementJournalItem = {
    kind: "your_expense",
    id: "e1",
    date: JULY,
    carriedOver: false,
    locked: false,
    description: "Open groceries",
    gross: 1000,
    partnerShare: 320,
};

const monthRow: SettlementJournalItem = {
    ...openRow,
    id: "e2",
    description: "Month groceries",
};

/** The transfer that closed a settlement: frozen server-side, so frozen here. */
const lockedTransfer: SettlementJournalItem = {
    kind: "transfer",
    id: "mClose",
    date: JULY,
    carriedOver: false,
    locked: true,
    direction: "gf_received",
    amount: 320,
    note: null,
    fundedFrom: "income",
    source: "movement",
};

/** An ordinary transfer, for contrast: it keeps its controls. */
const openTransfer: SettlementJournalItem = {
    ...lockedTransfer,
    id: "mOpen",
    locked: false,
};

const closedCycle: ClosedSettlementCycle = {
    id: "mClose",
    closedOn: new Date("2026-06-30T06:00:00Z"),
    settledAmount: 420,
    journal: [{ ...openRow, id: "e3", description: "Closed groceries" }],
    summary: {
        spentUnsplit: 1000,
        youOwed: 220,
        sheOwed: 320,
        outcome: { kind: "partner_paid", amount: 100 },
    },
};

function renderViews(
    over: Partial<Parameters<typeof SettlementViews>[0]> = {},
) {
    return render(
        <SettlementViews
            openJournal={[openRow]}
            monthJournal={[monthRow]}
            monthLabel="July"
            monthPosition="current"
            history={[closedCycle]}
            partnerName="Brenda"
            {...over}
        />,
    );
}

describe("toMonthPosition", () => {
    it("places the viewed month against the current one", () => {
        expect(toMonthPosition("2026-09", "2026-09")).toBe("current");
        expect(toMonthPosition("2026-08", "2026-09")).toBe("past");
        expect(toMonthPosition("2026-10", "2026-09")).toBe("future");
    });

    it("reads a year boundary correctly, not by comparing month numbers alone", () => {
        // A naive month-number comparison sees "12" > "09" and calls this
        // future; it is December of the PRIOR year, so it is past.
        expect(toMonthPosition("2025-12", "2026-09")).toBe("past");
        // A naive month-number comparison sees "01" < "09" and calls this
        // past; it is January of the NEXT year, so it is future.
        expect(toMonthPosition("2027-01", "2026-09")).toBe("future");
    });
});

describe("SettlementViews", () => {
    it("shows the open settlement first", () => {
        renderViews();
        expect(screen.getByText("Open groceries")).toBeDefined();
        expect(
            screen
                .getByRole("tab", { name: "Open settlement" })
                .getAttribute("aria-selected"),
        ).toBe("true");
    });

    it("switches to the calendar month", () => {
        renderViews();
        fireEvent.click(screen.getByRole("tab", { name: "July" }));
        expect(screen.getByText("Month groceries")).toBeDefined();
        expect(screen.queryByText("Open groceries")).toBeNull();
    });

    it("opens a closed cycle to reveal the rows it contained", () => {
        renderViews();
        fireEvent.click(screen.getByRole("tab", { name: "History" }));
        const trigger = screen.getByRole("button", { name: /Settled/ });
        // The panel stays mounted (and `hidden`) while closed, so read the
        // disclosure state off the trigger rather than the row's presence.
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        fireEvent.click(trigger);
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
        expect(screen.getByText("Closed groceries")).toBeDefined();
    });

    it("an empty cycle says so instead of showing a bare zero", () => {
        renderViews({ openJournal: [] });
        expect(
            screen.getByText(/nothing has been logged since the last close/i),
        ).toBeDefined();
    });

    it("an empty history names the month rather than showing a bare zero", () => {
        renderViews({ history: [] });
        fireEvent.click(screen.getByRole("tab", { name: "History" }));
        expect(
            screen.getByText(/No settlement was closed in July/i),
        ).toBeDefined();
    });

    it("footers a closed settlement with its four figures, in words", () => {
        renderViews();
        fireEvent.click(screen.getByRole("tab", { name: "History" }));
        fireEvent.click(screen.getByRole("button", { name: /Settled/ }));

        const footer = screen.getByTestId("cycle-summary");
        expect(footer.textContent).toContain("Spent (unsplit)");
        expect(footer.textContent).toContain("$1,000.00");
        expect(footer.textContent).toContain("You owed Brenda");
        expect(footer.textContent).toContain("$220.00");
        expect(footer.textContent).toContain("Brenda owed you");
        expect(footer.textContent).toContain("$320.00");
        // How it ended, stated rather than signed.
        expect(footer.textContent).toContain("Brenda paid you");
        expect(footer.textContent).toContain("$100.00");
    });

    it("says a cycle came out even instead of showing a zero", () => {
        renderViews({
            history: [
                {
                    ...closedCycle,
                    summary: {
                        ...closedCycle.summary,
                        outcome: { kind: "even" },
                    },
                },
            ],
        });
        fireEvent.click(screen.getByRole("tab", { name: "History" }));
        fireEvent.click(screen.getByRole("button", { name: /Settled/ }));

        expect(screen.getByTestId("cycle-summary").textContent).toContain(
            "Came out even",
        );
    });

    it("labels the month tab with the selected month, never 'This month'", () => {
        renderViews({ monthLabel: "August 2026", monthPosition: "past" });
        expect(screen.getByRole("tab", { name: "August 2026" })).toBeDefined();
        expect(screen.queryByRole("tab", { name: "This month" })).toBeNull();
    });

    it("keeps the Open settlement tab on a past month, lands on the month, and says the month ended", () => {
        // There is exactly one open cycle and it belongs to no month, so its
        // tab is not a property of which month is selected.
        renderViews({ monthLabel: "August 2026", monthPosition: "past" });
        expect(
            screen.getByRole("tab", { name: "Open settlement" }),
        ).toBeDefined();
        expect(
            screen
                .getByRole("tab", { name: "August 2026" })
                .getAttribute("aria-selected"),
        ).toBe("true");
        expect(screen.getByText(/August 2026 has ended/)).toBeDefined();
        expect(screen.queryByText(/is a past month/i)).toBeNull();
    });

    it("shows no notice and opens on Open settlement at initial mount for the current month", () => {
        renderViews({ monthLabel: "July", monthPosition: "current" });
        expect(
            screen
                .getByRole("tab", { name: "Open settlement" })
                .getAttribute("aria-selected"),
        ).toBe("true");
        expect(screen.queryByText(/has ended/)).toBeNull();
        expect(screen.queryByText(/has not started/)).toBeNull();
    });

    it("keeps the Open settlement tab on a future month, lands on the month, and never says the month is past", () => {
        renderViews({ monthLabel: "December 2026", monthPosition: "future" });
        expect(
            screen.getByRole("tab", { name: "Open settlement" }),
        ).toBeDefined();
        expect(
            screen
                .getByRole("tab", { name: "December 2026" })
                .getAttribute("aria-selected"),
        ).toBe("true");
        expect(screen.getByText(/December 2026 has not started/)).toBeDefined();
        expect(screen.queryByText(/is a past month/i)).toBeNull();
        expect(screen.queryByText(/has ended/)).toBeNull();
    });

    it("does not call a future month empty when rows are already dated to it", () => {
        // A user can date an expense forward, so a future month can hold rows
        // at the very moment its "has not started" notice renders.
        renderViews({ monthLabel: "October 2026", monthPosition: "future" });
        expect(
            screen.getByText(
                "October 2026 has not started. This is what is already dated to it — the open settlement is on its own tab.",
            ),
        ).toBeDefined();
        expect(screen.getByText("Month groceries")).toBeDefined();
    });

    it.each<MonthPosition>(["past", "future"])(
        "opens the Open settlement tab from a %s month to show the open journal rows",
        (monthPosition) => {
            renderViews({ monthLabel: "August 2026", monthPosition });
            fireEvent.click(
                screen.getByRole("tab", { name: "Open settlement" }),
            );
            expect(screen.getByText("Open groceries")).toBeDefined();
            expect(screen.queryByText("Month groceries")).toBeNull();
        },
    );

    it("drops the row descriptor beside a settlement count", () => {
        renderViews({ history: [closedCycle] });
        fireEvent.click(screen.getByRole("tab", { name: "History" }));
        expect(screen.getByText("1 settlement")).toBeDefined();
        // The suffix describes journal rows, so it has no business here.
        expect(
            screen.queryByText(/shared expenses · debts · transfers/),
        ).toBeNull();
    });

    it("counts what the active view renders, not the whole dataset", () => {
        renderViews({
            openJournal: [openRow, openTransfer],
            monthJournal: [monthRow],
            history: [closedCycle],
        });
        expect(screen.getByText("2 items")).toBeDefined();
        // One row in the month — a count taken from the open set would say 2.
        fireEvent.click(screen.getByRole("tab", { name: "July" }));
        expect(screen.getByText("1 item")).toBeDefined();
        // History counts settlements, not rows.
        fireEvent.click(screen.getByRole("tab", { name: "History" }));
        expect(screen.getByText("1 settlement")).toBeDefined();
    });
});

describe("a locked row", () => {
    // The Month view passes no `readOnly`, so a locked row must carry its own lock —
    // otherwise the refusal only arrives after the user confirms the delete.
    it("offers no edit or delete control in a view that never passes readOnly", () => {
        render(
            <SettlementJournal
                journal={[lockedTransfer, openTransfer]}
                partnerName="Brenda"
            />,
        );

        // Two transfer rows, one locked: exactly one Edit and one Delete survive.
        // Counting proves the lock, not a component that renders no controls at all.
        expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(
            1,
        );
        expect(
            screen.getAllByRole("button", { name: /^Delete / }),
        ).toHaveLength(1);
    });

    it("says why it cannot be changed, rather than looking inert", () => {
        render(
            <SettlementJournal
                journal={[lockedTransfer]}
                partnerName="Brenda"
            />,
        );
        // "IN a closed settlement", not "closed a settlement": a cycle freezes
        // every row it counted, and only one of them carries the marker. The
        // narrower wording was false on every debt and payment beside it.
        expect(
            screen.getByText(/in a closed settlement · locked/),
        ).toBeDefined();
    });

    // The Month TAB passes no `readOnly`, so an expense-backed row's own `locked` is the
    // only thing that hides its controls. Asserted through `SettlementViews`, the
    // composed view — the journal alone never shows this.
    it("drops the controls on a locked PAYMENT in the Month tab, which passes no readOnly", () => {
        const lockedPayment: SettlementJournalItem = {
            kind: "transfer",
            id: "ePay",
            date: JULY,
            carriedOver: false,
            locked: true,
            direction: "gf_paid",
            amount: 320,
            note: null,
            fundedFrom: "income",
            // A payment you sent is an EXPENSE now (spec 0007 §6b) — the row
            // type whose `locked` the service hardcoded.
            source: "expense",
        };
        const openPayment: SettlementJournalItem = {
            ...lockedPayment,
            id: "ePayOpen",
            locked: false,
        };

        renderViews({ monthJournal: [lockedPayment, openPayment] });
        fireEvent.click(screen.getByRole("tab", { name: "July" }));

        // Two identical-looking payment rows, one locked: exactly one Edit and one
        // Delete survive. Counting proves the lock.
        expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(
            1,
        );
        expect(
            screen.getAllByRole("button", { name: /^Delete / }),
        ).toHaveLength(1);
        expect(
            screen.getByText(/in a closed settlement · locked/),
        ).toBeDefined();
    });

    // A frozen shared expense must not point at the Expenses screen: the same
    // close froze it there too, so that names a way out that is not there.
    it("does not send a locked shared expense to the Expenses screen", () => {
        render(
            <SettlementJournal
                journal={[{ ...openRow, locked: true }]}
                partnerName="Brenda"
            />,
        );
        expect(screen.queryByText(/edit on the Expenses screen/)).toBeNull();
        expect(
            screen.getByText(/in a closed settlement · locked/),
        ).toBeDefined();
    });
});

describe("SettlementCloseCard", () => {
    beforeEach(() => {
        closeMock.mockReset();
        refreshMock.mockReset();
    });

    it("never closes without an explicit confirmation", () => {
        render(<SettlementCloseCard partnerName="Brenda" />);
        fireEvent.click(
            screen.getByRole("button", { name: "Close settlement" }),
        );
        expect(closeMock).not.toHaveBeenCalled();
        expect(
            screen.getByRole("heading", { name: "Close this settlement?" }),
        ).toBeDefined();
    });

    it("closes once the user confirms, then refreshes", async () => {
        closeMock.mockResolvedValue({
            ok: true,
            data: {
                marked: { id: "m1", kind: "movement" },
                alreadyClosed: false,
            },
        });
        render(<SettlementCloseCard partnerName="Brenda" />);
        fireEvent.click(
            screen.getByRole("button", { name: "Close settlement" }),
        );
        const dialog = screen.getByRole("dialog");
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Close settlement" }),
        );

        await waitFor(() => expect(closeMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    });

    it("surfaces a failure instead of pretending the cycle closed", async () => {
        closeMock.mockResolvedValue({
            ok: false,
            code: "not_settled",
            message: "This settlement isn't square yet, so it can't be closed.",
        });
        render(<SettlementCloseCard partnerName="Brenda" />);
        fireEvent.click(
            screen.getByRole("button", { name: "Close settlement" }),
        );
        const dialog = screen.getByRole("dialog");
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Close settlement" }),
        );

        expect((await screen.findByRole("alert")).textContent).toMatch(
            /isn.t square yet/i,
        );
        expect(refreshMock).not.toHaveBeenCalled();
    });
});
