// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server.js";

const { session } = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/auth", () => ({ authProvider: { api: { getSession: session } } }));

import { proxy } from "@/proxy";

beforeEach(() => {
    session.mockReset();
    session.mockResolvedValue({ user: { id: "invented" } });
});

it("guard: renders /login for a signed-in user continuing an OAuth request", async () => {
    const result = await proxy(
        new NextRequest(
            "http://localhost/login?client_id=invented&prompt=login&sig=abc",
        ),
    );
    expect(result.headers.get("location")).toBeNull();
    expect(result.headers.get("x-middleware-next")).toBe("1");
});

it.each([
    "/login",
    "/login?client_id=invented",
    "/login?sig=abc",
    "/signup?client_id=invented&sig=abc",
])(
    "pin: still sends a signed-in user from %s to the dashboard",
    async (path) => {
        expect(
            (
                await proxy(new NextRequest("http://localhost" + path))
            ).headers.get("location"),
        ).toBe("http://localhost/dashboard");
    },
);
