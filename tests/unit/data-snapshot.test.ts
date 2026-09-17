// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
    assertLocalDatabase,
    assertReadOnlyOperation,
    MISSING_URL_MESSAGE,
    NON_LOCAL_MESSAGE,
} from "@/scripts/data-snapshot";

describe("data:snapshot — local-host guard", () => {
    it("proceeds against localhost", () => {
        expect(() =>
            assertLocalDatabase(
                "postgresql://postgres:x@localhost:5433/fast_expense_tracker",
            ),
        ).not.toThrow();
    });

    it("proceeds against 127.0.0.1", () => {
        expect(() =>
            assertLocalDatabase("postgresql://postgres:x@127.0.0.1:5432/dev"),
        ).not.toThrow();
    });

    it("aborts against a remote host", () => {
        // The shape of a hosted Postgres URL — the accident this guards against.
        expect(() =>
            assertLocalDatabase(
                "postgresql://user:pw@ep-cool-name-123.us-east-2.aws.neon.tech/db?sslmode=require",
            ),
        ).toThrow(NON_LOCAL_MESSAGE);
    });

    it("aborts on a host that merely looks local", () => {
        expect(() =>
            assertLocalDatabase("postgresql://u:p@localhost.evil.example/db"),
        ).toThrow(NON_LOCAL_MESSAGE);
    });

    it("fails closed on an unparseable url", () => {
        expect(() => assertLocalDatabase("not-a-url")).toThrow(
            NON_LOCAL_MESSAGE,
        );
    });

    it("aborts when the url is missing entirely", () => {
        expect(() => assertLocalDatabase(undefined)).toThrow(
            MISSING_URL_MESSAGE,
        );
    });

    it("never names the host, user or database in the refusal", () => {
        const url =
            "postgresql://christian:s3cret@ep-cool-name-123.neon.tech/prod";
        try {
            assertLocalDatabase(url);
            throw new Error("expected the guard to abort");
        } catch (e) {
            const message = (e as Error).message;
            expect(message).toBe(NON_LOCAL_MESSAGE);
            for (const secret of [
                "christian",
                "s3cret",
                "ep-cool-name-123",
                "neon.tech",
                "prod",
            ]) {
                expect(message).not.toContain(secret);
            }
        }
    });
});

describe("data:snapshot — read-only guard", () => {
    it("allows the read operations the snapshot uses", () => {
        for (const op of [
            "findMany",
            "findFirst",
            "count",
            "aggregate",
            "groupBy",
        ]) {
            expect(() => assertReadOnlyOperation(op)).not.toThrow();
        }
    });

    it("refuses every write and raw operation", () => {
        for (const op of [
            "create",
            "createMany",
            "update",
            "updateMany",
            "upsert",
            "delete",
            "deleteMany",
            "$executeRawUnsafe",
            "$queryRawUnsafe",
        ]) {
            expect(() => assertReadOnlyOperation(op)).toThrow(/read-only/);
        }
    });
});
