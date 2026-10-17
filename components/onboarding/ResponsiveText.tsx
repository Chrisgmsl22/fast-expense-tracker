import type { ReactNode } from "react";

/** Two wordings of one line: the full one from `sm` up, the short one on a phone. */
export function ResponsiveText({
    desktop,
    phone,
}: {
    desktop: ReactNode;
    phone: ReactNode;
}) {
    return (
        <>
            <span className="hidden sm:inline">{desktop}</span>
            <span className="sm:hidden">{phone}</span>
        </>
    );
}
