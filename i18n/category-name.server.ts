import { getMessages } from "next-intl/server";

import { translateCategoryName, type CategoryNames } from "./category-name";

/** Async server components and server actions. */
export async function getCategoryName(): Promise<(name: string) => string> {
    const names: CategoryNames = (await getMessages()).categories;
    return (name) => translateCategoryName(name, names);
}
