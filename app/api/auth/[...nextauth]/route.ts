import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { passiveSessionResponse } from "@/lib/auth/passive-session-response";

export async function GET(request: NextRequest): Promise<Response> {
    const response = await handlers.GET(request);
    return new URL(request.url).pathname === "/api/auth/session"
        ? passiveSessionResponse(response)
        : response;
}

export const POST = handlers.POST;
