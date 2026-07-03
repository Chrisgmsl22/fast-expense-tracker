"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

/**
 * Slide-in drawer, built on the same Base UI Dialog as `dialog.tsx` but pinned
 * to a screen edge (default: left) instead of centered. Used for the mobile nav.
 */
function Sheet({ ...props }: SheetPrimitive.Root.Props) {
    return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
    return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
    return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
    return (
        <SheetPrimitive.Backdrop
            data-slot="sheet-overlay"
            className={cn(
                "fixed inset-0 z-50 bg-black/20 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
                className,
            )}
            {...props}
        />
    );
}

function SheetContent({
    className,
    children,
    side = "left",
    showCloseButton = true,
    ...props
}: SheetPrimitive.Popup.Props & {
    side?: "left" | "right";
    showCloseButton?: boolean;
}) {
    return (
        <SheetPrimitive.Portal data-slot="sheet-portal">
            <SheetOverlay />
            <SheetPrimitive.Popup
                data-slot="sheet-content"
                className={cn(
                    "fixed inset-y-0 z-50 flex h-dvh w-72 max-w-[80%] flex-col gap-4 bg-popover p-5 text-sm text-popover-foreground shadow-lg duration-200 outline-none data-open:animate-in data-closed:animate-out",
                    side === "left"
                        ? "left-0 border-r data-open:slide-in-from-left data-closed:slide-out-to-left"
                        : "right-0 border-l data-open:slide-in-from-right data-closed:slide-out-to-right",
                    className,
                )}
                {...props}
            >
                {children}
                {showCloseButton && (
                    <SheetPrimitive.Close
                        data-slot="sheet-close"
                        render={
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="absolute top-3 right-3"
                            />
                        }
                    >
                        <XIcon />
                        <span className="sr-only">Close</span>
                    </SheetPrimitive.Close>
                )}
            </SheetPrimitive.Popup>
        </SheetPrimitive.Portal>
    );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="sheet-header"
            className={cn("flex flex-col gap-1", className)}
            {...props}
        />
    );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
    return (
        <SheetPrimitive.Title
            data-slot="sheet-title"
            className={cn("text-base font-medium", className)}
            {...props}
        />
    );
}

export {
    Sheet,
    SheetClose,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
};
