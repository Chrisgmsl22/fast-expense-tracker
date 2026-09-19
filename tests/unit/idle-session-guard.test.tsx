import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { IDLE_TIMEOUT_MS } from "@/lib/auth/idle-session";

const { getSession, signOut, replace, refresh, renew } = vi.hoisted(() => ({
    getSession: vi.fn(),
    signOut: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    renew: vi.fn(),
}));
vi.mock("next-auth/react", () => ({ getSession, signOut }));
const router = { replace, refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/_actions/auth/renew-idle-session", () => ({
    renewIdleSessionAction: renew,
}));
import { IdleSessionGuard } from "@/components/auth/IdleSessionGuard";
const NOW = Date.UTC(2026, 8, 18, 12);

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.resetAllMocks();
    getSession.mockResolvedValue(null);
    signOut.mockResolvedValue({ url: "/login" });
});
afterEach(() => vi.useRealTimers());

it("Should sign out and show the expiry notice when the deadline passes", async () => {
    render(
        <IdleSessionGuard
            idleExpiresAt={NOW + IDLE_TIMEOUT_MS}
            idleSessionId="invented-session"
        />,
    );
    await act(() => vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS));
    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(replace).toHaveBeenCalledWith("/login?reason=session-expired");
});

it("Should preserve a newer login when expiry work finishes late", async () => {
    getSession.mockResolvedValueOnce(null).mockResolvedValue({
        idleSessionId: "new-session",
        idleExpiresAt: NOW + IDLE_TIMEOUT_MS * 2,
    });
    render(
        <IdleSessionGuard
            idleExpiresAt={NOW + IDLE_TIMEOUT_MS}
            idleSessionId="old-session"
        />,
    );
    await act(() => vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS));
    expect(signOut).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
});

it("Should retain the throttle when a server action updates the layout deadline", async () => {
    renew.mockImplementation(async (_id: string, idleForMs: number) => ({
        idleSessionId: "invented-session",
        idleExpiresAt: Date.now() - idleForMs + IDLE_TIMEOUT_MS,
    }));
    const view = render(
        <IdleSessionGuard
            idleExpiresAt={NOW + IDLE_TIMEOUT_MS}
            idleSessionId="invented-session"
        />,
    );
    window.dispatchEvent(new Event("pointermove"));
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    view.rerender(
        <IdleSessionGuard
            idleExpiresAt={NOW + IDLE_TIMEOUT_MS + 1000}
            idleSessionId="invented-session"
        />,
    );
    window.dispatchEvent(new Event("pointermove"));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(renew).toHaveBeenCalledTimes(1);
});

it("Should reach login when the final session check never resolves", async () => {
    getSession
        .mockResolvedValueOnce(null)
        .mockReturnValue(new Promise(() => {}));
    render(
        <IdleSessionGuard
            idleExpiresAt={NOW + IDLE_TIMEOUT_MS}
            idleSessionId="invented-session"
        />,
    );
    await act(() => vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 60_000));
    expect(replace).toHaveBeenCalledWith("/login?reason=session-expired");
    expect(signOut).not.toHaveBeenCalled();
});

it("Should reach login when sign-out never resolves", async () => {
    let completeSignOut!: () => void;
    signOut.mockReturnValue(
        new Promise<void>((resolve) => {
            completeSignOut = resolve;
        }),
    );
    render(
        <IdleSessionGuard
            idleExpiresAt={NOW + IDLE_TIMEOUT_MS}
            idleSessionId="invented-session"
        />,
    );
    await act(() => vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 60_000));
    expect(replace).toHaveBeenCalledWith("/login?reason=session-expired");
    await act(async () => {
        completeSignOut();
    });
});

it("Should reach login when another tab holds the cookie lock indefinitely", async () => {
    Object.defineProperty(navigator, "locks", {
        configurable: true,
        value: { request: () => new Promise(() => {}) },
    });
    try {
        render(
            <IdleSessionGuard
                idleExpiresAt={NOW + IDLE_TIMEOUT_MS}
                idleSessionId="invented-session"
            />,
        );
        await act(() => vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 60_000));
        expect(replace).toHaveBeenCalledWith("/login?reason=session-expired");
        expect(signOut).not.toHaveBeenCalled();
    } finally {
        Reflect.deleteProperty(navigator, "locks");
    }
});

it("Should replace protected content locally when session and login requests stall", async () => {
    getSession.mockReturnValue(new Promise(() => {}));
    replace.mockImplementation(() => new Promise(() => {}));
    render(
        <IdleSessionGuard
            idleExpiresAt={NOW + IDLE_TIMEOUT_MS}
            idleSessionId="invented-session"
        >
            <div>Private account content</div>
        </IdleSessionGuard>,
    );
    expect(screen.getByText("Private account content")).toBeDefined();
    await act(() => vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 60_000));
    expect(screen.queryByText("Private account content")).toBeNull();
    const notice = screen.getByRole("status");
    expect(notice.textContent).toBe(
        "Your session expired. Please log back in.",
    );
    expect(notice.classList.contains("text-destructive")).toBe(true);
    expect(notice.classList.contains("bg-red-50")).toBe(true);
    expect(notice.classList.contains("border-destructive/30")).toBe(true);
    expect(
        screen.getByRole("link", { name: "Log in" }).getAttribute("href"),
    ).toBe("/login?reason=session-expired");
});

it("Should retain protected content when the final check finds a newer login", async () => {
    getSession.mockResolvedValueOnce(null).mockResolvedValue({
        idleSessionId: "new-session",
        idleExpiresAt: NOW + IDLE_TIMEOUT_MS * 2,
    });
    render(
        <IdleSessionGuard
            idleExpiresAt={NOW + IDLE_TIMEOUT_MS}
            idleSessionId="old-session"
        >
            <div>Private account content</div>
        </IdleSessionGuard>,
    );
    await act(() => vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS));
    expect(screen.getByText("Private account content")).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
});
