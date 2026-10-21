import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/_actions/locale/set-locale", () => ({ setLocale: vi.fn() }));

import { setLocale } from "@/app/_actions/locale/set-locale";
import { LanguageSection } from "@/components/settings/LanguageSection";
import { renderWithIntl } from "@/tests/support/intl";

const setLocaleMock = setLocale as unknown as Mock;

beforeEach(() => {
    refresh.mockReset();
    setLocaleMock.mockReset();
    setLocaleMock.mockResolvedValue({ ok: true, data: { locale: "en" } });
});

describe("LanguageSection", () => {
    it.each([
        ["es", "Idioma", "Español", "English"],
        ["en", "Language", "English", "Español"],
    ] as const)(
        "Should show the %s locale as selected",
        (locale, heading, selected, other) => {
            renderWithIntl(<LanguageSection />, { locale });

            expect(
                screen.getByRole("heading", { name: heading }),
            ).toBeDefined();
            expect(
                screen
                    .getByRole("button", { name: selected })
                    .getAttribute("aria-pressed"),
            ).toBe("true");
            expect(
                screen
                    .getByRole("button", { name: other })
                    .getAttribute("aria-pressed"),
            ).toBe("false");
        },
    );

    it("Should save the new locale and refresh the page", async () => {
        renderWithIntl(<LanguageSection />, { locale: "es" });

        fireEvent.click(screen.getByRole("button", { name: "English" }));

        await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
        expect(setLocaleMock).toHaveBeenCalledWith({ locale: "en" });
    });

    it("Should do nothing when the current locale is chosen again", () => {
        renderWithIntl(<LanguageSection />, { locale: "es" });

        fireEvent.click(screen.getByRole("button", { name: "Español" }));

        expect(setLocaleMock).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
    });

    it("Should show the action's message and not refresh on a failure", async () => {
        setLocaleMock.mockResolvedValue({
            ok: false,
            code: "invalid_locale",
            message: "Elige Español o English.",
        });
        renderWithIntl(<LanguageSection />, { locale: "es" });

        fireEvent.click(screen.getByRole("button", { name: "English" }));

        expect((await screen.findByRole("alert")).textContent).toBe(
            "Elige Español o English.",
        );
        expect(refresh).not.toHaveBeenCalled();
    });

    it("Should show a fallback message when the action throws", async () => {
        setLocaleMock.mockRejectedValue(new Error("network"));
        renderWithIntl(<LanguageSection />, { locale: "es" });

        fireEvent.click(screen.getByRole("button", { name: "English" }));

        expect((await screen.findByRole("alert")).textContent).toBe(
            "No se pudo cambiar el idioma. Inténtalo de nuevo.",
        );
        expect(refresh).not.toHaveBeenCalled();
    });
});
