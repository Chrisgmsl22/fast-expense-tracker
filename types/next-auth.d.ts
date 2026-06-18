import type { DefaultSession } from "next-auth";

// The Credentials callbacks (slice 1.3) put the DB user id on the session.
// Declaring it here makes `session.user.id` typed everywhere — server actions
// read it without an `as` cast.
declare module "next-auth" {
    interface Session {
        user: { id: string } & DefaultSession["user"];
    }
}
