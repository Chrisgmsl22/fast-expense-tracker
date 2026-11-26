import { authProvider } from "@/auth";
import { passiveSessionResponse } from "@/lib/auth/passive-session-response";

export async function GET(request: Request): Promise<Response> {
    const response = await authProvider.handler(request);
    return new URL(request.url).pathname === "/api/auth/get-session"
        ? passiveSessionResponse(response)
        : response;
}

export async function POST(request: Request): Promise<Response> {
    return authProvider.handler(request);
}
