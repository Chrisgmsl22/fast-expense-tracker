/**
 * The one form an email is stored and looked up in, so addresses match whatever
 * case or spacing is typed. Alias-free: `prisma/seed.ts` imports it under plain Node.
 */
export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}
