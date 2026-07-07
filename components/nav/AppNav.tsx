"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { LogoutButton } from "@/components/auth/LogoutButton";

const LINKS = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/expenses", label: "Expenses" },
    { href: "/income", label: "Income" },
    { href: "/settlement", label: "Settlement" },
] as const;

/**
 * App header nav. Desktop (≥md): inline link row + email + Sign out. Mobile: a
 * hamburger opens a Sheet drawer with the links + email + Sign out, so the
 * header stays a compact burger + brand and never overflows the viewport width.
 */
export function AppNav({ email }: { email?: string }) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const isActive = (href: string) =>
        pathname === href || pathname.startsWith(`${href}/`);

    return (
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
            <div className="flex items-center gap-5">
                <Sheet open={open} onOpenChange={setOpen}>
                    <SheetTrigger
                        render={
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="md:hidden"
                                aria-label="Open menu"
                            >
                                <Menu />
                            </Button>
                        }
                    />
                    <SheetContent>
                        <SheetHeader>
                            <SheetTitle>Expense Tracker</SheetTitle>
                        </SheetHeader>
                        <nav className="flex flex-col gap-1">
                            {LINKS.map((l) => (
                                // Plain links (role "link", not a Close button)
                                // that close the drawer on tap — keeps correct
                                // nav semantics for screen readers.
                                <Link
                                    key={l.href}
                                    href={l.href}
                                    onClick={() => setOpen(false)}
                                    aria-current={
                                        isActive(l.href) ? "page" : undefined
                                    }
                                    className={cn(
                                        "rounded-md px-3 py-2 text-sm transition-colors",
                                        isActive(l.href)
                                            ? "bg-muted font-medium text-foreground"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {l.label}
                                </Link>
                            ))}
                        </nav>
                        <div className="mt-auto border-t pt-4">
                            {email && (
                                <p className="mb-2 truncate px-3 text-xs text-muted-foreground">
                                    {email}
                                </p>
                            )}
                            <LogoutButton />
                        </div>
                    </SheetContent>
                </Sheet>

                <span className="font-medium">Expense Tracker</span>

                <nav className="hidden items-center gap-5 text-sm md:flex">
                    {LINKS.map((l) => (
                        <Link
                            key={l.href}
                            href={l.href}
                            aria-current={isActive(l.href) ? "page" : undefined}
                            className={cn(
                                "transition-colors",
                                isActive(l.href)
                                    ? "font-medium text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {l.label}
                        </Link>
                    ))}
                </nav>
            </div>

            <div className="hidden items-center gap-4 md:flex">
                {email && (
                    <span className="max-w-[16rem] truncate text-sm text-muted-foreground">
                        {email}
                    </span>
                )}
                <LogoutButton />
            </div>
        </div>
    );
}
