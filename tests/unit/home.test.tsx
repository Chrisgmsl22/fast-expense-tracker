import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home page", () => {
    it("renders the application title heading", () => {
        render(<Home />);
        const heading = screen.getByRole("heading", {
            name: /fast-expense-tracker/i,
        });
        expect(heading).toBeDefined();
    });

    it("includes the Phase 0 bootstrap status text", () => {
        render(<Home />);
        expect(screen.getByText(/phase 0 bootstrap complete/i)).toBeDefined();
    });
});
