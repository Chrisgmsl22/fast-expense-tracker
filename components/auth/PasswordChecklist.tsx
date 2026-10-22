import { Check, Circle } from "lucide-react";
import { useTranslations } from "next-intl";

import {
    firstPasswordProblem,
    PASSWORD_MAX_BYTES,
    PASSWORD_MIN_LENGTH,
    passwordRuleStatuses,
    passwordStrength,
    type PasswordStrength,
} from "@/lib/domain/password-rules";
import { cn } from "@/lib/utils";
import {
    AUTH_MUTED_CLASS,
    AUTH_POSITIVE_ICON_CLASS,
    AUTH_POSITIVE_TEXT_CLASS,
} from "./auth-form-styles";

const NEUTRAL_FILL = "bg-white/60 md:bg-muted-foreground";

const STRENGTH: Record<PasswordStrength, { segments: number; fill: string }> = {
    weak: { segments: 1, fill: NEUTRAL_FILL },
    fair: { segments: 2, fill: NEUTRAL_FILL },
    strong: { segments: 3, fill: "bg-green-400 md:bg-positive" },
};

const SEGMENTS = [1, 2, 3] as const;

/** Live password rules and a weak / fair / strong bar, shown once the user types. */
export function PasswordChecklist({ password }: { password: string }) {
    const t = useTranslations("auth.password");
    const level = password ? passwordStrength(password) : null;
    const strength = level ? STRENGTH[level] : null;
    const statuses = passwordRuleStatuses(password);
    // The limit only shows once it is the one thing keeping the password from "Strong".
    const overLimit =
        statuses.every(({ met }) => met) &&
        firstPasswordProblem(password) !== undefined;

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
                    {level && (
                        <>
                            <span className="sr-only">
                                {t("strengthLabel")}{" "}
                            </span>
                            {t(`strength.${level}`)}
                        </>
                    )}
                </p>
            </div>
            {strength && (
                <ul aria-label={t("requirements")} className="mt-2 space-y-1">
                    {statuses.map(({ rule, met }) => (
                        <ChecklistItem
                            key={rule.id}
                            label={t(`rules.${rule.id}`, {
                                min: PASSWORD_MIN_LENGTH,
                            })}
                            met={met}
                        />
                    ))}
                    {overLimit && (
                        <ChecklistItem
                            label={t("lengthLimit", {
                                max: PASSWORD_MAX_BYTES,
                            })}
                            met={false}
                        />
                    )}
                </ul>
            )}
        </div>
    );
}

function ChecklistItem({ label, met }: { label: string; met: boolean }) {
    const t = useTranslations("auth.password");
    const Icon = met ? Check : Circle;
    return (
        <li
            className={cn(
                "flex items-center gap-2 text-xs",
                met ? AUTH_POSITIVE_TEXT_CLASS : AUTH_MUTED_CLASS,
            )}
        >
            <Icon
                className={cn(
                    "size-3.5 shrink-0",
                    met && AUTH_POSITIVE_ICON_CLASS,
                )}
                aria-hidden="true"
            />
            {label}
            <span className="sr-only"> {met ? t("met") : t("notMet")}</span>
        </li>
    );
}
