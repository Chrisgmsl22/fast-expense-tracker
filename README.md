# fast-expense-tracker

A temporary personal expense tracker built while [MoneyFlow](https://github.com/Chrisgmsl22/my-expense-tracker)
(the long-form learning project) is being built.

**Why this exists:** MoneyFlow takes months. I need a working tool now to track
shared expenses with a proper 68/32 split, categorize spend, and watch budgets.
This app is the temporary bridge.

**What's different:** this repo is intentionally an *agent-led* project — agents
write the code, I review. The opposite of MoneyFlow, which is hand-written for
learning. Same code-quality bar, but speed > deliberate practice.

## Stack

- Next.js 15 (App Router) — TypeScript end-to-end
- Postgres on Neon — same shape as MoneyFlow's schema for easy migration later
- Prisma ORM
- Tailwind CSS + shadcn/ui
- Auth.js (Credentials provider)
- Hosted on Vercel

## Where to find things

| You want to know… | Look here |
|---|---|
| Project goals + non-goals | [docs/specs/0001-initial-design.md](./docs/specs/0001-initial-design.md) *(pending)* |
| Current phase + what's next | [docs/roadmap/README.md](./docs/roadmap/README.md) |
| Why a design choice was made | [docs/decisions/](./docs/decisions/) |
| Data model + seed data + shared-expense math | [docs/reference/domain-reference.md](./docs/reference/domain-reference.md) |
| Coding conventions | [docs/conventions/coding-conventions.md](./docs/conventions/coding-conventions.md) |
| How agents work on this repo | [docs/conventions/agent-workflow.md](./docs/conventions/agent-workflow.md) |
| AI assistant instructions | [CLAUDE.md](./CLAUDE.md) |

## License

Personal project. No license intended for reuse.
