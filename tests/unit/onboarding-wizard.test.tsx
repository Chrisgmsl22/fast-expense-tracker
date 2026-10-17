import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from "vitest";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/app/_actions/account/update-display-name", () => ({
    updateDisplayName: vi.fn(),
}));
vi.mock("@/app/_actions/account/complete-onboarding", () => ({
    completeOnboarding: vi.fn(),
}));
vi.mock("@/app/_actions/settings/save-split-rule", () => ({
    saveSplitRule: vi.fn(),
}));
vi.mock("@/app/_actions/income/set-fixed", () => ({
    setFixedIncome: vi.fn(),
}));
vi.mock("@/app/_actions/settings/save-budget-rule", () => ({
    saveBudgetRule: vi.fn(),
}));
vi.mock("@/app/_actions/card/add", () => ({ addCard: vi.fn() }));
// A passthrough that records the root's props: a controlled dialog with no
// onOpenChange cannot close on an outside press, so behaviour alone cannot show
// that the wizard opts out of pointer dismissal.
const { dialogRootProps } = vi.hoisted(() => ({
    dialogRootProps: [] as Array<{ disablePointerDismissal?: boolean }>,
}));
vi.mock("@/components/ui/dialog", async (importOriginal) => {
    const actual = await importOriginal<typeof DialogModule>();
    const { createElement } = await import("react");
    return {
        ...actual,
        Dialog: (props: Parameters<typeof actual.Dialog>[0]) => {
            dialogRootProps.push(props);
            return createElement(actual.Dialog, props);
        },
    };
});

import { completeOnboarding } from "@/app/_actions/account/complete-onboarding";
import { updateDisplayName } from "@/app/_actions/account/update-display-name";
import { addCard } from "@/app/_actions/card/add";
import { setFixedIncome } from "@/app/_actions/income/set-fixed";
import { saveBudgetRule } from "@/app/_actions/settings/save-budget-rule";
import { saveSplitRule } from "@/app/_actions/settings/save-split-rule";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import type * as DialogModule from "@/components/ui/dialog";
import type { OnboardingData } from "@/lib/onboarding/load-onboarding";

const nameMock = updateDisplayName as unknown as Mock;
const completeMock = completeOnboarding as unknown as Mock;
const splitMock = saveSplitRule as unknown as Mock;
const incomeMock = setFixedIncome as unknown as Mock;
const budgetMock = saveBudgetRule as unknown as Mock;
const addCardMock = addCard as unknown as Mock;
const allActions = [
    nameMock,
    completeMock,
    splitMock,
    incomeMock,
    budgetMock,
    addCardMock,
];

const CATEGORIES = [
    { id: "k1", name: "Housing", color: "#4f46e5" },
    { id: "k2", name: "Groceries", color: "#65a30d" },
    { id: "k3", name: "Health", color: "#0891b2" },
];

function data(over: Partial<OnboardingData> = {}): OnboardingData {
    return {
        name: over.name ?? "Lupe Inventada",
        sharing: over.sharing ?? {
            sharesExpenses: false,
            partnerName: "",
            sharePercent: 50,
        },
        fixedIncome: over.fixedIncome ?? 0,
        budgetRule: over.budgetRule ?? {
            essentials: 50,
            discretionary: 25,
            savings: 25,
        },
        cards: over.cards ?? [],
        categories: over.categories ?? CATEGORIES,
    };
}

/**
 * Renders the wizard and lets the dialog finish opening. Base UI focuses the
 * initial element on the next animation frame, over any focus set before then,
 * so a test that acts sooner than a person could races it.
 */
async function renderWizard(wizardData: OnboardingData = data()) {
    const view = render(<OnboardingWizard data={wizardData} />);
    await act(async () => {
        // Let Base UI queue its focus frame first, then wait for that frame.
        await Promise.resolve();
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
        );
    });
    return view;
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const dialog = () => screen.getByRole("dialog");
const heading = () => within(dialog()).getByRole("heading", { level: 2 });

async function expectStep(step: number) {
    await waitFor(() =>
        expect(
            screen.getByRole("progressbar").getAttribute("aria-valuenow"),
        ).toBe(String(step)),
    );
}

/** Walks forward without writing anything, from step 1 to `step`. */
async function goTo(step: number) {
    for (let at = 1; at < step; at += 1) {
        if (at === 1) fireEvent.click(button("Get started"));
        else if (at === 2 || at === 7) fireEvent.click(button("Continue"));
        else fireEvent.click(button(/^Skip/));
        await expectStep(at + 1);
    }
}

/**
 * Gives every element one running animation that ends only on `release`.
 * jsdom has no Web Animations API, so otherwise every step change and the
 * close finish at once.
 */
function holdAnimations() {
    let running: Array<() => void> = [];
    Object.defineProperty(Element.prototype, "getAnimations", {
        configurable: true,
        value: () => [
            { finished: new Promise<void>((end) => running.push(end)) },
        ],
    });
    const release = () => {
        const ending = running;
        running = [];
        for (const end of ending) end();
    };
    return {
        release,
        /** Ends what is running now and lets the wizard react. */
        finish: () =>
            act(async () => {
                release();
                await new Promise((resolve) => setTimeout(resolve, 0));
            }),
    };
}

/** Gives every element animations whose `finished` comes from `finished`. */
function animateWith(finished: () => Array<Promise<void>>) {
    Object.defineProperty(Element.prototype, "getAnimations", {
        configurable: true,
        value: () => finished().map((done) => ({ finished: done })),
    });
}

/** Lets every pending fade end and the wizard react. */
const flushFades = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

/**
 * Records each element that takes focus, and whether focus rests on <body>
 * once the DOM has changed.
 */
function trackFocus() {
    const focused: Element[] = [];
    let restedOnBody = false;
    const onFocusIn = (event: FocusEvent) =>
        focused.push(event.target as Element);
    const observer = new MutationObserver(() => {
        if (document.activeElement === document.body) restedOnBody = true;
    });
    document.addEventListener("focusin", onFocusIn);
    observer.observe(document.body, { childList: true, subtree: true });
    return {
        stop: () => {
            observer.disconnect();
            document.removeEventListener("focusin", onFocusIn);
            return { focused, restedOnBody };
        },
    };
}

function preferReducedMotion() {
    vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    }));
}

const progressStep = () =>
    screen.getByRole("progressbar").getAttribute("aria-valuenow");

afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "getAnimations");
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

beforeEach(() => {
    refreshMock.mockReset();
    dialogRootProps.length = 0;
    for (const mock of allActions) mock.mockReset();
    nameMock.mockImplementation(async (input: { name: string }) => ({
        ok: true,
        data: { name: input.name.trim() },
    }));
    completeMock.mockResolvedValue({ ok: true, data: undefined });
    splitMock.mockResolvedValue({ ok: true, data: { sharesExpenses: true } });
    incomeMock.mockImplementation(async (input: { amount: string }) => ({
        ok: true,
        data: { amount: Number(input.amount), effectiveMonth: "2026-10" },
    }));
    budgetMock.mockResolvedValue({
        ok: true,
        data: {
            effectiveMonth: "2026-10",
            rule: { essentials: 50, discretionary: 25, savings: 25 },
        },
    });
    addCardMock.mockImplementation(async (input: { name: string }) => ({
        ok: true,
        data: { name: input.name.trim() },
    }));
});

describe("OnboardingWizard shell", () => {
    it("opens on the welcome step as a dialog named by its heading", async () => {
        await renderWizard();

        expect(
            screen.getByRole("dialog", { name: /Welcome to Fast Expense/ }),
        ).toBeTruthy();
        expect(document.activeElement).toBe(heading());
        const progress = screen.getByRole("progressbar");
        expect(progress.getAttribute("aria-valuetext")).toBe("Step 1 of 8");
        expect(progress.getAttribute("aria-valuemax")).toBe("8");
        expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
        expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Skip/ })).toBeNull();
    });

    it("stays open on Escape", async () => {
        await renderWizard();

        fireEvent.keyDown(dialog(), { key: "Escape" });

        await waitFor(() => expect(dialog()).toBeTruthy());
        expect(heading().textContent).toBe("Welcome to Fast Expense");
    });

    it("tells the dialog to ignore presses outside it", async () => {
        await renderWizard();

        expect(dialogRootProps.length).toBeGreaterThan(0);
        expect(dialogRootProps.at(-1)?.disablePointerDismissal).toBe(true);
    });

    it("stays open on an outside click", async () => {
        await renderWizard();
        const overlay = document.querySelector<HTMLElement>(
            '[data-slot="dialog-overlay"]',
        );
        expect(overlay).not.toBeNull();

        for (const target of [overlay!, document.body]) {
            fireEvent.pointerDown(target);
            fireEvent.mouseDown(target);
            fireEvent.pointerUp(target);
            fireEvent.mouseUp(target);
            fireEvent.click(target);
        }

        await waitFor(() => expect(dialog()).toBeTruthy());
        expect(heading().textContent).toBe("Welcome to Fast Expense");
    });

    it("sits on the dark sidebar backdrop instead of the default dim", async () => {
        await renderWizard();

        const overlay = document.querySelector('[data-slot="dialog-overlay"]');
        // The overlay portals to <body>, so it must carry the theme that defines --sidebar.
        expect(overlay?.classList.contains("sidebar-theme")).toBe(true);
        expect(overlay?.classList.contains("bg-sidebar")).toBe(true);
        expect(overlay?.className).not.toContain("bg-black/10");
    });

    it("keeps the step and entered values when a save refreshes the page", async () => {
        const view = await renderWizard();
        await goTo(4);
        fireEvent.change(screen.getByLabelText("Monthly income (MXN)"), {
            target: { value: "44000" },
        });
        fireEvent.click(button("Continue"));
        await expectStep(5);
        expect(refreshMock).toHaveBeenCalledTimes(1);

        // The refresh re-renders the layout, which hands the wizard fresh data.
        view.rerender(
            <OnboardingWizard
                data={data({
                    fixedIncome: 44000,
                    budgetRule: {
                        essentials: 60,
                        discretionary: 20,
                        savings: 20,
                    },
                })}
            />,
        );

        await expectStep(5);
        expect(
            (screen.getByLabelText("Essentials") as HTMLInputElement).value,
        ).toBe("50");
        fireEvent.click(button("Back"));
        await expectStep(4);
        expect(
            (screen.getByLabelText("Monthly income (MXN)") as HTMLInputElement)
                .value,
        ).toBe("44000");
    });

    it("moves focus to each new step's heading and renames the dialog", async () => {
        await renderWizard();

        fireEvent.click(button("Get started"));
        await expectStep(2);

        expect(document.activeElement).toBe(heading());
        expect(
            screen.getByRole("dialog", { name: /What's your name\?/ }),
        ).toBeTruthy();
        expect(
            screen.getByRole("progressbar").getAttribute("aria-valuetext"),
        ).toBe("Step 2 of 8");
    });

    it.each([2, 3, 4, 5, 6, 7])("offers Back on step %i", async (step) => {
        await renderWizard();
        await goTo(step);

        expect(button("Back")).toBeTruthy();
    });

    it.each([3, 4, 5, 6, 7])("offers Skip on step %i", async (step) => {
        await renderWizard();
        await goTo(step);

        expect(button(/^Skip/)).toBeTruthy();
    });

    it("offers no Skip on the name step", async () => {
        await renderWizard();
        await goTo(2);

        expect(screen.queryByRole("button", { name: /^Skip/ })).toBeNull();
    });

    it("writes nothing when every optional step is skipped", async () => {
        await renderWizard();
        await goTo(8);

        for (const mock of allActions) expect(mock).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    });

    it("keeps entered values when going Back and forward", async () => {
        await renderWizard();
        await goTo(4);
        fireEvent.change(screen.getByLabelText("Monthly income (MXN)"), {
            target: { value: "18000" },
        });

        fireEvent.click(button("Back"));
        await expectStep(3);
        fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));
        fireEvent.change(screen.getByLabelText("Partner's name"), {
            target: { value: "Toño Inventado" },
        });
        fireEvent.click(button("Back"));
        await expectStep(2);
        fireEvent.click(button("Continue"));
        await expectStep(3);

        expect(
            (screen.getByLabelText("Partner's name") as HTMLInputElement).value,
        ).toBe("Toño Inventado");
        fireEvent.click(button(/^Skip/));
        await expectStep(4);
        expect(
            (screen.getByLabelText("Monthly income (MXN)") as HTMLInputElement)
                .value,
        ).toBe("18000");
    });
});

describe("Name step", () => {
    it("prefills the signup name and writes nothing when it is unchanged", async () => {
        await renderWizard(data({ name: "Lupe Inventada" }));
        await goTo(2);

        expect(
            (screen.getByLabelText("Your name") as HTMLInputElement).value,
        ).toBe("Lupe Inventada");
        fireEvent.change(screen.getByLabelText("Your name"), {
            target: { value: "  Lupe Inventada " },
        });
        fireEvent.click(button("Continue"));

        await expectStep(3);
        expect(nameMock).not.toHaveBeenCalled();
    });

    it("saves a changed name, refreshes the page, and greets with it at the end", async () => {
        await renderWizard();
        await goTo(2);
        fireEvent.change(screen.getByLabelText("Your name"), {
            target: { value: "Guadalupe" },
        });

        fireEvent.click(button("Continue"));

        await expectStep(3);
        expect(nameMock).toHaveBeenCalledWith({ name: "Guadalupe" });
        expect(refreshMock).toHaveBeenCalledTimes(1);
        for (let at = 3; at < 7; at += 1) {
            fireEvent.click(button(/^Skip/));
            await expectStep(at + 1);
        }
        fireEvent.click(button("Continue"));
        await expectStep(8);
        expect(heading().textContent).toBe("You're all set, Guadalupe");
    });

    it("keeps the user on the step with the field error and focus on the field", async () => {
        nameMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Check the highlighted field.",
            fieldErrors: { name: ["Name is required"] },
        });
        await renderWizard();
        await goTo(2);
        fireEvent.change(screen.getByLabelText("Your name"), {
            target: { value: " " },
        });

        fireEvent.click(button("Continue"));

        const input = screen.getByLabelText("Your name");
        await waitFor(() => expect(document.activeElement).toBe(input));
        expect(input.getAttribute("aria-invalid")).toBe("true");
        expect(input.getAttribute("aria-describedby")).toBe(
            "onboarding-name-error",
        );
        expect(screen.getByText("Name is required")).toBeTruthy();
        expect(screen.getAllByRole("alert")).toHaveLength(1);
        await expectStep(2);
    });

    it("clears the field error once the name is edited", async () => {
        nameMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Check the highlighted field.",
            fieldErrors: { name: ["Name is required"] },
        });
        await renderWizard();
        await goTo(2);
        const input = screen.getByLabelText("Your name");
        fireEvent.change(input, { target: { value: " " } });
        fireEvent.click(button("Continue"));
        await screen.findByText("Name is required");

        fireEvent.change(input, { target: { value: "Gu" } });

        expect(screen.queryByText("Name is required")).toBeNull();
        expect(input.getAttribute("aria-invalid")).toBeNull();
        expect(input.getAttribute("aria-describedby")).toBeNull();
    });

    it("clears the form message once the name is edited", async () => {
        nameMock.mockRejectedValue(new Error("network"));
        await renderWizard();
        await goTo(2);
        const input = screen.getByLabelText("Your name");
        fireEvent.change(input, { target: { value: "Otra" } });
        fireEvent.click(button("Continue"));
        await screen.findByRole("alert");

        fireEvent.change(input, { target: { value: "Otra B" } });

        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows a form message when the action throws", async () => {
        nameMock.mockRejectedValue(new Error("network"));
        await renderWizard();
        await goTo(2);
        fireEvent.change(screen.getByLabelText("Your name"), {
            target: { value: "Otra" },
        });

        fireEvent.click(button("Continue"));

        expect((await screen.findByRole("alert")).textContent).toBe(
            "Something went wrong. Please try again.",
        );
        await expectStep(2);
    });
});

describe("Sharing step", () => {
    it("asks for a choice before Continue", async () => {
        await renderWizard();
        await goTo(3);

        const group = screen.getByRole("radiogroup", {
            name: "Do you share expenses?",
        });
        expect(within(group).getAllByRole("radio")).toHaveLength(2);
        expect((button("Continue") as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByLabelText("Partner's name")).toBeNull();
    });

    it("reveals the partner fields with the slider at 50% and saves the split", async () => {
        await renderWizard();
        await goTo(3);
        fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));

        const slider = screen.getByRole("slider", { name: /Your share/ });
        expect((slider as HTMLInputElement).value).toBe("50");
        fireEvent.change(screen.getByLabelText("Partner's name"), {
            target: { value: "Toño Inventado" },
        });
        fireEvent.change(slider, { target: { value: "60" } });
        expect(slider.getAttribute("aria-valuetext")).toBe(
            "You 60%, Toño Inventado 40%",
        );
        expect(screen.getByText("Toño Inventado 40%")).toBeTruthy();

        fireEvent.click(button("Continue"));

        await expectStep(4);
        expect(splitMock).toHaveBeenCalledWith({
            sharesExpenses: true,
            partnerName: "Toño Inventado",
            sharePercentage: 60,
        });
        expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it("saves Solo mode for Just me", async () => {
        await renderWizard();
        await goTo(3);
        fireEvent.click(screen.getByRole("radio", { name: /Just me/ }));

        fireEvent.click(button("Continue"));

        await expectStep(4);
        expect(splitMock).toHaveBeenCalledWith({
            sharesExpenses: false,
            partnerName: "",
            sharePercentage: 50,
        });
    });

    it("caps the partner name input at the schema limit", async () => {
        await renderWizard();
        await goTo(3);
        fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));

        expect(
            (screen.getByLabelText("Partner's name") as HTMLInputElement)
                .maxLength,
        ).toBe(80);
    });

    it("leaves a too-long partner name behind on Just me and still saves", async () => {
        await renderWizard();
        await goTo(3);
        fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));
        fireEvent.change(screen.getByLabelText("Partner's name"), {
            target: { value: "a".repeat(81) },
        });
        fireEvent.click(screen.getByRole("radio", { name: /Just me/ }));

        fireEvent.click(button("Continue"));

        await expectStep(4);
        expect(splitMock).toHaveBeenCalledTimes(1);
        expect(splitMock.mock.lastCall?.[0]).toStrictEqual({
            sharesExpenses: false,
            sharePercentage: 50,
        });
    });

    it("shows the partner name error and stays", async () => {
        splitMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: {
                partnerName: ["Add your partner's name to share expenses"],
            },
        });
        await renderWizard();
        await goTo(3);
        fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));

        fireEvent.click(button("Continue"));

        const input = screen.getByLabelText("Partner's name");
        await waitFor(() => expect(document.activeElement).toBe(input));
        expect(
            screen.getByText("Add your partner's name to share expenses"),
        ).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toBe(
            "Please fix the highlighted fields.",
        );
        await expectStep(3);
    });

    it("clears the partner name error and the form message once the name is typed", async () => {
        splitMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: {
                partnerName: ["Add your partner's name to share expenses"],
            },
        });
        await renderWizard();
        await goTo(3);
        fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));
        fireEvent.click(button("Continue"));
        const input = screen.getByLabelText("Partner's name");
        await waitFor(() => expect(document.activeElement).toBe(input));

        fireEvent.change(input, { target: { value: "T" } });

        expect(
            screen.queryByText("Add your partner's name to share expenses"),
        ).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(input.getAttribute("aria-invalid")).toBeNull();
    });

    it("clears the share error once the slider moves, and keeps the name error", async () => {
        splitMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: {
                partnerName: ["Add your partner's name to share expenses"],
                sharePercentage: ["Enter your share (1–100%)"],
            },
        });
        await renderWizard();
        await goTo(3);
        fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));
        fireEvent.click(button("Continue"));
        await screen.findByText("Enter your share (1–100%)");
        const slider = screen.getByRole("slider");

        fireEvent.change(slider, { target: { value: "60" } });

        expect(screen.queryByText("Enter your share (1–100%)")).toBeNull();
        expect(slider.getAttribute("aria-invalid")).toBeNull();
        expect(
            screen.getByText("Add your partner's name to share expenses"),
        ).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("clears the form message once the choice changes", async () => {
        splitMock.mockRejectedValue(new Error("network"));
        await renderWizard();
        await goTo(3);
        fireEvent.click(screen.getByRole("radio", { name: /Just me/ }));
        fireEvent.click(button("Continue"));
        await screen.findByRole("alert");

        fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));

        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("drops a Yes save's partner name error once the choice changes", async () => {
        splitMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: {
                partnerName: ["Add your partner's name to share expenses"],
            },
        });
        await renderWizard();
        await goTo(3);
        fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));
        fireEvent.click(button("Continue"));
        await screen.findByText("Add your partner's name to share expenses");

        fireEvent.click(screen.getByRole("radio", { name: /Just me/ }));
        fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));

        expect(
            screen.queryByText("Add your partner's name to share expenses"),
        ).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(
            screen
                .getByLabelText("Partner's name")
                .getAttribute("aria-invalid"),
        ).toBeNull();
    });

    it("prefills a saved split when resuming", async () => {
        await renderWizard(
            data({
                sharing: {
                    sharesExpenses: true,
                    partnerName: "Toño Inventado",
                    sharePercent: 55,
                },
            }),
        );
        await goTo(3);

        expect(
            (screen.getByRole("radio", { name: /Yes/ }) as HTMLInputElement)
                .checked,
        ).toBe(true);
        expect((screen.getByRole("slider") as HTMLInputElement).value).toBe(
            "55",
        );
    });

    describe("resuming as solo with a saved share", () => {
        const solo60 = () =>
            data({
                sharing: {
                    sharesExpenses: false,
                    partnerName: "Toño Inventado",
                    sharePercent: 60,
                },
            });

        it("keeps the saved share on Just me", async () => {
            await renderWizard(solo60());
            await goTo(3);
            fireEvent.click(screen.getByRole("radio", { name: /Just me/ }));

            fireEvent.click(button("Continue"));

            await expectStep(4);
            expect(splitMock).toHaveBeenCalledWith({
                sharesExpenses: false,
                partnerName: "Toño Inventado",
                sharePercentage: 60,
            });
        });

        it("starts the slider at 50% on Yes", async () => {
            await renderWizard(solo60());
            await goTo(3);
            fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));

            expect((screen.getByRole("slider") as HTMLInputElement).value).toBe(
                "50",
            );
            fireEvent.click(button("Continue"));

            await expectStep(4);
            expect(splitMock).toHaveBeenCalledWith(
                expect.objectContaining({ sharePercentage: 50 }),
            );
        });

        it("sends the moved share on Just me once the slider moved", async () => {
            await renderWizard(solo60());
            await goTo(3);
            fireEvent.click(screen.getByRole("radio", { name: /Yes/ }));
            fireEvent.change(screen.getByRole("slider"), {
                target: { value: "70" },
            });
            fireEvent.click(screen.getByRole("radio", { name: /Just me/ }));

            fireEvent.click(button("Continue"));

            await expectStep(4);
            expect(splitMock).toHaveBeenCalledWith({
                sharesExpenses: false,
                partnerName: "Toño Inventado",
                sharePercentage: 70,
            });
        });
    });
});

describe("Income step", () => {
    it.each([
        ["empty", ""],
        ["zero", "0"],
    ])("writes nothing for an %s amount", async (_case, value) => {
        await renderWizard();
        await goTo(4);
        fireEvent.change(screen.getByLabelText("Monthly income (MXN)"), {
            target: { value },
        });

        fireEvent.click(button("Continue"));

        await expectStep(5);
        expect(incomeMock).not.toHaveBeenCalled();
    });

    it.each([
        ["cleared", ""],
        ["set to zero", "0"],
    ])("keeps a saved income when the field is %s", async (_case, value) => {
        await renderWizard(data({ fixedIncome: 32000 }));
        await goTo(4);
        fireEvent.change(screen.getByLabelText("Monthly income (MXN)"), {
            target: { value },
        });

        fireEvent.click(button("Continue"));

        await expectStep(5);
        expect(incomeMock).not.toHaveBeenCalled();
    });

    it("saves the amount without separators and with no month", async () => {
        await renderWizard();
        await goTo(4);
        fireEvent.change(screen.getByLabelText("Monthly income (MXN)"), {
            target: { value: "44,000" },
        });

        fireEvent.click(button("Continue"));

        await expectStep(5);
        expect(incomeMock).toHaveBeenCalledWith({ amount: "44000" });
        expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it("prefills a saved income and writes nothing when it is unchanged", async () => {
        await renderWizard(data({ fixedIncome: 32000 }));
        await goTo(4);

        expect(
            (screen.getByLabelText("Monthly income (MXN)") as HTMLInputElement)
                .value,
        ).toBe("32000");
        fireEvent.click(button("Continue"));

        await expectStep(5);
        expect(incomeMock).not.toHaveBeenCalled();
    });

    it("shows the amount error and stays with focus on the field", async () => {
        incomeMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Invalid amount",
            fieldErrors: { amount: ["Amount can't be negative"] },
        });
        await renderWizard();
        await goTo(4);
        fireEvent.change(screen.getByLabelText("Monthly income (MXN)"), {
            target: { value: "-5" },
        });

        fireEvent.click(button("Continue"));

        expect(
            await screen.findByText("Amount can't be negative"),
        ).toBeTruthy();
        const input = screen.getByLabelText("Monthly income (MXN)");
        await waitFor(() => expect(document.activeElement).toBe(input));
        await expectStep(4);
    });

    it("clears the amount error once the amount is edited", async () => {
        incomeMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Invalid amount",
            fieldErrors: { amount: ["Amount can't be negative"] },
        });
        await renderWizard();
        await goTo(4);
        const input = screen.getByLabelText("Monthly income (MXN)");
        fireEvent.change(input, { target: { value: "-5" } });
        fireEvent.click(button("Continue"));
        await screen.findByText("Amount can't be negative");

        fireEvent.change(input, { target: { value: "5" } });

        expect(screen.queryByText("Amount can't be negative")).toBeNull();
        expect(input.getAttribute("aria-invalid")).toBeNull();
    });
});

describe("Budget step", () => {
    it("shows the three buckets at the rule in force and saves them on Continue", async () => {
        await renderWizard();
        await goTo(5);

        expect(
            (screen.getByLabelText("Essentials") as HTMLInputElement).value,
        ).toBe("50");
        expect(screen.getByText("Total 100%")).toBeTruthy();
        fireEvent.click(button("Continue"));

        await expectStep(6);
        expect(budgetMock).toHaveBeenCalledWith({
            essentials: "50",
            discretionary: "25",
            savings: "25",
        });
        expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it("shows the live remainder and keeps the user on the step when the total is not 100", async () => {
        budgetMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "The three buckets must add up to 100%",
            fieldErrors: {},
        });
        await renderWizard();
        await goTo(5);
        fireEvent.change(screen.getByLabelText("Essentials"), {
            target: { value: "60" },
        });

        expect(screen.getByText("Total 110% · 10% over 100%")).toBeTruthy();
        fireEvent.click(button("Continue"));

        expect((await screen.findByRole("alert")).textContent).toBe(
            "The three buckets must add up to 100%",
        );
        expect(budgetMock).toHaveBeenCalledWith({
            essentials: "60",
            discretionary: "25",
            savings: "25",
        });
        await expectStep(5);
    });

    it("focuses the first invalid bucket in screen order", async () => {
        budgetMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: {
                savings: ["Use a whole number"],
                discretionary: ["Use a whole number"],
            },
        });
        await renderWizard();
        await goTo(5);

        fireEvent.click(button("Continue"));

        const input = screen.getByLabelText("Discretionary");
        await waitFor(() => expect(document.activeElement).toBe(input));
        expect(input.getAttribute("aria-invalid")).toBe("true");
        await expectStep(5);
    });

    it("clears the total message once the user fixes the buckets", async () => {
        budgetMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "The three buckets must add up to 100%",
            fieldErrors: {},
        });
        await renderWizard();
        await goTo(5);
        const essentials = screen.getByLabelText("Essentials");
        fireEvent.change(essentials, { target: { value: "60" } });
        fireEvent.click(button("Continue"));
        await screen.findByRole("alert");

        fireEvent.change(essentials, { target: { value: "50" } });

        expect(screen.getByText("Total 100%")).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(
            screen.queryByText("The three buckets must add up to 100%"),
        ).toBeNull();
    });

    it("clears only the edited bucket's error and leaves focus where the user is", async () => {
        budgetMock.mockResolvedValue({
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: {
                discretionary: ["Use a whole number"],
                savings: ["Use a whole number"],
            },
        });
        await renderWizard();
        await goTo(5);
        fireEvent.click(button("Continue"));
        const discretionary = screen.getByLabelText("Discretionary");
        await waitFor(() => expect(document.activeElement).toBe(discretionary));

        fireEvent.change(discretionary, { target: { value: "20" } });

        expect(discretionary.getAttribute("aria-invalid")).toBeNull();
        expect(
            screen
                .getByLabelText("Investing / Savings")
                .getAttribute("aria-invalid"),
        ).toBe("true");
        expect(screen.getAllByText("Use a whole number")).toHaveLength(1);
        expect(screen.queryByRole("alert")).toBeNull();
        await act(async () => {});
        expect(document.activeElement).toBe(discretionary);
    });

    it("labels Skip as keeping the default and writes nothing", async () => {
        await renderWizard();
        await goTo(5);

        fireEvent.click(button(/^Skip — use default/));

        await expectStep(6);
        expect(budgetMock).not.toHaveBeenCalled();
    });
});

describe("Cards step", () => {
    function addOne(name: string, swatch?: string) {
        fireEvent.change(screen.getByLabelText("Card name"), {
            target: { value: name },
        });
        if (swatch) fireEvent.click(button(swatch));
        fireEvent.click(button("Add card"));
    }

    async function chooseType(label: "Credit" | "Debit") {
        fireEvent.click(screen.getByLabelText("Card type"));
        const option = await screen.findByRole("option", { name: label });
        // Base UI selects on the full press, not on a bare click event.
        fireEvent.pointerDown(option);
        fireEvent.mouseDown(option);
        fireEvent.pointerUp(option);
        fireEvent.mouseUp(option);
        fireEvent.click(option);
        await waitFor(() =>
            expect(screen.getByLabelText("Card type").textContent).toContain(
                label,
            ),
        );
    }

    function expectDefaultCardForm() {
        expect(
            (screen.getByLabelText("Card name") as HTMLInputElement).value,
        ).toBe("");
        expect(screen.getByLabelText("Card type").textContent).toContain(
            "Credit",
        );
        expect(button("Slate").getAttribute("aria-pressed")).toBe("true");
        expect(button("Blue").getAttribute("aria-pressed")).toBe("false");
        expect(button("Gold").getAttribute("aria-pressed")).toBe("false");
    }

    it("adds several cards and marks each as added", async () => {
        await renderWizard();
        await goTo(6);

        addOne("Invented Blue", "Blue");
        await screen.findByText("Invented Blue");
        addOne("Invented Gold", "Gold");
        await screen.findByText("Invented Gold");

        expect(addCardMock).toHaveBeenNthCalledWith(1, {
            name: "Invented Blue",
            type: "credit",
            color: "#2563eb",
        });
        expect(addCardMock).toHaveBeenNthCalledWith(2, {
            name: "Invented Gold",
            type: "credit",
            color: "#ca8a04",
        });
        const list = screen.getByRole("list", { name: "Added cards" });
        expect(within(list).getAllByRole("listitem")).toHaveLength(2);
        expect(within(list).getAllByText("Added ✓")).toHaveLength(2);
        expect(
            (screen.getByLabelText("Card name") as HTMLInputElement).value,
        ).toBe("");
        expect(screen.getByText("Cash is always included.")).toBeTruthy();
        expect(refreshMock).toHaveBeenCalledTimes(2);
        await expectStep(6);
    });

    it("adds a typed card on Continue and then moves on", async () => {
        await renderWizard();
        await goTo(6);
        fireEvent.change(screen.getByLabelText("Card name"), {
            target: { value: "Invented Debit" },
        });

        fireEvent.click(button("Continue"));

        await expectStep(7);
        expect(addCardMock).toHaveBeenCalledTimes(1);
        expect(addCardMock).toHaveBeenCalledWith({
            name: "Invented Debit",
            type: "credit",
            color: "#6b7280",
        });
        fireEvent.click(button("Back"));
        await expectStep(6);
        const list = screen.getByRole("list", { name: "Added cards" });
        expect(within(list).getByText("Invented Debit")).toBeTruthy();
        expect(
            (screen.getByLabelText("Card name") as HTMLInputElement).value,
        ).toBe("");
    });

    it("stays on the step with the error when the Continue save fails", async () => {
        addCardMock.mockResolvedValue({
            ok: false,
            code: "duplicate_name",
            message: "You already have an active card with that name.",
            fieldErrors: { name: ["A card with that name already exists"] },
        });
        await renderWizard();
        await goTo(6);
        fireEvent.change(screen.getByLabelText("Card name"), {
            target: { value: "Invented Blue" },
        });

        fireEvent.click(button("Continue"));

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toBe("A card with that name already exists");
        const input = screen.getByLabelText("Card name");
        await waitFor(() => expect(document.activeElement).toBe(input));
        expect(input.getAttribute("aria-invalid")).toBe("true");
        expect((input as HTMLInputElement).value).toBe("Invented Blue");
        await expectStep(6);
        expect(refreshMock).not.toHaveBeenCalled();
    });

    it("moves on without writing when the card name is only spaces", async () => {
        await renderWizard();
        await goTo(6);
        fireEvent.change(screen.getByLabelText("Card name"), {
            target: { value: "   " },
        });

        fireEvent.click(button("Continue"));

        await expectStep(7);
        expect(addCardMock).not.toHaveBeenCalled();
    });

    it("shows a duplicate name on the field only", async () => {
        addCardMock.mockResolvedValue({
            ok: false,
            code: "duplicate_name",
            message: "You already have an active card with that name.",
            fieldErrors: { name: ["A card with that name already exists"] },
        });
        await renderWizard();
        await goTo(6);

        addOne("Invented Blue");

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toBe("A card with that name already exists");
        expect(
            screen.queryByText(
                "You already have an active card with that name.",
            ),
        ).toBeNull();
        expect(screen.queryByRole("list", { name: "Added cards" })).toBeNull();
    });

    it("clears the duplicate name error once the name is cleared", async () => {
        addCardMock.mockResolvedValue({
            ok: false,
            code: "duplicate_name",
            message: "You already have an active card with that name.",
            fieldErrors: { name: ["A card with that name already exists"] },
        });
        await renderWizard();
        await goTo(6);
        addOne("Invented Blue");
        await screen.findByRole("alert");
        const input = screen.getByLabelText("Card name");

        fireEvent.change(input, { target: { value: "" } });

        expect(
            screen.queryByText("A card with that name already exists"),
        ).toBeNull();
        expect(input.getAttribute("aria-invalid")).toBeNull();
        expect(input.getAttribute("aria-describedby")).toBeNull();
    });

    it("clears a form message once the colour changes", async () => {
        addCardMock.mockResolvedValue({
            ok: false,
            code: "limit_reached",
            message:
                "You can have at most 10 active cards. Archive one to add another.",
        });
        await renderWizard();
        await goTo(6);
        addOne("Invented Blue");
        await screen.findByRole("alert");

        fireEvent.click(button("Gold"));

        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("clears a form message once the type changes", async () => {
        addCardMock.mockResolvedValue({
            ok: false,
            code: "limit_reached",
            message:
                "You can have at most 10 active cards. Archive one to add another.",
        });
        await renderWizard();
        await goTo(6);
        addOne("Invented Blue");
        await screen.findByRole("alert");

        await chooseType("Debit");

        expect(
            screen.queryByText(
                "You can have at most 10 active cards. Archive one to add another.",
            ),
        ).toBeNull();
    });

    it("resets the type and colour to the defaults after Add card", async () => {
        await renderWizard();
        await goTo(6);
        await chooseType("Debit");
        addOne("Invented Blue", "Blue");
        await screen.findByText("Invented Blue");

        expect(addCardMock).toHaveBeenCalledWith({
            name: "Invented Blue",
            type: "debit",
            color: "#2563eb",
        });
        expectDefaultCardForm();
    });

    it("Continue saves the typed card with its chosen type and colour", async () => {
        await renderWizard();
        await goTo(6);
        await chooseType("Debit");
        fireEvent.change(screen.getByLabelText("Card name"), {
            target: { value: "Invented Gold" },
        });
        fireEvent.click(button("Gold"));

        fireEvent.click(button("Continue"));

        await expectStep(7);
        expect(addCardMock).toHaveBeenCalledTimes(1);
        expect(addCardMock).toHaveBeenCalledWith({
            name: "Invented Gold",
            type: "debit",
            color: "#ca8a04",
        });
    });

    it("sets the colour swatches in even rows of five", async () => {
        await renderWizard();
        await goTo(6);

        const group = screen.getByRole("group", { name: "Colour swatches" });
        expect(group.className).toContain("grid-cols-5");
        expect(button("Slate").className).toContain("size-9");
    });

    it("shows the card limit as a form message", async () => {
        addCardMock.mockResolvedValue({
            ok: false,
            code: "limit_reached",
            message:
                "You can have at most 10 active cards. Archive one to add another.",
        });
        await renderWizard();
        await goTo(6);

        addOne("Invented Blue");

        expect((await screen.findByRole("alert")).textContent).toBe(
            "You can have at most 10 active cards. Archive one to add another.",
        );
    });

    it("lists cards already added and moves on without writing", async () => {
        await renderWizard(
            data({
                cards: [{ name: "Saved Card", color: "#2563eb" }],
            }),
        );
        await goTo(6);

        expect(screen.getByText("Saved Card")).toBeTruthy();
        fireEvent.click(button("Continue"));

        await expectStep(7);
        expect(addCardMock).not.toHaveBeenCalled();
    });
});

describe("Categories step", () => {
    it("renders a chip per real category with the count from the data", async () => {
        await renderWizard();
        await goTo(7);

        const chips = within(
            screen.getByRole("list", { name: "Your categories" }),
        ).getAllByRole("listitem");
        expect(chips.map((chip) => chip.textContent)).toEqual([
            "Housing",
            "Groceries",
            "Health",
        ]);
        expect(
            screen.getByText(
                "3 categories with sensible subcategories. Set a monthly limit from any category's page.",
            ),
        ).toBeTruthy();
        expect(screen.getByText("3 categories set up for you.")).toBeTruthy();
        expect(
            screen.getByText("More category settings are coming to Settings."),
        ).toBeTruthy();
    });

    it("folds categories past six into +N more on a phone", async () => {
        const many = Array.from({ length: 13 }, (_, i) => ({
            id: `k${i}`,
            name: `Category ${i}`,
            color: "#4f46e5",
        }));
        await renderWizard(data({ categories: many }));
        await goTo(7);

        const more = screen.getByText("+7 more");
        expect(more.className).toContain("sm:hidden");
        expect(screen.getByText("Category 6").className).toContain(
            "hidden sm:inline-flex",
        );
        expect(screen.getByText("Category 5").className).not.toContain(
            "hidden",
        );
    });
});

describe("Done step", () => {
    it("finishes onboarding, closes the wizard and refreshes the page", async () => {
        await renderWizard();
        await goTo(8);
        expect(heading().textContent).toBe("You're all set, Lupe Inventada");

        fireEvent.click(button("Open the app"));

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(completeMock).toHaveBeenCalledTimes(1);
        expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it("stays open with a message when finishing fails", async () => {
        completeMock.mockResolvedValue({
            ok: false,
            code: "db_error",
            message: "Could not finish setup. Please try again.",
        });
        await renderWizard();
        await goTo(8);

        fireEvent.click(button("Open the app"));

        expect((await screen.findByRole("alert")).textContent).toBe(
            "Could not finish setup. Please try again.",
        );
        expect(dialog()).toBeTruthy();
        expect(refreshMock).not.toHaveBeenCalled();
    });
});

describe("Transitions", () => {
    it("fades the step out, then in, and focuses the new heading as it arrives", async () => {
        await renderWizard();
        const animations = holdAnimations();
        const focus = trackFocus();

        fireEvent.click(button("Get started"));
        expect(progressStep()).toBe("1");
        expect(heading().textContent).toBe("Welcome to Fast Expense");

        await animations.finish();
        expect(progressStep()).toBe("2");
        const arrived = heading();
        expect(arrived.textContent).toBe("What's your name?");
        expect(document.activeElement).toBe(arrived);

        await animations.finish();
        expect(document.activeElement).toBe(arrived);
        expect(focus.stop()).toEqual({
            focused: [arrived],
            restedOnBody: false,
        });
    });

    it("still changes step and unlocks when a fade is cancelled", async () => {
        await renderWizard();
        animateWith(() => [
            Promise.reject(
                new DOMException("The animation was aborted.", "AbortError"),
            ),
        ]);

        fireEvent.click(button("Get started"));
        await flushFades();
        expect(progressStep()).toBe("2");
        expect(document.activeElement).toBe(heading());

        fireEvent.click(button("Continue"));
        await flushFades();
        expect(progressStep()).toBe("3");
    });

    it("still changes step and unlocks when there is nothing to animate", async () => {
        await renderWizard();
        animateWith(() => []);

        fireEvent.click(button("Get started"));
        await flushFades();
        expect(progressStep()).toBe("2");
        expect(document.activeElement).toBe(heading());

        fireEvent.click(button("Continue"));
        await flushFades();
        expect(progressStep()).toBe("3");
    });

    it("settles a step change whose fade never ends after a second", async () => {
        await renderWizard();
        holdAnimations();
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

        fireEvent.click(button("Get started"));
        await wait(999);
        expect(progressStep()).toBe("1");
        await wait(1);
        expect(progressStep()).toBe("2");
        expect(document.activeElement).toBe(heading());

        await wait(1000);
        fireEvent.click(button("Continue"));
        await wait(1000);
        expect(progressStep()).toBe("3");
    });

    it("ignores Continue, Back and Get started while a step is changing", async () => {
        await renderWizard();
        const animations = holdAnimations();

        fireEvent.click(button("Get started"));
        fireEvent.click(button("Get started"));
        await animations.finish();
        fireEvent.click(button("Continue"));
        await animations.finish();
        expect(progressStep()).toBe("2");

        fireEvent.click(button("Continue"));
        fireEvent.click(button("Continue"));
        fireEvent.click(button("Back"));
        await animations.finish();
        await animations.finish();
        await animations.finish();

        expect(progressStep()).toBe("3");
        expect(nameMock).not.toHaveBeenCalled();
    });

    it("saves once when Continue is pressed again as the step fades out", async () => {
        await renderWizard();
        // The budget step saves on every Continue, even when nothing changed.
        await goTo(5);
        const animations = holdAnimations();

        fireEvent.click(button("Continue"));
        // The save is back and the step is fading out, so Continue is live again.
        await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
        await waitFor(() =>
            expect((button("Continue") as HTMLButtonElement).disabled).toBe(
                false,
            ),
        );
        expect(progressStep()).toBe("5");
        fireEvent.click(button("Continue"));
        await animations.finish();
        await animations.finish();

        expect(progressStep()).toBe("6");
        expect(budgetMock).toHaveBeenCalledTimes(1);
        expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it("refreshes the page only after the close fade ends, and finishes once", async () => {
        await renderWizard();
        await goTo(8);
        const animations = holdAnimations();
        const popup = () =>
            document.querySelector('[data-slot="dialog-content"]');
        const openApp = () =>
            screen.getByRole("button", { name: "Open the app", hidden: true });

        fireEvent.click(openApp());
        await waitFor(() =>
            expect(popup()?.hasAttribute("data-ending-style")).toBe(true),
        );
        await act(
            () =>
                new Promise<void>((resolve) =>
                    requestAnimationFrame(() => resolve()),
                ),
        );
        fireEvent.click(openApp());

        expect(popup()).not.toBeNull();
        expect(completeMock).toHaveBeenCalledTimes(1);
        expect(refreshMock).not.toHaveBeenCalled();

        await waitFor(() => {
            animations.release();
            expect(popup()).toBeNull();
        });
        expect(refreshMock).toHaveBeenCalledTimes(1);
        expect(completeMock).toHaveBeenCalledTimes(1);
    });

    it("changes step at once and focuses its heading under reduced motion", async () => {
        preferReducedMotion();
        holdAnimations();
        await renderWizard();

        fireEvent.click(button("Get started"));

        expect(progressStep()).toBe("2");
        expect(heading().textContent).toBe("What's your name?");
        expect(document.activeElement).toBe(heading());
    });
});
