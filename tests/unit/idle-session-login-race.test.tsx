import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";
import { IDLE_TIMEOUT_MS } from "@/lib/auth/idle-session";
const { getSession, signOut, loginAction, replace } = vi.hoisted(() => ({
    getSession: vi.fn(),
    signOut: vi.fn(),
    loginAction: vi.fn(),
    replace: vi.fn(),
}));
vi.mock("next-auth/react", () => ({ getSession, signOut }));
const router = { replace, refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/app/_actions/auth/renew-idle-session", () => ({
    renewIdleSessionAction: vi.fn(),
}));
vi.mock("@/app/_actions/auth/login", () => ({ loginAction }));
import { IdleSessionGuard } from "@/components/auth/IdleSessionGuard";
import { LoginForm } from "@/components/auth/LoginForm";
const NOW = Date.UTC(2026, 8, 18, 12);
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.resetAllMocks();
});
afterEach(() => vi.useRealTimers());

it("Should keep login behind an unfinished sign-out even after the visible expiry timeout", async () => {
    let completeSignOut!: () => void;
    getSession.mockResolvedValue(null);
    signOut.mockReturnValue(
        new Promise<void>((resolve) => {
            completeSignOut = resolve;
        }),
    );
    loginAction.mockResolvedValue({
        ok: false,
        code: "invalid_credentials",
        message: "Invented test response.",
    });
    renderWithIntl(
        <>
            <IdleSessionGuard
                idleExpiresAt={NOW + IDLE_TIMEOUT_MS}
                idleSessionId="old-session"
            />
            <LoginForm />
        </>,
    );
    await act(() => vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS));
    expect(signOut).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText(/email/i), {
        target: { value: "invented@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "invented-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(loginAction).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(replace).toHaveBeenCalledWith("/login?reason=session-expired");
    expect(loginAction).not.toHaveBeenCalled();
    await act(async () => {
        completeSignOut();
    });
    expect(loginAction).toHaveBeenCalledTimes(1);
});
