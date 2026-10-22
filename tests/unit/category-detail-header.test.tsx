import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";

import { CategoryDetailHeader } from "@/components/category/CategoryDetailHeader";

const base = {
    name: "Health",
    color: "#0d9488",
    bucket: "essentials" as const,
    hasLimit: true,
    remaining: 80,
    over: false,
    backHref: "/dashboard?month=2026-06",
};

describe("CategoryDetailHeader", () => {
    it("renders the name, bucket tag, and a month-preserving Back link", () => {
        renderWithIntl(<CategoryDetailHeader {...base} />);
        expect(screen.getByText("Health")).toBeDefined();
        expect(screen.getByText("Essentials")).toBeDefined();
        expect(
            screen.getByRole("link", { name: /Back/ }).getAttribute("href"),
        ).toBe("/dashboard?month=2026-06");
    });

    it("shows the money-left badge when under budget", () => {
        renderWithIntl(<CategoryDetailHeader {...base} />);
        expect(screen.getByText("$80.00 left")).toBeDefined();
    });

    it("shows an over-by badge when over budget", () => {
        renderWithIntl(
            <CategoryDetailHeader {...base} remaining={-120} over={true} />,
        );
        expect(screen.getByText("over by $120.00")).toBeDefined();
    });

    it("omits the badge entirely when there's no limit", () => {
        renderWithIntl(
            <CategoryDetailHeader
                {...base}
                hasLimit={false}
                remaining={null}
            />,
        );
        expect(screen.queryByText(/left|over by/)).toBeNull();
    });
});

describe("CategoryDetailHeader in Spanish", () => {
    it("translates the name, bucket tag, Back link, and badge", () => {
        renderWithIntl(<CategoryDetailHeader {...base} />, { locale: "es" });
        expect(screen.getByRole("heading", { name: "Salud" })).toBeDefined();
        expect(screen.getByText("Esenciales")).toBeDefined();
        expect(screen.getByRole("link", { name: "Regresar" })).toBeDefined();
        expect(screen.getByText("quedan $80.00")).toBeDefined();
    });

    it("labels savings with its short Spanish name and an over badge", () => {
        renderWithIntl(
            <CategoryDetailHeader
                {...base}
                bucket="savings"
                remaining={-120}
                over
            />,
            { locale: "es" },
        );
        expect(screen.getByText("Ahorro/Inv")).toBeDefined();
        expect(screen.getByText("excedido por $120.00")).toBeDefined();
    });
});
