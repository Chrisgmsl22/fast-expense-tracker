import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { translateCategoryName, useCategoryName } from "@/i18n/category-name";
import { getCategoryName } from "@/i18n/category-name.server";
import { LOCALES } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import { STARTER_CATEGORIES } from "@/lib/domain/starter-kit";
import { renderWithIntl, setServerLocale } from "@/tests/support/intl";

const names = { Groceries: "Despensa", "Repairs/maintenance": "Reparaciones" };

describe("translateCategoryName", () => {
    it("Should return the translation when the stored name has a key", () => {
        expect(translateCategoryName("Groceries", names)).toBe("Despensa");
        expect(translateCategoryName("Repairs/maintenance", names)).toBe(
            "Reparaciones",
        );
    });

    it("Should return the stored name when no key exists", () => {
        expect(translateCategoryName("Pets", names)).toBe("Pets");
        expect(translateCategoryName("groceries", names)).toBe("groceries");
    });

    it("Should not mistake an object prototype key for a translation", () => {
        expect(translateCategoryName("constructor", names)).toBe("constructor");
        expect(translateCategoryName("toString", names)).toBe("toString");
    });
});

describe("seeded category names", () => {
    const seeded = STARTER_CATEGORIES.flatMap((category) => [
        category.name,
        ...category.subcategories,
    ]);

    it.each(LOCALES)("Should have a %s key for every seeded name", (locale) => {
        const missing = seeded.filter(
            (name) => !Object.hasOwn(MESSAGES[locale].categories, name),
        );
        expect(missing).toEqual([]);
    });

    it("Should keep English as the stored name", () => {
        for (const name of seeded)
            expect(translateCategoryName(name, MESSAGES.en.categories)).toBe(
                name,
            );
    });
});

function CategoryLabel({ name }: { name: string }) {
    const categoryName = useCategoryName();
    return <span>{categoryName(name)}</span>;
}

describe("useCategoryName", () => {
    it.each([
        ["es", "Disposable Income", "Dinero libre"],
        ["en", "Disposable Income", "Disposable Income"],
        ["es", "Pets", "Pets"],
    ] as const)("Should render in %s: %s → %s", (locale, stored, expected) => {
        renderWithIntl(<CategoryLabel name={stored} />, { locale });
        expect(screen.getByText(expected)).toBeDefined();
    });
});

describe("getCategoryName", () => {
    it.each([
        ["es", "Housing", "Vivienda"],
        ["en", "Housing", "Housing"],
        ["es", "Pets", "Pets"],
    ] as const)(
        "Should translate in %s: %s → %s",
        async (locale, stored, expected) => {
            setServerLocale(locale);
            const categoryName = await getCategoryName();
            expect(categoryName(stored)).toBe(expected);
        },
    );
});
