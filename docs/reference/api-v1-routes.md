# `/api/v1` routes and iOS screens

Data for [spec 0014](../specs/0014-api-v1.md). The spec holds the rules. This file holds the lists.
Checked against `origin/main` at `4692c39` and the iOS designs on 2026-11-27.

Every path below starts with `/api/v1`. Every route takes the user id from the access token and
from nothing else. No route has a user id in its path, query or body.

**Columns.** "Reuses" names the code a route calls today. A route marked _core_ needs its logic
moved out of the server action into a function that takes `userId` first (spec 0014 §3). "PR" is
the chore that ships the route.

## 1. Routes

### Identity, account and onboarding

| Method | Path                   | Returns                                                                                                   | Reuses                                             | PR                  |
| ------ | ---------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------- |
| GET    | `/me`                  | `id`, `name`, `email`                                                                                     | Built by the auth readiness item, not by this spec | auth readiness item |
| PATCH  | `/me`                  | The user after the name change                                                                            | `changeDisplayName` (_core_)                       | CHORE-61            |
| GET    | `/onboarding`          | `onboardedAt` and the wizard data: name, split rule, fixed income, budget rule, cards, starter categories | `loadOnboarding(userId, month, sources)`           | CHORE-61            |
| POST   | `/onboarding/complete` | `onboardedAt`. A repeat keeps the first timestamp                                                         | `finishOnboarding` (_core_)                        | CHORE-61            |
| GET    | `/openapi.json`        | The OpenAPI document. Public, no token                                                                    | The committed file (spec 0014 §8)                  | CHORE-53            |

### Dashboard summary

| Method | Path         | Returns                                                                                                                                       | Reuses                                                      | PR       |
| ------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------- |
| GET    | `/dashboard` | Income, the 3 buckets (spent, target, percent), net, daily average, days left, spend by card, top categories, category budgets, savings spent | `getDashboardSummary(userId, month)`                        | CHORE-53 |
| GET    | `/dashboard` | Adds the month breakdown (my cost, charged, outside income, partner share, set aside) and the open settlement balance. Additive fields        | `computeFeedTotals`, `computeSavingsSpend`, `getSettlement` | CHORE-56 |

### Expenses

| Method | Path                     | Returns                                                                                                                                                                                                                                                                                                                                             | Reuses                                                                                                                                   | PR       |
| ------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| GET    | `/feed`                  | One month of expenses and movements, newest first, with `totals` (my cost, charged, outside income, partner share), entry count, the categories with spend, the open settlement balance and the month's income total. Optional `categoryId` and `q` (description and notes) filter the rows and `totals`. The settlement balance ignores the filter | `expenseRepo.getForMonth`, `movementRepo.getForMonth`, `buildFeed`, `computeFeedTotals`, `getSettlement`, `incomeRepo.getMonthlySummary` | CHORE-54 |
| GET    | `/expenses/{id}`         | One expense for the edit form                                                                                                                                                                                                                                                                                                                       | `getExpenseForEdit` (_core_)                                                                                                             | CHORE-54 |
| POST   | `/expenses`              | The created expense, with `actualExpenditure` and `partnerShare`                                                                                                                                                                                                                                                                                    | `createExpense` (_core_)                                                                                                                 | CHORE-55 |
| PUT    | `/expenses/{id}`         | The updated expense                                                                                                                                                                                                                                                                                                                                 | `updateExpense` (_core_)                                                                                                                 | CHORE-55 |
| DELETE | `/expenses/{id}`         | `id`                                                                                                                                                                                                                                                                                                                                                | `deleteExpense` (_core_)                                                                                                                 | CHORE-55 |
| POST   | `/partner-payments`      | The created payment row ("I paid {partner}")                                                                                                                                                                                                                                                                                                        | `addPartnerPayment` (_core_)                                                                                                             | CHORE-55 |
| PUT    | `/partner-payments/{id}` | The updated payment row                                                                                                                                                                                                                                                                                                                             | `updatePartnerPayment` (_core_)                                                                                                          | CHORE-55 |

A partner payment is an expense row (ADR-0024). The app deletes it with `DELETE /expenses/{id}`.

### Categories

| Method | Path                        | Returns                                                                                                                                                  | Reuses                                                                                                              | PR       |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| GET    | `/categories`               | Every category with `id`, `slug`, `name`, `color`, `bucket` and its subcategories                                                                        | `categoryRepo.listForPicker`, `listSubcategoriesForPicker`. The picker rows have no bucket today, so the PR adds it | CHORE-54 |
| GET    | `/categories/{slug}`        | The category detail for one month: spent, limit, default budget, month override, remaining, percent of limit, days left, subcategory breakdown, expenses | `getCategoryDetail(userId, slug, month)`                                                                            | CHORE-56 |
| PUT    | `/categories/{slug}/budget` | The limits after the change. A null amount means no limit                                                                                                | `setCategoryBudget` (_core_)                                                                                        | CHORE-56 |

Category and subcategory names are stored in English. The API returns them as stored, and the app
translates them with the same key list the web uses.

### Cards

| Method | Path                  | Returns                                                                                                     | Reuses                                           | PR       |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------- |
| GET    | `/cards`              | Every card, archived ones included, with `type`, `color`, `archivedAt`, `inUse`, `isCash`                   | `cardRepo.listForSettings`                       | CHORE-54 |
| GET    | `/cards/balances`     | One month of balances per credit card (charged, paid, redeemed, balance, state), `totalOwed`, `totalCredit` | `cardRepo.listBalances`, `summarizeCardBalances` | CHORE-58 |
| GET    | `/cards/{id}/history` | One month of card lines, newest first, each with `signedAmount` and `balanceAfter`                          | `getCardHistory` (_core_), `withRunningBalance`  | CHORE-58 |
| POST   | `/cards`              | The created card. The action returns only a name today, so the core function returns the row                | `addCard` (_core_)                               | CHORE-59 |
| PATCH  | `/cards/{id}`         | The updated card                                                                                            | `updateCard` (_core_)                            | CHORE-59 |
| POST   | `/cards/{id}/archive` | `id`. A repeat returns `not_found` (spec 0014 §7)                                                           | `archiveCard` (_core_)                           | CHORE-59 |
| POST   | `/cards/{id}/restore` | `id` and `name`. A repeat returns `not_found`                                                               | `restoreCard` (_core_)                           | CHORE-59 |
| DELETE | `/cards/{id}`         | `id`. Refused with `has_references` when a row uses the card                                                | `deleteCard` (_core_)                            | CHORE-59 |

The expense form reads `GET /cards` and offers the cards with no `archivedAt`.

### Movements

| Method | Path                  | Returns                                           | Reuses                        | PR       |
| ------ | --------------------- | ------------------------------------------------- | ----------------------------- | -------- |
| GET    | `/movements/{id}`     | One movement for the edit form                    | `getMovementForEdit` (_core_) | CHORE-57 |
| DELETE | `/movements/{id}`     | `id`                                              | `deleteMovement` (_core_)     | CHORE-57 |
| POST   | `/card-payments`      | The created card payment                          | `addCardPayment` (_core_)     | CHORE-57 |
| PUT    | `/card-payments/{id}` | The updated card payment                          | `updateCardPayment` (_core_)  | CHORE-57 |
| POST   | `/transfers`          | The created transfer ("{partner} paid me")        | `addTransfer` (_core_)        | CHORE-57 |
| PUT    | `/transfers/{id}`     | The updated transfer                              | `updateTransfer` (_core_)     | CHORE-57 |
| POST   | `/partner-debts`      | The created debt ("I owe" or "{partner} owes me") | `addPartnerDebt` (_core_)     | CHORE-57 |
| PUT    | `/partner-debts/{id}` | The updated debt. The direction cannot change     | `updatePartnerDebt` (_core_)  | CHORE-57 |

### Settlement

| Method | Path                | Returns                                                                                                                                      | Reuses                                 | PR       |
| ------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------- |
| GET    | `/settlement`       | Balance (amount, direction, breakdown), the open-cycle journal, carried-over amount, the viewed month's journal, closed cycles of that month | `getSettlement(userId, deps, {month})` | CHORE-60 |
| POST   | `/settlement/close` | The row that closed the cycle, or `alreadyClosed: true` on a repeat                                                                          | `closeSettlementCycle` (_core_)        | CHORE-60 |

### Income

| Method | Path                    | Returns                                                       | Reuses                                                | PR       |
| ------ | ----------------------- | ------------------------------------------------------------- | ----------------------------------------------------- | -------- |
| GET    | `/income`               | `fixed`, `variable`, `total` and the month's variable entries | `incomeRepo.getMonthlySummary`, `getVariableForMonth` | CHORE-58 |
| PUT    | `/income/fixed`         | `amount` and `effectiveMonth`. A future month is refused      | `setFixedIncome` (_core_)                             | CHORE-58 |
| POST   | `/income/variable`      | The created entry                                             | `addVariableIncome` (_core_)                          | CHORE-58 |
| DELETE | `/income/variable/{id}` | `id`                                                          | `deleteVariableIncome` (_core_)                       | CHORE-58 |

### Settings and export

| Method | Path                    | Returns                                                                         | Reuses                                                                      | PR       |
| ------ | ----------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------- |
| GET    | `/settings`             | Split rule, the budget rule in force this month, `currency` (`MXN`), `timeZone` | `settingsRepo.getSettings`, `budgetRuleRepo.listRules`, `resolveBudgetRule` | CHORE-54 |
| PUT    | `/settings/split-rule`  | The split rule after the change                                                 | `saveSplitRule` (_core_)                                                    | CHORE-59 |
| PUT    | `/settings/budget-rule` | The rule and its `effectiveMonth`. The server picks the month                   | `saveBudgetRule` (_core_)                                                   | CHORE-59 |
| GET    | `/financial-export`     | The Excel file for a year or a month. Failures use the spec 0014 §4 shape       | `financialExportResponse(request, userId, repo)`, already takes `userId`    | CHORE-61 |

### Not in v1

- **Language.** The app keeps it on the phone and sends `Accept-Language`. The `setLocale` action only sets a web cookie.
- **Sign in, sign up, token refresh, sign out.** These are OAuth endpoints (CHORE-42 and the auth readiness item), not `/api/v1` routes.
- **Idle session renewal.** A web cookie concern.

## 2. Screens that v1 covers

Kept and Adjusted screens from `fast-expense-tracker-ios-app/docs/design/`. A screen with no route
makes no API call.

### 01 Sign in and onboarding

| Screen                                  | Routes                                     |
| --------------------------------------- | ------------------------------------------ |
| Launch, the 3 browser sheets, 1 Welcome | None. The browser sheets are FET web pages |
| After sign-in                           | `GET /me`, `GET /onboarding`               |
| 2 Name                                  | `PATCH /me`                                |
| 3 Share expenses, both states           | `PUT /settings/split-rule`                 |
| 4 Monthly income                        | `PUT /income/fixed`                        |
| 5 Budgeting rule                        | `PUT /settings/budget-rule`                |
| 6 Payment method                        | `POST /cards`                              |
| 7 Categories                            | `GET /onboarding`                          |
| 8 All set                               | `POST /onboarding/complete`                |

### 02 Dashboard

| Screen                                                | Routes                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| Dashboard top, scrolled 1 and 2                       | `GET /dashboard` (CHORE-53 fields)                                    |
| Month rail, month breakdown sheet, breakdown scrolled | `GET /dashboard` (CHORE-56 fields), `GET /feed` for the activity rows |
| All activity                                          | `GET /feed`                                                           |
| Month picker                                          | None                                                                  |
| Category detail, with and without a limit             | `GET /categories/{slug}`, `DELETE /expenses/{id}`                     |
| Monthly limit sheet                                   | `PUT /categories/{slug}/budget`                                       |

### 03 Expenses and add

| Screen                                           | Routes                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| Expenses top, scrolled to the end, chin expanded | `GET /feed`                                                         |
| Filter and search                                | `GET /feed` with `categoryId` or `q`                                |
| Swipe delete                                     | `DELETE /expenses/{id}`, `DELETE /movements/{id}`                   |
| Add menu                                         | None. The points redemption entry waits for CHORE-24                |
| Add expense, category picker                     | `GET /categories`, `GET /cards`, `GET /settings`, `POST /expenses`  |
| Edit expense                                     | `GET /expenses/{id}`, `PUT /expenses/{id}`, `DELETE /expenses/{id}` |
| Card payment                                     | `GET /cards/balances`, `POST /card-payments`                        |
| I paid {partner}                                 | `GET /settlement`, `POST /partner-payments`                         |
| {partner} paid me                                | `GET /settlement`, `POST /transfers`, then `POST /settlement/close` |

### 04 Money

| Screen                             | Routes                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| Money hub                          | `GET /dashboard`, `GET /income`, `GET /settlement`, `GET /cards/balances`              |
| Income, amounts shown or hidden    | `GET /income`                                                                          |
| Edit fixed income                  | `PUT /income/fixed`                                                                    |
| Add variable income                | `POST /income/variable`                                                                |
| Settlement, scrolled, all settled  | `GET /settlement`                                                                      |
| Record payment                     | `POST /transfers`, then `POST /settlement/close`                                       |
| I owe {partner}, {partner} owes me | `POST /partner-debts`                                                                  |
| Common operations                  | None                                                                                   |
| Card balances                      | `GET /cards/balances`. The archived-cards footer and the points term wait for CHORE-24 |
| Card detail                        | `GET /cards/{id}/history`, `PUT /card-payments/{id}`, `DELETE /movements/{id}`         |
| Log a payment                      | `POST /card-payments`. The points segment waits for CHORE-24                           |

### 05 Settings

| Screen                     | Routes                                                                     |
| -------------------------- | -------------------------------------------------------------------------- |
| Settings                   | `GET /settings`, `GET /me`, `GET /income`, `GET /cards`, `GET /categories` |
| Expense split rule         | `GET /settings`, `PUT /settings/split-rule`                                |
| Budget rule, both states   | `GET /settings`, `PUT /settings/budget-rule`                               |
| Cards, add card, edit card | `GET /cards`, `POST /cards`, `PATCH /cards/{id}`, archive, restore, delete |
| Export data                | `GET /financial-export`                                                    |
| Sign out                   | None in `/api/v1`. The app revokes its refresh token at the OAuth server   |

## 3. Screens that need a backend feature first

New and Proposal screens. v1 adds no route for them. Each gets its routes in the PR that builds the
feature, as an additive change to v1.

| Screens                                                                                                               | Needs                                                                                              | Owner in FET                             |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Browser sheet consent, Session ended                                                                                  | The OAuth provider and its consent page                                                            | CHORE-42                                 |
| Dashboard amounts hidden, Privacy                                                                                     | Nothing. On-device preference                                                                      | Slice 2.8 on the web. None for the phone |
| Category, show full amounts                                                                                           | Full-amount totals next to my-share totals in the category detail                                  | CHORE-30                                 |
| Weekly summary card, Weekly summary setting                                                                           | A weekly total and an `emailDay` setting                                                           | Slices 7.1 to 7.4                        |
| Plan a month, Add a due payment                                                                                       | A due-payment model. The scope is not decided                                                      | CHORE-28                                 |
| Recurring: form switch, row badge, rollover sheet, after "Add them", Settings row                                     | A recurring flag, rollover candidates, a bulk clone, a per-month prompt state                      | Slices 3.1 to 3.4                        |
| Multi-currency: USD expense, validation, list row                                                                     | `currency` and an original amount on the expense                                                   | Slices 5.1 and 5.2                       |
| Partial reimbursement, form and list                                                                                  | A partial amount and a linked card payment                                                         | CHORE-38                                 |
| Optimistic rows, offline and failed                                                                                   | Safe retries for writes. v1 has them (spec 0014 §7). The queue is iOS work                         | CHORE-55 and the later create routes     |
| Card balances with archived cards, points redemption sheet, card detail after a redemption, tile states, no cards yet | Points redemptions, and archived cards in the balances                                             | CHORE-24, BUG-10                         |
| Settlement, History tab                                                                                               | A list of every closed cycle. `GET /settlement` returns only the cycles closed in the viewed month | No owner. Needs a decision               |
| Savings                                                                                                               | The figures exist in `GET /dashboard` and `GET /feed`. The screen is a proposal                    | No owner. Needs a decision               |
| Categories: list, detail, override, bucket change, rename, new, archive, archived                                     | Category management and the subcategory bucket override                                            | CHORE-8.c, CHORE-27                      |
| Preferences                                                                                                           | Nothing new. `GET /settings` returns currency and time zone                                        | CHORE-54                                 |
| Account, Change password                                                                                              | Change password. The native form conflicts with the rule that the app never sees a password        | CHORE-33                                 |
| Delete account, both steps                                                                                            | Delete account                                                                                     | CHORE-36                                 |
| Privacy policy                                                                                                        | A public web page                                                                                  | CHORE-37                                 |

## 4. Gaps the designs leave open

- No iOS screen edits or deletes a variable income entry, a transfer or a partner debt. The routes exist because the web has them.
- The Settings rows "Household" and "Fixed income" have no screen of their own.
- Several Adjusted screens show parts of CHORE-24 (points, archived cards). The iOS slice hides those parts until CHORE-24 ships.
