// @vitest-environment node
import { expect, it } from "vitest";
import { passiveSessionResponse } from "@/lib/auth/passive-session-response";
it.each(["better-auth.session_token", "__Secure-better-auth.session_token"])(
    "strips passive writes for %s while preserving other cookies",
    (name) => {
        const headers = new Headers({ "x-test": "preserved" });
        headers.append("set-cookie", name + "=invented; Path=/");
        headers.append("set-cookie", "other=invented; Path=/");
        const result = passiveSessionResponse(
            new Response("body", { headers }),
        );
        expect(result.headers.getSetCookie()).toEqual([
            "other=invented; Path=/",
        ]);
        expect(result.headers.get("x-test")).toBe("preserved");
    },
);
