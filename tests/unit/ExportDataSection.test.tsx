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
