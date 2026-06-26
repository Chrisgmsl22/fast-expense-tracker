import { execSync } from "node:child_process";

// Runs once before the integration suite: bring the test database's schema up to
// date. The DB itself must already exist (local: `pnpm db:test:setup`; CI: the
// Postgres service is created with the test database). Migrations are applied via
// the direct (unpooled) URL, per prisma/schema.prisma.
export default function setup() {
    execSync("prisma migrate deploy", {
        stdio: "inherit",
        env: {
            ...process.env,
            DATABASE_URL_UNPOOLED:
                process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
        },
    });
}
