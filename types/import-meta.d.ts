// Node >= 24.2 exposes `import.meta.main` (true when the module is the entry
// point). `@types/node@20` doesn't type it yet, so augment it here. Used by
// prisma/seed.ts to run only when invoked directly, not when imported by tests.
interface ImportMeta {
    readonly main?: boolean;
}
