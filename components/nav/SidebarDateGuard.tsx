"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSidebarDate } from "./sidebar-model";

/** Refresh the persistent layout when its CDMX calendar date becomes stale. */
export function SidebarDateGuard({ dayKey }: { dayKey: string }) {
    const pathname = usePathname();
    const router = useRouter();
    const requestedDay = useRef<string | null>(null);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        const check = () => {
            const now = new Date();
            const date = getSidebarDate(now);
            if (
                document.visibilityState !== "hidden" &&
                date.dayKey !== dayKey &&
                requestedDay.current !== date.dayKey
            ) {
                requestedDay.current = date.dayKey;
                router.refresh();
            }
            clearTimeout(timer);
            timer = setTimeout(check, date.nextDayAt - now.getTime() + 100);
        };
        check();
        window.addEventListener("focus", check);
        document.addEventListener("visibilitychange", check);
        return () => {
            clearTimeout(timer);
            window.removeEventListener("focus", check);
            document.removeEventListener("visibilitychange", check);
        };
    }, [dayKey, pathname, router]);
    return null;
}
