"use client";

import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ComponentProps,
} from "react";
import { flushSync } from "react-dom";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AUTH_MUTED_CLASS } from "./auth-form-styles";

type Props = Omit<ComponentProps<"input">, "type" | "ref"> & {
    /** What the toggle reveals, read in its name: "Show {toggleSubject}". */
    toggleSubject?: string;
};

/** A password field with a button inside it that shows or hides the value. */
export function PasswordInput({
    className,
    toggleSubject = "password",
    ...props
}: Props) {
    const [visible, setVisible] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const savedSelection = useRef<[number | null, number | null] | null>(null);

    // Changing the input type can move the caret to the end; put it back.
    useLayoutEffect(() => {
        const input = inputRef.current;
        const selection = savedSelection.current;
        savedSelection.current = null;
        if (input && selection && document.activeElement === input) {
            input.setSelectionRange(selection[0], selection[1]);
        }
    }, [visible]);

    // Hide the value again on submit, before the form's own handler reads it,
    // so the browser never records the shown text. Re-attaches when the
    // `form` attribute points the input at another form.
    const formId = props.form;
    useEffect(() => {
        const form = inputRef.current?.form;
        if (!form) return;
        const hide = () => flushSync(() => setVisible(false));
        form.addEventListener("submit", hide);
        return () => form.removeEventListener("submit", hide);
    }, [formId]);

    function toggle() {
        const input = inputRef.current;
        if (input) {
            savedSelection.current = [input.selectionStart, input.selectionEnd];
        }
        setVisible((v) => !v);
    }

    const Icon = visible ? EyeOff : Eye;

    return (
        <div className="relative">
            <Input
                {...props}
                ref={inputRef}
                type={visible ? "text" : "password"}
                className={cn(className, "pr-11")}
            />
            <button
                type="button"
                onClick={toggle}
                // Keeps focus, and so the caret, in the field on a pointer click.
                onMouseDown={(e) => e.preventDefault()}
                aria-label={`${visible ? "Hide" : "Show"} ${toggleSubject}`}
                aria-controls={props.id}
                className={cn(
                    "absolute right-1 bottom-1 flex size-8 items-center justify-center rounded-md outline-none",
                    "hover:text-white focus-visible:ring-3 focus-visible:ring-ring/50 md:hover:text-foreground",
                    AUTH_MUTED_CLASS,
                )}
            >
                <Icon className="size-4" aria-hidden="true" />
            </button>
        </div>
    );
}
