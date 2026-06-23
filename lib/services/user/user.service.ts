import bcrypt from "bcryptjs";

import { db } from "@/lib/db";

/**
 * User data layer + credential verification (slice 1.3).
 *
 * Per coding-conventions §Data layer, all DB access lives in a service. The
 * credential check (bcrypt.compare) lives here too so the security-critical
 * path is a plain function the Credentials `authorize` callback calls — and one
 * that unit tests can exercise without booting Auth.js.
 */

/** The shape Auth.js puts on the session/JWT — never includes the hash. */
export type AuthUser = {
    id: string;
    email: string;
    name: string | null;
};

export async function getUserByEmail(email: string) {
    return db.user.findUnique({ where: { email } });
}

/**
 * Returns the user when `email` + `password` match a stored bcrypt hash, else
 * `null`. The unknown-email and wrong-password cases both return `null` (no
 * distinction leaked to the caller). A wrong password is an expected outcome,
 * not an error — it returns `null` rather than throwing.
 */
export async function verifyCredentials(
    email: string,
    password: string,
): Promise<AuthUser | null> {
    const user = await getUserByEmail(email);
    if (!user) {
        return null;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
        return null;
    }

    return { id: user.id, email: user.email, name: user.name };
}
