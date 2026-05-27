# Lessons Learned

A running log of topics where an agent (or the team) hit avoidable friction —
the root cause and the fix — so we don't relitigate the same problem. Append
newest at the top. Keep entries short.

## Template

```
### <date> — <topic>
- **Symptom:** what went wrong / why it dragged
- **Root cause:** the actual underlying reason
- **Fix / decision:** what resolved it
- **Lesson for next time:** the generalizable takeaway
```

---

### 2026-05-26 — Setting a base Node version took far too many turns

- **Symptom:** Picking and wiring up the project's Node version dragged across
  many back-and-forth turns instead of being a quick setup step.
- **Root causes:**
  - `node`/`pnpm` were not available in the **non-interactive shells** that
    agents use. nvm is lazy-loaded from `~/.zshrc` (interactive-only), so the
    `node` shim recursed (`_nvm_lazy_load` undefined) in non-interactive shells.
  - The toolchain was not verified in a non-interactive shell **first**, before
    committing to an approach.
  - The Node landscape had shifted: Node 20 (the original plan's pick) reached
    end-of-life on 2026-04-30, invalidating a months-old assumption.
  - A bespoke `~/.zshenv` function was drafted to scope versions per project —
    non-standard, and rightly rejected in favor of a standard approach.
- **Fix / decision:** Node 24 (active LTS, Vercel's default) as the nvm default;
  expose it on PATH via `~/.zshenv` so non-interactive/agent shells see it; drop
  `node/npm/npx` from the `~/.zshrc` lazy-shim loop; pin in-repo via `.nvmrc`
  + `package.json` `engines`; pnpm via corepack. `nvm use <v>` still overrides
  per project (e.g. Blend on Node 22).
- **Lessons for next time:**
  1. Verify prerequisites (`node`, `pnpm`, etc.) in a **non-interactive** shell
     at the very start of environment setup — not midway through.
  2. Confirm current LTS / EOL status before pinning a runtime; don't trust a
     plan written months earlier.
  3. Prefer standard tooling and patterns over bespoke shell code. If a custom
     approach is truly required, flag it explicitly as non-standard.
  4. nvm is interactive-oriented; automation needs the version on PATH (e.g.
     via `~/.zshenv`), not behind interactive-only lazy-load functions.
