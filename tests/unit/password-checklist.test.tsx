import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

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
        const { container } = render(<PasswordChecklist password="" />);

        expect(screen.queryByRole("list")).toBeNull();
        const region = strengthRegion(container);
        expect(region.getAttribute("aria-live")).toBe("polite");
        expect(region.textContent).toBe("");
    });

    it("Should state each rule as met or not met in text", () => {
        render(<PasswordChecklist password="abc" />);

        expect(itemStates()).toEqual([
            "At least 8 characters (not met)",
            "One uppercase letter (not met)",
            "One lowercase letter (met)",
            "One number (not met)",
            "One special character, like ! or # (not met)",
        ]);
    });

    it("Should tick every rule for a password meeting all five", () => {
        render(<PasswordChecklist password="Invented-pass-123" />);

        expect(itemStates().every((text) => text?.endsWith("(met)"))).toBe(
            true,
        );
    });

    it("Should colour a met rule's icon green but keep its text readable on the white panel", () => {
        render(<PasswordChecklist password="abc" />);

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
        render(<PasswordChecklist password="Invented-pass-123" />);

        expect(itemStates()).toHaveLength(5);
        expect(screen.queryByText(LIMIT_LABEL)).toBeNull();
    });

    it.each([
        ["100 characters", "Invented-pass-123".padEnd(100, "x")],
        ["24 characters but 84 bytes", `Aa1!${"😀".repeat(20)}`],
    ])(
        "Should rate a password of %s as fair and list the limit as not met",
        (_, password) => {
            const { container } = render(
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
        render(<PasswordChecklist password={"a".repeat(100)} />);

        expect(itemStates()).toHaveLength(5);
        expect(screen.queryByText(LIMIT_LABEL)).toBeNull();
    });

    it("Should never colour an unmet rule red", () => {
        render(<PasswordChecklist password="a" />);

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
        const { container } = render(<PasswordChecklist password={password} />);

        expect(strengthRegion(container).textContent).toBe(
            `Password strength: ${label}`,
        );
    });

    it("Should keep the announcement unchanged while the level holds", () => {
        const { container, rerender } = render(
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
