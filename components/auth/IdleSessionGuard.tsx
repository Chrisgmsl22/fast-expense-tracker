"use client";

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { getSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { renewIdleSessionAction } from "@/app/_actions/auth/renew-idle-session";
import { EXPIRED_LOGIN_PATH } from "@/lib/auth/idle-session";
import { watchIdleSession } from "@/lib/auth/idle-session-client";
import { withSessionLock } from "@/lib/auth/session-lock";
import { boundedSessionRequest } from "@/lib/auth/session-request";
import { SessionExpiredNotice } from "./SessionExpiredNotice";

export function IdleSessionGuard({
    idleExpiresAt,
    idleSessionId,
    children,
}: {
    idleExpiresAt?: number;
    idleSessionId?: string;
    children?: ReactNode;
}) {
    const router = useRouter();
    const [generation, restart] = useState(0);
    const [expired, setExpired] = useState(false);
    const initialDeadline = useEffectEvent(() => idleExpiresAt);
    useEffect(() => {
        let active = true;
        const lifetime = new AbortController();
        const stop = watchIdleSession({
            session: { idleExpiresAt: initialDeadline(), idleSessionId },
            readSession: () => getSession({ broadcast: false }),
            renewSession: (id, idleForMs, signal) => {
                const queuedAt = Date.now();
                return withSessionLock(
                    () =>
                        renewIdleSessionAction(
                            id,
                            idleForMs + Date.now() - queuedAt,
                        ),
                    signal,
                );
            },
            onExpire: (expiredId, expiredDeadline) => {
                void boundedSessionRequest(
                    (signal) =>
                        withSessionLock(async () => {
                            const current = await boundedSessionRequest(
                                () => getSession({ broadcast: false }),
                                signal,
                            );
                            if (!active) return;
                            if (
                                current?.idleSessionId &&
                                (current.idleSessionId !== expiredId ||
                                    (current.idleExpiresAt ?? 0) >
                                        expiredDeadline)
                            ) {
                                router.refresh();
                                restart((value) => value + 1);
                                return;
                            }
                            setExpired(true);
                            await signOut({ redirect: false });
                            if (active) router.replace(EXPIRED_LOGIN_PATH);
                        }, signal),
                    lifetime.signal,
                ).catch(() => {
                    if (active) {
                        setExpired(true);
                        router.replace(EXPIRED_LOGIN_PATH);
                    }
                });
            },
            onSignedOut: () => router.replace("/login"),
        });
        return () => {
            active = false;
            lifetime.abort();
            stop();
        };
    }, [idleSessionId, router, generation]);
    if (expired) {
        return (
            <main className="flex min-h-screen items-center justify-center p-6">
                <div className="w-full max-w-sm space-y-4">
                    <SessionExpiredNotice />
                    <a
                        href={EXPIRED_LOGIN_PATH}
                        className="text-sm font-medium underline underline-offset-4"
                    >
                        Log in
                    </a>
                </div>
            </main>
        );
    }
    return children;
}
