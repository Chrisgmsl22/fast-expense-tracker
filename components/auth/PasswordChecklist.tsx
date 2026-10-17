import { Check, Circle } from "lucide-react";

import {
    passwordRuleStatuses,
    passwordStrength,
    type PasswordStrength,
} from "@/lib/domain/password-rules";
import { cn } from "@/lib/utils";
import { AUTH_MUTED_CLASS, AUTH_POSITIVE_CLASS } from "./auth-form-styles";

const NEUTRAL_FILL = "bg-white/60 md:bg-muted-foreground";

const STRENGTH: Record<
    PasswordStrength,
    { label: string; segments: number; fill: string }
> = {
    weak: { label: "Weak", segments: 1, fill: NEUTRAL_FILL },
    fair: { label: "Fair", segments: 2, fill: NEUTRAL_FILL },
    strong: {
        label: "Strong",
        segments: 3,
        fill: "bg-green-400 md:bg-positive",
    },
};

const SEGMENTS = [1, 2, 3] as const;

/** Live password rules and a weak / fair / strong bar, shown once the user types. */
export function PasswordChecklist({ password }: { password: string }) {
    const strength = password ? STRENGTH[passwordStrength(password)] : null;

    return (
        <div>
            <div className={cn(strength && "mt-3 flex items-center gap-3")}>
                {strength && (
                    <div className="flex flex-1 gap-1" aria-hidden="true">
                        {SEGMENTS.map((segment) => (
                            <span
                                key={segment}
                                className={cn(
                                    "h-1 flex-1 rounded-full",
                                    segment <= strength.segments
                                        ? strength.fill
                                        : "bg-white/10 md:bg-muted",
                                )}
                            />
                        ))}
                    </div>
                )}
                {/* Mounted while empty, so the first level is announced. The
                    text only changes with the level, not on every keystroke. */}
                <p
                    aria-live="polite"
                    aria-atomic="true"
                    className={cn("text-xs font-medium", AUTH_MUTED_CLASS)}
                >
                    {strength && (
                        <>
                            <span className="sr-only">Password strength: </span>
                            {strength.label}
                        </>
                    )}
                </p>
            </div>
            {strength && (
                <ul
                    aria-label="Password requirements"
                    className="mt-2 space-y-1"
                >
                    {passwordRuleStatuses(password).map(({ rule, met }) => {
                        const Icon = met ? Check : Circle;
                        return (
                            <li
                                key={rule.id}
                                className={cn(
                                    "flex items-center gap-2 text-xs",
                                    met
                                        ? AUTH_POSITIVE_CLASS
                                        : AUTH_MUTED_CLASS,
                                )}
                            >
                                <Icon
                                    className="size-3.5 shrink-0"
                                    aria-hidden="true"
                                />
                                {rule.label}
                                <span className="sr-only">
                                    {met ? " (met)" : " (not met)"}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
