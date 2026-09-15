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
vi.mock("@/app/_actions/expense/add-fronted", () => ({
    addFrontedExpense: vi.fn(),
}));
vi.mock("@/app/_actions/expense/update-fronted", () => ({
    updateFrontedExpense: vi.fn(),
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
};

function renderViews(
    over: Partial<Parameters<typeof SettlementViews>[0]> = {},
) {
    return render(
        <SettlementViews
            openJournal={[openRow]}
            monthJournal={[monthRow]}
            monthLabel="July"
            history={[closedCycle]}
            partnerName="Brenda"
            {...over}
        />,
    );
}

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
        fireEvent.click(screen.getByRole("tab", { name: "This month" }));
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

    it("an empty history explains what fills it", () => {
        renderViews({ history: [] });
        fireEvent.click(screen.getByRole("tab", { name: "History" }));
        expect(screen.getByText(/No settlements closed yet/i)).toBeDefined();
    });
});

describe("a locked row", () => {
    // The Month view passes no `readOnly`, so this is the exact case the round-2
    // fix missed: the same closing transfer showed Edit and Delete there, and
    // the refusal only arrived after the user confirmed the delete.
    it("offers no edit or delete control in a view that never passes readOnly", () => {
        render(
            <SettlementJournal
                journal={[lockedTransfer, openTransfer]}
                partnerName="Brenda"
            />,
        );

        // Two transfer rows, one locked: exactly one Edit and one Delete
        // survive. Counting proves the lock, not a component that happens to
        // render no controls at all.
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
        expect(screen.getByText(/closed a settlement · locked/)).toBeDefined();
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
            data: { markedMovementId: "m1", alreadyClosed: false },
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
