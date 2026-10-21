import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";

import { PasswordInput } from "@/components/auth/PasswordInput";

function renderInForm(props: { toggleSubject?: string } = {}) {
    const typeAtSubmit: (string | null)[] = [];
    const onSubmit = vi.fn((e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        typeAtSubmit.push(
            e.currentTarget.querySelector("input")?.getAttribute("type") ??
                null,
        );
    });
    renderWithIntl(
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
    return {
        onSubmit,
        typeAtSubmit,
        input: screen.getByLabelText("Password"),
    };
}

/** A form outside the rendered tree, joined through the input's `form` attribute. */
function externalForm(id: string) {
    const form = document.createElement("form");
    form.id = id;
    form.addEventListener("submit", (e) => e.preventDefault());
    document.body.append(form);
    return form;
}

describe("PasswordInput", () => {
    it("Should start hidden with a show button that names its action", () => {
        const { input } = renderInForm();

        expect(input.getAttribute("type")).toBe("password");
        const toggle = screen.getByRole("button", { name: "Show password" });
        expect(toggle.getAttribute("type")).toBe("button");
        expect(toggle.hasAttribute("aria-pressed")).toBe(false);
        expect(toggle.getAttribute("aria-controls")).toBe("pw");
    });

    it("Should reveal and hide the value without submitting the form", () => {
        const { input, onSubmit } = renderInForm();
        fireEvent.change(input, { target: { value: "Invented-pass-123" } });

        fireEvent.click(screen.getByRole("button", { name: "Show password" }));

        expect(input.getAttribute("type")).toBe("text");
        const hide = screen.getByRole("button", { name: "Hide password" });
        expect(hide.hasAttribute("aria-pressed")).toBe(false);
        expect(hide.getAttribute("aria-controls")).toBe("pw");
        expect((input as HTMLInputElement).value).toBe("Invented-pass-123");

        fireEvent.click(hide);

        expect(input.getAttribute("type")).toBe("password");
        expect(
            screen.getByRole("button", { name: "Show password" }),
        ).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("Invented-pass-123");
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("Should hide the value again before the form's submit handler runs", () => {
        const { input, onSubmit, typeAtSubmit } = renderInForm();
        fireEvent.change(input, { target: { value: "Invented-pass-123" } });
        fireEvent.click(screen.getByRole("button", { name: "Show password" }));
        expect(input.getAttribute("type")).toBe("text");

        fireEvent.submit(input.closest("form")!);

        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(typeAtSubmit).toEqual(["password"]);
        expect(input.getAttribute("type")).toBe("password");
        expect(
            screen.getByRole("button", { name: "Show password" }),
        ).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("Invented-pass-123");
    });

    it("Should leave a hidden field hidden and its value intact on submit", () => {
        const { input, onSubmit, typeAtSubmit } = renderInForm();
        fireEvent.change(input, { target: { value: "Invented-pass-123" } });

        fireEvent.submit(input.closest("form")!);

        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(typeAtSubmit).toEqual(["password"]);
        expect(input.getAttribute("type")).toBe("password");
        expect(
            screen.getByRole("button", { name: "Show password" }),
        ).toBeTruthy();
        expect((input as HTMLInputElement).value).toBe("Invented-pass-123");
    });

    it("Should remove its submit listener on unmount", () => {
        const form = externalForm("outside");
        const add = vi.spyOn(form, "addEventListener");
        const remove = vi.spyOn(form, "removeEventListener");
        const { unmount } = renderWithIntl(
            <PasswordInput aria-label="Password" form="outside" />,
        );
        const added = add.mock.calls.find(([type]) => type === "submit");
        expect(added).toBeDefined();

        unmount();

        expect(remove).toHaveBeenCalledWith("submit", added![1]);
        expect(() => fireEvent.submit(form)).not.toThrow();
        form.remove();
    });

    it("Should follow the input to another form when its form attribute changes", () => {
        const first = externalForm("first");
        const second = externalForm("second");
        const { rerender } = renderWithIntl(
            <PasswordInput aria-label="Password" form="first" />,
        );
        const input = screen.getByLabelText("Password");

        rerender(<PasswordInput aria-label="Password" form="second" />);
        fireEvent.click(screen.getByRole("button", { name: "Show password" }));

        fireEvent.submit(first);
        expect(input.getAttribute("type")).toBe("text");

        fireEvent.submit(second);
        expect(input.getAttribute("type")).toBe("password");

        first.remove();
        second.remove();
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
