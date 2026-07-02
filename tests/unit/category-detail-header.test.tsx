import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

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
        render(<CategoryDetailHeader {...base} />);
        expect(screen.getByText("Health")).toBeDefined();
        expect(screen.getByText("Essentials")).toBeDefined();
        expect(
            screen.getByRole("link", { name: /Back/ }).getAttribute("href"),
        ).toBe("/dashboard?month=2026-06");
    });

    it("shows the money-left badge when under budget", () => {
        render(<CategoryDetailHeader {...base} />);
        expect(screen.getByText("$80.00 left")).toBeDefined();
    });

    it("shows an over-by badge when over budget", () => {
        render(<CategoryDetailHeader {...base} remaining={-120} over={true} />);
        expect(screen.getByText("over by $120.00")).toBeDefined();
    });

    it("omits the badge entirely when there's no limit", () => {
        render(
            <CategoryDetailHeader
                {...base}
                hasLimit={false}
                remaining={null}
            />,
        );
        expect(screen.queryByText(/left|over by/)).toBeNull();
    });
});
