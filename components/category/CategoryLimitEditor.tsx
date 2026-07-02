"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { setCategoryBudget } from "@/app/_actions/category/set-budget";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** number | null → the string an <input> shows (null = empty = "no limit"). */
function toField(n: number | null): string {
    return n === null ? "" : String(n);
}

/**
 * Pencil-triggered dialog to edit a category's limit (ADR-0016): a "this month"
 * override and the default for other months. Blank = no limit / no override.
 * "Reset to default" clears this month's override. On save it calls the
 * server action and refreshes the server-rendered page so the new figures show.
 */
export function CategoryLimitEditor({
    slug,
    month,
    monthLabel,
    categoryName,
    defaultBudget,
    thisMonthOverride,
    className,
}: {
    slug: string;
    month: string;
    monthLabel: string;
    categoryName: string;
    defaultBudget: number | null;
    thisMonthOverride: number | null;
    className?: string;
}) {
    const router = useRouter();
    // Unique per editor instance — desktop + mobile both mount, so hardcoded ids
    // would collide (invalid duplicate ids break label + aria associations).
    const uid = useId();
    const thisMonthId = `${uid}-this-month`;
    const defaultId = `${uid}-default`;
    const [open, setOpen] = useState(false);
    const [thisMonth, setThisMonth] = useState(toField(thisMonthOverride));
    const [defaultAmount, setDefaultAmount] = useState(toField(defaultBudget));
    const [errors, setErrors] = useState<{
        thisMonth?: string;
        default?: string;
        general?: string;
    }>({});
    const [pending, startTransition] = useTransition();

    // Re-seed the fields from the latest props each time the dialog opens (so a
    // prior refresh's values are reflected), and clear any stale errors.
    function handleOpenChange(next: boolean) {
        if (next) {
            setThisMonth(toField(thisMonthOverride));
            setDefaultAmount(toField(defaultBudget));
            setErrors({});
        }
        setOpen(next);
    }

    function handleSave() {
        setErrors({});
        startTransition(async () => {
            const res = await setCategoryBudget({
                slug,
                month,
                thisMonthAmount: thisMonth,
                defaultAmount,
            });
            if (res.ok) {
                setOpen(false);
                router.refresh();
                return;
            }
            // Surface per-field validation errors where the user can act on
            // them; fall back to the general message only when no field is
            // pinpointed (e.g. a db_error).
            const fe = res.fieldErrors;
            setErrors({
                thisMonth: fe?.thisMonthAmount?.[0],
                default: fe?.defaultAmount?.[0],
                general:
                    fe?.thisMonthAmount || fe?.defaultAmount
                        ? undefined
                        : res.message,
            });
        });
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className={className}
                        aria-label="Edit limit"
                    >
                        <Pencil />
                    </Button>
                }
            />
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Monthly limit · {categoryName}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor={thisMonthId}>
                            This month ({monthLabel})
                        </Label>
                        <Input
                            id={thisMonthId}
                            inputMode="numeric"
                            placeholder="No limit"
                            value={thisMonth}
                            onChange={(e) => setThisMonth(e.target.value)}
                            aria-invalid={errors.thisMonth ? true : undefined}
                            aria-describedby={
                                errors.thisMonth
                                    ? `${thisMonthId}-error`
                                    : undefined
                            }
                        />
                        {errors.thisMonth ? (
                            <p
                                id={`${thisMonthId}-error`}
                                className="text-xs text-danger"
                            >
                                {errors.thisMonth}
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Leave blank to use the default.
                            </p>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={defaultId}>
                            Default (other months)
                        </Label>
                        <Input
                            id={defaultId}
                            inputMode="numeric"
                            placeholder="No limit"
                            value={defaultAmount}
                            onChange={(e) => setDefaultAmount(e.target.value)}
                            aria-invalid={errors.default ? true : undefined}
                            aria-describedby={
                                errors.default
                                    ? `${defaultId}-error`
                                    : undefined
                            }
                        />
                        {errors.default && (
                            <p
                                id={`${defaultId}-error`}
                                className="text-xs text-danger"
                            >
                                {errors.default}
                            </p>
                        )}
                    </div>
                    {errors.general && (
                        <p className="text-sm text-danger">{errors.general}</p>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => setThisMonth("")}
                        disabled={pending}
                    >
                        Reset to default
                    </Button>
                    <Button onClick={handleSave} disabled={pending}>
                        {pending ? "Saving…" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
