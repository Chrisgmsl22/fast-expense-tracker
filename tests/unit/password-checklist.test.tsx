import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";

import { PasswordChecklist } from "@/components/auth/PasswordChecklist";

const LIMIT_LABEL = "72 characters or fewer (accents and emoji count extra)";

function strengthRegion(container: HTMLElement) {
    const region = container.querySelector("[aria-live]");
    if (!region) throw new Error("No live region");
    return region;
}

function itemStates() {
    const list = screen.getByRole("list", { name: "Password requirements" });
    return within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent);
}

describe("PasswordChecklist", () => {
    it("Should show nothing but an empty live region before typing", () => {
        const { container } = renderWithIntl(<PasswordChecklist password="" />);

        expect(screen.queryByRole("list")).toBeNull();
        const region = strengthRegion(container);
        expect(region.getAttribute("aria-live")).toBe("polite");
        expect(region.textContent).toBe("");
    });

    it("Should state each rule as met or not met in text", () => {
        renderWithIntl(<PasswordChecklist password="abc" />);

        expect(itemStates()).toEqual([
            "At least 8 characters (not met)",
            "One uppercase letter (not met)",
            "One lowercase letter (met)",
            "One number (not met)",
            "One special character, like ! or # (not met)",
        ]);
    });

    it("Should tick every rule for a password meeting all five", () => {
        renderWithIntl(<PasswordChecklist password="Invented-pass-123" />);

        expect(itemStates().every((text) => text?.endsWith("(met)"))).toBe(
            true,
        );
    });

    it("Should colour a met rule's icon green but keep its text readable on the white panel", () => {
        renderWithIntl(<PasswordChecklist password="abc" />);

        const met = screen.getByText("One lowercase letter").closest("li");
        if (!met) throw new Error("No met item");
        expect(met.className).toContain("md:text-foreground");
        expect(met.className).not.toContain("md:text-positive");
        expect(met.querySelector("svg")?.getAttribute("class")).toContain(
            "md:text-positive",
        );

        const unmet = screen.getByText("One number").closest("li");
        if (!unmet) throw new Error("No unmet item");
        expect(unmet.innerHTML).not.toContain("positive");
    });

    it("Should not list the length limit for a strong password", () => {
        renderWithIntl(<PasswordChecklist password="Invented-pass-123" />);

        expect(itemStates()).toHaveLength(5);
        expect(screen.queryByText(LIMIT_LABEL)).toBeNull();
    });

    it.each([
        ["100 characters", "Invented-pass-123".padEnd(100, "x")],
        ["24 characters but 84 bytes", `Aa1!${"😀".repeat(20)}`],
    ])(
        "Should rate a password of %s as fair and list the limit as not met",
        (_, password) => {
            const { container } = renderWithIntl(
                <PasswordChecklist password={password} />,
            );

            const states = itemStates();
            expect(states).toHaveLength(6);
            expect(
                states.slice(0, 5).every((text) => text?.endsWith("(met)")),
            ).toBe(true);
            expect(states[5]).toBe(`${LIMIT_LABEL} (not met)`);
            expect(strengthRegion(container).textContent).toBe(
                "Password strength: Fair",
            );
        },
    );

    it("Should not list the length limit while a rule is still unmet", () => {
        renderWithIntl(<PasswordChecklist password={"a".repeat(100)} />);

        expect(itemStates()).toHaveLength(5);
        expect(screen.queryByText(LIMIT_LABEL)).toBeNull();
    });

    it("Should never colour an unmet rule red", () => {
        renderWithIntl(<PasswordChecklist password="a" />);

        const list = screen.getByRole("list", {
            name: "Password requirements",
        });
        expect(list.innerHTML).not.toMatch(/destructive|red-/);
    });

    it.each([
        ["a", "Weak"],
        ["aA", "Weak"],
        ["aA1", "Fair"],
        ["aA1!", "Fair"],
        ["Invented-pass-123", "Strong"],
    ])("Should rate %j as %s", (password, label) => {
        const { container } = renderWithIntl(
            <PasswordChecklist password={password} />,
        );

        expect(strengthRegion(container).textContent).toBe(
            `Password strength: ${label}`,
        );
    });

    it("Should keep the announcement unchanged while the level holds", () => {
        const { container, rerender } = renderWithIntl(
            <PasswordChecklist password="aA1" />,
        );
        const region = strengthRegion(container);
        const before = region.textContent;

        rerender(<PasswordChecklist password="aA12" />);

        expect(strengthRegion(container)).toBe(region);
        expect(region.textContent).toBe(before);

        rerender(<PasswordChecklist password="Invented-pass-123" />);

        expect(region.textContent).toBe("Password strength: Strong");
    });
});

describe("PasswordChecklist in Spanish", () => {
    it("Should render the strength, rules and states in Spanish", () => {
        const { container } = renderWithIntl(
            <PasswordChecklist password="abc" />,
            { locale: "es" },
        );
        expect(strengthRegion(container).textContent).toBe(
            "Seguridad de la contraseña: Débil",
        );
        const list = screen.getByRole("list", {
            name: "Requisitos de la contraseña",
        });
        expect(
            within(list)
                .getAllByRole("listitem")
                .map((item) => item.textContent),
        ).toEqual([
            "Al menos 8 caracteres (pendiente)",
            "Una letra mayúscula (pendiente)",
            "Una letra minúscula (cumplido)",
            "Un número (pendiente)",
            "Un carácter especial, como ! o # (pendiente)",
        ]);
    });

    it("Should show the length limit in Spanish once it is the only problem", () => {
        renderWithIntl(
            <PasswordChecklist password={`Aa1!${"a".repeat(80)}`} />,
            {
                locale: "es",
            },
        );
        expect(
            screen.getByText(
                "72 caracteres o menos (los acentos y emojis cuentan doble o más)",
            ),
        ).toBeDefined();
    });
});
