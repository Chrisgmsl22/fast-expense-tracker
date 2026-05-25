# Domain Reference

The data model, seed values, and domain rules for fast-expense-tracker.

**Provenance:** Lifted from MoneyFlow (`Chrisgmsl22/my-expense-tracker` —
specifically `backend/prisma/seed.ts` and `backend/prisma/schema.prisma` at
commit `80c57c6`) on 2026-05-24. This document is a **frozen snapshot**.
If MoneyFlow's schema evolves, this doc does not auto-update.

**Why this exists:** fast-expense-tracker mirrors a *subset* of MoneyFlow's
domain so that migration (when MoneyFlow ships) is a clean `pg_dump` →
`pg_restore` with no schema translation. This doc captures what to mirror
and what to deliberately exclude.

---

## 1. Categories

13 system categories, seeded immutably on first migration. Each has an
`isRelevant` flag (50/25/25 logic: essentials vs. discretionary), a
URL-friendly `slug` (used to match across systems for migration), and a list
of subcategories.

### Full list

| # | Name | Slug | `isRelevant` | Subcategories |
|---|---|---|---|---|
| 1 | Housing | `housing` | ✅ | Rent · Mortgage · House expenses · Repairs/maintenance · Tax/fees |
| 2 | Groceries | `groceries` | ✅ | Groceries · Restaurants/other |
| 3 | Charity | `charity` | ✅ | Taxes · Donations |
| 4 | Transport | `transport` | ✅ | Gasoline · Repairs/tires · License/fees · Parking/tolls · Public transportation · Ubers · Car maintenance |
| 5 | Insurance | `insurance` | ✅ | Life · Medical expenses · House · Car · Handicap · Theft · Long-term care |
| 6 | Savings | `savings` | ✅ | Emergency fund · Open savings · Future purchases |
| 7 | Services | `services` | ✅ | Electricity · Gas · Water · Trash · Phone plan · Internet |
| 8 | Health | `health` | ✅ | Medicine · Doctors appt · Dentist · Additional medication · Therapy · Other expenses |
| 9 | Combined Expenses | `combined-expenses` | ✅ | Purchases made by girlfriend · Purchases made between the two · Cats |
| 10 | Personal | `personal` | ❌ | Courses · Education · Books · Subscriptions · Cash withdrawals · Technology · Accountant · Other |
| 11 | Debt | `debt` | ✅ | Car loan · Credit card balance · Personal loans · Monthly installments |
| 12 | Disposable Income | `disposable-income` | ❌ | Entertainment · Hobbies · Dining out · Social events · Tech gadgets · Ecommerce expenses |
| 13 | Unassigned | `unassigned` | ❌ | (no subcategories — sentinel for orphaned expenses) |

### Important nuance for 50/25/25 logic

The `isRelevant` flag in MoneyFlow encodes "is this obligatory spending?"
It's `true` for Savings (because moving money to savings is treated as a
non-negotiable allocation, "pay yourself first").

But for 50/25/25 display, **Savings is its own bucket, not essentials**.
Treat:

- **Essentials** (target 50%): categories where `isRelevant = true` AND `slug ≠ "savings"`
- **Discretionary** (target 25%): categories where `isRelevant = false` AND `slug ≠ "unassigned"` (exclude sentinel)
- **Savings** (target 25%): category where `slug = "savings"`
- **Unallocated** (info only): `Monthly Income − Essentials − Discretionary − Savings`

See ADR-0002 reasoning for why the temp app treats Savings specially.

---

## 2. Data model (mirror these)

These are the Prisma models fast-expense-tracker will implement. Field
names match MoneyFlow exactly so migration is 1:1.

### `User`

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String   // bcrypt hash — never plaintext
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  expenses   Expense[]
  cards      Card[]
  // (categories are system-only in temp app; no per-user override)
}
```

**Notes**:
- Single user (Christian) in the temp app. Seed with one row.
- `defaultCurrency` and `language` fields exist in MoneyFlow but are not
  needed in the temp app (MXN-only, English-only).

### `Category`

```prisma
model Category {
  id               String @id @default(uuid())
  slug             String @unique
  name             String
  isRelevant       Boolean @default(true)
  isSystemCategory Boolean @default(true)  // all system in temp app
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  subcategories Subcategory[]
  expenses      Expense[]
}
```

**Notes**:
- All 13 categories are `isSystemCategory: true` in the temp app (no user-created categories in v1).
- `userId` field exists in MoneyFlow for per-user custom categories — omitted here.

### `Subcategory`

```prisma
model Subcategory {
  id         String @id @default(uuid())
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id])
  name       String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  expenses Expense[]
}
```

### `Card`

```prisma
model Card {
  id        String @id @default(uuid())
  userId    String
  user      User @relation(fields: [userId], references: [id])
  name      String
  color     String  // see Card colors below
  type      String  // "credit" | "debit" | "cash"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  expenses Expense[]
}
```

**Notes**:
- `creditLimit` and `dueDate` exist in MoneyFlow but are not needed in temp app.

### `Expense` (the heart)

```prisma
model Expense {
  id            String @id @default(uuid())
  userId        String
  user          User @relation(fields: [userId], references: [id])

  categoryId    String
  category      Category @relation(fields: [categoryId], references: [id])

  subcategoryId String?
  subcategory   Subcategory? @relation(fields: [subcategoryId], references: [id])

  cardId        String?  // null = cash
  card          Card? @relation(fields: [cardId], references: [id])

  date          DateTime
  description   String
  amount        Float    // what was paid out of pocket

  // Shared expense math
  isShared          Boolean @default(false)
  yourPercentage    Float   @default(1.0)  // 1.0 = 100% mine; 0.68 = my 68% share
  actualExpenditure Float   // computed: isShared ? amount * yourPercentage : amount

  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, date])
}
```

**Notes**:
- `actualExpenditure` is stored (not computed) so historical splits stay
  correct even if the default `yourPercentage` changes over time.
- The MoneyFlow schema has additional fields documented in section 3 (excluded).

### `Budget` (simplified for temp app)

MoneyFlow has a separate `Budget` table with one row per (user, category, month).
The temp app simplifies this to a single `monthlyBudget` field on `Category`:

```prisma
// Add to Category model:
monthlyBudget Float?  // null = no budget set
```

**Trade-off**: loses historical "what was my March budget?" tracking, but
saves entry-per-month bookkeeping. Acceptable for a temporary tool.

---

## 3. Fields and models deliberately NOT mirrored (YAGNI)

These exist in MoneyFlow but are excluded from fast-expense-tracker v1:

### Excluded fields on `Expense`

- `currency` — MXN-only in temp app
- `sharedWith` — always girlfriend, assume it
- `settlementStatus`, `paidAt` — defer settlement tracking to MoneyFlow
- `isRecurring`, `recurringFrequency`, `recurringDay` — manual entry for rent/subscriptions
- `merchantName` — use `description`

### Excluded fields on `Card`

- `creditLimit`, `dueDate` — not needed for spend tracking

### Excluded fields on `User`

- `defaultCurrency`, `language` — single-user, MXN-only, English-only
- `profilePictureUrl` — vanity, skip
- `aiEnabled`, `twoFactorEnabled`, `twoFactorSecret` — feature flags from MoneyFlow

### Excluded models

- **`Income`** — replaced by a single `monthlyIncome` env or config value
- **`Debt`** — defer to MoneyFlow
- **`Goal`** — defer to MoneyFlow
- **`Budget` (per-month)** — replaced by `monthlyBudget` field on `Category`

---

## 4. Domain constants

### Currency

- Single currency: **MXN** (Mexican Peso). Stored as `Float` (sufficient
  precision for personal use; MoneyFlow follows the same convention).

### Shared expense default split

- **Current**: 68% (Christian's share) / 32% (girlfriend's share).
- **Rationale**: income-ratio based. May adjust if either income changes.
- **Implementation**: `yourPercentage` is per-row on the Expense record so
  historical splits stay correct when the default changes.
- **Env var**: `NEXT_PUBLIC_DEFAULT_SHARE_PERCENT="0.68"` — used as default
  when the form is rendered; user can override per row.

### Cards (seed data, 5 rows)

| Name | Color | Type | Notes |
|---|---|---|---|
| Amex Platinum | Gray | credit | |
| Amex Gold | Yellow | credit | (or "Gold" — UI choice) |
| NU | Purple | credit | |
| BBVA | Blue | debit | |
| Cash | Green | cash | Sentinel row for cash expenses |

**Color values**: use semantic names (`gray`, `yellow`, `purple`, `blue`,
`green`). Map to Tailwind classes (or shadcn theme tokens) in the UI layer.
Don't hardcode hex values in the DB.

### Budget rule (50/25/25)

- **50% of monthly income** → Essentials
- **25% of monthly income** → Discretionary
- **25% of monthly income** → Savings

See "Important nuance for 50/25/25 logic" in §1 for bucket definitions.

---

## 5. Shared-expense math

The single most important domain invariant. Implement once, test thoroughly.

### Formula

```ts
actualExpenditure = isShared ? amount * yourPercentage : amount
```

### Three scenarios

| Scenario | `isShared` | `yourPercentage` | `amount` | `actualExpenditure` |
|---|---|---|---|---|
| Solo expense | `false` | (1.0 — ignored) | $200 | **$200** |
| Standard shared | `true` | 0.68 | $1000 | **$680** |
| Custom split (one-off) | `true` | 0.50 | $400 | **$200** |

### Display rules

- **All totals** (dashboard, by category, by card) use `actualExpenditure`, NOT `amount`.
- **Settlement view** (informational only in v1) shows `amount − actualExpenditure` per shared row = what's owed to Christian by girlfriend.

### Edge cases to test

- `isShared = true` but `yourPercentage = 1.0` (degenerate "shared" expense that's actually all mine — should equal `amount`)
- `isShared = false` but `yourPercentage = 0.5` (the percentage is ignored — should equal `amount`)
- `yourPercentage = 0` (rare: a gift, fully covered by girlfriend — should equal $0)
- `amount = 0` (legitimate? probably not, but should not throw)
- Floating-point precision: prefer storing rounded to 2 decimal places on insert

---

## 6. Migration plan (when MoneyFlow ships)

1. **Export** each fast-expense-tracker table to CSV (Prisma or `psql \copy`).
2. **Map columns** to MoneyFlow's Prisma schema:
   - Direct mapping by field name (most fields match exactly).
   - `Category` rows match by `slug`.
   - `Subcategory` rows match by `(categoryId via slug join, name)`.
3. **Import** via a one-shot Prisma seed script in MoneyFlow.
4. **Reconnect relations** by re-resolving foreign keys (IDs change; slugs and names don't).
5. **Decommission** fast-expense-tracker (or archive as read-only).

This works because field names + semantics are deliberately aligned.

---

## 7. What lives in MoneyFlow that this doc does NOT replicate

For completeness — these are MoneyFlow-only concerns, not relevant to the temp app:

- API endpoint design (`docs/reference/api-endpoints.md` in MoneyFlow)
- Service/controller/route layering (Express-specific; the temp app uses Next.js server actions instead)
- Slice-by-slice phase plans (those are per-project)
- ADR-0001 (Unassigned sentinel category) and ADR-0002 (Defer system category customization) — applied here implicitly since we don't allow user-created categories in v1

If a future agent in this repo asks about something not covered here, they
can read MoneyFlow's docs directly — but for the data model and seed values,
this doc is the source of truth.
