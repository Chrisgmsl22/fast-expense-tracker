// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server.js";
import type { NextFetchEvent } from "next/server";
const { get, post, middleware } = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
    middleware: vi.fn(),
}));
vi.mock("@/auth", () => ({
    handlers: { GET: get, POST: post },
    auth: () => middleware,
}));
import { GET, POST } from "@/app/api/auth/[...nextauth]/route";
import { proxy } from "@/proxy";
import { authConfig } from "@/auth.config";
const cookie = "authjs.session-token=invented; Path=/";
function response() {
    const headers = new Headers({ "x-test-header": "preserve" });
    headers.append("set-cookie", cookie);
    headers.append("set-cookie", "authjs.csrf-token=invented; Path=/");
    return new Response("payload", { headers });
}
beforeEach(() => {
    vi.resetAllMocks();
    get.mockImplementation(async () => response());
    middleware.mockImplementation(async () => response());
});

it("Should remove session writes from the passive session GET", async () => {
    const result = await GET(
        new NextRequest("http://localhost/api/auth/session"),
    );
    expect(result.headers.getSetCookie()).toEqual([
        "authjs.csrf-token=invented; Path=/",
    ]);
    expect(await result.text()).toBe("payload");
});
it("Should preserve explicit auth GET responses and all POST writes", async () => {
    const result = await GET(
        new NextRequest("http://localhost/api/auth/callback/example"),
    );
    expect(result.headers.getSetCookie()).toContain(cookie);
    expect(POST).toBe(post);
});
it("Should remove session writes from proxy responses", async () => {
    const result = await proxy(
        new NextRequest("http://localhost/dashboard"),
        {} as NextFetchEvent,
    );
    expect(result?.headers.getSetCookie()).toEqual([
        "authjs.csrf-token=invented; Path=/",
    ]);
    expect(result?.headers.get("x-test-header")).toBe("preserve");
});
it("Should return an explicit redirect when a protected request has no session", () => {
    const result = authConfig.callbacks.authorized({
        auth: null,
        request: new NextRequest("http://localhost/dashboard"),
    });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
        const location = new URL(result.headers.get("location")!);
        expect(location.pathname).toBe("/login");
        expect(location.searchParams.get("reason")).toBeNull();
        expect(location.searchParams.get("callbackUrl")).toBe(
            "http://localhost/dashboard",
        );
    }
});
it("Should allow the first login page without a session or an expiry notice", () => {
    expect(
        authConfig.callbacks.authorized({
            auth: null,
            request: new NextRequest("http://localhost/login"),
        }),
    ).toBe(true);
});
