import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PasswordInput } from "@/components/auth/PasswordInput";

function renderInForm(props: { toggleSubject?: string } = {}) {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
        <form onSubmit={onSubmit}>
            <label htmlFor="pw">Password</label>
            <PasswordInput
                id="pw"
                name="pw"
                autoComplete="new-password"
                {...props}
            />
        </form>,
    );
    return { onSubmit, input: screen.getByLabelText("Password") };
}

describe("PasswordInput", () => {
    it("Should start hidden with a show button that is not pressed", () => {
        const { input } = renderInForm();

        expect(input.getAttribute("type")).toBe("password");
        const toggle = screen.getByRole("button", { name: "Show password" });
        expect(toggle.getAttribute("type")).toBe("button");
        expect(toggle.getAttribute("aria-pressed")).toBe("false");
        expect(toggle.getAttribute("aria-controls")).toBe("pw");
    });

    it("Should reveal and hide the value without submitting the form", () => {
        const { input, onSubmit } = renderInForm();
        fireEvent.change(input, { target: { value: "Invented-pass-123" } });

        fireEvent.click(screen.getByRole("button", { name: "Show password" }));

        expect(input.getAttribute("type")).toBe("text");
        const hide = screen.getByRole("button", { name: "Hide password" });
        expect(hide.getAttribute("aria-pressed")).toBe("true");
        expect((input as HTMLInputElement).value).toBe("Invented-pass-123");

        fireEvent.click(hide);

        expect(input.getAttribute("type")).toBe("password");
        expect(
            screen.getByRole("button", { name: "Show password" }),
        ).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("Invented-pass-123");
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("Should keep the autocomplete hint when the value is shown", () => {
        const { input } = renderInForm();

        fireEvent.click(screen.getByRole("button", { name: "Show password" }));

        expect(input.getAttribute("autocomplete")).toBe("new-password");
    });

    it("Should keep focus and the caret in the field when clicked", () => {
        const { input } = renderInForm();
        const field = input as HTMLInputElement;
        fireEvent.change(field, { target: { value: "Invented-pass-123" } });
        field.focus();
        field.setSelectionRange(3, 3);
        const toggle = screen.getByRole("button", { name: "Show password" });
        // jsdom keeps the caret on a type change; browsers can move it.
        const restore = vi.spyOn(field, "setSelectionRange");

        const notPrevented = fireEvent.mouseDown(toggle);
        fireEvent.click(toggle);

        expect(notPrevented).toBe(false);
        expect(document.activeElement).toBe(field);
        expect(restore).toHaveBeenCalledWith(3, 3);
        expect([field.selectionStart, field.selectionEnd]).toEqual([3, 3]);
    });

    it("Should leave the caret alone when the field does not have focus", () => {
        const { input } = renderInForm();
        const restore = vi.spyOn(
            input as HTMLInputElement,
            "setSelectionRange",
        );

        fireEvent.click(screen.getByRole("button", { name: "Show password" }));

        expect(restore).not.toHaveBeenCalled();
    });

    it("Should be reachable with the keyboard", () => {
        renderInForm();
        const toggle = screen.getByRole("button", { name: "Show password" });

        expect(toggle.tabIndex).toBe(0);
    });

    it("Should name the field the toggle reveals", () => {
        renderInForm({ toggleSubject: "confirm password" });

        fireEvent.click(
            screen.getByRole("button", { name: "Show confirm password" }),
        );

        expect(
            screen.getByRole("button", { name: "Hide confirm password" }),
        ).toBeTruthy();
    });
});
