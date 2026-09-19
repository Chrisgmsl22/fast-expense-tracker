// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_TIMEOUT_MS } from "@/lib/auth/idle-session";
const { update } = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/auth", () => ({ unstable_update: update }));
import { renewIdleSessionAction } from "@/app/_actions/auth/renew-idle-session";
beforeEach(() => vi.resetAllMocks());

describe("renew idle session action", () => {
    it.each([-1, Infinity, NaN, IDLE_TIMEOUT_MS])(
        "Should reject invalid elapsed time (%s)",
        async (elapsed) => {
            expect(
                await renewIdleSessionAction("invented-session", elapsed),
            ).toBeNull();
            expect(update).not.toHaveBeenCalled();
        },
    );
    it("Should reject activity without a session identifier", async () => {
        expect(await renewIdleSessionAction("", 0)).toBeNull();
        expect(update).not.toHaveBeenCalled();
    });
    it("Should pass scoped activity through Auth.js for server validation", async () => {
        const result = {
            idleSessionId: "invented-session",
            idleExpiresAt: 123,
        };
        update.mockResolvedValue(result);
        expect(await renewIdleSessionAction("invented-session", 25)).toEqual(
            result,
        );
        expect(update).toHaveBeenCalledWith({
            idleActivity: true,
            idleSessionId: "invented-session",
            idleForMs: 25,
        });
    });
});
