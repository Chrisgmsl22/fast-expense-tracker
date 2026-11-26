import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { ExportDataSection } from "@/components/settings/ExportDataSection";
import { renderWithIntl } from "@/tests/support/intl";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
describe("Settings export controls", () => {
    it("defaults to the current year and switches to the current month", () => {
        renderWithIntl(<ExportDataSection currentMonth="2026-11" />);
        expect((screen.getByLabelText("Year") as HTMLInputElement).value).toBe(
            "2026",
        );
        fireEvent.change(screen.getByLabelText("Period"), {
            target: { value: "month" },
        });
        expect((screen.getByLabelText("Month") as HTMLInputElement).value).toBe(
            "2026-11",
        );
    });
    it("disables controls while downloading and shows an error for an expired session", async () => {
        let finish!: (value: Response) => void;
        const request = vi.fn(
            () =>
                new Promise<Response>((resolve) => {
                    finish = resolve;
                }),
        );
        vi.stubGlobal("fetch", request);
        renderWithIntl(<ExportDataSection currentMonth="2026-11" />);
        fireEvent.click(screen.getByRole("button", { name: "Download Excel" }));
        expect(
            (
                screen.getByRole("button", {
                    name: "Preparing download…",
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);
        finish(new Response(null, { status: 401 }));
        expect((await screen.findByRole("alert")).textContent).toContain(
            "Your session expired",
        );
        expect(request).toHaveBeenCalledWith(
            "/api/financial-export?type=year&period=2026",
        );
    });
    it("shows Spanish controls and validation errors", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 400 })),
        );
        renderWithIntl(<ExportDataSection currentMonth="2026-11" />, {
            locale: "es",
        });
        fireEvent.click(
            screen.getByRole("button", { name: "Descargar Excel" }),
        );
        expect((await screen.findByRole("alert")).textContent).toContain(
            "Elige un año o mes válido",
        );
    });
    it.each([
        {
            locale: "en",
            type: "year",
            typeLabel: "Period",
            fieldLabel: "Year",
            period: "2099",
            button: "Download Excel",
            warning:
                "There is no data to export for this year. Choose another year.",
        },
        {
            locale: "en",
            type: "month",
            typeLabel: "Period",
            fieldLabel: "Month",
            period: "2099-12",
            button: "Download Excel",
            warning:
                "There is no data to export for this month. Choose another month.",
        },
        {
            locale: "es",
            type: "year",
            typeLabel: "Periodo",
            fieldLabel: "Año",
            period: "2099",
            button: "Descargar Excel",
            warning: "No hay datos para exportar de este año. Elige otro año.",
        },
        {
            locale: "es",
            type: "month",
            typeLabel: "Periodo",
            fieldLabel: "Mes",
            period: "2099-12",
            button: "Descargar Excel",
            warning: "No hay datos para exportar de este mes. Elige otro mes.",
        },
    ] as const)(
        "shows a localized $type warning in $locale for future selections and clears stale warnings",
        async ({
            locale,
            type,
            typeLabel,
            fieldLabel,
            period,
            button,
            warning,
        }) => {
            const request = vi.fn(async () =>
                Response.json({ code: "no_data" }, { status: 404 }),
            );
            vi.stubGlobal("fetch", request);
            renderWithIntl(<ExportDataSection currentMonth="2026-11" />, {
                locale,
            });
            fireEvent.change(screen.getByLabelText(typeLabel), {
                target: { value: type },
            });
            const input = screen.getByLabelText(fieldLabel) as HTMLInputElement;
            expect(input.max).toBe("");
            fireEvent.change(input, { target: { value: period } });
            fireEvent.click(screen.getByRole("button", { name: button }));
            expect((await screen.findByRole("alert")).textContent).toBe(
                warning,
            );
            expect(request).toHaveBeenCalledWith(
                "/api/financial-export?type=" + type + "&period=" + period,
            );
            fireEvent.change(input, {
                target: { value: type === "year" ? "2025" : "2025-01" },
            });
            expect(screen.queryByRole("alert")).toBeNull();
            fireEvent.click(screen.getByRole("button", { name: button }));
            await screen.findByRole("alert");
            fireEvent.change(screen.getByLabelText(typeLabel), {
                target: { value: type === "year" ? "month" : "year" },
            });
            expect(screen.queryByRole("alert")).toBeNull();
        },
    );
    it("reports a failed network request and permits retry", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("offline");
            }),
        );
        renderWithIntl(<ExportDataSection currentMonth="2026-11" />);
        fireEvent.click(screen.getByRole("button", { name: "Download Excel" }));
        expect((await screen.findByRole("alert")).textContent).toContain(
            "Could not export",
        );
        await waitFor(() =>
            expect(
                (
                    screen.getByRole("button", {
                        name: "Download Excel",
                    }) as HTMLButtonElement
                ).disabled,
            ).toBe(false),
        );
    });
});
