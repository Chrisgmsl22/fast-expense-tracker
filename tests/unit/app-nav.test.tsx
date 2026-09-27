import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";
const route = vi.hoisted(() => ({ pathname: "/dashboard", month: "2026-04" }));
vi.mock("next/navigation", () => ({
    usePathname: () => route.pathname,
    useSearchParams: () =>
        new URLSearchParams(route.month ? "month=" + route.month : ""),
}));
vi.mock("@/app/_actions/auth/logout", () => ({ logoutAction: vi.fn() }));
import { logoutAction } from "@/app/_actions/auth/logout";
import { AppNav } from "@/components/nav/AppNav";
import { buildSidebarModel } from "@/components/nav/sidebar-model";
import {
    sidebarSummary,
    sidebarBalance,
    sidebarNow,
} from "@/tests/support/sidebar-fixture";

const model = buildSidebarModel(
    sidebarSummary,
    sidebarBalance,
    true,
    "Taylor",
    sidebarNow,
);
const props = {
    email: "alex@example.test",
    name: "Alex",
    model,
};
beforeEach(() => {
    route.pathname = "/dashboard";
    route.month = "2026-04";
    vi.clearAllMocks();
});

describe("AppNav", () => {
    it("shows grouped navigation, the current page, and a selected-month Savings destination", () => {
        render(<AppNav {...props} />);
        expect(
            screen
                .getByRole("link", { name: "Dashboard" })
                .getAttribute("aria-current"),
        ).toBe("page");
        for (const label of ["Overview", "Money", "Setup"])
            expect(screen.getByText(label)).toBeDefined();
        expect(
            screen.getByRole("link", { name: "Savings" }).getAttribute("href"),
        ).toBe("/category/savings?month=2026-04");
        expect(screen.getByText("This month")).toBeDefined();
        expect(screen.getByText("September 2026")).toBeDefined();
        expect(screen.getByText("day 18 / 30")).toBeDefined();
        expect(
            screen.getByRole("link", { name: /Settlement.*Taylor owes you/ }),
        ).toBeDefined();
    });
    it("keeps a residual sub-peso settlement visible", () => {
        render(
            <AppNav
                {...props}
                model={{
                    ...model,
                    settlement: {
                        direction: "she_owes",
                        amount: 0.25,
                        label: "Taylor owes you",
                    },
                }}
            />,
        );
        expect(
            screen.getByRole("link", { name: /Settlement.*0\.25/ }),
        ).toBeDefined();
    });
    it("preserves explicit valid months across the existing month-scoped links", () => {
        render(<AppNav {...props} />);
        for (const label of ["Dashboard", "Expenses", "Income"]) {
            expect(
                screen.getByRole("link", { name: label }).getAttribute("href"),
            ).toBe(`/${label.toLowerCase()}?month=2026-04`);
        }
        expect(
            screen.getByRole("link", { name: "Settings" }).getAttribute("href"),
        ).toBe("/settings");
    });
    it("leaves an invalid URL month to the destination server resolver", () => {
        route.month = "invalid";
        render(<AppNav {...props} />);
        expect(
            screen.getByRole("link", { name: "Savings" }).getAttribute("href"),
        ).toBe("/category/savings");
    });
    it("does not reuse cached layout month props after a month choice and Settings navigation", () => {
        const { rerender } = render(<AppNav {...props} />);
        route.month = "2026-08";
        rerender(<AppNav {...props} />);
        expect(
            screen.getByRole("link", { name: "Savings" }).getAttribute("href"),
        ).toBe("/category/savings?month=2026-08");
        route.pathname = "/settings";
        route.month = "";
        rerender(<AppNav {...props} />);
        expect(
            screen.getByRole("link", { name: "Savings" }).getAttribute("href"),
        ).toBe("/category/savings");
    });
    it("shows cents and visible kinds for same-name bucket and category alerts", () => {
        const alerts = [
            {
                key: "essentials",
                kind: "bucket" as const,
                label: "Essentials",
                amount: 0.25,
                href: "/dashboard?month=2026-09",
            },
            {
                key: "essentials",
                kind: "category" as const,
                label: "Essentials",
                amount: 0.25,
                href: "/category/essentials?month=2026-09",
            },
        ];
        render(<AppNav {...props} model={{ ...model, alerts }} />);
        for (const kind of ["bucket", "category"]) {
            const link = screen.getByRole("link", {
                name: `Essentials, ${kind}, $0.25 over budget for September 2026`,
            });
            expect(
                within(link).getByText(`Essentials · ${kind}`),
            ).toBeDefined();
            expect(within(link).getByText("+$0.25")).toBeDefined();
        }
        expect(screen.queryByText("+$0")).toBeNull();
    });
    it("renders refreshed totals and hides the empty warning section", () => {
        const { rerender } = render(<AppNav {...props} />);
        expect(
            screen.getByRole("region", { name: "Over budget" }),
        ).toBeDefined();
        rerender(
            <AppNav
                {...props}
                model={{
                    ...model,
                    totals: { spent: 1700, saved: 600, net: 1900 },
                    alerts: [],
                }}
            />,
        );
        expect(screen.getByText("$1,700")).toBeDefined();
        expect(
            screen.queryByRole("region", { name: "Over budget" }),
        ).toBeNull();
        expect(screen.queryByText("$1,300")).toBeNull();
    });
    it("hides the settlement link and partner name for a settled solo account", () => {
        render(<AppNav {...props} model={{ ...model, settlement: null }} />);
        expect(screen.queryByRole("link", { name: /Settlement/ })).toBeNull();
        expect(screen.queryByText(/Taylor/)).toBeNull();
    });
    it("opens the same rail in a drawer and closes it after a link", async () => {
        render(<AppNav {...props} />);
        const trigger = screen.getByRole("button", { name: "Open menu" });
        trigger.focus();
        fireEvent.click(trigger);
        const drawer = await screen.findByRole("dialog", {
            name: "Navigation",
        });
        expect(within(drawer).getByText("alex@example.test")).toBeDefined();
        expect(
            within(drawer).getByRole("button", { name: "Sign out" }),
        ).toBeDefined();
        fireEvent.click(within(drawer).getByRole("link", { name: "Income" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });
    it("closes the drawer with Escape and restores focus", async () => {
        render(<AppNav {...props} />);
        const trigger = screen.getByRole("button", { name: "Open menu" });
        trigger.focus();
        fireEvent.click(trigger);
        const drawer = await screen.findByRole("dialog");
        fireEvent.keyDown(drawer, { key: "Escape" });
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });
    describe("the mobile top bar on scroll", () => {
        function scrollTo(y: number) {
            Object.defineProperty(window, "scrollY", {
                value: y,
                configurable: true,
            });
            fireEvent.scroll(window);
        }
        const bar = () => screen.getByRole("banner");

        beforeEach(() => {
            // jsdom lays nothing out, so give the page room to scroll: 1,000px.
            Object.defineProperty(document.documentElement, "scrollHeight", {
                value: window.innerHeight + 1000,
                configurable: true,
            });
            scrollTo(0);
        });
        afterEach(() => {
            Reflect.deleteProperty(document.documentElement, "scrollHeight");
        });

        it("reads an iOS rubber-band past the bottom as no scroll at all", () => {
            render(<AppNav {...props} />);
            scrollTo(1000);
            expect(bar().getAttribute("data-hidden")).toBe("true");
            // Overshoot, then spring back to the real bottom: not a scroll up.
            scrollTo(1060);
            scrollTo(1000);
            expect(bar().getAttribute("data-hidden")).toBe("true");
            scrollTo(980);
            expect(bar().getAttribute("data-hidden")).toBe("false");
        });

        it("hides on a scroll down and returns on any scroll up", () => {
            render(<AppNav {...props} />);
            expect(bar().getAttribute("data-hidden")).toBe("false");

            scrollTo(200);
            expect(bar().getAttribute("data-hidden")).toBe("true");
            expect(bar().className).toContain("-translate-y-full");

            scrollTo(190);
            expect(bar().getAttribute("data-hidden")).toBe("false");
        });

        it("stays put for a move under the threshold, and shows at the top", () => {
            render(<AppNav {...props} />);
            scrollTo(4);
            expect(bar().getAttribute("data-hidden")).toBe("false");
            scrollTo(300);
            expect(bar().getAttribute("data-hidden")).toBe("true");
            scrollTo(0);
            expect(bar().getAttribute("data-hidden")).toBe("false");
        });

        it("comes back when a keyboard user focuses into it", () => {
            render(<AppNav {...props} />);
            scrollTo(300);
            expect(bar().getAttribute("data-hidden")).toBe("true");
            fireEvent.focus(screen.getByRole("button", { name: "Open menu" }));
            expect(bar().getAttribute("data-hidden")).toBe("false");
        });

        it("skips the slide for reduced motion and stops listening on unmount", () => {
            const { unmount } = render(<AppNav {...props} />);
            expect(bar().className).toContain("motion-reduce:transition-none");
            unmount();
            expect(() => scrollTo(500)).not.toThrow();
        });
    });
    it("keeps icon sign-out accessible and calls the existing action", async () => {
        render(<AppNav {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        await waitFor(() => expect(logoutAction).toHaveBeenCalledTimes(1));
    });
});
