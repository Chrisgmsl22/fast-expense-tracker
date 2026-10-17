import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { replayMigration } from "@/tests/support/replay-migration";

const MIGRATION = "20261017000000_card_color_names_to_hex";

async function seedUser() {
    return db.user.create({
        data: {
            email: `card-color-${Math.random()}@example.com`,
            password: "x",
            name: "T",
        },
    });
}

async function seedCards(userId: string, colors: Record<string, string>) {
    const ids: Record<string, string> = {};
    for (const [name, color] of Object.entries(colors)) {
        const card = await db.card.create({
            data: { userId, name, color, type: "credit" },
        });
        ids[name] = card.id;
    }
    return ids;
}

async function colorsByName() {
    const cards = await db.card.findMany({
        select: { name: true, color: true },
    });
    return Object.fromEntries(cards.map((c) => [c.name, c.color]));
}

describe("card_color_names_to_hex migration (integration)", () => {
    it("converts each legacy colour name to its hex, whatever its case", async () => {
        const user = await seedUser();
        await seedCards(user.id, {
            "Amex Platinum": "gray",
            "Amex Gold": "Yellow",
            NU: "PURPLE",
            BBVA: "blue",
            Cash: "green",
        });

        await replayMigration(MIGRATION);

        expect(await colorsByName()).toEqual({
            "Amex Platinum": "#6b7280",
            "Amex Gold": "#ca8a04",
            NU: "#9333ea",
            BBVA: "#2563eb",
            Cash: "#16a34a",
        });
    });

    it("leaves a hex and an unknown value alone", async () => {
        const user = await seedUser();
        await seedCards(user.id, {
            Custom: "#0b5cab",
            Upper: "#2563EB",
            Odd: "navy",
        });

        await replayMigration(MIGRATION);

        expect(await colorsByName()).toEqual({
            Custom: "#0b5cab",
            Upper: "#2563EB",
            Odd: "navy",
        });
    });

    it("changes nothing on a second run", async () => {
        const user = await seedUser();
        await seedCards(user.id, { BBVA: "blue", Custom: "#0b5cab" });

        await replayMigration(MIGRATION);
        const first = await db.card.findMany({ orderBy: { name: "asc" } });
        await replayMigration(MIGRATION);
        const second = await db.card.findMany({ orderBy: { name: "asc" } });

        expect(second).toEqual(first);
    });
});
