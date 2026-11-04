// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server.js";
const { handler, session } = vi.hoisted(() => ({
    handler: vi.fn(),
    session: vi.fn(),
}));
vi.mock("@/auth", () => ({
    authProvider: { handler, api: { getSession: session } },
}));
import { GET, POST } from "@/app/api/auth/[...all]/route";
import { proxy } from "@/proxy";
const cookie = "better-auth.session_token=invented; Path=/";
beforeEach(() => {
    vi.resetAllMocks();
    handler.mockImplementation(
        async () =>
            new Response("payload", {
                headers: { "set-cookie": cookie, "x-test": "preserved" },
            }),
    );
});
it("Should remove session writes from the passive session GET", async () => {
    const result = await GET(
        new Request("http://localhost/api/auth/get-session"),
    );
    expect(result.headers.getSetCookie()).toEqual([]);
    expect(await result.text()).toBe("payload");
});
it("Should preserve explicit auth GET responses and all POST writes", async () => {
    expect(
        (
            await GET(new Request("http://localhost/api/auth/ok"))
        ).headers.getSetCookie(),
    ).toContain(cookie);
    expect(
        (
            await POST(
                new Request("http://localhost/api/auth/sign-out", {
                    method: "POST",
                }),
            )
        ).headers.getSetCookie(),
    ).toContain(cookie);
});
it("Should return an explicit redirect when a protected request has no session", async () => {
    session.mockResolvedValue(null);
    const result = await proxy(new NextRequest("http://localhost/dashboard"));
    expect(new URL(result.headers.get("location")!).pathname).toBe("/login");
});
it("redirects an expired cookie to the existing session-expired notice", async () => {
    session.mockResolvedValue(null);
    const result = await proxy(
        new NextRequest("http://localhost/dashboard", {
            headers: { cookie: "better-auth.session_token=invented" },
        }),
    );
    expect(result.headers.get("location")).toBe(
        "http://localhost/login?reason=session-expired",
    );
});
it.each(["/login", "/signup"])(
    "redirects signed-in users away from %s",
    async (path) => {
        session.mockResolvedValue({ user: { id: "invented" } });
        expect(
            (
                await proxy(new NextRequest("http://localhost" + path))
            ).headers.get("location"),
        ).toBe("http://localhost/dashboard");
    },
);
it("Should remove session writes from proxy responses", async () => {
    session.mockResolvedValue({ user: { id: "invented" } });
    const result = await proxy(new NextRequest("http://localhost/dashboard"));
    expect(result.headers.getSetCookie()).toEqual([]);
});
