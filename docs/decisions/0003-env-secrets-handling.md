# ADR-0003: Environment Variables and Secret Handling

Date: 2026-05-24
Status: Accepted

## Context

The repo is **public** for portfolio visibility. This raises the bar on
secret hygiene compared to a private repo:

- A leaked secret in git history is permanently exposed to anyone who clones.
- Even rotated secrets remain in commit history unless rewritten (which is
  destructive and hard to coordinate).
- Auth secrets, DB URLs, and any future API keys must be treated as if a
  motivated reader is watching.

The user has explicitly flagged secret handling as a non-negotiable concern.

## Decision

### Hard rules

1. **`.env*` files are gitignored.** The `.gitignore` excludes:
   - `.env`
   - `.env.local`, `.env.development.local`, `.env.test.local`, `.env.production.local`
   - `.env.development`, `.env.test`, `.env.production`
   - `.env.*.local`

2. **Only `.env.example` is committed.** It contains variable names and
   placeholder values (e.g., `DATABASE_URL=""`). Never real secrets, even
   "test" ones — placeholders only.

3. **All secrets read via `process.env`.** No hardcoded fallbacks like
   `process.env.AUTH_SECRET || 'dev-secret-123'` in committed code. If a
   secret is missing, the app should fail fast at startup with a clear error.

4. **No secrets in logs.** Even masked. Logging `DATABASE_URL` is forbidden
   even if redacted, because the redaction logic itself could break.

5. **No secrets in test fixtures.** Tests use values like `'test-secret'` or
   generated values per test run. Never copy-paste a real value.

6. **Secrets are NOT shared via Slack, Discord, email, or screenshots.** The
   only places they live: Neon dashboard, Vercel env config, the user's local
   `.env.local`.

### Process rules

7. **Auth flow PRs get reviewer subagent review.** Anything touching
   `auth.config.ts`, session handling, cookies, JWT, or env reads.

8. **CI rejects PRs with `.env` in the diff.** A GitHub Action grep step
   fails the build if any `.env*` file (other than `.env.example`) appears.
   Set up in Phase 0.

9. **Adding a new env var requires:**
   - Add to `.env.example` with a comment explaining what it is.
   - Document in `docs/conventions/coding-conventions.md` (Auth section, App config section, etc.).
   - Reference via `process.env` only in server-side code OR `NEXT_PUBLIC_*` for client-needed values.

### `NEXT_PUBLIC_*` policy

- Variables prefixed `NEXT_PUBLIC_` are bundled into client JavaScript and are
  visible to anyone who views the page source.
- **Only use `NEXT_PUBLIC_*` for non-sensitive config** (e.g., the default
  68/32 split percentage, public API endpoints).
- **Never** for: secrets, internal URLs, feature flags that gate sensitive UI.

### What to do if a secret leaks

1. **Don't push** if it's local-only. Use `git reset` to undo before remote sync.
2. **If already pushed:**
   - **Rotate the secret immediately** at its source (Neon, Vercel auth secret regen, etc.).
   - **Scrub history** with `git filter-repo` or BFG Repo-Cleaner.
   - **Force-push** with the user's explicit approval (this rewrites public history).
   - **Write a post-mortem ADR** documenting what happened and how the process changed to prevent recurrence.
3. **Assume the worst.** A leaked secret should be treated as compromised
   regardless of whether evidence of misuse exists.

## Consequences

**Positive:**

- The repo can be public without ongoing fear.
- Onboarding (now or future) starts with `cp .env.example .env.local` — the
  expected vars are documented.
- CI gating prevents the most common leak path (accidental commit).

**Negative:**

- Slightly more friction adding a new env var (must update `.env.example` and docs).
- The CI grep step needs maintenance if `.env*` naming conventions evolve.
- No protection against deliberate exfiltration — only accidental leaks.

## References

- `.env.example` — the committed template
- `.gitignore` — the exclusion list
- `CLAUDE.md` (Security section) — AI assistant rules for secret handling
- `docs/conventions/coding-conventions.md` (Security section) — coding rules
