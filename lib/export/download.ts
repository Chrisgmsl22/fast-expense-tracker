import { logAppEvent } from "@/lib/observability/log";
import { failureAttributes } from "@/lib/observability/health";
import type { FinancialExportRepository } from "@/lib/repositories/financial-export.repository";
import { financialExportSchema } from "@/lib/schemas/financial-export";
import { resolveExportPeriod } from "./period";
import { hasFinancialExportData } from "./has-data";
import { buildFinancialWorkbook } from "./workbook";

const PRIVATE_HEADERS = {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
};
export async function financialExportResponse(
    request: Request,
    userId: string | null,
    repository: FinancialExportRepository,
    now = new Date(),
): Promise<Response> {
    if (!userId)
        return Response.json(
            { code: "unauthenticated" },
            { status: 401, headers: PRIVATE_HEADERS },
        );
    const params = new URL(request.url).searchParams;
    const parsed = financialExportSchema.safeParse(Object.fromEntries(params));
    if (
        !parsed.success ||
        [...params.keys()].some((key) => params.getAll(key).length !== 1)
    )
        return Response.json(
            { code: "validation" },
            { status: 400, headers: PRIVATE_HEADERS },
        );
    const noData = () =>
        Response.json(
            { code: "no_data" },
            { status: 404, headers: PRIVATE_HEADERS },
        );
    const period = resolveExportPeriod(parsed.data, now);
    if (!period) return noData();
    try {
        const data = await repository.read(userId, period.start, period.end);
        if (!hasFinancialExportData(data, period)) return noData();
        const content = await buildFinancialWorkbook(
            data,
            period,
        ).xlsx.writeBuffer();
        const response = new Response(new Uint8Array(content), {
            headers: {
                ...PRIVATE_HEADERS,
                "Content-Type":
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition":
                    'attachment; filename="financial-export-' +
                    period.label +
                    '.xlsx"',
            },
        });
        logAppEvent("export.generated");
        return response;
    } catch (error) {
        logAppEvent("export.generate_failed", failureAttributes(error));
        return Response.json(
            { code: "export_failed" },
            { status: 500, headers: PRIVATE_HEADERS },
        );
    }
}
