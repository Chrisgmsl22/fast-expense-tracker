import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
const navigation = vi.hoisted(() => ({
    pathname: "/dashboard",
    router: { refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({
    usePathname: () => navigation.pathname,
    useRouter: () => navigation.router,
}));
import { SidebarDateGuard } from "@/components/nav/SidebarDateGuard";

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T05:59:59Z"));
    navigation.pathname = "/dashboard";
    navigation.router.refresh.mockClear();
});
afterEach(() => {
    vi.useRealTimers();
});

describe("SidebarDateGuard", () => {
    it("refreshes once at CDMX midnight and accepts refreshed server props", () => {
        const { rerender, unmount } = render(
            <SidebarDateGuard dayKey="2026-09-30" />,
        );
        expect(navigation.router.refresh).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(1100));
        expect(navigation.router.refresh).toHaveBeenCalledTimes(1);
        act(() => window.dispatchEvent(new Event("focus")));
        expect(navigation.router.refresh).toHaveBeenCalledTimes(1);
        rerender(<SidebarDateGuard dayKey="2026-10-01" />);
        act(() => vi.advanceTimersByTime(86400000));
        expect(navigation.router.refresh).toHaveBeenCalledTimes(2);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
    it("refreshes a stale layout on focus after a hidden-tab date change", () => {
        const { unmount } = render(<SidebarDateGuard dayKey="2026-09-30" />);
        vi.setSystemTime(new Date("2026-10-02T18:00:00Z"));
        act(() => window.dispatchEvent(new Event("focus")));
        expect(navigation.router.refresh).toHaveBeenCalledTimes(1);
        unmount();
    });
    it("checks the persistent layout after navigation", () => {
        const { rerender, unmount } = render(
            <SidebarDateGuard dayKey="2026-09-30" />,
        );
        vi.setSystemTime(new Date("2026-10-01T07:00:00Z"));
        navigation.pathname = "/income";
        rerender(<SidebarDateGuard dayKey="2026-09-30" />);
        expect(navigation.router.refresh).toHaveBeenCalledTimes(1);
        unmount();
    });
});
