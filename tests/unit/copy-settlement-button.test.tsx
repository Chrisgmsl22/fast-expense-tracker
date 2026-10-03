import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
// The journal's edit dialogs import these; stub them so a pure render doesn't
// pull the next-auth server graph in.
vi.mock("@/app/_actions/expense/delete", () => ({ deleteExpense: vi.fn() }));
vi.mock("@/app/_actions/movement/delete", () => ({ deleteMovement: vi.fn() }));
vi.mock("@/app/_actions/movement/add-partner-debt", () => ({
    addPartnerDebt: vi.fn(),
}));
vi.mock("@/app/_actions/movement/get-for-edit", () => ({
    getMovementForEdit: vi.fn(),
}));
vi.mock("@/app/_actions/expense/get-for-edit", () => ({
    getExpenseForEdit: vi.fn(),
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

import { CopySettlementButton } from "@/components/settlement/CopySettlementButton";
import { SettlementViews } from "@/components/settlement/SettlementViews";
import { buildSettlementSummaryText } from "@/components/settlement/settlement-summary-text";
import type {
    ClosedSettlementCycle,
    SettlementJournalItem,
} from "@/lib/services/settlement/settlement.service";

const LABEL = "Copy settlement summary to clipboard";

const openRow: SettlementJournalItem = {
    kind: "your_expense",
    id: "e1",
    date: new Date("2026-07-10T06:00:00Z"),
    carriedOver: false,
    locked: false,
    description: "Open groceries",
    gross: 1000,
    partnerShare: 320,
};

const closedRow: SettlementJournalItem = {
    ...openRow,
    id: "e3",
    date: new Date("2026-06-20T06:00:00Z"),
    description: "Closed groceries",
    locked: true,
};

function cycle(
    id: string,
    journal: SettlementJournalItem[],
): ClosedSettlementCycle {
    return {
        id,
        closedOn: new Date("2026-06-30T06:00:00Z"),
        settledAmount: 320,
        journal,
        summary: {
            spentUnsplit: 1000,
            youOwed: 0,
            sheOwed: 320,
            outcome: { kind: "partner_paid", amount: 320 },
        },
    };
}

function renderViews(
    over: Partial<Parameters<typeof SettlementViews>[0]> = {},
) {
    return render(
        <SettlementViews
            openJournal={[openRow]}
            monthJournal={[openRow]}
            monthLabel="July"
            monthPosition="current"
            history={[cycle("c1", [closedRow])]}
            partnerName="Brenda"
            {...over}
        />,
    );
}

function setClipboard(value: unknown) {
    Object.defineProperty(navigator, "clipboard", {
        value,
        configurable: true,
    });
}

/** Clicks the button and lets the clipboard promise settle. */
async function clickCopy(button: HTMLElement) {
    await act(async () => {
        fireEvent.click(button);
    });
}

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
});

afterEach(() => {
    vi.useRealTimers();
    setClipboard(undefined);
});

describe("CopySettlementButton", () => {
    it("renders nothing for an empty journal", () => {
        const { container } = render(
            <CopySettlementButton
                journal={[]}
                partnerName="Brenda"
                scope="open"
            />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("opens its tooltip on hover", async () => {
        render(
            <CopySettlementButton
                journal={[openRow]}
                partnerName="Brenda"
                scope="open"
            />,
        );
        // Closed until asked: the label is the only copy of the text.
        expect(screen.queryByText(LABEL)).toBeNull();
        const button = screen.getByRole("button", { name: LABEL });
        // Base UI opens a tooltip on hover for a mouse pointer only.
        fireEvent.pointerEnter(button, { pointerType: "mouse" });
        fireEvent.mouseEnter(button);
        fireEvent.mouseMove(button);
        // Its standard open delay is 600ms.
        const tooltip = await screen.findByText(LABEL, {}, { timeout: 2000 });
        const popup = tooltip.closest('[data-slot="tooltip-content"]');
        // Hidden from assistive tech: the aria-label already says it.
        expect(popup?.getAttribute("aria-hidden")).toBe("true");
    });

    it("opens its tooltip on keyboard focus", async () => {
        render(
            <CopySettlementButton
                journal={[openRow]}
                partnerName="Brenda"
                scope="open"
            />,
        );
        act(() => {
            screen.getByRole("button", { name: LABEL }).focus();
        });
        const tooltip = await screen.findByText(LABEL);
        const popup = tooltip.closest('[data-slot="tooltip-content"]');
        // Hidden from assistive tech: the aria-label already says it.
        expect(popup?.getAttribute("aria-hidden")).toBe("true");
    });

    it("writes the overview text to the clipboard", async () => {
        render(
            <CopySettlementButton
                journal={[openRow]}
                partnerName="Brenda"
                scope="closed"
            />,
        );
        await clickCopy(screen.getByRole("button", { name: LABEL }));
        expect(writeText).toHaveBeenCalledWith(
            buildSettlementSummaryText([openRow], "Brenda", "closed"),
        );
    });

    it("announces Copied, then returns to idle after two seconds", async () => {
        vi.useFakeTimers();
        const { container } = render(
            <CopySettlementButton
                journal={[openRow]}
                partnerName="Brenda"
                scope="open"
            />,
        );
        const live = container.querySelector('[aria-live="polite"]');
        expect(live?.textContent).toBe("");

        await clickCopy(screen.getByRole("button", { name: LABEL }));
        expect(live?.textContent).toBe("Copied");
        expect(container.querySelector(".lucide-check")).not.toBeNull();

        act(() => {
            vi.advanceTimersByTime(1999);
        });
        expect(live?.textContent).toBe("Copied");
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(live?.textContent).toBe("");
        expect(container.querySelector(".lucide-copy")).not.toBeNull();
    });

    it("restarts the timer and re-announces on a second copy", async () => {
        vi.useFakeTimers();
        const { container } = render(
            <CopySettlementButton
                journal={[openRow]}
                partnerName="Brenda"
                scope="open"
            />,
        );
        const live = container.querySelector('[aria-live="polite"]');
        const button = screen.getByRole("button", { name: LABEL });

        await clickCopy(button);
        const firstAnnouncement = live?.firstChild;
        act(() => {
            vi.advanceTimersByTime(1500);
        });
        await clickCopy(button);
        // A fresh node, so assistive tech announces "Copied" again.
        expect(live?.firstChild).not.toBe(firstAnnouncement);
        expect(live?.textContent).toBe("Copied");

        // Past the first click's two seconds, still copied.
        act(() => {
            vi.advanceTimersByTime(1999);
        });
        expect(live?.textContent).toBe("Copied");
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(live?.textContent).toBe("");
    });

    it("says it could not copy when the write rejects", async () => {
        writeText.mockRejectedValue(new Error("denied"));
        render(
            <CopySettlementButton
                journal={[openRow]}
                partnerName="Brenda"
                scope="open"
            />,
        );
        const button = screen.getByRole("button", { name: LABEL });
        await clickCopy(button);
        const message = screen.getByText("Could not copy");
        expect(screen.queryByText("Copied")).toBeNull();
        // After the icon, so the icon keeps its place.
        expect(
            button.compareDocumentPosition(message) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("says it could not copy when the clipboard API is missing", async () => {
        setClipboard(undefined);
        render(
            <CopySettlementButton
                journal={[openRow]}
                partnerName="Brenda"
                scope="open"
            />,
        );
        await clickCopy(screen.getByRole("button", { name: LABEL }));
        expect(screen.getByText("Could not copy")).toBeDefined();
    });

    it("clears the failure once a retry succeeds", async () => {
        writeText.mockRejectedValueOnce(new Error("denied"));
        render(
            <CopySettlementButton
                journal={[openRow]}
                partnerName="Brenda"
                scope="open"
            />,
        );
        const button = screen.getByRole("button", { name: LABEL });
        await clickCopy(button);
        expect(screen.getByText("Could not copy")).toBeDefined();
        await clickCopy(button);
        expect(screen.queryByText("Could not copy")).toBeNull();
        expect(screen.getByText("Copied")).toBeDefined();
    });
});

describe("SettlementViews copy button", () => {
    it("sits on the open settlement tab and copies the open rows", async () => {
        renderViews();
        await clickCopy(screen.getByRole("button", { name: LABEL }));
        expect(writeText).toHaveBeenCalledWith(
            buildSettlementSummaryText([openRow], "Brenda", "open"),
        );
    });

    it("gives each tab a short phone label and keeps the full accessible name", () => {
        renderViews({ monthLabel: "September 2026" });
        const open = screen.getByRole("tab", { name: "Open settlement" });
        const month = screen.getByRole("tab", { name: "September 2026" });
        expect(within(open).getByText("Open").className).toBe("sm:hidden");
        expect(within(month).getByText("Sep 2026").className).toBe("sm:hidden");
        expect(within(month).getByText("September 2026").className).toContain(
            "hidden sm:inline",
        );
        // Already short: one label, no duplicate.
        expect(screen.getByRole("tab", { name: "History" }).textContent).toBe(
            "History",
        );
    });

    it("is hidden when the open settlement is empty", () => {
        renderViews({ openJournal: [] });
        expect(screen.queryByRole("button", { name: LABEL })).toBeNull();
    });

    it("is hidden on the month tab", () => {
        renderViews();
        fireEvent.click(screen.getByRole("tab", { name: "July" }));
        expect(screen.queryByRole("button", { name: LABEL })).toBeNull();
    });

    it("copies a closed cycle's own rows from inside its panel", async () => {
        renderViews();
        fireEvent.click(screen.getByRole("tab", { name: "History" }));
        const trigger = screen.getByRole("button", { name: /Settled/ });
        fireEvent.click(trigger);

        const panel = document.getElementById("cycle-c1");
        expect(panel).not.toBeNull();
        const button = within(panel!).getByRole("button", { name: LABEL });
        // Never nested in the disclosure trigger: no button inside a button.
        expect(trigger.contains(button)).toBe(false);

        await clickCopy(button);
        expect(writeText).toHaveBeenCalledWith(
            buildSettlementSummaryText([closedRow], "Brenda", "closed"),
        );
    });

    it("shows only the expanded cycle's button on History, none in the header", () => {
        renderViews({
            history: [cycle("c1", [closedRow]), cycle("c3", [closedRow])],
        });
        fireEvent.click(screen.getByRole("tab", { name: "History" }));
        const [firstTrigger] = screen.getAllByRole("button", {
            name: /Settled/,
        });
        fireEvent.click(firstTrigger!);

        const buttons = screen.getAllByRole("button", { name: LABEL });
        expect(buttons).toHaveLength(1);
        expect(document.getElementById("cycle-c1")?.contains(buttons[0]!)).toBe(
            true,
        );
    });

    it("is hidden inside a closed cycle with no rows", () => {
        renderViews({ history: [cycle("c2", [])] });
        fireEvent.click(screen.getByRole("tab", { name: "History" }));
        fireEvent.click(screen.getByRole("button", { name: /Settled/ }));
        const panel = document.getElementById("cycle-c2");
        expect(
            within(panel!).queryByRole("button", { name: LABEL }),
        ).toBeNull();
    });
});
