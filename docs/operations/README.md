# Operations

Human-led tasks for running this project. This directory answers
**"what do I (the human) actually need to do?"** — as opposed to design
decisions, working conventions, or agent-led code work.

## How this differs from the other `docs/` subdirectories

| Directory                         | Answers                                                 |
| --------------------------------- | ------------------------------------------------------- |
| [`conventions/`](../conventions/) | How do we work? (coding rules, slicing, agent workflow) |
| [`decisions/`](../decisions/)     | Why did we do it this way? (immutable ADRs)             |
| [`reference/`](../reference/)     | What's the domain data? (categories, schema, math)      |
| [`roadmap/`](../roadmap/)         | What are we building next? (phases, slices)             |
| [`specs/`](../specs/)             | What does the design say? (versioned specs)             |
| **`operations/`**                 | **What manual steps does the human need to take?**      |

## Index

| Topic                                                                                | When needed                                                                                                                                                                   |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [setup.md](./setup.md)                                                               | Initial external setup (Neon, Vercel, env vars, GitHub branch protection). Some sections deferred until specific slices.                                                      |
| [owner-shared-mode-migration.md](./owner-shared-mode-migration.md)                   | After deploying CHORE-6.a: switch the owner account to Shared mode + the BUG-2 rider (re-seed prod category colors, drop the retired Amex Gold card). Manual prod data steps. |
| [per-user-categories-migration.md](./per-user-categories-migration.md)               | Before and after deploying CHORE-8.a (ADR-0022): confirm the single-owner precondition, then verify every category row was re-homed.                                          |
| [partner-payment-conversion-migration.md](./partner-payment-conversion-migration.md) | Before merging CHORE-12: read-only survey of the `gf_paid` conversion, the subcategory rename and the cents backfill, plus the balance check to repeat afterwards.            |

Future docs will land here as operational needs surface — recovery
procedures, secret rotation, the eventual MoneyFlow data migration.

## What goes here

- **Initial external setup** — account creation, dashboard configuration
  (Neon, Vercel, Resend, GitHub)
- **Recovery procedures** — what to do when something goes wrong (leaked
  secret, broken deploy, lost DB)
- **Periodic operational tasks** — secret rotation, dependency upgrades
- **Migration procedures** — the eventual `pg_dump | pg_restore` to
  MoneyFlow when this project sunsets

## What does NOT go here

- Architecture decisions → [`docs/decisions/`](../decisions/)
- Coding / workflow rules → [`docs/conventions/`](../conventions/)
- Domain data (categories, cards, math) → [`docs/reference/`](../reference/)
- Phase / slice plans → [`docs/roadmap/`](../roadmap/)
- Design specs → [`docs/specs/`](../specs/)

## How phase files reference operations

Phase files that depend on manual setup carry a **Prerequisites (manual)**
section near the top, pointing at the relevant section of
[`setup.md`](./setup.md). This way the agent (and future you) sees the
manual prereqs _before_ trying to ship a slice that depends on them.
