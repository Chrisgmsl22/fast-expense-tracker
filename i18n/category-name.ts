import { useMessages } from "next-intl";

export type CategoryNames = Readonly<Record<string, string>>;

// Keys in messages/*/categories.json are the stored English names verbatim, spaces
// and slashes included. next-intl reserves "." for nesting, so a seeded name must
// not contain one. A name with no key (one the owner created) renders as stored.
export function translateCategoryName(
    name: string,
    names: CategoryNames,
): string {
    const translated = Object.hasOwn(names, name) ? names[name] : undefined;
    return translated ?? name;
}

/** Client components and non-async server components. */
export function useCategoryName(): (name: string) => string {
    const names: CategoryNames = useMessages().categories;
    return (name) => translateCategoryName(name, names);
}
