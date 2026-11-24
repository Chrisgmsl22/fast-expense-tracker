import { getSessionUserId } from "@/lib/auth/session";
import { financialExportResponse } from "@/lib/export/download";
import { financialExportRepository } from "@/lib/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
    return financialExportResponse(
        request,
        await getSessionUserId(),
        financialExportRepository,
    );
}
