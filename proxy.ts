import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";
import { auth } from "@/auth";
import { passiveSessionResponse } from "@/lib/auth/passive-session-response";

const continueRequest: NextMiddleware = () => undefined;
const authorize = auth(continueRequest);

export async function proxy(request: NextRequest, event: NextFetchEvent) {
    const response = await authorize(request, event);
    return response ? passiveSessionResponse(response) : response;
}

export const config = {
    // Run on app routes; skip the auth API, Next internals, and static assets.
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
