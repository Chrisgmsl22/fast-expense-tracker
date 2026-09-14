"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

import { cn } from "@/lib/utils";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
    return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

/**
 * The disclosure button. Base UI renders a real `<button>` and owns
 * `aria-expanded` + `aria-controls`, so the trigger is keyboard reachable and
 * announces its state; its text content is the accessible name.
 */
function CollapsibleTrigger({
    className,
    ...props
}: CollapsiblePrimitive.Trigger.Props) {
    return (
        <CollapsiblePrimitive.Trigger
            data-slot="collapsible-trigger"
            className={cn(
                "cursor-pointer rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                className,
            )}
            {...props}
        />
    );
}

function CollapsiblePanel({
    className,
    ...props
}: CollapsiblePrimitive.Panel.Props) {
    return (
        <CollapsiblePrimitive.Panel
            data-slot="collapsible-panel"
            className={cn("overflow-hidden", className)}
            {...props}
        />
    );
}

export { Collapsible, CollapsibleTrigger, CollapsiblePanel };
