// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const { renew } = vi.hoisted(() => ({ renew: vi.fn() }));
vi.mock("@/lib/auth/renew-session", () => ({ renewSession: renew }));
import { renewIdleSessionAction } from "@/app/_actions/auth/renew-idle-session";
beforeEach(() => vi.resetAllMocks());
it("passes activity through the server-owned renewal path", async () => {
    renew.mockResolvedValue(null);
    expect(await renewIdleSessionAction("invented", 25)).toBeNull();
    expect(renew).toHaveBeenCalledWith("invented", 25);
});
