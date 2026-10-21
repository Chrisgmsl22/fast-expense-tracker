# Spanish and English UI (i18n)

Reflects plan revision 2.

The app is English only. Add Spanish as the default language and keep English as the second one. The owner picks the language in Settings, and the choice lives in a cookie. The database does not change: stored names stay in English and the UI translates them on top.

## Decisions

- **Library:** `next-intl`, in its "without i18n routing" setup. URLs do not change and there is no locale prefix.
- **Locales:** `es` (default) and `en`.
- **Where the choice lives:** the `NEXT_LOCALE` cookie. No user column and no migration. The choice is per browser, so a new device starts in Spanish.
- **Where the switch lives:** Settings, as its own small section.
- **Database text:** no migration. Seeded category and subcategory names stay in English and work as message keys. A name with no key (a category the owner created) shows as stored.

## How it works

1. `i18n/request.ts` reads `NEXT_LOCALE` with `cookies()`. A missing or unknown value falls back to `es`.
2. `app/layout.tsx` wraps the app in `NextIntlClientProvider` and sets `<html lang>` from the locale.
3. A `setLocale` server action checks the value against the locale list and writes the cookie: `path=/`, 1 year, `sameSite=lax`, `httpOnly`. The client then calls `router.refresh()`.
4. Server components use `getTranslations`. Client components use `useTranslations`.
5. Every route is already dynamic because of the auth check, so reading the cookie adds no cost.

## What gets translated

- **UI text:** every label, button, heading, empty state, toast, and the login page.
- **Category and subcategory names:** one helper takes the stored English name and returns the translation, or the name as stored when no key exists. Pages and components call the helper. They never look up the key themselves.
- **Action errors:** actions build `message` and `fieldErrors` with `getTranslations`, so `ActionResult` keeps its shape. Callers still branch on `code`.
- **Logs stay English.** Spanish is for what the owner sees. `console` output, thrown `Error` messages and error codes do not change.
- **Dates:** every date uses the active locale. The 3 `en-US` date formatters go away.
- **Money:** stays `es-MX` in both languages. It is MXN, and `$1,234.50` reads the same in both.

## Message files

One file per namespace per locale, for example `messages/es/dashboard.json` and `messages/en/dashboard.json`. Fan-out slices then never edit the same file. A test fails when a key exists in one locale and not the other.

## Rollout

One branch, one PR, built foundation first and then fanned out ([parallel-slicing.md](../conventions/parallel-slicing.md)):

- **Foundation:** `next-intl` setup, the cookie, `setLocale`, the Settings switch, the name helper, the date helper, every namespace file (empty), the key-parity test, plus the nav and the shared `components/ui` text.
- **Fan-out, one part per screen group:** dashboard and category; expenses and income; settlement and money movements; settings and login. Each part owns its components and its namespace files.

The implementer drafts the Spanish text. The owner corrects it in review.

## Coordination

This work lands first. CHORE-8.c (category management), CHORE-8.e (onboarding wizard) and CHORE-33 (change password) rebase on it after it merges and move their new text into message files.

## Out of scope

- A third language.
- Translating text that the owner types (expense notes, custom category names).
- The weekly email (phase 7). It picks a language when it ships.
- A per-user language column. Add it later if the cookie is not enough.
